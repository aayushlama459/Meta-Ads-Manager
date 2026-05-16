import { NextResponse } from 'next/server'
import { updateCampaignStatus } from '@/lib/meta'

export const runtime = 'nodejs'

// POST { action: 'PAUSE' | 'RESUME' }
export async function POST(request, { params }) {
  try {
    const { action } = await request.json()
    if (action !== 'PAUSE' && action !== 'RESUME') {
      return NextResponse.json({ success: false, error: 'action must be PAUSE or RESUME' }, { status: 400 })
    }
    const result = await updateCampaignStatus(params.id, null, action)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
