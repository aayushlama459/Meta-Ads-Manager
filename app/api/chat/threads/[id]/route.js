import { NextResponse } from 'next/server'
const db = require('../../../../../lib/db')

// GET /api/chat/threads/:id — load one thread's full history.
export async function GET(_request, { params }) {
  try {
    const row = db.prepare(`
      SELECT id, title, history_json, message_count, created_at, updated_at
      FROM chat_threads
      WHERE id = ?
    `).get(params.id)
    if (!row) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    let history
    try { history = JSON.parse(row.history_json) } catch { history = [] }

    // If the thread was saved mid-confirmation, the last assistant message has
    // tool_calls without matching tool responses. Resuming a conversation in
    // that state would make the LLM error out, so strip trailing assistant
    // messages whose tool_calls are unresponded. (Read-only tool calls always
    // get fulfilled in the same request, so this only ever affects pending
    // pause/resume confirms.)
    while (history.length > 0) {
      const last = history[history.length - 1]
      if (last?.role !== 'assistant' || !last.tool_calls?.length) break
      const respondedIds = new Set()
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'tool' && history[i].tool_call_id) respondedIds.add(history[i].tool_call_id)
        if (history[i] === last) break
      }
      const allResponded = last.tool_calls.every((tc) => respondedIds.has(tc.id))
      if (allResponded) break
      history.pop()
    }
    return NextResponse.json({
      id: row.id,
      title: row.title,
      history,
      message_count: row.message_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/chat/threads/:id
export async function DELETE(_request, { params }) {
  try {
    const r = db.prepare(`DELETE FROM chat_threads WHERE id = ?`).run(params.id)
    return NextResponse.json({ deleted: r.changes > 0 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/chat/threads/:id — rename a thread.
export async function PATCH(request, { params }) {
  try {
    const { title } = await request.json()
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title required' }, { status: 400 })
    }
    const r = db.prepare(`
      UPDATE chat_threads SET title = ?, updated_at = datetime('now') WHERE id = ?
    `).run(title.slice(0, 120), params.id)
    return NextResponse.json({ updated: r.changes > 0 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
