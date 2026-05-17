import { NextResponse } from 'next/server'
import { getRule, updateRule, deleteRule } from '@/lib/rules'

export const runtime = 'nodejs'

export async function GET(_request, { params }) {
  const rule = getRule(parseInt(params.id, 10))
  if (!rule) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true, data: rule })
}

export async function PATCH(request, { params }) {
  try {
    const body = await request.json()
    const rule = updateRule(parseInt(params.id, 10), body)
    return NextResponse.json({ success: true, data: rule })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}

export async function DELETE(_request, { params }) {
  deleteRule(parseInt(params.id, 10))
  return NextResponse.json({ success: true })
}
