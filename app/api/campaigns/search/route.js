import { NextResponse } from 'next/server'
import { searchAllCampaigns } from '@/lib/meta'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') || ''

    if (!q || q.trim().length < 2) {
      return NextResponse.json([])
    }

    const campaigns = await searchAllCampaigns(q.trim())
    return NextResponse.json(campaigns)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
