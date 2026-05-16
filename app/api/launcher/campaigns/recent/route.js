import { NextResponse } from 'next/server'
import { getRecentCampaigns } from '@/lib/meta'

export const runtime = 'nodejs'

export async function GET(request) {
  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '7', 10)
    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000
    const campaigns = await getRecentCampaigns(sinceMs)
    return NextResponse.json({ success: true, data: campaigns })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
