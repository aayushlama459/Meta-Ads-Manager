import { NextResponse } from 'next/server'
import { getPixels, findTokenForAdAccount } from '@/lib/meta'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const adAccountId = searchParams.get('adAccountId')

    if (!adAccountId) {
      return NextResponse.json({ success: false, error: 'adAccountId is required' }, { status: 400 })
    }

    const token = await findTokenForAdAccount(adAccountId)
    const pixels = await getPixels(token, adAccountId)
    return NextResponse.json({ success: true, data: pixels })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
