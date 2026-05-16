import { NextResponse } from 'next/server'
import { getAllAdAccounts } from '@/lib/meta'

export async function GET() {
  try {
    // Merge ad accounts from all configured tokens (multi-BM support)
    const accounts = await getAllAdAccounts()
    return NextResponse.json({ success: true, data: accounts })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
