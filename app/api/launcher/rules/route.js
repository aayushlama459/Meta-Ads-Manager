import { NextResponse } from 'next/server'
import { listRules, createRule, VALID_METRICS, VALID_OPERATORS, VALID_WINDOWS, VALID_ACTIONS } from '@/lib/rules'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: listRules(),
    constants: {
      metrics: VALID_METRICS,
      operators: VALID_OPERATORS,
      windows: VALID_WINDOWS,
      actions: VALID_ACTIONS,
    },
  })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const rule = createRule(body)
    return NextResponse.json({ success: true, data: rule })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}
