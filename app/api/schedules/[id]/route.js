import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function DELETE(request, { params }) {
  try {
    const { id } = params
    const row = db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(id)

    if (!row) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    if (row.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Only scheduled jobs can be cancelled' },
        { status: 400 }
      )
    }

    db.prepare(`UPDATE schedules SET status = 'cancelled' WHERE id = ?`).run(id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
