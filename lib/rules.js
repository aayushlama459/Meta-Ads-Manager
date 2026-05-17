const db = require('./db')
const { findTokenForAdAccount, updateCampaignStatus } = require('./meta')
const { META_API_VERSION, META_TOKENS } = require('./config')
const { sendTelegram, sendWithButtons } = require('./telegram')
const { createPending, setTelegramMessage } = require('./pending-actions')
// Lazy-required to avoid a hard import cycle (rules.js ← telegram-poller.js ← rules.js).
// `startTelegramPoller` is idempotent so calling it on first evaluation is safe.
let _pollerStartFn = null
function ensurePollerRunning() {
  if (!_pollerStartFn) _pollerStartFn = require('./telegram-poller').startTelegramPoller
  _pollerStartFn()
}

// ─── Schema reference ────────────────────────────────────────────────────────
// rules.condition_json:
//   { metric: 'roas'|'spend'|'ctr'|'frequency'|'cpa',
//     operator: '<'|'<='|'>'|'>='|'==',
//     value: number,
//     window: 'today'|'yesterday'|'last_3d'|'last_7d'|'last_14d',
//     min_spend_cents: number  // only trigger if at least this much spent in window
//   }
//
// rules.action_json:
//   { type: 'pause' }
//   { type: 'increase_budget', percent: 40 }
//   { type: 'decrease_budget', percent: 30 }
//   { type: 'notify' }   // log + Telegram only, no Meta action

const VALID_METRICS = ['roas', 'spend', 'ctr', 'frequency', 'cpa', 'cpr']

// "Cost per result" lookup. Meta returns `cost_per_action_type` as an array of
// { action_type, value }. The campaign's headline metric in Ads Manager — what
// they call "Cost per result" — is the entry that matches the campaign's
// optimization goal. We try these in priority order so we automatically pick
// the right one for each campaign type without needing a second API call:
//   purchase (sales / website conversions)  →  conversation (messenger)
//   →  lead  →  add_to_cart  →  link_click  →  landing_page_view  →  post_engagement
const CPR_ACTION_PRIORITY = [
  'offsite_conversion.fb_pixel_purchase',
  'omni_purchase',
  'purchase',
  'onsite_conversion.messaging_conversation_started_7d',
  'lead',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_add_to_cart',
  'add_to_cart',
  'link_click',
  'landing_page_view',
  'post_engagement',
]

function pickCostPerResult(costPerActionType) {
  if (!Array.isArray(costPerActionType)) return null
  for (const wanted of CPR_ACTION_PRIORITY) {
    const hit = costPerActionType.find(a => a.action_type === wanted)
    if (hit && hit.value != null) return parseFloat(hit.value)
  }
  return null  // null = no result yet — caller should skip, not treat as 0
}
const VALID_OPERATORS = ['<', '<=', '>', '>=', '==']
const VALID_WINDOWS = ['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d']
const VALID_ACTIONS = ['pause', 'increase_budget', 'decrease_budget', 'notify']

function validateRule({ name, condition, action }) {
  if (!name || typeof name !== 'string') throw new Error('name is required')
  if (!condition || typeof condition !== 'object') throw new Error('condition is required')
  if (!VALID_METRICS.includes(condition.metric)) throw new Error(`metric must be one of: ${VALID_METRICS.join(', ')}`)
  if (!VALID_OPERATORS.includes(condition.operator)) throw new Error(`operator must be one of: ${VALID_OPERATORS.join(', ')}`)
  if (typeof condition.value !== 'number' || isNaN(condition.value)) throw new Error('condition.value must be a number')
  if (!VALID_WINDOWS.includes(condition.window)) throw new Error(`window must be one of: ${VALID_WINDOWS.join(', ')}`)
  if (typeof condition.min_spend_cents !== 'number' || condition.min_spend_cents < 0) throw new Error('min_spend_cents must be a non-negative number')
  if (!action || !VALID_ACTIONS.includes(action.type)) throw new Error(`action.type must be one of: ${VALID_ACTIONS.join(', ')}`)
  if (action.type === 'increase_budget' || action.type === 'decrease_budget') {
    if (typeof action.percent !== 'number' || action.percent <= 0 || action.percent > 500) {
      throw new Error('action.percent must be a number between 0 and 500')
    }
  }
}

// ─── CRUD helpers ────────────────────────────────────────────────────────────

function listRules() {
  const rows = db.prepare('SELECT * FROM rules ORDER BY enabled DESC, created_at DESC').all()
  return rows.map(deserializeRule)
}

function getRule(id) {
  const row = db.prepare('SELECT * FROM rules WHERE id = ?').get(id)
  return row ? deserializeRule(row) : null
}

function createRule({ name, scope, ad_account_id, campaign_id, condition, action, cooldown_hours, requires_approval }) {
  validateRule({ name, condition, action })
  // Default approval ON for pause/budget changes (irreversible-ish, money-moving);
  // OFF for notify (it IS just a notification, approval is meaningless).
  const ra = requires_approval != null
    ? (requires_approval ? 1 : 0)
    : (action.type === 'notify' ? 0 : 1)
  const stmt = db.prepare(`
    INSERT INTO rules (name, scope, ad_account_id, campaign_id, condition_json, action_json, cooldown_hours, enabled, requires_approval)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `)
  const result = stmt.run(
    name,
    scope || 'all',
    ad_account_id || null,
    campaign_id || null,
    JSON.stringify(condition),
    JSON.stringify(action),
    cooldown_hours ?? 24,
    ra,
  )
  return getRule(result.lastInsertRowid)
}

function updateRule(id, patch) {
  const existing = getRule(id)
  if (!existing) throw new Error('Rule not found')
  const next = { ...existing, ...patch }
  if (patch.condition || patch.action) {
    validateRule({ name: next.name, condition: next.condition, action: next.action })
  }
  db.prepare(`
    UPDATE rules SET name=?, scope=?, ad_account_id=?, campaign_id=?,
      condition_json=?, action_json=?, cooldown_hours=?, enabled=?, requires_approval=?
    WHERE id=?
  `).run(
    next.name,
    next.scope,
    next.ad_account_id || null,
    next.campaign_id || null,
    JSON.stringify(next.condition),
    JSON.stringify(next.action),
    next.cooldown_hours,
    next.enabled ? 1 : 0,
    next.requires_approval ? 1 : 0,
    id,
  )
  return getRule(id)
}

function deleteRule(id) {
  db.prepare('DELETE FROM rules WHERE id = ?').run(id)
}

function listExecutions({ ruleId, limit = 50 } = {}) {
  if (ruleId) {
    return db.prepare('SELECT * FROM rule_executions WHERE rule_id = ? ORDER BY executed_at DESC LIMIT ?').all(ruleId, limit)
  }
  return db.prepare('SELECT * FROM rule_executions ORDER BY executed_at DESC LIMIT ?').all(limit)
}

function deserializeRule(row) {
  return {
    ...row,
    enabled: !!row.enabled,
    requires_approval: !!row.requires_approval,
    condition: JSON.parse(row.condition_json),
    action: JSON.parse(row.action_json),
  }
}

// ─── Insights fetch ──────────────────────────────────────────────────────────

// Returns a normalized metrics object for one campaign in the given window.
// Keys: spend_cents, roas, ctr, frequency, cpa, name, dailyBudgetCents, accountId, status, token.
async function fetchCampaignMetrics(campaignId, datePreset) {
  // Try each non-dead token until one returns data. Most calls hit the right
  // token first because findTokenForAdAccount has cached the mapping.
  const errors = []
  const tokensToTry = [...META_TOKENS]
  for (const token of tokensToTry) {
    try {
      const fields = `id,name,status,effective_status,daily_budget,account_id,insights.date_preset(${datePreset}){spend,purchase_roas,actions,cost_per_action_type,ctr,frequency,cpm}`
      const url = `https://graph.facebook.com/${META_API_VERSION}/${campaignId}?fields=${fields}&access_token=${token}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()
      if (data.error) { errors.push(`${token.slice(-8)}: ${data.error.message}`); continue }
      // Found a working token. Extract metrics.
      const ins = data.insights?.data?.[0] || {}
      const spend = parseFloat(ins.spend || 0)
      const roas = parseFloat(ins.purchase_roas?.[0]?.value || 0)
      const ctr = parseFloat(ins.ctr || 0)
      const frequency = parseFloat(ins.frequency || 0)
      // Find purchase CPA: cost_per_action_type may contain { action_type, value }
      const purchaseCpaEntry = (ins.cost_per_action_type || []).find(a =>
        a.action_type === 'purchase' || a.action_type === 'omni_purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
      )
      const cpa = purchaseCpaEntry ? parseFloat(purchaseCpaEntry.value) : null
      // CPR adapts to the campaign's optimization goal — picks the right
      // cost-per-X for sales / messenger / engagement / etc.
      const cpr = pickCostPerResult(ins.cost_per_action_type)
      return {
        token,
        name: data.name,
        status: data.effective_status || data.status,
        accountId: data.account_id ? `act_${data.account_id}` : null,
        dailyBudgetCents: data.daily_budget ? parseInt(data.daily_budget, 10) : null,
        spend_cents: Math.round(spend * 100),
        roas,
        ctr,
        frequency,
        cpa,
        cpr,
      }
    } catch (e) {
      errors.push(`${token.slice(-8)}: ${e.message}`)
    }
  }
  throw new Error(`Could not fetch insights for ${campaignId}: ${errors.join(' | ')}`)
}

// ─── Cool-down check ─────────────────────────────────────────────────────────

function isOnCooldown(ruleId, campaignId, cooldownHours) {
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString()
  const row = db.prepare(`
    SELECT id FROM rule_executions
    WHERE rule_id = ? AND target_campaign_id = ? AND status = 'success' AND executed_at >= ?
    ORDER BY executed_at DESC LIMIT 1
  `).get(ruleId, campaignId, cutoff)
  return !!row
}

// ─── Condition evaluation ────────────────────────────────────────────────────

function compare(value, operator, threshold) {
  switch (operator) {
    case '<': return value < threshold
    case '<=': return value <= threshold
    case '>': return value > threshold
    case '>=': return value >= threshold
    case '==': return value === threshold
    default: return false
  }
}

// ─── Action execution ────────────────────────────────────────────────────────

async function executeAction(rule, campaign, metrics) {
  const action = rule.action
  if (action.type === 'pause') {
    const accountId = campaign.accountId || metrics.accountId
    await updateCampaignStatus(campaign.id, accountId, 'PAUSE')
    return { action_taken: 'paused', action_detail: `was ${metrics.status} → PAUSED` }
  }
  if (action.type === 'increase_budget' || action.type === 'decrease_budget') {
    const current = metrics.dailyBudgetCents
    if (!current) throw new Error('Campaign has no daily_budget (likely ABO — budget on ad sets, not campaign). Skipping budget action.')
    const factor = action.type === 'increase_budget' ? 1 + action.percent / 100 : 1 - action.percent / 100
    const next = Math.max(100, Math.round(current * factor))  // min $1
    const token = metrics.token
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${campaign.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_budget: next, access_token: token }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return {
      action_taken: `budget_${action.type === 'increase_budget' ? 'increased' : 'decreased'}_${action.percent}%`,
      action_detail: `$${(current / 100).toFixed(2)} → $${(next / 100).toFixed(2)}`,
    }
  }
  if (action.type === 'notify') {
    return { action_taken: 'notify_only', action_detail: 'no Meta action — log + Telegram only' }
  }
  throw new Error(`Unknown action type: ${action.type}`)
}

// ─── Evaluate one rule against one campaign ──────────────────────────────────

async function evaluateRuleOnCampaign(rule, campaignId, { dryRun = false } = {}) {
  const { condition } = rule

  // Fetch metrics first so dry-run reports show numbers even when other gates skip
  let metrics
  try {
    metrics = await fetchCampaignMetrics(campaignId, condition.window)
  } catch (err) {
    return { status: 'failed', campaignId, error: `metrics fetch: ${err.message}` }
  }

  const baseInfo = {
    campaignId,
    campaignName: metrics.name,
    campaignStatus: metrics.status,
    spend_cents: metrics.spend_cents,
  }

  // Cool-down: skip if this rule fired on this campaign too recently
  // (Dry-run bypasses this gate so the user can see what WOULD trigger even
  // if a cool-down is currently active.)
  if (!dryRun && isOnCooldown(rule.id, campaignId, rule.cooldown_hours)) {
    return { ...baseInfo, status: 'skipped_cooldown' }
  }

  // If campaign is already paused, no point evaluating "pause" rules
  if (rule.action.type === 'pause' && (metrics.status === 'PAUSED' || metrics.status === 'CAMPAIGN_PAUSED')) {
    return { ...baseInfo, status: 'skipped_already_paused' }
  }

  // Minimum spend gate — don't trigger on near-zero data
  if (metrics.spend_cents < condition.min_spend_cents) {
    return { ...baseInfo, status: 'skipped_below_min_spend' }
  }

  // Read the chosen metric value
  const metricValue = (
    condition.metric === 'roas' ? metrics.roas :
    condition.metric === 'spend' ? metrics.spend_cents / 100 :  // user-facing units
    condition.metric === 'ctr' ? metrics.ctr :
    condition.metric === 'frequency' ? metrics.frequency :
    condition.metric === 'cpa' ? metrics.cpa :
    condition.metric === 'cpr' ? metrics.cpr :
    null
  )

  // Skip when the campaign hasn't produced result data yet. This matters most
  // for CPR / CPA / ROAS: a campaign with zero purchases would have null, and
  // we'd otherwise either trigger or skip unpredictably depending on operator.
  // Better to wait until there's actual data.
  if (metricValue == null || isNaN(metricValue)) {
    return { ...baseInfo, status: 'skipped_no_data', metric: condition.metric }
  }

  const triggered = compare(metricValue, condition.operator, condition.value)
  if (!triggered) {
    return { ...baseInfo, status: 'no_trigger', metric: condition.metric, metricValue, threshold: condition.value }
  }

  // ─── Dry-run short-circuit ────────────────────────────────────────────────
  // From here down, normal execution either enqueues for approval or runs the
  // Meta action. In dry-run we just describe what WOULD happen.
  if (dryRun) {
    const proposed = describeProposedAction(rule.action, metrics)
    return {
      ...baseInfo,
      status: 'would_trigger',
      metric: condition.metric,
      metricValue,
      threshold: condition.value,
      wouldNeedApproval: !!rule.requires_approval && rule.action.type !== 'notify',
      proposedAction: proposed,
    }
  }

  // ─── Approval gate ────────────────────────────────────────────────────────
  // If the rule requires approval, don't execute now. Enqueue a pending
  // action, ping Telegram with Approve/Reject buttons, and let the poller
  // handle the user's decision.
  if (rule.requires_approval && rule.action.type !== 'notify') {
    const pending = createPending({
      rule_id: rule.id,
      rule_name: rule.name,
      target_campaign_id: campaignId,
      target_campaign_name: metrics.name,
      account_id: metrics.accountId,
      metric: condition.metric,
      metric_value: metricValue,
      threshold_value: condition.value,
      action: rule.action,
      snapshot: { dailyBudgetCents: metrics.dailyBudgetCents, status: metrics.status, spend_cents: metrics.spend_cents },
    })

    // Send Telegram message with inline buttons
    const proposed = describeProposedAction(rule.action, metrics)
    const msg =
      `<b>⏳ Action awaiting approval</b>\n\n` +
      `<b>Rule:</b> ${escapeHtml(rule.name)}\n` +
      `<b>Campaign:</b> ${escapeHtml(metrics.name)}\n` +
      `<b>${condition.metric.toUpperCase()}:</b> ${formatMetric(condition.metric, metricValue)} (threshold ${condition.operator} ${formatMetric(condition.metric, condition.value)})\n` +
      `<b>Spent today:</b> $${(metrics.spend_cents / 100).toFixed(2)}\n` +
      `<b>Proposed action:</b> ${proposed}\n\n` +
      `<i>Auto-rejects in 4h if no decision.</i>`
    const buttons = [[
      { text: '✅ Approve', callback_data: `pa:approve:${pending.id}` },
      { text: '❌ Reject', callback_data: `pa:reject:${pending.id}` },
    ]]
    const tg = await sendWithButtons(msg, buttons)
    if (tg?.ok && tg.result?.message_id) {
      setTelegramMessage(pending.id, tg.result.chat.id, tg.result.message_id)
    } else {
      console.warn(`[Rules] Could not send Telegram approval prompt for pending #${pending.id}`)
    }

    // Log as a "queued for approval" execution row so it shows up in the audit log.
    db.prepare(`
      INSERT INTO rule_executions (rule_id, rule_name, target_campaign_id, target_campaign_name,
        metric, metric_value, threshold_value, action_taken, action_detail, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(rule.id, rule.name, campaignId, metrics.name, condition.metric, metricValue,
      condition.value, 'queued_for_approval', `pending #${pending.id}`, 'pending_approval')

    return { status: 'pending_approval', campaignId, metricValue, pendingId: pending.id }
  }

  // Trigger — execute the action and record it
  let exec
  try {
    const result = await executeAction(rule, { id: campaignId, accountId: metrics.accountId }, metrics)
    exec = {
      rule_id: rule.id,
      rule_name: rule.name,
      target_campaign_id: campaignId,
      target_campaign_name: metrics.name,
      metric: condition.metric,
      metric_value: metricValue,
      threshold_value: condition.value,
      action_taken: result.action_taken,
      action_detail: result.action_detail,
      status: 'success',
      error_message: null,
    }
  } catch (err) {
    exec = {
      rule_id: rule.id,
      rule_name: rule.name,
      target_campaign_id: campaignId,
      target_campaign_name: metrics.name,
      metric: condition.metric,
      metric_value: metricValue,
      threshold_value: condition.value,
      action_taken: 'failed',
      action_detail: null,
      status: 'failed',
      error_message: err.message,
    }
  }

  db.prepare(`
    INSERT INTO rule_executions (rule_id, rule_name, target_campaign_id, target_campaign_name,
      metric, metric_value, threshold_value, action_taken, action_detail, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(exec.rule_id, exec.rule_name, exec.target_campaign_id, exec.target_campaign_name,
    exec.metric, exec.metric_value, exec.threshold_value, exec.action_taken, exec.action_detail,
    exec.status, exec.error_message)

  db.prepare('UPDATE rules SET trigger_count = trigger_count + 1 WHERE id = ?').run(rule.id)

  // Notify via Telegram (best-effort, never fails the whole flow)
  if (exec.status === 'success') {
    const emoji = rule.action.type === 'pause' ? '⏸' : rule.action.type.includes('budget') ? '💰' : '🔔'
    const msg =
      `${emoji} <b>Rule fired: ${escapeHtml(rule.name)}</b>\n` +
      `Campaign: ${escapeHtml(metrics.name)}\n` +
      `${condition.metric.toUpperCase()} = ${formatMetric(condition.metric, metricValue)} (threshold ${condition.operator} ${formatMetric(condition.metric, condition.value)})\n` +
      `Action: ${exec.action_detail || exec.action_taken}`
    sendTelegram(msg).catch(e => console.warn('[Rules] Telegram notify failed:', e.message))
  }

  return { status: exec.status, campaignId, metricValue, action: exec.action_taken, error: exec.error_message }
}

// Human-readable summary of what we'd actually do on approval
function describeProposedAction(action, metrics) {
  if (action.type === 'pause') return '⏸ Pause this campaign'
  if (action.type === 'increase_budget' || action.type === 'decrease_budget') {
    const cur = metrics.dailyBudgetCents
    if (!cur) return `${action.type === 'increase_budget' ? '💰 +' : '📉 -'}${action.percent}% daily budget (current budget unknown — campaign may be ABO)`
    const factor = action.type === 'increase_budget' ? 1 + action.percent / 100 : 1 - action.percent / 100
    const next = Math.max(100, Math.round(cur * factor))
    const arrow = action.type === 'increase_budget' ? '💰 +' : '📉 -'
    return `${arrow}${action.percent}%: $${(cur / 100).toFixed(2)}/day → $${(next / 100).toFixed(2)}/day`
  }
  return action.type
}

function formatMetric(metric, value) {
  if (metric === 'roas') return value.toFixed(2)
  if (metric === 'spend' || metric === 'cpa' || metric === 'cpr') return `$${value.toFixed(2)}`
  if (metric === 'ctr' || metric === 'frequency') return value.toFixed(2)
  return String(value)
}

function escapeHtml(s) {
  return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;')
}

// ─── Top-level evaluator ─────────────────────────────────────────────────────

// Returns campaign IDs that this rule applies to. For 'all' scope, we pull
// from getRecentCampaigns (last 7 days, since older campaigns are unlikely
// to be the ones we want auto-managing). For 'campaign' scope, just that one.
async function getCampaignsForRule(rule) {
  if (rule.scope === 'campaign' && rule.campaign_id) {
    return [rule.campaign_id]
  }
  // 'all' or unspecified — pull recent campaigns (last 7 days)
  const { getRecentCampaigns } = require('./meta')
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recent = await getRecentCampaigns(sinceMs)
  if (rule.ad_account_id) {
    return recent.filter(c => c.accountId === rule.ad_account_id).map(c => c.id)
  }
  return recent.map(c => c.id)
}

async function evaluateRule(rule, { dryRun = false } = {}) {
  // Make sure the Telegram callback poller is alive — so if this rule needs
  // approval, the user's Approve/Reject taps will be processed even when the
  // server was booted before this code shipped.
  if (!dryRun && rule.requires_approval) ensurePollerRunning()
  const campaignIds = await getCampaignsForRule(rule)
  const results = []
  for (const cid of campaignIds) {
    const r = await evaluateRuleOnCampaign(rule, cid, { dryRun })
    results.push(r)
  }
  if (!dryRun) {
    // SQLite quirk: double-quoted strings are parsed as column references, not
    // string literals. Must use single quotes around 'now' or SQLite throws
    // "no such column: now". (Real bug we hit — the action would execute
    // successfully but this trailing UPDATE would throw, making /run report failure.)
    db.prepare(`UPDATE rules SET last_evaluated_at = datetime('now') WHERE id = ?`).run(rule.id)
  }
  return results
}

// Verification path — run every enabled rule against every matching campaign
// in dry-run mode and return a structured report. Makes NO Meta changes and
// writes nothing to the DB. Use this to confirm rules are seeing what you'd
// expect before trusting them to run on auto.
async function dryRunAllRules() {
  const rules = listRules().filter(r => r.enabled)
  const report = []
  for (const rule of rules) {
    try {
      const results = await evaluateRule(rule, { dryRun: true })
      report.push({
        rule: {
          id: rule.id,
          name: rule.name,
          condition: rule.condition,
          action: rule.action,
          requires_approval: rule.requires_approval,
        },
        results,
      })
    } catch (err) {
      report.push({
        rule: { id: rule.id, name: rule.name },
        error: err.message,
        results: [],
      })
    }
  }
  return report
}

async function evaluateAllEnabledRules() {
  const rules = listRules().filter(r => r.enabled)
  console.log(`[Rules] Evaluating ${rules.length} enabled rule(s)`)
  const summary = []
  for (const rule of rules) {
    try {
      const results = await evaluateRule(rule)
      summary.push({ rule: rule.name, results })
    } catch (err) {
      console.error(`[Rules] Rule "${rule.name}" evaluation threw:`, err.message)
      summary.push({ rule: rule.name, error: err.message })
    }
  }
  return summary
}

// Called by the Telegram poller when a user taps Approve. Re-fetches latest
// metrics (in case state changed since the prompt was sent), then executes.
async function executeApprovedPending(pending) {
  // Re-check campaign metrics so we don't act on stale numbers
  const metrics = await fetchCampaignMetrics(pending.target_campaign_id, 'today')
  const fakeCampaign = { id: pending.target_campaign_id, accountId: pending.account_id || metrics.accountId }
  // Build a fake rule wrapper since executeAction reads rule.action
  const result = await executeAction({ action: pending.action }, fakeCampaign, metrics)

  // Log to rule_executions too so the audit log stays consistent
  db.prepare(`
    INSERT INTO rule_executions (rule_id, rule_name, target_campaign_id, target_campaign_name,
      metric, metric_value, threshold_value, action_taken, action_detail, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(pending.rule_id, pending.rule_name, pending.target_campaign_id, pending.target_campaign_name,
    pending.metric, pending.metric_value, pending.threshold_value,
    result.action_taken, result.action_detail, 'success')

  db.prepare('UPDATE rules SET trigger_count = trigger_count + 1 WHERE id = ?').run(pending.rule_id)
  return result
}

module.exports = {
  // CRUD
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  listExecutions,
  // Evaluation
  evaluateRule,
  evaluateRuleOnCampaign,
  evaluateAllEnabledRules,
  dryRunAllRules,
  executeApprovedPending,
  // Constants for UI
  VALID_METRICS,
  VALID_OPERATORS,
  VALID_WINDOWS,
  VALID_ACTIONS,
}
