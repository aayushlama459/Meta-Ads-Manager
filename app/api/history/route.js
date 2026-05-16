import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') || 'all'

    let query = `SELECT * FROM schedules WHERE status != 'scheduled'`
    if (filter === 'done') {
      query = `SELECT * FROM schedules WHERE status = 'done'`
    } else if (filter === 'failed') {
      query = `SELECT * FROM schedules WHERE status = 'failed'`
    }

    query += ` ORDER BY created_at DESC`

    const rows = db.prepare(query).all()
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
