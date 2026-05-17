import { NextResponse } from 'next/server'
import { listExecutions } from '@/lib/rules'

export const runtime = 'nodejs'

// Global execution log across every rule.
export async function GET(request) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)
  return NextResponse.json({ success: true, data: listExecutions({ limit }) })
}
