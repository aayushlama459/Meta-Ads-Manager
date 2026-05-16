import { getPreview } from '@/lib/preview-cache'

export const runtime = 'nodejs'

export async function GET(request, { params }) {
  const { id } = params
  const entry = getPreview(id)
  if (!entry) {
    return new Response('Preview expired or not found', { status: 404 })
  }
  // Range support is not strictly needed for short videos but helps Safari/iOS scrubbing.
  const rangeHeader = request.headers.get('range')
  const total = entry.buffer.length
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (match) {
      const start = parseInt(match[1], 10)
      const end = match[2] ? parseInt(match[2], 10) : total - 1
      const chunk = entry.buffer.slice(start, end + 1)
      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': entry.mimeType,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunk.length),
          'Cache-Control': 'private, max-age=600',
        },
      })
    }
  }
  return new Response(entry.buffer, {
    headers: {
      'Content-Type': entry.mimeType,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=600',
    },
  })
}
