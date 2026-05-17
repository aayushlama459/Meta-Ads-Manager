import { NextResponse } from 'next/server'
import { RECOMMENDED_RULES } from '@/lib/rules-recommendations'
import { listRules } from '@/lib/rules'

export const runtime = 'nodejs'

// Returns the curated starter-rules catalog. Each item flags whether the user
// has already installed a rule with the same condition+action, so the UI can
// disable the "Add" button to prevent duplicates.
export async function GET() {
  const existing = listRules()
  const isInstalled = (preset) => existing.some(r =>
    r.condition.metric === preset.condition.metric &&
    r.condition.operator === preset.condition.operator &&
    r.condition.value === preset.condition.value &&
    r.condition.window === preset.condition.window &&
    r.action.type === preset.action.type &&
    (r.action.percent ?? null) === (preset.action.percent ?? null)
    // note: not comparing requires_approval — installing the same condition+action
    // counts as "installed" regardless of approval setting (user can toggle later).
  )
  const catalog = RECOMMENDED_RULES.map(r => ({
    ...r,
    installed: isInstalled(r.preset),
  }))
  return NextResponse.json({ success: true, data: catalog })
}
