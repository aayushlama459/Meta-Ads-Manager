import { NextResponse } from 'next/server'
import { resetMetaCaches } from '@/lib/meta'

export const runtime = 'nodejs'

// Clears all Meta-related in-memory caches (dead-token list, ad-accounts-per-
// token, account→token lookup, recent campaigns). Use this when an account
// disappears from a dropdown because of a previous rate-limit incident and
// you want the app to retry every token immediately.
export async function POST() {
  const before = resetMetaCaches()
  return NextResponse.json({ success: true, before })
}
