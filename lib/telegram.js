const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./config')

const API = () => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

async function tgFetch(method, body) {
  try {
    const res = await fetch(`${API()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!data.ok) console.error(`Telegram ${method} error:`, data.description)
    return data
  } catch (err) {
    console.error(`Telegram ${method} threw:`, err.message)
    return { ok: false, error: err.message }
  }
}

async function sendTelegram(message) {
  const data = await tgFetch('sendMessage', {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML',
  })
  return data.ok
}

// Sends a message with inline-keyboard buttons. `buttons` is rows of buttons:
//   [[{ text, callback_data }, ...], ...]
// Returns the full Telegram response so callers can capture message_id.
async function sendWithButtons(message, buttons) {
  return tgFetch('sendMessage', {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  })
}

// Replaces a message's text and optionally its keyboard. Used to resolve
// pending-approval messages after the user taps a button.
async function editMessage(chatId, messageId, text, buttons = null) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  }
  if (buttons) body.reply_markup = { inline_keyboard: buttons }
  else body.reply_markup = { inline_keyboard: [] }  // explicit empty = remove buttons
  return tgFetch('editMessageText', body)
}

// Acknowledges a button tap — Telegram shows a brief toast. Always call this
// or the user's button stays in a "loading" state for 30s.
async function answerCallback(callbackQueryId, text) {
  return tgFetch('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || '',
    show_alert: false,
  })
}

// Polls Telegram for new updates (messages + callback queries). Pass the
// last-seen update_id so Telegram only returns newer ones. Uses long polling
// (timeout=25s) which is more efficient than fixed-interval polling.
async function getUpdates(offset = 0) {
  try {
    const url = `${API()}/getUpdates?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent(JSON.stringify(['callback_query']))}`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.ok) return { ok: false, updates: [] }
    return { ok: true, updates: data.result }
  } catch (err) {
    console.error('Telegram getUpdates threw:', err.message)
    return { ok: false, updates: [] }
  }
}

function formatScheduleConfirmation(schedule) {
  return `<b>📅 Ad Schedule Confirmed</b>

<b>Campaign:</b> ${schedule.campaign_name || schedule.campaign_id}
<b>Action:</b> ${schedule.action}
<b>Scheduled:</b> ${schedule.scheduled_time_npt} NPT
<b>Note:</b> ${schedule.note || 'None'}

Schedule ID: #${schedule.id}`
}

function formatExecutionResult(schedule, success, error) {
  if (success) {
    return `<b>✅ Ad Action Executed</b>

<b>Campaign:</b> ${schedule.campaign_name || schedule.campaign_id}
<b>Action:</b> ${schedule.action}
<b>Status:</b> Done
<b>Note:</b> ${schedule.note || 'None'}`
  } else {
    return `<b>❌ Ad Action Failed</b>

<b>Campaign:</b> ${schedule.campaign_name || schedule.campaign_id}
<b>Action:</b> ${schedule.action}
<b>Error:</b> ${error}
<b>Note:</b> ${schedule.note || 'None'}`
  }
}

module.exports = {
  sendTelegram,
  sendWithButtons,
  editMessage,
  answerCallback,
  getUpdates,
  formatScheduleConfirmation,
  formatExecutionResult,
}
