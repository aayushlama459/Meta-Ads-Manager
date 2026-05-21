// Client-side localStorage helpers for auto-saving the /launcher/new form.
// Versioned key so we can change the shape later without crashing on old drafts.
const STORAGE_KEY = 'launcher-draft-v1'

export function loadDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function saveDraft(state) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    // localStorage quota or serialization error — drop silently rather than block the UI
    console.warn('[launcher-draft] save failed:', err?.message || err)
  }
}

export function clearDraft() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
