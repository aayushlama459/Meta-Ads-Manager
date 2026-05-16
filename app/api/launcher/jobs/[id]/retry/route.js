import { NextResponse } from 'next/server'
import { getJob } from '@/lib/launch-jobs'

export const runtime = 'nodejs'

// Re-submits a failed (or 0-ads) job's original payload to /api/launcher/create-ad.
// We don't try to revive the existing Meta campaign (which is empty); instead we
// launch a fresh one with identical settings. The user can delete the empty
// shell in Ads Manager if they want.
export async function POST(request, { params }) {
  const job = getJob(params.id)
  if (!job) {
    return NextResponse.json({ success: false, error: 'Job not found or expired' }, { status: 404 })
  }
  const body = job.payload?.originalBody
  if (!body) {
    return NextResponse.json({ success: false, error: 'Original launch payload missing — cannot retry this job (likely an older job from before retry support).' }, { status: 400 })
  }

  // Same-origin POST. We construct the absolute URL from the incoming request
  // so this works both in dev and prod regardless of host/port.
  const origin = request.nextUrl.origin
  const res = await fetch(`${origin}/api/launcher/create-ad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
