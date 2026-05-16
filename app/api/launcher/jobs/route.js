import { NextResponse } from 'next/server'
import { listJobs } from '@/lib/launch-jobs'

export const runtime = 'nodejs'

// Returns all jobs newer than `since` (epoch ms). Polled by the campaign list.
export async function GET(request) {
  const since = parseInt(request.nextUrl.searchParams.get('since') || '0', 10)
  const jobs = listJobs({ since }).map(j => ({
    id: j.id,
    status: j.status,
    createdAt: j.createdAt,
    doneAt: j.doneAt,
    campaignId: j.campaignId,
    adsCreated: j.adsCreated,
    adsTotal: j.adsTotal,
    error: j.error,
    // True only if the job has a stored payload (added after retry support shipped).
    // Older in-flight jobs won't, so the UI shows "Open form" instead of "Retry".
    canRetry: !!j.payload?.originalBody,
    // Surface per-ad-set failures so the UI can show "Inside Valley failed: ..."
    // without spilling the entire creative spec.
    adSets: (j.adSets || []).map(s => ({
      name: s.name,
      success: !!s.success,
      adSetId: s.adSetId,
      error: s.error,
    })),
    payload: {
      campaignName: j.payload.campaignName,
      adAccountId: j.payload.adAccountId,
      initialStatus: j.payload.initialStatus,
      scheduledStart: j.payload.scheduledStart,
    },
  }))
  return NextResponse.json({ success: true, data: jobs })
}
