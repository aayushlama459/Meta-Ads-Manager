'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

// Campaign list view — the new home for /launcher. Shows in-progress launches
// (from our job registry) at the top, then recent Meta campaigns (last 7 days)
// below. Polls every 2.5s while there's an active job.
//
// The "+ Create New Ad" button takes you to /launcher/new (the existing form).
// Each row supports Pause/Resume, Duplicate, and Open in Ads Manager.

const POLL_INTERVAL_MS = 2500

export default function LauncherListPage() {
  const params = useSearchParams()
  const newJobId = params.get('newJob')

  const [jobs, setJobs] = useState([])         // in-flight + recently-finished launches
  const [campaigns, setCampaigns] = useState([])// last 7 days from Meta
  const [loading, setLoading] = useState(true)
  const [pauseBusy, setPauseBusy] = useState({})  // campaignId -> bool

  const loadCampaigns = async () => {
    try {
      const res = await fetch('/api/launcher/campaigns/recent?days=7', { cache: 'no-store' })
      const data = await res.json()
      if (data.success) setCampaigns(data.data)
    } catch (_) {}
  }

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/launcher/jobs', { cache: 'no-store' })
      const data = await res.json()
      if (data.success) setJobs(data.data)
    } catch (_) {}
  }

  // Two independent loops so the slow Meta call doesn't gate the fast in-
  // memory jobs poll:
  //   • Jobs: every 2.5s while any job is "creating" (otherwise 10s)
  //   • Campaigns: every 30s, or once a job just finished (to catch the new one)
  useEffect(() => {
    let cancelled = false
    let jobsTimer = null
    let campaignsTimer = null

    const tickJobs = async () => {
      if (cancelled) return
      await loadJobs()
      setLoading(false)
      // Read directly from state via a second fetch — cheap, avoids stale closure
      const fresh = await fetch('/api/launcher/jobs', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      const hasPending = fresh?.data?.some(j => j.status === 'creating')
      jobsTimer = setTimeout(tickJobs, hasPending ? POLL_INTERVAL_MS : 10000)
    }

    const tickCampaigns = async () => {
      if (cancelled) return
      await loadCampaigns()
      campaignsTimer = setTimeout(tickCampaigns, 30000)
    }

    tickJobs()
    tickCampaigns()
    return () => {
      cancelled = true
      if (jobsTimer) clearTimeout(jobsTimer)
      if (campaignsTimer) clearTimeout(campaignsTimer)
    }
  }, [])

  // When a job goes from "creating" → "done", trigger a campaigns refresh
  // so the newly-launched campaign appears in the list immediately rather
  // than waiting up to 30s.
  const prevJobStatuses = useRef({})
  useEffect(() => {
    let refreshNeeded = false
    for (const j of jobs) {
      const prev = prevJobStatuses.current[j.id]
      if (prev === 'creating' && j.status !== 'creating') refreshNeeded = true
      prevJobStatuses.current[j.id] = j.status
    }
    if (refreshNeeded) loadCampaigns()
  }, [jobs])

  // Merge view: jobs at top, then campaigns (deduped by campaignId if a job
  // already maps to a real campaign).
  const jobCampaignIds = new Set(jobs.map(j => j.campaignId).filter(Boolean))
  const visibleCampaigns = campaigns.filter(c => !jobCampaignIds.has(c.id))

  const resetMetaCache = async () => {
    if (!confirm('Reset Meta API cache? This clears the dead-token list and forces fresh token retries — useful if an account is missing from the dropdown after a past rate-limit incident.')) return
    try {
      const res = await fetch('/api/launcher/admin/reset-meta-cache', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Reset failed')
      alert(`Cache reset. Previously cached: ${JSON.stringify(data.before)}. Refresh the launcher form — your accounts should reappear.`)
      loadCampaigns()
    } catch (err) {
      alert(`Reset failed: ${err.message}`)
    }
  }

  const retryJob = async (jobId) => {
    if (!confirm('Retry this launch with the same settings? This creates a NEW campaign — the old empty one stays in Ads Manager (you can delete it there).')) return
    try {
      const res = await fetch(`/api/launcher/jobs/${jobId}/retry`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      // The retry queued a new job — refresh the list right away
      await loadJobs()
    } catch (err) {
      alert(`Retry failed: ${err.message}`)
    }
  }

  const togglePauseResume = async (c) => {
    const isPaused = c.status === 'PAUSED'
    const action = isPaused ? 'RESUME' : 'PAUSE'
    setPauseBusy(prev => ({ ...prev, [c.id]: true }))
    try {
      const res = await fetch(`/api/launcher/campaigns/${c.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed')
      // Optimistic local update
      setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: isPaused ? 'ACTIVE' : 'PAUSED' } : x))
    } catch (err) {
      alert(`${action} failed: ${err.message}`)
    } finally {
      setPauseBusy(prev => ({ ...prev, [c.id]: false }))
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-[#0a0a0a] border-b border-[#1f1f1f] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Your Campaigns</h1>
            <p className="text-xs text-[#9ca3af] mt-0.5">Last 7 days · auto-refresh every {POLL_INTERVAL_MS / 1000}s while ads are creating</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetMetaCache}
              className="text-xs text-[#9ca3af] hover:text-white px-3 py-2 rounded-lg border border-[#1f1f1f] hover:border-[#333]"
              title="If an ad account is missing from a dropdown, click this to clear our dead-token cache and force a fresh retry"
            >
              🔄 Reset Meta cache
            </button>
            <Link
              href="/launcher/new"
              className="bg-[#4f46e5] hover:bg-[#4338ca] text-white px-5 py-2 rounded-lg font-medium text-sm shadow-sm transition-colors flex items-center gap-2"
            >
              <span>+</span> Create New Ad
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {newJobId && (
          <div className="bg-[#4f46e5]/10 border border-[#4f46e5]/30 text-indigo-300 rounded-lg px-4 py-3 text-sm">
            🚀 Launch queued — watch the progress below. You can click "+ Create New Ad" to start the next one anytime.
          </div>
        )}

        {loading && jobs.length === 0 && campaigns.length === 0 ? (
          <p className="text-sm text-[#9ca3af] py-10 text-center">Loading campaigns…</p>
        ) : (jobs.length === 0 && visibleCampaigns.length === 0) ? (
          <div className="text-center py-16">
            <p className="text-[#9ca3af] mb-4">No campaigns in the last 7 days.</p>
            <Link
              href="/launcher/new"
              className="inline-block bg-[#4f46e5] hover:bg-[#4338ca] text-white px-5 py-2 rounded-lg font-medium text-sm"
            >
              Launch your first ad
            </Link>
          </div>
        ) : (
          <>
            {jobs.map(j => <JobRow key={j.id} job={j} highlight={j.id === newJobId} onRetry={() => retryJob(j.id)} />)}
            {visibleCampaigns.map(c => (
              <CampaignRow
                key={c.id}
                campaign={c}
                onToggle={() => togglePauseResume(c)}
                pauseBusy={!!pauseBusy[c.id]}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function JobRow({ job, highlight, onRetry }) {
  const isCreating = job.status === 'creating'
  const isDone = job.status === 'done'
  const isFailed = job.status === 'failed'
  // A "done" job that produced 0 ads is effectively a failure — surface it as such
  const zeroSuccess = isDone && job.adsCreated === 0
  const pct = job.adsTotal > 0 ? Math.min(100, Math.round((job.adsCreated / job.adsTotal) * 100)) : 0

  // Aggregate ad-set errors so the user sees the actual Meta message, not just "Done · 0 ads"
  const adSetErrors = (job.adSets || []).filter(s => !s.success && s.error)

  return (
    <div className={`bg-[#111111] rounded-xl border p-4 ${highlight ? 'border-[#4f46e5] shadow-[0_0_20px_rgba(79,70,229,0.2)]' : zeroSuccess || isFailed ? 'border-red-900/40' : 'border-[#1f1f1f]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{job.payload.campaignName}</p>
          <p className="text-xs text-[#9ca3af] mt-0.5">
            {job.payload.adAccountId} ·  queued {timeAgo(job.createdAt)}
          </p>
        </div>
        {isCreating && <StatusChip label={`Creating ${job.adsCreated}/${job.adsTotal}`} tone="indigo" />}
        {zeroSuccess && <StatusChip label="Failed · 0 ads" tone="red" />}
        {isDone && !zeroSuccess && <StatusChip label={`Done · ${job.adsCreated} ads`} tone="green" />}
        {isFailed && <StatusChip label="Failed" tone="red" />}
      </div>
      {isCreating && (
        <div className="mt-3 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div className="h-full bg-[#4f46e5] transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}
      {isFailed && job.error && (
        <p className="text-xs text-red-400 mt-2 leading-relaxed">{job.error}</p>
      )}
      {adSetErrors.length > 0 && (
        <div className="mt-2 space-y-1">
          {adSetErrors.map((s, i) => (
            <p key={i} className="text-xs text-red-400 leading-relaxed">
              <span className="font-medium">❌ {s.name}:</span> {s.error}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 mt-3 text-xs flex-wrap">
        {job.campaignId && <code className="text-[#6b7280]">{job.campaignId}</code>}
        {(zeroSuccess || isFailed) && job.canRetry && onRetry && (
          <>
            {job.campaignId && <span className="text-[#333]">·</span>}
            <button
              type="button"
              onClick={onRetry}
              className="text-[#4f46e5] hover:text-[#818cf8] font-medium"
              title="Re-launch with the same settings"
            >
              🔄 Retry
            </button>
          </>
        )}
        {(zeroSuccess || isFailed) && !job.canRetry && (
          <>
            {job.campaignId && <span className="text-[#333]">·</span>}
            <Link
              href="/launcher/new"
              className="text-[#4f46e5] hover:text-[#818cf8] font-medium"
              title="This job pre-dates retry support — open the form to recreate manually"
            >
              ↻ Re-launch manually
            </Link>
          </>
        )}
        {job.campaignId && (
          <>
            <span className="text-[#333]">·</span>
            <a
              href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${job.payload.adAccountId.replace('act_', '')}&selected_campaign_ids=${job.campaignId}`}
              target="_blank"
              rel="noopener"
              className="text-[#6366f1] hover:text-[#818cf8]"
            >
              ↗ Open in Ads Manager
            </a>
          </>
        )}
      </div>
    </div>
  )
}

function CampaignRow({ campaign: c, onToggle, pauseBusy }) {
  const isPaused = c.status === 'PAUSED' || c.status === 'CAMPAIGN_PAUSED'
  const isFailed = /DISAPPROVED|REJECTED|ERROR/i.test(c.status || '')
  const tone = isPaused ? 'gray' : isFailed ? 'red' : 'green'
  const statusLabel = (c.status || 'UNKNOWN').replace(/_/g, ' ')
  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{c.name}</p>
          <p className="text-xs text-[#9ca3af] mt-0.5">
            {c.accountName} · created {timeAgo(c.createdMs)}
            {c.dailyBudgetCents != null && <> · ${(c.dailyBudgetCents / 100).toFixed(2)}/day</>}
          </p>
        </div>
        <StatusChip label={statusLabel} tone={tone} />
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs">
        <code className="text-[#6b7280]">{c.id}</code>
        <span className="text-[#333]">·</span>
        <button
          type="button"
          onClick={onToggle}
          disabled={pauseBusy}
          className="text-[#9ca3af] hover:text-white disabled:opacity-50"
          title={isPaused ? 'Resume this campaign' : 'Pause this campaign'}
        >
          {pauseBusy ? '⏳' : isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <span className="text-[#333]">·</span>
        <Link
          href={`/launcher/new?duplicate=${c.id}&adAccountId=${c.accountId}`}
          className="text-[#9ca3af] hover:text-white"
          title="Duplicate as a new campaign"
        >
          📋 Duplicate
        </Link>
        <span className="text-[#333]">·</span>
        <a
          href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${c.accountId.replace('act_', '')}&selected_campaign_ids=${c.id}`}
          target="_blank"
          rel="noopener"
          className="text-[#6366f1] hover:text-[#818cf8]"
        >
          ↗ Open in Ads Manager
        </a>
      </div>
    </div>
  )
}

function StatusChip({ label, tone }) {
  const cls = {
    green: 'bg-green-500/15 text-green-400 border-green-500/30',
    indigo: 'bg-[#4f46e5]/15 text-[#818cf8] border-[#4f46e5]/30',
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
    gray: 'bg-[#1f1f1f] text-[#9ca3af] border-[#333]',
  }[tone] || 'bg-[#1f1f1f] text-[#9ca3af] border-[#333]'
  return (
    <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${cls}`}>
      {label}
    </span>
  )
}

function timeAgo(ms) {
  if (!ms) return 'unknown'
  const diffSec = Math.floor((Date.now() - ms) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}
