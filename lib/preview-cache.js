const crypto = require('crypto')

// In-process cache of recently downloaded media bytes so the launcher UI can
// play back URL-sourced uploads (Ad Library, Drive, TikTok, etc.) without
// re-downloading. Entries expire after TTL_MS so memory stays bounded.

const TTL_MS = 30 * 60 * 1000   // 30 minutes — long enough to launch the ad
const MAX_ENTRIES = 50          // hard cap; oldest entry evicted on overflow

// IMPORTANT: anchored on globalThis so the Map survives Next.js dev-mode
// hot-reloads. Without this, each route handler ends up with a different
// fresh module instance and previews 404 even though the upload succeeded.
const cache = globalThis.__previewCache || (globalThis.__previewCache = new Map())  // id -> { buffer, mimeType, expiresAt }

function gcExpired() {
  const now = Date.now()
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k)
  }
}

function storePreview(buffer, mimeType) {
  gcExpired()
  if (cache.size >= MAX_ENTRIES) {
    // Evict the entry closest to expiry (effectively oldest)
    let oldestKey = null
    let oldestExpiry = Infinity
    for (const [k, v] of cache) {
      if (v.expiresAt < oldestExpiry) {
        oldestExpiry = v.expiresAt
        oldestKey = k
      }
    }
    if (oldestKey) cache.delete(oldestKey)
  }
  const id = crypto.randomBytes(12).toString('hex')
  cache.set(id, { buffer, mimeType: mimeType || 'application/octet-stream', expiresAt: Date.now() + TTL_MS })
  return id
}

function getPreview(id) {
  const entry = cache.get(id)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(id)
    return null
  }
  return entry
}

module.exports = { storePreview, getPreview }
