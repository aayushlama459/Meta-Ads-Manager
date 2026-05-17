import { NextResponse } from 'next/server'
import { dryRunAllRules } from '@/lib/rules'

export const runtime = 'nodejs'
export const maxDuration = 120  // can take a moment if you have many campaigns

// Verification endpoint: simulates running every enabled rule against every
// matching campaign but makes NO Meta changes and writes nothing to the DB.
// The UI's "Test all rules" button calls this to show what each rule sees.
export async function POST() {
  try {
    const report = await dryRunAllRules()
    return NextResponse.json({ success: true, report, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
