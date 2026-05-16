import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { sendTelegram, formatScheduleConfirmation } from '@/lib/telegram'
import { NEPAL_OFFSET_MS } from '@/lib/config'

function nepalToUTC(nepalDateTimeStr) {
  // nepalDateTimeStr format: "YYYY-MM-DD HH:MM"
  const [datePart, timePart] = nepalDateTimeStr.split(' ')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, 0, 0) - NEPAL_OFFSET_MS
  return new Date(utcMs).toISOString()
}

export async function GET() {
  try {
    const rows = db
      .prepare(
        `SELECT * FROM schedules WHERE status = 'scheduled' ORDER BY scheduled_time ASC`
      )
      .all()
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { campaign_id, campaign_name, ad_account_id, action, scheduled_time_nepal, note } = body

    if (!campaign_id || !action || !scheduled_time_nepal) {
      return NextResponse.json(
        { error: 'campaign_id, action, and scheduled_time_nepal are required' },
        { status: 400 }
      )
    }

    if (!['PAUSE', 'RESUME'].includes(action)) {
      return NextResponse.json({ error: 'action must be PAUSE or RESUME' }, { status: 400 })
    }

    const scheduledTimeUTC = nepalToUTC(scheduled_time_nepal)

    const result = db
      .prepare(
        `INSERT INTO schedules (campaign_id, campaign_name, ad_account_id, action, scheduled_time, note, status)
         VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`
      )
      .run(
        campaign_id,
        campaign_name || '',
        ad_account_id || '',
        action,
        scheduledTimeUTC,
        note || ''
      )

    const created = db
      .prepare(`SELECT * FROM schedules WHERE id = ?`)
      .get(result.lastInsertRowid)

    await sendTelegram(
      formatScheduleConfirmation({
        ...created,
        scheduled_time_npt: scheduled_time_nepal,
      })
    )

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
