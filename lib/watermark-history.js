// Track the most-recently-used watermark strings so the launcher form can
// offer them as quick-select chips. Per-browser localStorage; single-user app.
const STORAGE_KEY = 'watermark-history-v1'
const MAX_ENTRIES = 5

export function loadWatermarkHistory() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x.trim()) : []
  } catch {
    return []
  }
}

export function pushWatermarkHistory(text) {
  if (typeof window === 'undefined') return
  const trimmed = (text || '').trim()
  if (!trimmed) return
  try {
    const current = loadWatermarkHistory()
    // Move-to-front so the freshest watermark is always first
    const deduped = [trimmed, ...current.filter(x => x !== trimmed)].slice(0, MAX_ENTRIES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped))
  } catch {}
}
