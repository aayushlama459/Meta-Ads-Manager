const db = require('./db')

// Pending-actions queue. When a rule has requires_approval=1, the evaluator
// inserts a row here instead of executing the action immediately. The Telegram
// poller flips status to 'approved' or 'rejected' when the user taps a button.
// Auto-expires after expires_at (default 4 hours).

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000

function createPending({
  rule_id, rule_name, target_campaign_id, target_campaign_name, account_id,
  metric, metric_value, threshold_value, action, snapshot, ttl_ms,
}) {
  const expires_at = new Date(Date.now() + (ttl_ms || DEFAULT_TTL_MS)).toISOString()
  const result = db.prepare(`
    INSERT INTO pending_actions
      (rule_id, rule_name, target_campaign_id, target_campaign_name, account_id,
       metric, metric_value, threshold_value, action_json, snapshot_json, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rule_id, rule_name, target_campaign_id, target_campaign_name, account_id || null,
    metric, metric_value, threshold_value,
    JSON.stringify(action), JSON.stringify(snapshot || {}),
    expires_at,
  )
  return getPending(result.lastInsertRowid)
}

function getPending(id) {
  const row = db.prepare('SELECT * FROM pending_actions WHERE id = ?').get(id)
  return row ? deserialize(row) : null
}

function listPending(status = 'pending') {
  const rows = db.prepare('SELECT * FROM pending_actions WHERE status = ? ORDER BY created_at DESC').all(status)
  return rows.map(deserialize)
}

function setTelegramMessage(id, chatId, messageId) {
  db.prepare('UPDATE pending_actions SET telegram_chat_id = ?, telegram_message_id = ? WHERE id = ?')
    .run(String(chatId), String(messageId), id)
}

// Returns the updated row. Caller should check the returned status to handle
// race conditions (e.g. someone clicked Approve twice while we were processing).
function tryResolve(id, newStatus, executionError) {
  // Only resolve if currently pending. Other states (approved/expired/etc.) win.
  const result = db.prepare(`
    UPDATE pending_actions
    SET status = ?, resolved_at = datetime('now'), execution_error = ?
    WHERE id = ? AND status = 'pending'
  `).run(newStatus, executionError || null, id)
  return { changed: result.changes > 0, row: getPending(id) }
}

function markExecuted(id, executionError) {
  db.prepare(`
    UPDATE pending_actions
    SET status = ?, execution_error = ?
    WHERE id = ?
  `).run(executionError ? 'failed' : 'executed', executionError || null, id)
  return getPending(id)
}

// Returns IDs of pending rows whose expires_at has passed. Caller should
// flip them to 'expired' and ideally edit their Telegram message.
function findExpired() {
  const rows = db.prepare(`
    SELECT * FROM pending_actions
    WHERE status = 'pending' AND expires_at <= datetime('now')
  `).all()
  return rows.map(deserialize)
}

function deserialize(row) {
  return {
    ...row,
    action: row.action_json ? JSON.parse(row.action_json) : null,
    snapshot: row.snapshot_json ? JSON.parse(row.snapshot_json) : null,
  }
}

module.exports = {
  createPending,
  getPending,
  listPending,
  setTelegramMessage,
  tryResolve,
  markExecuted,
  findExpired,
}
