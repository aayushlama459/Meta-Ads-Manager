// AI tools the chat assistant can call. Two categories:
//   - read-only: executed immediately
//   - destructive (pause/resume): execution gated behind explicit user confirmation
//
// Tool definitions are in Gemini's functionDeclarations schema. Implementations
// reuse the existing lib/meta.js helpers so behavior stays consistent with the
// rest of the app (token routing, dead-token skipping, etc.).

const {
  getAllAdAccounts,
  searchAllCampaigns,
  updateCampaignStatus,
  findTokenForAdAccount,
  getAllCampaignsWithInsights,
} = require('./meta')
const { META_TOKENS, META_API_VERSION } = require('./config')

const V = META_API_VERSION

// ─── Gemini function declarations ─────────────────────────────────────────────
const TOOL_DEFINITIONS = [
  {
    name: 'list_ad_accounts',
    description: "List all of the user's Meta ad accounts (name, id, status). Use this when the user asks 'which accounts do I have' or you need to disambiguate which account a campaign lives in.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_active_campaigns',
    description: "List currently ACTIVE campaigns across all accounts. Optionally filter by account or by a substring of the campaign name. Use this to find the campaign the user is referring to before acting.",
    parameters: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Optional ad account id like act_1863796901131490 to filter by.' },
        name_contains: { type: 'string', description: 'Optional substring to filter campaign names (case-insensitive).' },
      },
    },
  },
  {
    name: 'get_campaign_insights',
    description: "Get performance metrics (spend, impressions, link clicks, CTR, CPC, purchases, purchase ROAS, cost per purchase) for a campaign over a date range. Use this when the user asks 'how is X doing' or 'what's the ROAS for Y'.",
    parameters: {
      type: 'object',
      properties: {
        campaign: { type: 'string', description: 'Campaign id (numeric) or part of the name. The system will resolve it to a single campaign.' },
        date_preset: { type: 'string', description: "Date range. One of: today, yesterday, last_3d, last_7d, last_14d, last_28d, last_30d, this_month, last_month, maximum. Default: last_7d." },
      },
      required: ['campaign'],
    },
  },
  {
    name: 'get_campaign_landing_page',
    description: "Returns the landing page URL and inferred product slug for a campaign. Useful when the user asks 'what product is this campaign selling'.",
    parameters: {
      type: 'object',
      properties: {
        campaign: { type: 'string', description: 'Campaign id (numeric) or part of the name.' },
      },
      required: ['campaign'],
    },
  },
  {
    name: 'get_today_summary',
    description: "One-shot overview: total spend today across all accounts, top spender, top performer by ROAS, worst spender (high spend, no purchases). Use this when the user asks 'how are things today' or 'give me an overview'.",
    parameters: { type: 'object', properties: {} },
  },
  // ─── DESTRUCTIVE — require user confirmation ──────────────────────────────
  {
    name: 'pause_campaign',
    description: "Pause a campaign. THIS IS A DESTRUCTIVE ACTION — the system will pause execution and ask the user to confirm before actually pausing. Use when the user says 'pause X' or agrees to a recommendation to pause.",
    parameters: {
      type: 'object',
      properties: {
        campaign: { type: 'string', description: 'Campaign id (numeric) or part of the name. Must resolve to exactly one ACTIVE campaign.' },
      },
      required: ['campaign'],
    },
  },
  {
    name: 'resume_campaign',
    description: "Resume a paused campaign. THIS IS A DESTRUCTIVE ACTION — confirmation required before execution.",
    parameters: {
      type: 'object',
      properties: {
        campaign: { type: 'string', description: 'Campaign id (numeric) or part of the name. Must resolve to exactly one PAUSED campaign.' },
      },
      required: ['campaign'],
    },
  },
]

const DESTRUCTIVE_TOOLS = new Set(['pause_campaign', 'resume_campaign'])
const isDestructive = (name) => DESTRUCTIVE_TOOLS.has(name)

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function gget(url) {
  const r = await fetch(url, { cache: 'no-store' })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j
}

function inferProductSlug(url) {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/products?\/([^\/?#]+)/i)
    if (m) return decodeURIComponent(m[1]).replace(/-/g, ' ')
    const seg = u.pathname.split('/').filter(Boolean).pop()
    return seg ? decodeURIComponent(seg).replace(/-/g, ' ') : u.hostname
  } catch { return null }
}

// Pull all campaigns (both active + paused) across all accounts. Used for name
// resolution so the user can resume something currently paused. Light fields.
async function listAllCampaignsLight() {
  const accounts = await getAllAdAccounts()
  const out = []
  await Promise.all(accounts.map(async (acc) => {
    let token
    try { token = await findTokenForAdAccount(acc.id) } catch { return }
    try {
      const url = `https://graph.facebook.com/${V}/${acc.id}/campaigns?fields=id,name,status,effective_status,objective,daily_budget&limit=200&access_token=${token}`
      const j = await gget(url)
      for (const c of j.data || []) {
        out.push({
          id: c.id,
          name: c.name,
          status: c.effective_status || c.status,
          objective: c.objective,
          accountId: acc.id,
          accountName: acc.name,
          dailyBudgetCents: c.daily_budget ? parseInt(c.daily_budget, 10) : null,
        })
      }
    } catch (_) {}
  }))
  return out
}

// Match a user-supplied campaign string to a single campaign.
// Returns { ok: true, campaign } | { ok: false, error, candidates? }.
async function resolveCampaign(input, { mustBeStatus } = {}) {
  if (!input) return { ok: false, error: 'No campaign provided.' }

  const all = await listAllCampaignsLight()

  // exact id
  if (/^\d+$/.test(String(input).trim())) {
    const hit = all.find((c) => c.id === String(input).trim())
    if (!hit) return { ok: false, error: `No campaign with id ${input} found.` }
    if (mustBeStatus && hit.status !== mustBeStatus) {
      return { ok: false, error: `Campaign "${hit.name}" is currently ${hit.status}, not ${mustBeStatus}.` }
    }
    return { ok: true, campaign: hit }
  }

  const q = String(input).toLowerCase().trim()
  let matches = all.filter((c) => c.name.toLowerCase().includes(q))

  // If a status was requested, narrow first; if that empties, return helpful list
  if (mustBeStatus) {
    const narrowed = matches.filter((c) => c.status === mustBeStatus)
    if (narrowed.length === 0 && matches.length > 0) {
      return {
        ok: false,
        error: `Found campaigns matching "${input}" but none are currently ${mustBeStatus}.`,
        candidates: matches.slice(0, 10).map((c) => ({ id: c.id, name: c.name, status: c.status, account: c.accountName })),
      }
    }
    matches = narrowed
  }

  if (matches.length === 0) {
    return { ok: false, error: `No campaign found matching "${input}".` }
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Multiple campaigns match "${input}" — please be more specific.`,
      candidates: matches.slice(0, 10).map((c) => ({ id: c.id, name: c.name, status: c.status, account: c.accountName })),
    }
  }
  return { ok: true, campaign: matches[0] }
}

// ─── Read-only tool implementations ───────────────────────────────────────────
async function impl_list_ad_accounts() {
  const accounts = await getAllAdAccounts()
  return {
    count: accounts.length,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, status: a.account_status })),
  }
}

async function impl_list_active_campaigns({ account_id, name_contains } = {}) {
  const all = await listAllCampaignsLight()
  let filtered = all.filter((c) => c.status === 'ACTIVE')
  if (account_id) filtered = filtered.filter((c) => c.accountId === account_id)
  if (name_contains) {
    const q = String(name_contains).toLowerCase()
    filtered = filtered.filter((c) => c.name.toLowerCase().includes(q))
  }
  return {
    count: filtered.length,
    campaigns: filtered.map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      account: c.accountName,
      dailyBudgetUsd: c.dailyBudgetCents ? (c.dailyBudgetCents / 100).toFixed(2) : null,
    })),
  }
}

async function impl_get_campaign_insights({ campaign, date_preset = 'last_7d' }) {
  const r = await resolveCampaign(campaign)
  if (!r.ok) return r

  const token = await findTokenForAdAccount(r.campaign.accountId)
  const fields = 'spend,impressions,inline_link_clicks,ctr,cpc,actions,action_values,purchase_roas,cost_per_action_type'
  const url = `https://graph.facebook.com/${V}/${r.campaign.id}/insights?fields=${fields}&date_preset=${date_preset}&access_token=${token}`
  const j = await gget(url)
  const row = (j.data && j.data[0]) || null

  if (!row) {
    return {
      campaign: r.campaign.name,
      account: r.campaign.accountName,
      date_preset,
      message: 'No insights for this date range yet.',
    }
  }

  const action = (type) => {
    const a = (row.actions || []).find((x) => x.action_type === type)
    return a ? Number(a.value) : 0
  }
  const value = (type) => {
    const a = (row.action_values || []).find((x) => x.action_type === type)
    return a ? Number(a.value) : 0
  }
  const cpa = (row.cost_per_action_type || []).find((x) => x.action_type === 'purchase')

  return {
    campaign: r.campaign.name,
    account: r.campaign.accountName,
    date_preset,
    spend_usd: Number(row.spend || 0).toFixed(2),
    impressions: Number(row.impressions || 0),
    link_clicks: Number(row.inline_link_clicks || 0),
    ctr_pct: row.ctr ? Number(row.ctr).toFixed(2) : null,
    cpc_usd: row.cpc ? Number(row.cpc).toFixed(2) : null,
    purchases: action('purchase'),
    purchase_value_usd: value('purchase').toFixed(2),
    cost_per_purchase_usd: cpa ? Number(cpa.value).toFixed(2) : null,
    purchase_roas: row.purchase_roas?.[0]?.value || null,
  }
}

async function impl_get_campaign_landing_page({ campaign }) {
  const r = await resolveCampaign(campaign)
  if (!r.ok) return r

  const token = await findTokenForAdAccount(r.campaign.accountId)
  const adsUrl = `https://graph.facebook.com/${V}/${r.campaign.id}/ads?fields=id,name,creative{id,object_story_spec,asset_feed_spec}&limit=10&access_token=${token}`
  const j = await gget(adsUrl)

  let link = null
  let adName = null
  for (const ad of j.data || []) {
    const c = ad.creative || {}
    link =
      c.object_story_spec?.link_data?.link ||
      c.object_story_spec?.video_data?.call_to_action?.value?.link ||
      c.asset_feed_spec?.link_urls?.[0]?.website_url ||
      null
    if (link) { adName = ad.name; break }
  }

  return {
    campaign: r.campaign.name,
    account: r.campaign.accountName,
    ad_name: adName,
    landing_page: link,
    product: link ? inferProductSlug(link) : null,
  }
}

async function impl_get_today_summary() {
  const rows = await getAllCampaignsWithInsights().catch(() => [])
  // rows: array of campaigns with insights for today (date_preset depends on impl)
  let totalSpend = 0
  let totalPurchases = 0
  let totalRevenue = 0
  const perCampaign = []

  for (const c of rows || []) {
    const ins = (c.insights && c.insights.data && c.insights.data[0]) || null
    if (!ins) continue
    const spend = Number(ins.spend || 0)
    const purchases = (ins.actions || []).find((a) => a.action_type === 'purchase')
    const purchaseVal = (ins.action_values || []).find((a) => a.action_type === 'purchase')
    const p = purchases ? Number(purchases.value) : 0
    const v = purchaseVal ? Number(purchaseVal.value) : 0
    totalSpend += spend
    totalPurchases += p
    totalRevenue += v
    perCampaign.push({
      id: c.id,
      name: c.name,
      account: c.accountName || null,
      spend_usd: spend.toFixed(2),
      purchases: p,
      revenue_usd: v.toFixed(2),
      roas: spend > 0 ? (v / spend).toFixed(2) : null,
    })
  }

  perCampaign.sort((a, b) => Number(b.spend_usd) - Number(a.spend_usd))
  const topSpender = perCampaign[0] || null
  const topRoas = [...perCampaign].filter((c) => Number(c.roas) > 0).sort((a, b) => Number(b.roas) - Number(a.roas))[0] || null
  const worstSpenders = perCampaign.filter((c) => Number(c.spend_usd) > 2 && c.purchases === 0)

  return {
    date_preset: 'today',
    total_spend_usd: totalSpend.toFixed(2),
    total_purchases: totalPurchases,
    total_revenue_usd: totalRevenue.toFixed(2),
    overall_roas: totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : null,
    top_spender: topSpender,
    top_roas: topRoas,
    spending_without_purchases: worstSpenders,
    campaign_count: perCampaign.length,
  }
}

// ─── Destructive tool implementations ─────────────────────────────────────────
// These are called ONLY after the user confirms via UI.
async function impl_pause_campaign({ campaign }) {
  const r = await resolveCampaign(campaign, { mustBeStatus: 'ACTIVE' })
  if (!r.ok) return r
  const res = await updateCampaignStatus(r.campaign.id, r.campaign.accountId, 'PAUSE')
  return {
    success: !!res.success,
    paused: { id: r.campaign.id, name: r.campaign.name, account: r.campaign.accountName },
  }
}

async function impl_resume_campaign({ campaign }) {
  const r = await resolveCampaign(campaign, { mustBeStatus: 'PAUSED' })
  if (!r.ok) return r
  const res = await updateCampaignStatus(r.campaign.id, r.campaign.accountId, 'RESUME')
  return {
    success: !!res.success,
    resumed: { id: r.campaign.id, name: r.campaign.name, account: r.campaign.accountName },
  }
}

// Build the preview data the UI shows on a confirmation card.
async function buildActionPreview(toolName, args) {
  if (toolName === 'pause_campaign' || toolName === 'resume_campaign') {
    const requiredStatus = toolName === 'pause_campaign' ? 'ACTIVE' : 'PAUSED'
    const r = await resolveCampaign(args.campaign, { mustBeStatus: requiredStatus })
    if (!r.ok) return { ok: false, error: r.error, candidates: r.candidates }

    // Best-effort: fetch today's spend so user sees what they're touching
    let spendToday = null
    let purchasesToday = null
    try {
      const token = await findTokenForAdAccount(r.campaign.accountId)
      const url = `https://graph.facebook.com/${V}/${r.campaign.id}/insights?fields=spend,actions&date_preset=today&access_token=${token}`
      const j = await gget(url)
      const ins = j.data && j.data[0]
      if (ins) {
        spendToday = Number(ins.spend || 0).toFixed(2)
        const p = (ins.actions || []).find((a) => a.action_type === 'purchase')
        purchasesToday = p ? Number(p.value) : 0
      }
    } catch (_) {}

    return {
      ok: true,
      action: toolName,
      campaign: {
        id: r.campaign.id,
        name: r.campaign.name,
        account: r.campaign.accountName,
        status: r.campaign.status,
        objective: r.campaign.objective,
        dailyBudgetUsd: r.campaign.dailyBudgetCents ? (r.campaign.dailyBudgetCents / 100).toFixed(2) : null,
        spendTodayUsd: spendToday,
        purchasesToday,
      },
    }
  }
  return { ok: false, error: `Unknown destructive tool: ${toolName}` }
}

// Single dispatcher for read-only tools.
async function executeReadTool(name, args = {}) {
  try {
    switch (name) {
      case 'list_ad_accounts': return await impl_list_ad_accounts()
      case 'list_active_campaigns': return await impl_list_active_campaigns(args)
      case 'get_campaign_insights': return await impl_get_campaign_insights(args)
      case 'get_campaign_landing_page': return await impl_get_campaign_landing_page(args)
      case 'get_today_summary': return await impl_get_today_summary()
      default: return { ok: false, error: `Unknown read tool: ${name}` }
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function executeDestructiveTool(name, args = {}) {
  try {
    switch (name) {
      case 'pause_campaign': return await impl_pause_campaign(args)
      case 'resume_campaign': return await impl_resume_campaign(args)
      default: return { ok: false, error: `Unknown destructive tool: ${name}` }
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  isDestructive,
  executeReadTool,
  executeDestructiveTool,
  buildActionPreview,
}
