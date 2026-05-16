import { NextResponse } from 'next/server'
import { uploadVideo, uploadImage, findTokenForAdAccount } from '@/lib/meta'
import { isSocialUrl, isDriveUrl, isAdLibraryUrl, extractFirstUrl, downloadViaYtDlp, downloadDirect, downloadFromAdLibrary } from '@/lib/ytdlp'
import { storePreview } from '@/lib/preview-cache'

export const runtime = 'nodejs'
export const maxDuration = 300

// Cap downloaded size to avoid OOM-ing the Node process on huge files.
// Meta's own video upload limit is 4GB; we go below that to stay memory-safe.
const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024  // 500 MB

function extractDriveFileId(url) {
  if (!url) return null
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

async function fetchFromGoogleDrive(fileId) {
  const baseUrl = `https://drive.google.com/uc?export=download&id=${fileId}`
  let res = await fetch(baseUrl, { redirect: 'follow' })

  const contentType = res.headers.get('content-type') || ''
  // For files >~100MB, Drive returns an HTML page with a confirm token instead of bytes.
  if (contentType.includes('text/html')) {
    const html = await res.text()
    const confirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/) || html.match(/name="confirm"\s+value="([^"]+)"/)
    const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/)
    if (!confirmMatch) {
      throw new Error('Drive file is not publicly accessible. Set sharing to "Anyone with the link".')
    }
    const params = new URLSearchParams({ id: fileId, export: 'download', confirm: confirmMatch[1] })
    if (uuidMatch) params.set('uuid', uuidMatch[1])
    res = await fetch(`https://drive.usercontent.google.com/download?${params.toString()}`, { redirect: 'follow' })
    if (!res.ok) throw new Error(`Drive returned ${res.status} on confirm step`)
  }

  if (!res.ok) throw new Error(`Drive returned ${res.status}`)

  // Size check before buffering — prevents OOM crash on huge files.
  const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
  if (contentLength && contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Drive file is ${(contentLength / 1024 / 1024).toFixed(1)}MB; max supported is ${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB. Compress or split the video.`)
  }

  const disposition = res.headers.get('content-disposition') || ''
  const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const fileName = nameMatch ? decodeURIComponent(nameMatch[1]) : `drive-${fileId}.mp4`
  const mimeType = res.headers.get('content-type') || 'video/mp4'
  const buffer = Buffer.from(await res.arrayBuffer())

  // Final guard for responses missing content-length header
  if (buffer.length > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Drive file is ${(buffer.length / 1024 / 1024).toFixed(1)}MB; max supported is ${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB.`)
  }

  return { buffer, fileName, mimeType }
}

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || ''

    let buffer, fileName, mimeType, adAccountId, previewId = null

    if (contentType.includes('application/json')) {
      const body = await request.json()
      const rawInput = (body.mediaUrl || body.driveUrl || '').trim()
      // Strip any surrounding share-text so "Check out this TikTok! https://..." works.
      const mediaUrl = extractFirstUrl(rawInput)
      adAccountId = body.adAccountId
      if (!mediaUrl || !adAccountId) {
        return NextResponse.json({ success: false, error: 'mediaUrl and adAccountId are required' }, { status: 400 })
      }
      if (!/^https?:\/\//i.test(mediaUrl)) {
        return NextResponse.json({ success: false, error: 'No valid http(s) URL found in input' }, { status: 400 })
      }

      let fetched
      try {
        if (isAdLibraryUrl(mediaUrl)) {
          // Meta Ad Library: prefer yt-dlp's dedicated facebook:ads extractor
          // (it handles Meta's anti-bot/cookie dance properly). If that fails,
          // fall back to our HTML scraper. If both fail, surface a clean error.
          try {
            fetched = await downloadViaYtDlp(mediaUrl)
          } catch (ytErr) {
            console.warn('[Upload] yt-dlp Ad Library extractor failed, trying HTML scraper:', ytErr.message)
            try {
              fetched = await downloadFromAdLibrary(mediaUrl)
            } catch (scrapeErr) {
              throw new Error(
                `Could not fetch from Ad Library — yt-dlp said "${ytErr.message}", HTML scraper said "${scrapeErr.message}". ` +
                `Workaround: open the ad, right-click the video → "Copy video address", paste that .mp4 URL here.`
              )
            }
          }
        } else if (isDriveUrl(mediaUrl)) {
          const fileId = extractDriveFileId(mediaUrl)
          if (!fileId) {
            return NextResponse.json({ success: false, error: 'Could not parse Google Drive file ID from URL' }, { status: 400 })
          }
          fetched = await fetchFromGoogleDrive(fileId)
        } else if (isSocialUrl(mediaUrl)) {
          // TikTok / YouTube / Facebook / Instagram / Twitter / Vimeo — via yt-dlp
          fetched = await downloadViaYtDlp(mediaUrl)
        } else {
          // Generic direct URL (S3, Dropbox direct, CDN, etc.)
          fetched = await downloadDirect(mediaUrl)
        }
      } catch (downloadErr) {
        // Make download failures distinguishable from Meta upload failures
        return NextResponse.json({ success: false, error: `Download failed: ${downloadErr.message}` }, { status: 500 })
      }
      buffer = fetched.buffer
      fileName = fetched.fileName
      mimeType = fetched.mimeType
      // Keep the bytes in memory briefly so the launcher UI can play them back
      // (file uploads handle this client-side with URL.createObjectURL).
      previewId = storePreview(buffer, mimeType)
    } else {
      const formData = await request.formData()
      const file = formData.get('file')
      adAccountId = formData.get('adAccountId')
      if (!file || !adAccountId) {
        return NextResponse.json({ success: false, error: 'file and adAccountId are required' }, { status: 400 })
      }
      buffer = Buffer.from(await file.arrayBuffer())
      fileName = file.name
      mimeType = file.type
    }

    const isImage = (mimeType || '').toLowerCase().startsWith('image/')
    const token = await findTokenForAdAccount(adAccountId)
    const sizeMb = (buffer.length / 1024 / 1024).toFixed(1)
    console.log(`[Upload] ${fileName} (${sizeMb} MB, ${mimeType}) → ${isImage ? 'image' : 'video'} upload`)

    if (isImage) {
      const result = await uploadImage(token, adAccountId, buffer, fileName, mimeType)
      return NextResponse.json({
        success: true,
        type: 'image',
        hash: result.hash,
        url: result.url,
        name: fileName,
        previewId,
      })
    } else {
      const result = await uploadVideo(token, adAccountId, buffer, fileName, mimeType)
      return NextResponse.json({
        success: true,
        type: 'video',
        videoId: result.id,
        id: result.id,
        title: result.title,
        name: fileName,
        previewId,
      })
    }
  } catch (error) {
    console.error('[Upload] Error:', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
