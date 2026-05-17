import { NextResponse } from 'next/server'
import { listExecutions } from '@/lib/rules'

export const runtime = 'nodejs'

export async function GET(_request, { params }) {
  const ruleId = parseInt(params.id, 10)
  return NextResponse.json({ success: true, data: listExecutions({ ruleId }) })
}
