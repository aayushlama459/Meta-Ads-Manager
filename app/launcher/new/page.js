'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Combobox from '@/components/Combobox'
import { loadDraft, saveDraft, clearDraft } from '@/lib/launcher-draft'

const OBJECTIVES = [
  { value: 'OUTCOME_SALES', label: 'Sales' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement' },
]
const DESTINATIONS = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'MESSENGER', label: 'Messenger' },
]
const CTA_OPTIONS = {
  OUTCOME_SALES: ['ORDER_NOW', 'SHOP_NOW', 'BUY_NOW', 'GET_OFFER'],
  OUTCOME_ENGAGEMENT: ['LEARN_MORE', 'LIKE_PAGE', 'SEND_MESSAGE', 'CONTACT_US'],
}
const CTA_LABELS = {
  ORDER_NOW: 'Order Now',
  SHOP_NOW: 'Shop Now',
  BUY_NOW: 'Buy Now',
  GET_OFFER: 'Get Offer',
  LEARN_MORE: 'Learn More',
  LIKE_PAGE: 'Like Page',
  SEND_MESSAGE: 'Send Message',
  CONTACT_US: 'Contact Us',
}
// Location presets — each ad set picks one of these.
// Add new entries here as you expand to other regions/cities.
const LOCATION_PRESETS = [
  {
    id: 'inside-valley',
    label: 'Inside Valley (Kathmandu, Lalitpur, Bhaktapur)',
    geoPreset: { cities: ['Kathmandu, Nepal', 'Lalitpur, Nepal', 'Bhaktapur, Nepal'], radiusKm: 25 },
  },
  {
    id: 'nepal',
    label: 'Nepal (whole country)',
    geoPreset: { countries: ['NP'] },
  },
]

export default function LauncherPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const duplicateId = searchParams.get('duplicate')
  const [duplicateBanner, setDuplicateBanner] = useState(null)  // { sourceName } | null

  // ── API Data ──────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState([])
  const [pages, setPages] = useState([])
  const [pixels, setPixels] = useState([])

  // ── Form State ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    adAccountId: '', pageId: '', pixelId: '',
    campaignName: '', objective: 'OUTCOME_SALES', destination: 'WEBSITE',
    budgetLevel: 'CAMPAIGN',    // 'CAMPAIGN' (CBO, default) | 'ADSET' (ABO)
    dailyBudget: '5',
    ageMin: '18', ageMax: '65', genders: '',
    cta: 'ORDER_NOW', landingUrl: '',
    // Optional scheduled start — blank = launch immediately
    scheduleDate: '',           // YYYY-MM-DD (Nepal local)
    scheduleTime: '',           // HH:MM (Nepal local)
  })

  // Copy variants — one ad is created per (media × variant) combination.
  // Always at least one row so the UI has something to render.
  const [copyVariants, setCopyVariants] = useState([
    { key: 'cv_1', primaryText: '', headline: '', description: '' },
  ])
  const [activeVariantIdx, setActiveVariantIdx] = useState(0)
  const cvKeyRef = useRef(1)
  const addVariant = () => {
    cvKeyRef.current += 1
    setCopyVariants(prev => {
      const next = [...prev, { key: `cv_${cvKeyRef.current}`, primaryText: '', headline: '', description: '' }]
      setActiveVariantIdx(next.length - 1)  // jump to the new tab
      return next
    })
  }
  const updateVariant = (key, patch) => {
    setCopyVariants(prev => prev.map(v => v.key === key ? { ...v, ...patch } : v))
  }
  const removeVariant = (key) => {
    setCopyVariants(prev => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(v => v.key === key)
      const next = prev.filter(v => v.key !== key)
      // After removal, keep the active tab in range
      setActiveVariantIdx(curr => Math.min(curr, next.length - 1, idx > 0 ? idx - 1 : 0))
      return next
    })
  }
  const filledVariants = copyVariants.filter(v => v.primaryText.trim() && v.headline.trim())
  const safeActiveIdx = Math.min(activeVariantIdx, copyVariants.length - 1)
  const activeVariant = copyVariants[safeActiveIdx]

  // Ad sets — first one defaults to Inside Valley
  const [adSetsList, setAdSetsList] = useState([
    { key: 'as_1', presetId: 'inside-valley' },
  ])
  const addAdSet = () => {
    setAdSetsList(prev => [
      ...prev,
      { key: `as_${Date.now()}`, presetId: 'nepal' },  // new ones default to Nepal
    ])
  }
  const updateAdSet = (key, patch) => {
    setAdSetsList(prev => prev.map(a => a.key === key ? { ...a, ...patch } : a))
  }
  const removeAdSet = (key) => {
    setAdSetsList(prev => prev.length > 1 ? prev.filter(a => a.key !== key) : prev)
  }

  // ── Media State ───────────────────────────────────────────────────────────
  // mediaItems: [{ key, file?, name, mediaType, previewUrl, status, progress, mediaId?, mediaHash?, errorMsg?, source }]
  const [mediaSource, setMediaSource] = useState('file')   // 'file' | 'drive'
  const [driveUrl, setDriveUrl] = useState('')
  const [mediaItems, setMediaItems] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)
  const keyCounterRef = useRef(0)
  const nextKey = () => `m_${++keyCounterRef.current}_${Date.now()}`

  // ── UI State ──────────────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchResult, setLaunchResult] = useState(null)  // null | { success, ... }
  // When set, a modal pops up to play this media item. Cleared on close.
  const [previewItem, setPreviewItem] = useState(null)

  // ── Draft Auto-Save ───────────────────────────────────────────────────────
  // null = not yet checked; { savedAt } = restored from localStorage on mount
  const [draftRestored, setDraftRestored] = useState(null)
  // Set to true right before we restore form.adAccountId from a draft so the
  // pageId/pixelId reset effect doesn't immediately wipe our restored selections.
  const skipNextAcctReset = useRef(false)
  // Wait until restore finishes before we start saving — otherwise the initial
  // empty render would overwrite the saved draft on mount.
  const draftRestoreDoneRef = useRef(false)

  // ── Fetch accounts on load ───────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/launcher/accounts').then(r => r.json()).then(d => { if (d.success) setAccounts(d.data) })
  }, [])

  // ── Pre-fill form when ?duplicate=<campaignId> is present ───────────────
  // Reuses the original campaign's settings (audience, budget, copy, page,
  // CTA, landing URL) but does NOT carry media — the user re-uploads fresh.
  useEffect(() => {
    if (!duplicateId) return
    const acctHint = searchParams.get('adAccountId') || ''
    fetch(`/api/launcher/campaigns/${duplicateId}/duplicate${acctHint ? `?adAccountId=${encodeURIComponent(acctHint)}` : ''}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) {
          alert(`Could not load original campaign: ${d.error}`)
          return
        }
        const t = d.data
        setForm(prev => ({
          ...prev,
          adAccountId: t.adAccountId || prev.adAccountId,
          pageId: t.pageId || prev.pageId,
          campaignName: t.campaignName,
          objective: t.objective,
          budgetLevel: t.budgetLevel,
          dailyBudget: t.dailyBudget,
          ageMin: String(t.ageMin),
          ageMax: String(t.ageMax),
          genders: t.genders,
          cta: t.cta,
          landingUrl: t.landingUrl,
        }))
        if (Array.isArray(t.copyVariants) && t.copyVariants.length > 0) {
          setCopyVariants(t.copyVariants.map((v, i) => {
            cvKeyRef.current += 1
            return {
              key: `cv_${cvKeyRef.current}`,
              primaryText: v.primaryText || '',
              headline: v.headline || '',
              description: v.description || '',
            }
          }))
        }
        setDuplicateBanner({ sourceName: t.sourceCampaignName })
      })
      .catch(err => alert(`Duplicate failed: ${err.message}`))
  }, [duplicateId])

  // ── Fetch pages + pixels when account changes ─────────────────────────────
  useEffect(() => {
    if (!form.adAccountId) {
      setPages([])
      setPixels([])
      setForm(f => ({ ...f, pageId: '', pixelId: '' }))
      return
    }
    // Reset selections — UNLESS this fired because draft restore just set the
    // account; in that case, keep the restored pageId/pixelId intact.
    if (skipNextAcctReset.current) {
      skipNextAcctReset.current = false
    } else {
      setForm(f => ({ ...f, pageId: '', pixelId: '' }))
    }
    // Fetch pages valid for this account
    fetch(`/api/launcher/pages?adAccountId=${form.adAccountId}`)
      .then(r => r.json()).then(d => { if (d.success) setPages(d.data) })
    // Fetch pixels for this account
    fetch(`/api/launcher/pixels?adAccountId=${form.adAccountId}`)
      .then(r => r.json()).then(d => { if (d.success) setPixels(d.data) })
  }, [form.adAccountId])

  // ── Restore draft on mount (skip if ?duplicate= flow is in progress) ──────
  useEffect(() => {
    if (duplicateId) {
      draftRestoreDoneRef.current = true  // duplicate flow owns the page state
      return
    }
    const draft = loadDraft()
    if (!draft) {
      draftRestoreDoneRef.current = true
      return
    }
    if (draft.form && typeof draft.form === 'object') {
      if (draft.form.adAccountId) skipNextAcctReset.current = true
      setForm(prev => ({ ...prev, ...draft.form }))
    }
    if (Array.isArray(draft.copyVariants) && draft.copyVariants.length) {
      setCopyVariants(draft.copyVariants)
      const maxN = draft.copyVariants.reduce((m, v) => {
        const match = typeof v.key === 'string' && v.key.match(/^cv_(\d+)/)
        return match ? Math.max(m, parseInt(match[1], 10)) : m
      }, 0)
      cvKeyRef.current = maxN
    }
    if (typeof draft.activeVariantIdx === 'number') {
      setActiveVariantIdx(draft.activeVariantIdx)
    }
    if (Array.isArray(draft.adSetsList) && draft.adSetsList.length) {
      setAdSetsList(draft.adSetsList)
    }
    if (Array.isArray(draft.mediaItems) && draft.mediaItems.length) {
      setMediaItems(draft.mediaItems)
      const maxN = draft.mediaItems.reduce((m, it) => {
        const match = typeof it.key === 'string' && it.key.match(/^m_(\d+)_/)
        return match ? Math.max(m, parseInt(match[1], 10)) : m
      }, 0)
      keyCounterRef.current = maxN
    }
    setDraftRestored({ savedAt: draft.savedAt || null })
    draftRestoreDoneRef.current = true
  }, [duplicateId])

  // ── Auto-save draft on any meaningful state change (debounced) ────────────
  useEffect(() => {
    if (!draftRestoreDoneRef.current) return  // don't clobber the draft during initial restore
    const timer = setTimeout(() => {
      // Only persist media items that finished uploading — the others have
      // ephemeral File/Blob refs that wouldn't survive a reload anyway.
      const persistedMedia = mediaItems
        .filter(m => m.status === 'done')
        .map(m => ({
          key: m.key,
          name: m.name,
          mediaType: m.mediaType,
          status: m.status,
          mediaId: m.mediaId,
          mediaHash: m.mediaHash,
          previewId: m.previewId,
          source: m.source,
        }))
      saveDraft({
        form,
        copyVariants,
        activeVariantIdx,
        adSetsList,
        mediaItems: persistedMedia,
        savedAt: Date.now(),
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [form, copyVariants, activeVariantIdx, adSetsList, mediaItems])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const updateItem = (key, patch) => {
    setMediaItems((items) => items.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  const removeItem = (key) => {
    setMediaItems((items) => {
      const target = items.find((it) => it.key === key)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return items.filter((it) => it.key !== key)
    })
  }

  const uploadOneFile = (item) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const fd = new FormData()
      fd.append('file', item.file)
      fd.append('adAccountId', form.adAccountId)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 95)  // cap at 95% — server-side Meta upload still pending
          updateItem(item.key, { progress: pct })
        }
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText)
          if (!data.success) throw new Error(data.error || `HTTP ${xhr.status}`)
          updateItem(item.key, {
            status: 'done',
            progress: 100,
            mediaType: data.type,
            mediaId: data.type === 'video' ? data.id : undefined,
            mediaHash: data.type === 'image' ? data.hash : undefined,
            previewId: data.previewId || undefined,
          })
          resolve(true)
        } catch (err) {
          updateItem(item.key, { status: 'error', errorMsg: err.message })
          resolve(false)
        }
      }
      xhr.onerror = () => {
        updateItem(item.key, { status: 'error', errorMsg: 'Network error' })
        resolve(false)
      }
      xhr.onabort = () => {
        updateItem(item.key, { status: 'error', errorMsg: 'Aborted' })
        resolve(false)
      }

      xhr.open('POST', '/api/launcher/upload')
      updateItem(item.key, { status: 'uploading', progress: 0 })
      xhr.send(fd)
    })
  }

  const addFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return
    if (!form.adAccountId) return alert('Select an Ad Account first.')

    const newItems = Array.from(fileList).map((f) => {
      const isImage = (f.type || '').toLowerCase().startsWith('image/')
      return {
        key: nextKey(),
        file: f,
        name: f.name,
        mediaType: isImage ? 'image' : 'video',
        previewUrl: URL.createObjectURL(f),
        status: 'pending',
        progress: 0,
        source: 'file',
      }
    })

    setMediaItems((items) => [...items, ...newItems])
    // Kick off uploads in parallel
    newItems.forEach((it) => uploadOneFile(it))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const detectUrlSource = (url) => {
    if (/drive\.google\.com/i.test(url)) return { source: 'drive', label: 'Google Drive' }
    // Ad Library check must come before generic facebook.com so it gets the right icon/label
    if (/facebook\.com\/ads\/library/i.test(url)) return { source: 'adlibrary', label: 'Meta Ad Library' }
    if (/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i.test(url)) return { source: 'tiktok', label: 'TikTok' }
    if (/youtube\.com|youtu\.be/i.test(url)) return { source: 'youtube', label: 'YouTube' }
    if (/facebook\.com|fb\.watch|fb\.com/i.test(url)) return { source: 'facebook', label: 'Facebook' }
    if (/instagram\.com/i.test(url)) return { source: 'instagram', label: 'Instagram' }
    if (/twitter\.com|x\.com/i.test(url)) return { source: 'twitter', label: 'Twitter / X' }
    if (/vimeo\.com/i.test(url)) return { source: 'vimeo', label: 'Vimeo' }
    return { source: 'url', label: 'Direct URL' }
  }

  const addMediaUrl = async () => {
    const url = driveUrl.trim()
    if (!url) return alert('Paste a URL first.')
    if (!form.adAccountId) return alert('Select an Ad Account first.')

    const { source, label } = detectUrlSource(url)
    const item = {
      key: nextKey(),
      file: null,
      name: `${label} file`,
      mediaType: 'video',   // assume video by default; server returns actual type
      previewUrl: null,
      status: 'uploading',
      progress: 0,
      source,
    }
    setMediaItems((items) => [...items, item])
    setDriveUrl('')

    try {
      // URL path can't show real progress — indeterminate state
      const res = await fetch('/api/launcher/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl: url, adAccountId: form.adAccountId }),
      })
      // Read as text first so we can give a useful error even when the server
      // dies mid-response (no body) or returns HTML instead of JSON.
      const raw = await res.text()
      let data
      try { data = JSON.parse(raw) } catch {
        throw new Error(
          raw.trim()
            ? `Server returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 120)}`
            : `Server returned empty response (HTTP ${res.status}). The download likely crashed — check the terminal logs. Try a smaller file or a direct .mp4 URL.`
        )
      }
      if (!data.success) throw new Error(data.error || `HTTP ${res.status}`)
      updateItem(item.key, {
        status: 'done',
        progress: 100,
        name: data.name || `${label} file`,
        mediaType: data.type,
        mediaId: data.type === 'video' ? data.id : undefined,
        mediaHash: data.type === 'image' ? data.hash : undefined,
        previewId: data.previewId || undefined,
      })
    } catch (err) {
      updateItem(item.key, { status: 'error', errorMsg: err.message })
    }
  }

  const generateCopy = async () => {
    if (!form.landingUrl.trim()) return alert('Enter Landing URL first to generate copy.')
    setIsGenerating(true)
    try {
      const res = await fetch('/api/launcher/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landingUrl: form.landingUrl,
          objective: form.objective,
          cta: form.cta,
          variantCount: 3,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      const variants = Array.isArray(data.variants) ? data.variants : []
      if (variants.length === 0) throw new Error('No variants returned')
      // Replace the variant list with what the AI returned (each gets a fresh key)
      setCopyVariants(variants.map((v) => {
        cvKeyRef.current += 1
        return {
          key: `cv_${cvKeyRef.current}`,
          primaryText: v.primaryText || '',
          headline: v.headline || '',
          description: v.description || '',
        }
      }))
      setActiveVariantIdx(0)
    } catch (err) {
      alert('Copy generation failed: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const readyMedia = mediaItems.filter((m) => m.status === 'done')
  const anyUploading = mediaItems.some((m) => m.status === 'uploading' || m.status === 'pending')
  const totalAds = readyMedia.length * filledVariants.length

  // Convert "YYYY-MM-DD" + "HH:MM" (Nepal local) → ISO UTC for Meta start_time
  const buildStartTimeUTC = () => {
    if (!form.scheduleDate || !form.scheduleTime) return null
    const [y, m, d] = form.scheduleDate.split('-').map(Number)
    const [hh, mm] = form.scheduleTime.split(':').map(Number)
    // Nepal = UTC+5:45 → UTC = Nepal - 5h45m
    const utcMs = Date.UTC(y, m - 1, d, hh, mm) - (5 * 60 + 45) * 60 * 1000
    return new Date(utcMs).toISOString()
  }

  const scheduledStartUTC = buildStartTimeUTC()
  const isScheduled = !!scheduledStartUTC
  const scheduleInPast = scheduledStartUTC && new Date(scheduledStartUTC).getTime() <= Date.now()

  const launchAd = async () => {
    if (readyMedia.length === 0) return alert('Please upload at least one media file first.')
    if (anyUploading) return alert('Wait for all uploads to finish before launching.')
    if (!form.adAccountId || !form.pageId || !form.campaignName) {
      return alert('Please fill in Ad Account, Page, and Campaign Name.')
    }
    if (filledVariants.length === 0) {
      return alert('Please add at least one ad copy variant with both Primary Text and Headline.')
    }
    if (isScheduled && scheduleInPast) {
      return alert('Scheduled start time is in the past. Pick a future date/time or clear the schedule.')
    }
    setIsLaunching(true)
    setLaunchResult(null)
    try {
      const mediaList = readyMedia.map((m) => (
        m.mediaType === 'video'
          ? { type: 'video', id: m.mediaId, name: m.name }
          : { type: 'image', hash: m.mediaHash, name: m.name }
      ))

      // Resolve location presets → { name, geoPreset } per ad set
      const adSets = adSetsList.map((row) => {
        const preset = LOCATION_PRESETS.find(p => p.id === row.presetId) || LOCATION_PRESETS[0]
        return {
          name: `${form.campaignName} - ${preset.label.split(' (')[0]}`,
          geoPreset: preset.geoPreset,
        }
      })

      const payload = {
        ...form,
        mediaList,
        adSets,
        copyVariants: filledVariants.map(({ primaryText, headline, description }) => ({
          primaryText, headline, description,
        })),
        genders: form.genders === 'male' ? [1] : form.genders === 'female' ? [2] : [],
        ageMin: parseInt(form.ageMin),
        ageMax: parseInt(form.ageMax),
        initialStatus: 'ACTIVE',
        startTime: scheduledStartUTC || undefined,
      }
      const res = await fetch('/api/launcher/create-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.success) {
        setLaunchResult(data)
        return
      }
      // Queued — go back to the campaign list so the user can watch progress
      // there and start preparing the next launch.
      clearDraft()  // launch succeeded; the autosaved draft is no longer relevant
      router.push(`/launcher?newJob=${encodeURIComponent(data.jobId)}`)
    } catch (err) {
      setLaunchResult({ success: false, error: err.message })
    } finally {
      setIsLaunching(false)
    }
  }

  const ctaOptions = CTA_OPTIONS[form.objective] || CTA_OPTIONS.OUTCOME_SALES

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-32 md:pb-24">

      {/* Header */}
      <div className="bg-[#0a0a0a] border-b border-[#1f1f1f] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">🚀 Launch New Ad</h1>
            <p className="text-xs text-[#9ca3af] mt-0.5">Fill in the details — launch runs in the background so you can move on right after.</p>
          </div>
          <button
            onClick={launchAd}
            disabled={isLaunching || anyUploading || totalAds === 0}
            className="bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            {isLaunching ? (
              <><span className="animate-spin">⏳</span> Creating {totalAds} Ad{totalAds === 1 ? '' : 's'}...</>
            ) : (
              <><span>🚀</span> Launch {totalAds > 0 ? `${totalAds} ` : ''}Ad{totalAds === 1 ? '' : 's'}</>
            )}
          </button>
        </div>
      </div>

      {/* Launch Result Banner — color reflects whether ads were actually created */}
      {launchResult && (() => {
        const apiFailed = !launchResult.success
        const zeroSuccess = launchResult.success && launchResult.successCount === 0
        const someFailed = launchResult.success && launchResult.successCount > 0 && launchResult.failCount > 0
        const tone = (apiFailed || zeroSuccess) ? 'red' : someFailed ? 'yellow' : 'green'
        const toneCls =
          tone === 'red' ? 'bg-red-900/20 border-red-800 text-red-400'
          : tone === 'yellow' ? 'bg-yellow-900/20 border-yellow-800 text-yellow-400'
          : 'bg-green-900/20 border-green-800 text-green-400'
        const headerIcon = tone === 'red' ? '❌' : tone === 'yellow' ? '⚠️' : '✅'
        return (
        <div className={`max-w-4xl mx-auto px-4 sm:px-6 mt-4 p-4 rounded-xl border ${toneCls}`}>
          {launchResult.success ? (
            <div>
              <p className="font-semibold">
                {headerIcon} {launchResult.message}
              </p>
              <p className="text-sm mt-1">
                Campaign ID: <code>{launchResult.campaignId}</code>
              </p>
              {launchResult.adSets && launchResult.adSets.length > 0 && (
                <div className="text-sm mt-2 space-y-2">
                  {launchResult.adSets.map((set, i) => (
                    <div key={i} className="pl-2 border-l-2 border-current/30">
                      <div className="font-medium">
                        {set.success ? '🎯' : '❌'} {set.name}
                        {set.adSetId && <> · <code className="text-xs">{set.adSetId}</code></>}
                      </div>
                      {set.error && <div className="text-xs opacity-75 mt-0.5">{set.error}</div>}
                      {set.ads && set.ads.length > 0 && (
                        <ul className="ml-4 mt-1 space-y-0.5 text-xs opacity-90">
                          {set.ads.map((ad, j) => (
                            <li key={j}>
                              {ad.success ? '✅' : '❌'} {ad.label} — {ad.success ? <code>{ad.adId}</code> : ad.error}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="font-semibold">❌ Error Creating Ads</p>
              <p className="text-sm mt-1">{launchResult.error}</p>
            </div>
          )}
        </div>
        )
      })()}

      {duplicateBanner && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-4 p-3 rounded-lg border border-[#4f46e5]/30 bg-[#4f46e5]/10 text-indigo-300 text-sm">
          📋 Duplicated from <span className="font-semibold text-white">{duplicateBanner.sourceName}</span> — settings pre-filled. Upload fresh media and tweak anything before launching.
        </div>
      )}

      {draftRestored && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm flex items-center justify-between gap-3">
          <div>
            💾 Restored your in-progress draft{draftRestored.savedAt ? ` (saved ${new Date(draftRestored.savedAt).toLocaleString()})` : ''}. Keep editing where you left off.
          </div>
          <button
            onClick={() => {
              if (!confirm('Discard the saved draft and start with a blank form? This cannot be undone.')) return
              clearDraft()
              window.location.href = '/launcher/new'
            }}
            className="shrink-0 px-3 py-1.5 rounded-md border border-emerald-500/40 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
          >
            Start fresh
          </button>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Cards stacked vertically — step 1 → 2 → 3 → 4 top to bottom */}

          {/* Card 1: Account & Destination */}
          <div className="bg-[#111111] rounded-xl border border-[#1f1f1f]">
            <CardHeader step={1} title="Account & Destination" isComplete={form.adAccountId && form.pageId} />
            <div className="p-5 space-y-4">
              <Field label="Ad Account *">
                <Combobox
                  value={form.adAccountId}
                  onChange={(v) => set('adAccountId', v)}
                  options={accounts}
                  placeholder="Select an Ad Account..."
                  emptyText="No ad accounts found"
                  getSubtitle={(a) => a.id}
                />
              </Field>
              <Field label="Facebook Page *">
                <Combobox
                  value={form.pageId}
                  onChange={(v) => set('pageId', v)}
                  options={pages}
                  placeholder="Select a Page..."
                  emptyText="No pages found"
                  getSubtitle={(p) => p.id}
                />
              </Field>
              <Field label="Meta Pixel">
                <Combobox
                  value={form.pixelId}
                  onChange={(v) => set('pixelId', v)}
                  options={pixels}
                  placeholder="No pixel (or not applicable)"
                  emptyText={form.adAccountId ? 'No pixels in this account' : 'Select an Ad Account first'}
                  getSubtitle={(p) => p.id}
                />
              </Field>
            </div>
          </div>

          {/* Card 2: Campaign Setup */}
          <div className="bg-[#111111] rounded-xl border border-[#1f1f1f]">
            <CardHeader step={2} title="Campaign Setup" isComplete={form.campaignName.trim().length > 0 && form.dailyBudget} />
            <div className="p-5 space-y-4">
              <Field label="Campaign Name *">
                <input type="text" className={inputCls} placeholder="e.g. Kitchen Cleaner - Nepal - May" value={form.campaignName} onChange={e => set('campaignName', e.target.value)} />
              </Field>
              <Field label="Objective">
                <div className="grid grid-cols-2 gap-2">
                  {OBJECTIVES.map(o => (
                    <button key={o.value} onClick={() => set('objective', o.value)}
                      className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${form.objective === o.value ? 'border-[#4f46e5] bg-[#4f46e5]/10 text-[#4f46e5]' : 'border-[#333333] bg-[#1a1a1a] text-[#9ca3af] hover:bg-[#2a2a2a]'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </Field>
              {form.objective === 'OUTCOME_SALES' && (
                <Field label="Destination">
                  <div className="grid grid-cols-2 gap-2">
                    {DESTINATIONS.map(d => (
                      <button key={d.value} onClick={() => set('destination', d.value)}
                        className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${form.destination === d.value ? 'border-[#4f46e5] bg-[#4f46e5]/10 text-[#4f46e5]' : 'border-[#333333] bg-[#1a1a1a] text-[#9ca3af] hover:bg-[#2a2a2a]'}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {/* Budget level + daily budget */}
              <Field label={`Daily Budget ($) * — ${form.budgetLevel === 'CAMPAIGN' ? 'campaign-wide (CBO)' : 'per ad set (ABO)'}`}>
                <div className="flex items-stretch gap-2">
                  <div className="flex bg-[#1a1a1a] border border-[#333333] rounded-lg p-0.5">
                    {[
                      { v: 'CAMPAIGN', label: 'Campaign' },
                      { v: 'ADSET', label: 'Ad Set' },
                    ].map(o => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => set('budgetLevel', o.v)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${form.budgetLevel === o.v ? 'bg-[#4f46e5] text-white' : 'text-[#9ca3af] hover:text-white'}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    className={`${inputCls} flex-1`}
                    value={form.dailyBudget}
                    onChange={e => set('dailyBudget', e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-[#9ca3af] mt-1.5 leading-snug">
                  {form.budgetLevel === 'CAMPAIGN'
                    ? 'Meta auto-distributes this budget across your ad sets based on performance.'
                    : 'Each ad set gets this daily budget (so total spend = budget × number of ad sets).'}
                </p>
              </Field>

              {/* Ad Sets — one entry per location/audience split */}
              <Field label={`Ad Sets (${adSetsList.length}) — same ads, different targeting`}>
                <div className="space-y-2">
                  {adSetsList.map((row, idx) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <span className="text-[11px] text-[#6b7280] font-mono w-6 flex-shrink-0">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <Combobox
                          value={row.presetId}
                          onChange={(v) => updateAdSet(row.key, { presetId: v })}
                          options={LOCATION_PRESETS.map(p => ({ id: p.id, name: p.label }))}
                          placeholder="Pick a location preset..."
                          emptyText="No presets"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAdSet(row.key)}
                        disabled={adSetsList.length === 1}
                        className="flex-shrink-0 text-[#9ca3af] hover:text-red-400 disabled:opacity-30 disabled:hover:text-[#9ca3af] text-sm w-7 h-9 flex items-center justify-center rounded hover:bg-red-500/10 transition-colors"
                        title={adSetsList.length === 1 ? 'At least one ad set is required' : 'Remove'}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addAdSet}
                  className="mt-2 text-xs text-[#4f46e5] hover:text-[#6366f1] font-medium transition-colors"
                >
                  + Add another ad set
                </button>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Age Min">
                  <input type="number" className={inputCls} value={form.ageMin} onChange={e => set('ageMin', e.target.value)} />
                </Field>
                <Field label="Age Max">
                  <input type="number" className={inputCls} value={form.ageMax} onChange={e => set('ageMax', e.target.value)} />
                </Field>
                <Field label="Gender">
                  <select className={selectCls} value={form.genders} onChange={e => set('genders', e.target.value)}>
                    <option value="">All</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>
              </div>

              {/* Schedule (optional — leave blank to launch immediately) */}
              <Field label="Schedule Start (optional — Nepal time)">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.scheduleDate}
                    onChange={e => set('scheduleDate', e.target.value)}
                  />
                  <input
                    type="time"
                    className={inputCls}
                    value={form.scheduleTime}
                    onChange={e => set('scheduleTime', e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-[#9ca3af] leading-snug">
                    {isScheduled
                      ? scheduleInPast
                        ? '⚠️ The selected time is in the past. Pick a future moment or clear it.'
                        : `📅 Meta will hold delivery until ${form.scheduleDate} ${form.scheduleTime} NPT.`
                      : '🟢 Leave blank → ads go live as soon as Meta finishes review.'}
                  </p>
                  {isScheduled && (
                    <button
                      type="button"
                      onClick={() => { set('scheduleDate', ''); set('scheduleTime', '') }}
                      className="text-[11px] text-[#9ca3af] hover:text-white underline whitespace-nowrap ml-3"
                    >
                      Clear schedule
                    </button>
                  )}
                </div>
              </Field>
            </div>
          </div>

          {/* Card 3: Media Upload */}
          <div className="bg-[#111111] rounded-xl border border-[#1f1f1f]">
            <CardHeader step={3} title="Creative Media" isComplete={readyMedia.length > 0} />
            <div className="p-5">
              {/* Source Tabs */}
              <div className="flex gap-2 mb-4 bg-[#1a1a1a] p-1 rounded-lg border border-[#333333]">
                <button
                  onClick={() => setMediaSource('file')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mediaSource === 'file' ? 'bg-[#2a2a2a] text-[#4f46e5] shadow-sm' : 'text-[#9ca3af] hover:text-[#e5e7eb]'}`}
                >
                  📁 Upload File
                </button>
                <button
                  onClick={() => setMediaSource('drive')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mediaSource === 'drive' ? 'bg-[#2a2a2a] text-[#4f46e5] shadow-sm' : 'text-[#9ca3af] hover:text-[#e5e7eb]'}`}
                >
                  🔗 From URL
                </button>
              </div>

              {mediaSource === 'file' ? (
                <>
                  <input type="file" multiple accept="video/*,image/*" ref={fileInputRef} className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />

                  {/* Drop Zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${isDragging ? 'border-[#4f46e5] bg-[#4f46e5]/10' : 'border-[#333333] hover:bg-[#1a1a1a] hover:border-[#4f46e5]/50'}`}
                  >
                    <div className="w-12 h-12 bg-[#4f46e5]/20 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-white">Drag & Drop videos or images</p>
                    <p className="text-xs text-[#9ca3af] mt-1">MP4, MOV, JPG, PNG — multiple files OK</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="border-2 border-dashed border-[#333333] rounded-xl p-5 bg-[#1a1a1a]">
                    <label className="block text-xs font-medium text-[#e5e7eb] mb-2">Media URL (Drive, TikTok, YouTube, Facebook, Instagram, or direct)</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="Paste any video URL..."
                        value={driveUrl}
                        onChange={e => setDriveUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMediaUrl() } }}
                        className="flex-1 bg-[#111111] text-white placeholder-[#9ca3af] border border-[#333333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                      />
                      <button
                        onClick={addMediaUrl}
                        disabled={!driveUrl.trim()}
                        className="bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                      >
                        + Add
                      </button>
                    </div>
                    <div className="text-[11px] text-[#9ca3af] mt-2 leading-snug space-y-1">
                      <p>📌 Supported: <strong>Meta Ad Library</strong> (<code>/ads/library/?id=...</code>), <strong>Google Drive</strong>, <strong>TikTok</strong>, <strong>YouTube / Shorts</strong>, <strong>Facebook / Reels</strong>, <strong>Instagram</strong>, <strong>Twitter/X</strong>, <strong>Vimeo</strong>, or any direct <code>.mp4</code>/<code>.jpg</code> URL.</p>
                      <p>⚠️ Drive files need <strong>"Anyone with the link"</strong> sharing. Social URLs need <code>yt-dlp</code> installed on the server (<code>brew install yt-dlp</code>). Only use content you own the rights to.</p>
                    </div>
                  </div>
                </>
              )}

              {/* Uploaded media list */}
              {mediaItems.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{mediaItems.length} file{mediaItems.length === 1 ? '' : 's'} · {readyMedia.length} ready</span>
                    {totalAds > 0 && (
                      <span className="text-[#4f46e5] font-medium">× {filledVariants.length} copy = {totalAds} ad{totalAds === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  {mediaItems.map((m) => (
                    <MediaRow
                      key={m.key}
                      item={m}
                      onRemove={() => removeItem(m.key)}
                      onPreview={() => setPreviewItem(m)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card 4: AI Copywriter — Variants */}
          <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] relative">
            <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#4f46e5]/5 rounded-full blur-3xl"></div>
            </div>

            <CardHeader step={4} title="Ad Copy Variants & AI Assistant" isComplete={filledVariants.length > 0} extra={
              <span className="text-xs text-indigo-300 bg-indigo-900/40 border border-indigo-500/30 px-2 py-1 rounded font-medium ml-2">✨ Gemini AI</span>
            }/>

            <div className="p-5 space-y-4 relative z-10">
              {/* AI Input (Landing URL) */}
              <div className="bg-[#4f46e5]/10 border border-[#4f46e5]/20 rounded-lg p-4">
                <label className="block text-xs font-medium text-indigo-300 mb-2">Landing URL (AI reads this to write 3 copy variants) *</label>
                <div className="flex gap-2">
                  <input type="url" className="flex-1 bg-[#1a1a1a] text-white placeholder-[#9ca3af] border border-[#333333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-[#4f46e5]"
                    placeholder="https://yourwebsite.com/product..."
                    value={form.landingUrl} onChange={e => set('landingUrl', e.target.value)}
                    disabled={form.destination === 'MESSENGER'} />
                  <button onClick={generateCopy} disabled={isGenerating || form.destination === 'MESSENGER'}
                    className="bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                    {isGenerating ? '⏳ Generating...' : '✨ Generate 3 Variants'}
                  </button>
                </div>
                <p className="text-[11px] text-indigo-300/70 mt-2 leading-snug">
                  Each variant runs as a separate ad against each video → more combinations tested → faster path to a winner.
                </p>
              </div>

              {/* Variants — tab strip (click a letter to switch) */}
              <div>
                <div className="flex items-center gap-1 border-b border-[#2a2a2a] overflow-x-auto">
                  {copyVariants.map((v, idx) => {
                    const isActive = idx === safeActiveIdx
                    const filled = v.primaryText.trim() && v.headline.trim()
                    return (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => setActiveVariantIdx(idx)}
                        className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                          isActive
                            ? 'border-[#4f46e5] text-white'
                            : 'border-transparent text-[#9ca3af] hover:text-white'
                        }`}
                      >
                        <span className={filled ? 'text-green-400' : 'text-[#6b7280]'}>{filled ? '✓' : '•'}</span>
                        {' '}Copy {String.fromCharCode(65 + idx)}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={addVariant}
                    className="px-3 py-2 text-sm font-medium text-[#4f46e5] hover:text-[#6366f1] whitespace-nowrap"
                    title="Add another copy variant"
                  >
                    + Add
                  </button>
                </div>

                {/* Active variant editor */}
                {activeVariant && (
                  <div className="pt-4">
                    <VariantCard
                      key={activeVariant.key}
                      letter={String.fromCharCode(65 + safeActiveIdx)}
                      variant={activeVariant}
                      canRemove={copyVariants.length > 1}
                      onChange={(patch) => updateVariant(activeVariant.key, patch)}
                      onRemove={() => removeVariant(activeVariant.key)}
                    />
                  </div>
                )}
              </div>

              {/* Bulk-test counter */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-[#9ca3af]">
                  <span className="text-white font-semibold">{readyMedia.length}</span> media
                  <span className="mx-1.5">×</span>
                  <span className="text-white font-semibold">{filledVariants.length}</span> copy variant{filledVariants.length === 1 ? '' : 's'}
                  <span className="mx-1.5">=</span>
                  <span className="text-[#4f46e5] font-bold text-base">{readyMedia.length * filledVariants.length}</span> ad{readyMedia.length * filledVariants.length === 1 ? '' : 's'}
                </div>
                <span className="text-[11px] text-[#6b7280]">created when you launch</span>
              </div>

              {/* CTA (shared across all variants) */}
              <Field label="Call to Action * (shared by all variants)">
                <Combobox
                  value={form.cta}
                  onChange={(v) => set('cta', v)}
                  options={ctaOptions.map((c) => ({ id: c, name: CTA_LABELS[c] || c.replace(/_/g, ' ') }))}
                  placeholder="Choose a call-to-action button..."
                  emptyText="No CTAs available"
                />
              </Field>
            </div>
          </div>

        {/* Preview Modal — opens when a media-row thumbnail is clicked */}
        {previewItem && (
          <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
        )}

        {/* Sticky Launch Bar (Usability Enhancement) */}
        <div className="fixed bottom-0 left-0 w-full z-50 p-6 pointer-events-none flex justify-center">
          <div className="bg-[#111111] border border-[#1f1f1f] shadow-2xl rounded-2xl p-3 flex items-center gap-8 pointer-events-auto">
            <div className="flex flex-col">
              <p className="text-sm font-bold text-white tracking-wide">{totalAds} Ad{totalAds === 1 ? '' : 's'} Ready</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isScheduled && !scheduleInPast ? (
                  <span className="text-xs">📅</span>
                ) : (
                  <div className="w-2.5 h-2.5 bg-[#10b981] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                )}
                <p className="text-xs text-[#9ca3af]">
                  {isScheduled && !scheduleInPast
                    ? `${form.scheduleDate} ${form.scheduleTime} NPT`
                    : `${readyMedia.length} media × ${filledVariants.length} copy · $${form.dailyBudget}/day`}
                </p>
              </div>
            </div>
            <button onClick={launchAd} disabled={isLaunching || anyUploading || totalAds === 0}
              className="bg-[#5b50e5] hover:bg-[#4f46e5] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(91,80,229,0.2)] hover:shadow-[0_0_25px_rgba(91,80,229,0.4)] transition-all flex items-center justify-center gap-2.5">
              {isLaunching
                ? <><span className="animate-spin">⏳</span> Creating...</>
                : isScheduled && !scheduleInPast
                  ? <><span>📅</span> Schedule {totalAds} Ad{totalAds === 1 ? '' : 's'}</>
                  : <>
                      <div className="w-3 h-3 bg-[#10b981] rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)] border border-[#10b981]/50"></div>
                      Launch {totalAds} Ad{totalAds === 1 ? '' : 's'} Live
                    </>}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Reusable Sub-Components ───────────────────────────────────────────────────
function CardHeader({ step, title, isComplete, extra }) {
  return (
    <div className="px-5 py-4 border-b border-[#1f1f1f] bg-[#1a1a1a]/50 rounded-t-xl flex items-center justify-between">
      <h2 className="text-base font-semibold flex items-center gap-3">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isComplete ? 'bg-green-500/20 text-green-500' : 'bg-[#4f46e5]/20 text-[#6366f1]'}`}>
          {isComplete ? '✓' : step}
        </span>
        <span className="text-white">{title}</span>
        {extra}
      </h2>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#e5e7eb] mb-1">{label}</label>
      {children}
    </div>
  )
}

function VariantCard({ letter, variant, canRemove, onChange, onRemove }) {
  const filled = variant.primaryText.trim() && variant.headline.trim()
  return (
    <div className={`bg-[#1a1a1a] border rounded-lg p-4 transition-colors ${filled ? 'border-[#2a2a2a]' : 'border-[#333333]'}`}>
      {/* Header — just a delete button on the right; tab strip above shows the letter */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#9ca3af]">Editing <span className="text-white font-semibold">Copy {letter}</span></span>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          title={canRemove ? `Remove Copy ${letter}` : 'At least one variant is required'}
          className="text-xs text-[#9ca3af] hover:text-red-400 disabled:opacity-30 disabled:hover:text-[#9ca3af] flex items-center gap-1 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
        >
          ✕ Delete Copy {letter}
        </button>
      </div>
      <Field label="Primary Text (Caption) *">
        <textarea
          rows="6"
          className={`${inputCls} resize-y min-h-[8rem] leading-relaxed`}
          placeholder="Hook, offer, benefits, CTA…"
          value={variant.primaryText}
          onChange={e => onChange({ primaryText: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Headline *">
          <input
            type="text"
            className={inputCls}
            placeholder="e.g. Free Delivery Nepal"
            value={variant.headline}
            onChange={e => onChange({ headline: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <input
            type="text"
            className={inputCls}
            placeholder="Short trust line"
            value={variant.description}
            onChange={e => onChange({ description: e.target.value })}
          />
        </Field>
      </div>
    </div>
  )
}

function PreviewModal({ item, onClose }) {
  const { name, mediaType, previewUrl, previewId } = item
  const src = previewUrl || (previewId ? `/api/launcher/preview/${previewId}` : null)
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full bg-[#111111] border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
          <p className="text-sm text-white font-medium truncate pr-4">{name}</p>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9ca3af] hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="bg-black flex items-center justify-center" style={{ minHeight: '40vh', maxHeight: '70vh' }}>
          {src && mediaType === 'video' ? (
            <video
              src={src}
              controls
              autoPlay
              className="max-w-full max-h-[70vh]"
            />
          ) : src && mediaType === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={name} className="max-w-full max-h-[70vh] object-contain" />
          ) : (
            <p className="text-[#9ca3af] text-sm py-12">Preview not available</p>
          )}
        </div>
      </div>
    </div>
  )
}

function MediaRow({ item, onRemove, onPreview }) {
  const { name, mediaType, previewUrl, previewId, status, progress, mediaId, mediaHash, errorMsg, source } = item

  const statusColor =
    status === 'done' ? 'bg-green-500'
    : status === 'error' ? 'bg-red-500'
    : 'bg-[#4f46e5]'

  const isUrlSource = source !== 'file'
  const sourceIcon = {
    drive: '🔗',
    adlibrary: '📚',
    tiktok: '🎵',
    youtube: '▶️',
    facebook: '📘',
    instagram: '📷',
    twitter: '🐦',
    vimeo: '🎞️',
    url: '🌐',
  }[source] || (mediaType === 'image' ? '🖼️' : '🎬')

  // previewUrl comes from file uploads (object URL); previewId comes from URL
  // uploads (server cache). Either one means we can play the media back.
  const previewSrc = previewUrl || (previewId ? `/api/launcher/preview/${previewId}` : null)
  const canPreview = !!previewSrc && status === 'done'

  return (
    <div className="flex items-center gap-3 bg-[#1a1a1a] border border-[#333333] rounded-lg p-2.5">
      {/* Thumbnail — clickable when we can play this media */}
      <button
        type="button"
        onClick={canPreview ? onPreview : undefined}
        disabled={!canPreview}
        title={canPreview ? 'Click to preview' : 'Preview not available'}
        className={`relative w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-[#2a2a2a] flex items-center justify-center group ${canPreview ? 'cursor-pointer hover:ring-2 hover:ring-[#4f46e5]' : 'cursor-default'} transition-all`}
      >
        {previewSrc && mediaType === 'video' ? (
          <video src={previewSrc} className="w-full h-full object-cover" muted preload="metadata" />
        ) : previewSrc && mediaType === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl">{sourceIcon}</span>
        )}
        {canPreview && mediaType === 'video' && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity">▶</span>
        )}
      </button>

      {/* Info + Progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-[#e5e7eb] truncate">{name}</p>
          <span className="text-[10px] text-[#9ca3af] flex-shrink-0 uppercase tracking-wide">
            {mediaType || '...'}
          </span>
        </div>

        {status === 'done' ? (
          <p className="text-[10px] text-green-500 mt-1 font-mono truncate">
            ✓ {mediaType === 'image' ? `hash: ${mediaHash}` : `id: ${mediaId}`}
          </p>
        ) : status === 'error' ? (
          <p className="text-[10px] text-red-500 mt-1 truncate">✗ {errorMsg}</p>
        ) : (
          <>
            <div className="mt-1.5 h-1.5 bg-[#333333] rounded-full overflow-hidden">
              <div
                className={`h-full ${statusColor} transition-all duration-200 ${isUrlSource && status === 'uploading' ? 'animate-pulse w-full' : ''}`}
                style={isUrlSource && status === 'uploading' ? {} : { width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-[#9ca3af] mt-0.5">
              {isUrlSource && status === 'uploading'
                ? source === 'drive' ? 'Fetching from Drive & uploading to Meta…'
                  : source === 'adlibrary' ? 'Scraping Meta Ad Library & uploading…'
                  : source === 'url' ? 'Downloading & uploading to Meta…'
                  : `Downloading from ${source} & uploading to Meta…`
                : `${progress}%`}
            </p>
          </>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 text-[#9ca3af] hover:text-red-500 text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-[#333333] transition-colors"
        title="Remove"
      >
        ✕
      </button>
    </div>
  )
}

const inputCls = "w-full bg-[#1a1a1a] text-white placeholder-[#9ca3af] border border-[#333333] rounded-lg px-3.5 py-2.5 text-sm shadow-sm hover:border-[#555555] focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-[#4f46e5] transition-colors"
const selectCls = "select-chevron w-full bg-[#1a1a1a] text-white border border-[#333333] rounded-lg pl-3.5 pr-9 py-2.5 text-sm shadow-sm hover:border-[#555555] focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-[#4f46e5] transition-colors appearance-none cursor-pointer"
