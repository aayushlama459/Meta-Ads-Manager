const { spawn } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')

const SUPPORTED_DOMAINS = /(?:tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch|fb\.com|instagram\.com|twitter\.com|x\.com|vimeo\.com)/i

function isSocialUrl(url) {
  return SUPPORTED_DOMAINS.test(url || '')
}

function isDriveUrl(url) {
  return /drive\.google\.com/i.test(url || '')
}

function isDirectMediaUrl(url) {
  return /\.(mp4|mov|m4v|webm|jpg|jpeg|png|gif)(\?|#|$)/i.test(url || '')
}

function isAdLibraryUrl(url) {
  return /facebook\.com\/ads\/library/i.test(url || '')
}

function isTikTokUrl(url) {
  return /(?:tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(url || '')
}

// TikTok blocks datacenter IPs (e.g. Hostinger VPSes) for direct yt-dlp scraping.
// tikwm.com is a free public extractor that proxies through residential IPs.
// We use it as a fallback when yt-dlp fails. Note: third-party service — if it
// goes down or changes its API, TikTok URL import breaks. Localhost path
// continues to prefer yt-dlp (the fallback only kicks in on failure).
async function downloadFromTikwm(url) {
  const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  })
  if (!res.ok) throw new Error(`tikwm returned HTTP ${res.status}`)
  const json = await res.json()
  if (json.code !== 0 || !json.data) {
    throw new Error(`tikwm error: ${json.msg || 'unknown'}`)
  }
  // Prefer HD, then no-watermark play URL, then watermarked fallback
  const videoUrl = json.data.hdplay || json.data.play || json.data.wmplay
  if (!videoUrl) {
    throw new Error('tikwm response had no video URL (may be an image post — not yet supported)')
  }
  const videoRes = await fetch(videoUrl, { redirect: 'follow' })
  if (!videoRes.ok) throw new Error(`tikwm video URL returned HTTP ${videoRes.status}`)
  const buffer = Buffer.from(await videoRes.arrayBuffer())
  const videoId = json.data.id || 'video'
  return { buffer, fileName: `tiktok-${videoId}.mp4`, mimeType: 'video/mp4' }
}

// Meta embeds video URLs in HTML as JSON-escaped strings (e.g. https:\/\/...?a&b).
// This unescapes them back into a normal absolute URL.
function decodeEmbeddedUrl(s) {
  return String(s)
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
}

// Scrape a Meta Ad Library page like https://www.facebook.com/ads/library/?id=12345
// Tries several patterns since Meta changes the JSON shape periodically.
async function downloadFromAdLibrary(url) {
  const idMatch = url.match(/[?&]id=([0-9]+)/)
  if (!idMatch) {
    throw new Error('Ad Library URL must include ?id=<ad-id>. Example: https://www.facebook.com/ads/library/?id=123456789')
  }
  const adId = idMatch[1]

  // Fake a real browser so Meta returns the embedded JSON, not the login wall.
  const pageRes = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!pageRes.ok) {
    if (pageRes.status === 404) {
      throw new Error(`Ad Library says ad ${adId} doesn't exist. Double-check the ?id=... value in the URL.`)
    }
    if (pageRes.status === 401 || pageRes.status === 403) {
      throw new Error(
        `Meta blocked the request (HTTP ${pageRes.status}) — usually means this ad needs login to view, or Meta rate-limited us. ` +
        `Workaround: open the ad in your browser, right-click the video → "Copy video address", then paste that .mp4 URL here instead.`
      )
    }
    throw new Error(`Ad Library returned HTTP ${pageRes.status}`)
  }
  const html = await pageRes.text()

  // Login-wall heuristic: very short HTML body with "log in" text → Meta is gating it
  if (html.length < 8000 && /log in to continue|login_required|"loginRequired"/i.test(html)) {
    throw new Error(
      'Meta wants us to log in to see this ad. Fallback: open the ad in your browser, right-click the video → "Copy video address" → paste that .mp4 URL into this same field.'
    )
  }

  // Try the common JSON keys (in priority order — prefer HD), then OG meta tags
  const patterns = [
    /"video_hd_url":"([^"\\]+(?:\\.[^"\\]*)*)"/,
    /"videoHdUrl":"([^"\\]+(?:\\.[^"\\]*)*)"/,
    /"video_sd_url":"([^"\\]+(?:\\.[^"\\]*)*)"/,
    /"videoSdUrl":"([^"\\]+(?:\\.[^"\\]*)*)"/,
    /<meta\s+property="og:video:secure_url"\s+content="([^"]+)"/i,
    /<meta\s+property="og:video"\s+content="([^"]+)"/i,
  ]

  let videoUrl = null
  for (const p of patterns) {
    const m = html.match(p)
    if (m && m[1]) {
      const candidate = decodeEmbeddedUrl(m[1])
      if (/^https?:\/\//.test(candidate)) {
        videoUrl = candidate
        break
      }
    }
  }

  // Last-resort: scan for any raw fbcdn URL that looks like a video.
  // This catches the case where Meta renamed the JSON keys but the URL is still in the HTML.
  if (!videoUrl) {
    const fbcdn = html.match(/https?:[\\/]+[a-z0-9.-]*fbcdn\.net[\\/][^"'\s\\<>]+/i)
    if (fbcdn) {
      const candidate = decodeEmbeddedUrl(fbcdn[0])
      if (/\.mp4|\/v\/|video/i.test(candidate)) {
        videoUrl = candidate
      }
    }
  }

  if (!videoUrl) {
    throw new Error(
      'Could not find a video URL in the Ad Library page. Meta may have changed the page structure. ' +
      'Workaround: open the ad in your browser, right-click the video → "Copy video address", then paste that .mp4 URL here.'
    )
  }

  // Hand off to the direct downloader; rename so the filename is identifiable
  const dl = await downloadDirect(videoUrl)
  return { ...dl, fileName: `adlib-${adId}.mp4`, mimeType: 'video/mp4' }
}

// Pull the first http(s) URL out of free-form text.
// Handles cases like: "Check out this TikTok I found! https://vm.tiktok.com/xyz/"
function extractFirstUrl(text) {
  if (!text) return ''
  const m = String(text).match(/https?:\/\/[^\s"'<>]+/i)
  return m ? m[0] : String(text).trim()
}

function downloadViaYtDlp(url) {
  return new Promise((resolve, reject) => {
    let tmpDir
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-'))
    } catch (e) {
      return reject(new Error(`Could not create temp dir: ${e.message}`))
    }

    const outTemplate = path.join(tmpDir, '%(id)s.%(ext)s')
    const args = [
      '-f', 'mp4/bestvideo*+bestaudio/best',
      '--merge-output-format', 'mp4',
      '-o', outTemplate,
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--max-filesize', '4000M',
      url,
    ]

    const proc = spawn('yt-dlp', args)
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp is not installed on the server. Install it with: brew install yt-dlp (macOS) or pip install yt-dlp'))
      } else {
        reject(err)
      }
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
        reject(new Error(stderr.split('\n').filter(l => l.toLowerCase().includes('error')).slice(0, 2).join(' ') || `yt-dlp exited with code ${code}`))
        return
      }
      try {
        const files = fs.readdirSync(tmpDir)
        if (!files.length) {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
          return reject(new Error('yt-dlp produced no output file'))
        }
        const filePath = path.join(tmpDir, files[0])
        const buffer = fs.readFileSync(filePath)
        const fileName = files[0]
        const ext = path.extname(fileName).toLowerCase()
        const mimeType =
          ['.jpg', '.jpeg'].includes(ext) ? 'image/jpeg' :
          ext === '.png' ? 'image/png' :
          ext === '.gif' ? 'image/gif' :
          ext === '.webm' ? 'video/webm' :
          'video/mp4'
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
        resolve({ buffer, fileName, mimeType })
      } catch (e) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
        reject(e)
      }
    })
  })
}

async function downloadDirect(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Direct URL returned ${res.status}`)
  const mimeType = res.headers.get('content-type') || 'application/octet-stream'
  const disposition = res.headers.get('content-disposition') || ''
  const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  let fileName = nameMatch ? decodeURIComponent(nameMatch[1]) : url.split('/').pop().split('?')[0]
  if (!fileName || !fileName.includes('.')) fileName = 'media.mp4'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, fileName, mimeType }
}

module.exports = {
  isSocialUrl,
  isDriveUrl,
  isDirectMediaUrl,
  isAdLibraryUrl,
  isTikTokUrl,
  extractFirstUrl,
  downloadViaYtDlp,
  downloadDirect,
  downloadFromAdLibrary,
  downloadFromTikwm,
}
