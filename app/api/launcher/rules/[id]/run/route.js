import { NextResponse } from 'next/server'
import { getRule, evaluateRule } from '@/lib/rules'

export const runtime = 'nodejs'
export const maxDuration = 300

// Manual "run now" — evaluate this rule immediately and return the results.
// Useful for testing a rule before leaving it on auto.
export async function POST(_request, { params }) {
  const rule = getRule(parseInt(params.id, 10))
  if (!rule) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  try {
    const results = await evaluateRule(rule)
    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
