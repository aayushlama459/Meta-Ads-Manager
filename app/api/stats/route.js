import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  try {
    const upcoming = db
      .prepare(`SELECT COUNT(*) as count FROM schedules WHERE status = 'scheduled'`)
      .get().count

    const todayUTC = new Date()
    const startOfTodayUTC = new Date(
      Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate())
    ).toISOString()
    const endOfTodayUTC = new Date(
      Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate() + 1)
    ).toISOString()

    const doneToday = db
      .prepare(
        `SELECT COUNT(*) as count FROM schedules WHERE status = 'done' AND executed_at >= ? AND executed_at < ?`
      )
      .get(startOfTodayUTC, endOfTodayUTC).count

    const failed = db
      .prepare(`SELECT COUNT(*) as count FROM schedules WHERE status = 'failed'`)
      .get().count

    return NextResponse.json({ upcoming, doneToday, failed })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
