const cron = require('node-cron')
const db = require('./db')
const { updateCampaignStatus } = require('./meta')
const { sendTelegram, formatExecutionResult } = require('./telegram')
const { NEPAL_OFFSET_MS } = require('./config')
const { generateAndSendReport } = require('./reporter')
const { evaluateAllEnabledRules } = require('./rules')
const { startTelegramPoller } = require('./telegram-poller')

function getNowUTC() {
  return new Date()
}

function toNepalTime(date) {
  const nepalMs = date.getTime() + NEPAL_OFFSET_MS
  return new Date(nepalMs)
}

function formatNepalTime(utcIsoString) {
  const d = new Date(utcIsoString)
  const nepal = toNepalTime(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${nepal.getUTCFullYear()}-${pad(nepal.getUTCMonth() + 1)}-${pad(nepal.getUTCDate())} ${pad(nepal.getUTCHours())}:${pad(nepal.getUTCMinutes())} NPT`
}

async function runScheduledJobs() {
  const now = getNowUTC()
  const nowISO = now.toISOString()

  const dueJobs = db
    .prepare(
      `SELECT * FROM schedules WHERE status = 'scheduled' AND scheduled_time <= ?`
    )
    .all(nowISO)

  for (const job of dueJobs) {
    console.log(`[Scheduler] Processing job #${job.id}: ${job.campaign_name} - ${job.action}`)

    try {
      await updateCampaignStatus(job.campaign_id, job.ad_account_id, job.action)

      db.prepare(
        `UPDATE schedules SET status = 'done', executed_at = ?, error_message = '' WHERE id = ?`
      ).run(new Date().toISOString(), job.id)

      const scheduledNPT = formatNepalTime(job.scheduled_time)
      await sendTelegram(
        formatExecutionResult({ ...job, scheduled_time_npt: scheduledNPT }, true, null)
      )

      console.log(`[Scheduler] Job #${job.id} completed successfully`)
    } catch (err) {
      const errorMsg = err.message || 'Unknown error'

      db.prepare(
        `UPDATE schedules SET status = 'failed', executed_at = ?, error_message = ? WHERE id = ?`
      ).run(new Date().toISOString(), errorMsg, job.id)

      const scheduledNPT = formatNepalTime(job.scheduled_time)
      await sendTelegram(
        formatExecutionResult({ ...job, scheduled_time_npt: scheduledNPT }, false, errorMsg)
      )

      console.error(`[Scheduler] Job #${job.id} failed:`, errorMsg)
    }
  }
}

function startScheduler() {
  // Every minute — execute due pause/resume jobs
  cron.schedule('* * * * *', async () => {
    try {
      await runScheduledJobs()
    } catch (err) {
      console.error('[Scheduler] Unexpected error:', err)
    }
  })

  // Every hour at :05 — evaluate all enabled automation rules
  // (Sam Piliero's auto-kill / auto-scale system: pause losers, scale winners.)
  cron.schedule('5 * * * *', async () => {
    try {
      await evaluateAllEnabledRules()
    } catch (err) {
      console.error('[Scheduler] Rules evaluation error:', err)
    }
  })

  // Daily performance reports — times in UTC (Nepal = UTC+5:45)
  // 9:00 AM NPT  = 03:15 UTC
  cron.schedule('15 3 * * *', () => generateAndSendReport('9:00 AM').catch(console.error))
  // 12:00 PM NPT = 06:15 UTC
  cron.schedule('15 6 * * *', () => generateAndSendReport('12:00 PM').catch(console.error))
  // 3:00 PM NPT  = 09:15 UTC
  cron.schedule('15 9 * * *', () => generateAndSendReport('3:00 PM').catch(console.error))
  // 5:00 PM NPT  = 11:15 UTC
  cron.schedule('15 11 * * *', () => generateAndSendReport('5:00 PM').catch(console.error))

  // Start the long-poll loop for Telegram inline-button approvals.
  // Single-process safe — module-level guard prevents double-start on HMR.
  startTelegramPoller()

  console.log('[Scheduler] All cron jobs registered')
  console.log('[Scheduler] Reports scheduled: 9AM, 12PM, 3PM, 5PM NPT')
  console.log('[Scheduler] Rules evaluator scheduled: every hour at :05')
}

module.exports = { startScheduler }
