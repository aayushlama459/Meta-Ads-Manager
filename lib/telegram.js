const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./config')

async function sendTelegram(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error('Telegram error:', data.description)
    }
    return data.ok
  } catch (err) {
    console.error('Failed to send Telegram message:', err.message)
    return false
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

module.exports = { sendTelegram, formatScheduleConfirmation, formatExecutionResult }
