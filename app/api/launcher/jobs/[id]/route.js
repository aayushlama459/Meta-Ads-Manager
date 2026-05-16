import { NextResponse } from 'next/server'
import { getJob } from '@/lib/launch-jobs'

export const runtime = 'nodejs'

export async function GET(request, { params }) {
  const job = getJob(params.id)
  if (!job) {
    return NextResponse.json({ success: false, error: 'Job not found or expired' }, { status: 404 })
  }
  return NextResponse.json({ success: true, data: job })
}
