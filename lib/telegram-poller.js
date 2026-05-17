const { getUpdates, answerCallback, editMessage } = require('./telegram')
const { getPending, tryResolve, markExecuted, findExpired, setTelegramMessage } = require('./pending-actions')
const { executeApprovedPending } = require('./rules')
const db = require('./db')

// Long-poll Telegram for inline-button taps on pending-approval messages.
// Runs in a single forever-loop started by the scheduler. Uses Telegram's
// long polling (timeout=25s) so we don't burn HTTP requests when idle.
//
// Callback data format: 'pa:<approve|reject>:<pendingId>'
//   pa = "pending action" namespace, leaves room for other callback types later

let pollerStarted = false
let lastUpdateId = 0  // Telegram returns updates with monotonic update_ids

async function processCallback(cbq) {
  const data = cbq.data || ''
  const match = data.match(/^pa:(approve|reject):(\d+)$/)
  if (!match) {
    await answerCallback(cbq.id, 'Unknown action')
    return
  }
  const [, verb, pendingIdStr] = match
  const pendingId = parseInt(pendingIdStr, 10)
  const pending = getPending(pendingId)
  if (!pending) {
    await answerCallback(cbq.id, 'This request no longer exists.')
    return
  }
  if (pending.status !== 'pending') {
    await answerCallback(cbq.id, `Already ${pending.status}.`)
    return
  }

  if (verb === 'reject') {
    const { changed } = tryResolve(pendingId, 'rejected')
    await answerCallback(cbq.id, '❌ Rejected')
    if (changed && pending.telegram_chat_id && pending.telegram_message_id) {
      const who = cbq.from?.first_name || 'you'
      const newText =
        `<b>❌ Rejected by ${escapeHtml(who)}</b>\n\n` +
        `<b>Rule:</b> ${escapeHtml(pending.rule_name)}\n` +
        `<b>Campaign:</b> ${escapeHtml(pending.target_campaign_name || pending.target_campaign_id)}\n` +
        `<i>No action taken.</i>`
      await editMessage(pending.telegram_chat_id, pending.telegram_message_id, newText)
    }
    return
  }

  // verb === 'approve'
  const { changed } = tryResolve(pendingId, 'approved')
  await answerCallback(cbq.id, '✅ Approved, executing…')
  if (!changed) return  // someone else got here first

  // Execute the action. Re-read pending in case the resolve updated it.
  const fresh = getPending(pendingId)
  let result, error
  try {
    result = await executeApprovedPending(fresh)
  } catch (e) {
    error = e.message
  }
  markExecuted(pendingId, error)

  if (fresh.telegram_chat_id && fresh.telegram_message_id) {
    const who = cbq.from?.first_name || 'you'
    let newText
    if (error) {
      newText =
        `<b>⚠️ Approved by ${escapeHtml(who)}, but execution failed</b>\n\n` +
        `<b>Rule:</b> ${escapeHtml(fresh.rule_name)}\n` +
        `<b>Campaign:</b> ${escapeHtml(fresh.target_campaign_name)}\n` +
        `<b>Error:</b> ${escapeHtml(error)}`
    } else {
      newText =
        `<b>✅ Approved by ${escapeHtml(who)}</b>\n\n` +
        `<b>Rule:</b> ${escapeHtml(fresh.rule_name)}\n` +
        `<b>Campaign:</b> ${escapeHtml(fresh.target_campaign_name)}\n` +
        `<b>Action:</b> ${escapeHtml(result.action_detail || result.action_taken)}`
    }
    await editMessage(fresh.telegram_chat_id, fresh.telegram_message_id, newText)
  }
}

// One pass: long-polls for new updates (waits up to 25s for one) and processes
// every callback it gets. Returns the highest update_id seen so the next call
// can advance offset.
async function pollOnce() {
  const { ok, updates } = await getUpdates(lastUpdateId + 1)
  if (!ok || !updates?.length) return
  for (const u of updates) {
    lastUpdateId = Math.max(lastUpdateId, u.update_id)
    if (u.callback_query) {
      try { await processCallback(u.callback_query) }
      catch (e) { console.error('[TelegramPoller] callback processing failed:', e.message) }
    }
  }
}

// Sweeps any pending actions whose expires_at has passed. Edits their Telegram
// message to show "expired" so the buttons stop working visually.
async function sweepExpired() {
  const expired = findExpired()
  for (const p of expired) {
    const { changed } = tryResolve(p.id, 'expired')
    if (changed && p.telegram_chat_id && p.telegram_message_id) {
      const newText =
        `<b>⌛ Expired (no decision in 4h)</b>\n\n` +
        `<b>Rule:</b> ${escapeHtml(p.rule_name)}\n` +
        `<b>Campaign:</b> ${escapeHtml(p.target_campaign_name || p.target_campaign_id)}\n` +
        `<i>No action taken.</i>`
      await editMessage(p.telegram_chat_id, p.telegram_message_id, newText).catch(() => {})
    }
  }
}

function startTelegramPoller() {
  if (pollerStarted) return
  pollerStarted = true
  console.log('[TelegramPoller] Starting long-poll loop')

  // Long-poll loop — runs forever, naturally throttled by Telegram's 25s timeout
  ;(async function loop() {
    while (true) {
      try { await pollOnce() }
      catch (e) {
        console.error('[TelegramPoller] poll error:', e.message)
        // Back off briefly on transient errors so we don't spin
        await new Promise(r => setTimeout(r, 5000))
      }
    }
  })()

  // Expiry sweep every minute — separate, independent of long-poll
  setInterval(() => {
    sweepExpired().catch(e => console.error('[TelegramPoller] sweep error:', e.message))
  }, 60 * 1000)
}

module.exports = { startTelegramPoller }

// Small html-escape helper kept private to this module
function escapeHtml(s) {
  return String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;')
}
