import { NextResponse } from 'next/server'
const db = require('../../../../lib/db')

// GET /api/chat/threads — list all threads, newest first.
// Returns lightweight rows (no full history); the chat page fetches one
// thread's history on demand.
export async function GET() {
  try {
    const rows = db.prepare(`
      SELECT id, title, message_count, created_at, updated_at
      FROM chat_threads
      ORDER BY datetime(updated_at) DESC
      LIMIT 200
    `).all()
    return NextResponse.json({ threads: rows })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
