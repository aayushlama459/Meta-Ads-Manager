const { getAllCampaignsWithInsights } = require('./meta')
const { sendTelegram } = require('./telegram')
const { NEPAL_OFFSET_MS } = require('./config')

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNepalTime() {
  return new Date(Date.now() + NEPAL_OFFSET_MS)
}

function formatDate(nepalDate) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${days[nepalDate.getUTCDay()]}, ${nepalDate.getUTCDate()} ${months[nepalDate.getUTCMonth()]} ${nepalDate.getUTCFullYear()}`
}

function getPurchases(actions) {
  if (!actions || !actions.length) return 0
  const found = actions.find(a =>
    a.action_type === 'purchase' ||
    a.action_type === 'omni_purchase' ||
    a.action_type === 'offsite_conversion.fb_pixel_purchase'
  )
  return found ? parseInt(found.value, 10) : 0
}

function getCostPerPurchase(costPerAction) {
  if (!costPerAction || !costPerAction.length) return null
  const found = costPerAction.find(a =>
    a.action_type === 'purchase' ||
    a.action_type === 'omni_purchase' ||
    a.action_type === 'offsite_conversion.fb_pixel_purchase'
  )
  return found ? parseFloat(found.value) : null
}

function getRoas(purchaseRoas) {
  if (!purchaseRoas || !purchaseRoas.length) return null
  const found = purchaseRoas.find(a =>
    a.action_type === 'omni_purchase' ||
    a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
    a.action_type === 'purchase'
  )
  return found ? parseFloat(found.value) : null
}

function roasEmoji(roas) {
  if (roas === null) return ''
  if (roas >= 2.0) return '✅'
  if (roas >= 1.0) return '⚠️'
  return '🚨'
}

function fmt(num) {
  return parseFloat(num || 0).toFixed(2)
}

// ── Main report function ───────────────────────────────────────────────────────

async function generateAndSendReport(timeLabel) {
  const nepalNow = getNepalTime()
  const dateStr = formatDate(nepalNow)

  console.log(`[Reporter] Generating report for ${timeLabel}`)

  let campaigns
  try {
    campaigns = await getAllCampaignsWithInsights()
  } catch (err) {
    await sendTelegram(`<b>Report Error at ${timeLabel}</b>\nCould not fetch data: ${err.message}`)
    return
  }

  if (!campaigns.length) {
    await sendTelegram(`<b>Report ${timeLabel}</b>\nNo campaigns found.`)
    return
  }

  // Sort by spend descending
  campaigns.sort((a, b) => {
    const aSpend = parseFloat(a.insights?.data?.[0]?.spend || 0)
    const bSpend = parseFloat(b.insights?.data?.[0]?.spend || 0)
    return bSpend - aSpend
  })

  let totalSpent = 0
  let totalPurchases = 0
  let totalRevenue = 0

  const lines = []
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`📊 <b>AD REPORT — ${timeLabel}</b>`)
  lines.push(`📅 ${dateStr}`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push('')

  // Only show campaigns that spent money today
  const activeCampaigns = campaigns.filter(c => parseFloat(c.insights?.data?.[0]?.spend || 0) > 0)

  if (!activeCampaigns.length) {
    await sendTelegram(`📊 <b>AD REPORT — ${timeLabel}</b>\n📅 ${dateStr}\n\nNo campaigns have spent budget today yet.`)
    return
  }

  for (const c of activeCampaigns) {
    const insight = c.insights?.data?.[0]
    const spend = parseFloat(insight?.spend || 0)
    const purchases = getPurchases(insight?.actions)
    const costPer = getCostPerPurchase(insight?.cost_per_action_type)
    const roas = getRoas(insight?.purchase_roas)
    const isActive = c.effective_status === 'ACTIVE'

    totalSpent += spend
    totalPurchases += purchases
    if (roas && spend > 0) totalRevenue += roas * spend

    const statusIcon = isActive ? '🟢' : '⏸'
    lines.push(`${statusIcon} <b>${c.name}</b>`)

    if (!isActive && spend === 0) {
      lines.push(`   Status: Paused — no spend today`)
    } else {
      lines.push(`   💸 Spent: $${fmt(spend)}`)
      if (purchases > 0) {
        lines.push(`   🛒 Purchases: ${purchases}   Cost/Purchase: $${fmt(costPer)}`)
        lines.push(`   📈 ROAS: ${roas ? roas.toFixed(2) + 'x' : 'N/A'} ${roasEmoji(roas)}`)
      } else {
        lines.push(`   🛒 Purchases: 0   No conversions yet`)
      }
    }
    lines.push('')
  }

  const overallRoas = totalSpent > 0 && totalRevenue > 0 ? totalRevenue / totalSpent : null

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`<b>TODAY'S TOTAL</b>`)
  lines.push(`💸 Total Spent: $${fmt(totalSpent)}`)
  lines.push(`🛒 Total Purchases: ${totalPurchases}`)
  if (overallRoas !== null) {
    lines.push(`📈 Overall ROAS: ${overallRoas.toFixed(2)}x ${roasEmoji(overallRoas)}`)
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push('')
  lines.push(`<i>🟢 Running  ⏸ Paused  ✅ Good ROAS  ⚠️ Low ROAS  🚨 Losing money</i>`)

  // Split into chunks of 4000 chars to stay under Telegram's 4096 limit
  const fullText = lines.join('\n')
  const chunks = []
  let current = ''

  for (const line of lines) {
    if ((current + '\n' + line).length > 4000) {
      chunks.push(current)
      current = line
    } else {
      current = current ? current + '\n' + line : line
    }
  }
  if (current) chunks.push(current)

  for (const chunk of chunks) {
    await sendTelegram(chunk)
  }

  console.log(`[Reporter] Report sent for ${timeLabel} in ${chunks.length} message(s)`)
}

module.exports = { generateAndSendReport }
