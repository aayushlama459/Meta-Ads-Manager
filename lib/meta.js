const { META_TOKENS, META_API_VERSION } = require('./config')

// ─── Multi-token routing ──────────────────────────────────────────────────────
// Cache: adAccountId -> { token, expiresAt }
const accountTokenCache = new Map()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 min

function normalizeAccountId(id) {
  if (!id) return id
  return String(id).startsWith('act_') ? id : `act_${id}`
}

// Find which token has access to a given ad account.
// Tries each token's /me/adaccounts; caches the answer.
async function findTokenForAdAccount(adAccountId) {
  const normalized = normalizeAccountId(adAccountId)

  // Cache hit — but only trust it if the token is still alive. Previously a
  // dead/rate-limited cached token would be returned anyway, causing the caller
  // (e.g. campaign create) to fail with a confusing "missing permissions" error
  // instead of falling through to a working token.
  const cached = accountTokenCache.get(normalized)
  if (cached && cached.expiresAt > Date.now() && !isTokenDead(cached.token)) {
    return cached.token
  }

  for (const token of META_TOKENS) {
    if (isTokenDead(token)) continue  // skip rate-limited/deactivated tokens
    try {
      const url = `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?fields=id&limit=200&access_token=${token}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()
      if (data.error) {
        if (/too many calls|access deactivated|rate.limit/i.test(data.error.message)) {
          markTokenDead(token, data.error.message)
        }
        continue
      }
      if (!Array.isArray(data.data)) continue
      if (data.data.some(a => a.id === normalized)) {
        accountTokenCache.set(normalized, { token, expiresAt: Date.now() + CACHE_TTL_MS })
        return token
      }
    } catch (_) {}
  }

  // No live token has access. Throw a clear error so the caller surfaces this
  // to the user as "rate-limited, try later" instead of Meta's misleading
  // "object does not exist / missing permissions" response from a dead fallback.
  throw new Error(
    `No working access token has permission for ${normalized}. ` +
    `This usually means the token that owns this account is currently rate-limited or has been deactivated by Meta. ` +
    `Wait a few minutes and retry, or use the "Reset Meta cache" button on the Launch Ad page.`
  )
}

// Merge ad accounts from all tokens, dedupe by id, populate the token cache as a side effect.
async function getAllAdAccounts() {
  const results = []
  const seen = new Set()

  for (const token of META_TOKENS) {
    try {
      const accounts = await getAdAccounts(token)
      for (const acc of accounts) {
        if (!seen.has(acc.id)) {
          seen.add(acc.id)
          results.push(acc)
          accountTokenCache.set(acc.id, { token, expiresAt: Date.now() + CACHE_TTL_MS })
        }
      }
    } catch (_) {}
  }

  return results
}

// Ad-account list per token, cached for 5 min. Without this the campaigns
// list polling would hit /me/adaccounts every 30s × N tokens, which trips
// Meta's rate limit fast. Ad accounts don't change in real time so the cache
// is safe — invalidation happens naturally on TTL.
const adAccountsCache = new Map()  // token -> { accounts, expiresAt }
const AD_ACCOUNTS_TTL_MS = 5 * 60 * 1000

// Tokens that recently failed (rate-limited / deactivated). Skip them for a
// cool-down so we don't keep hammering Meta with calls we know will fail.
const deadTokens = new Map()  // token -> expiresAt
const DEAD_TOKEN_COOLDOWN_MS = 15 * 60 * 1000

function isTokenDead(token) {
  const entry = deadTokens.get(token)
  if (!entry) return false
  if (entry.expiresAt < Date.now()) { deadTokens.delete(token); return false }
  return true
}

// Marks a token dead with exponential backoff: 15min, then 30min, then 60min.
// This breaks the previous infinite loop where a token kept getting re-marked
// every time its cool-down expired and the next poll happened to hit a brief
// Meta hiccup. After 3 consecutive failures, the token gets a real rest.
function markTokenDead(token, reason) {
  const prev = deadTokens.get(token)
  const failCount = (prev?.failCount || 0) + 1
  const minutes = failCount === 1 ? 15 : failCount === 2 ? 30 : 60
  const expiresAt = Date.now() + minutes * 60 * 1000
  console.warn(`[Meta] Token ...${token.slice(-8)} marked dead for ${minutes}min (failure #${failCount}): ${reason}`)
  deadTokens.set(token, { expiresAt, failCount })
}

// Called when a token successfully serves a request — clears the dead flag so
// the failure counter doesn't compound and the token is fully back in rotation.
function markTokenAlive(token) {
  if (deadTokens.has(token)) {
    console.log(`[Meta] Token ...${token.slice(-8)} recovered; clearing dead flag`)
    deadTokens.delete(token)
  }
}

// Admin reset — clears all in-memory caches related to Meta API state.
// Used by the UI reset button so users can recover without restarting the server.
function resetMetaCaches() {
  const before = { adAccounts: adAccountsCache.size, dead: deadTokens.size, tokenLookup: accountTokenCache.size, recent: !!recentCampaignsCache.result }
  adAccountsCache.clear()
  deadTokens.clear()
  accountTokenCache.clear()
  recentCampaignsCache.result = null
  recentCampaignsCache.expiresAt = 0
  console.log(`[Meta] Reset caches:`, before)
  return before
}

async function getAdAccounts(token) {
  if (isTokenDead(token)) throw new Error('Token in cool-down (recent rate-limit/deactivation)')

  const cached = adAccountsCache.get(token)
  if (cached && cached.expiresAt > Date.now()) return cached.accounts

  const url = `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?fields=id,name,account_id&limit=50&access_token=${token}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  if (data.error) {
    // Rate-limit (#17, #4) and deactivated-app errors should mark the token dead
    // so we stop spamming Meta. Other errors bubble up normally.
    if (/too many calls|access deactivated|rate.limit/i.test(data.error.message)) {
      markTokenDead(token, data.error.message)
    }
    throw new Error(data.error.message)
  }
  const accounts = data.data || []
  markTokenAlive(token)  // success → clear any prior dead flag
  adAccountsCache.set(token, { accounts, expiresAt: Date.now() + AD_ACCOUNTS_TTL_MS })
  return accounts
}

async function getPagesForAccount(token, adAccountId) {
  // IMPORTANT: cache: 'no-store' is required. Without it, Next.js caches the
  // fetch response at the framework level — so a page you add to your ad
  // account / business won't appear here until the cache expires (or the dev
  // server restarts), which looks indistinguishable from a permissions bug.

  // Primary: pages the system user can ADVERTISE on (works as long as the system
  // user is assigned to the page, even if Meta's strict /promote_pages link to
  // the ad account hasn't propagated yet).
  try {
    const url = `https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,tasks&limit=100&access_token=${token}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    if (!data.error && Array.isArray(data.data)) {
      const advertisable = data.data.filter(p => Array.isArray(p.tasks) && p.tasks.includes('ADVERTISE'))
      if (advertisable.length > 0) return advertisable.map(({ id, name }) => ({ id, name }))
    }
  } catch (_) {}

  // Fallback: strict /promote_pages link (Meta's preferred answer when it propagates)
  try {
    const url = `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/promote_pages?fields=id,name&access_token=${token}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    if (!data.error && data.data?.length > 0) return data.data
  } catch (_) {}

  return []
}

async function getPixels(token, adAccountId) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adspixels?fields=id,name,last_fired_time,is_unavailable&access_token=${token}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data || []
}

async function searchCampaigns(token, adAccountId, query) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/campaigns?fields=id,name,status,effective_status&filtering=[{"field":"name","operator":"CONTAIN","value":"${encodeURIComponent(query)}"}]&limit=50&access_token=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data || []
}

async function searchAllCampaigns(query) {
  const results = []
  const seen = new Set()

  for (const token of META_TOKENS) {
    if (isTokenDead(token)) continue
    try {
      const accounts = await getAdAccounts(token)
      for (const account of accounts) {
        try {
          const campaigns = await searchCampaigns(token, account.id, query)
          for (const c of campaigns) {
            if (!seen.has(c.id)) {
              seen.add(c.id)
              results.push({
                id: c.id,
                name: c.name,
                status: c.effective_status || c.status,
                account_id: account.id,
              })
            }
          }
        } catch (err) {
          console.error(`Error searching campaigns in account ${account.id}:`, err.message)
        }
      }
    } catch (err) {
      console.error(`Error fetching ad accounts with token:`, err.message)
    }
  }

  return results
}

async function updateCampaignStatus(campaignId, adAccountId, action) {
  const status = action === 'PAUSE' ? 'PAUSED' : 'ACTIVE'
  let lastError = null

  for (const token of META_TOKENS) {
    if (isTokenDead(token)) continue  // skip rate-limited tokens
    try {
      const url = `https://graph.facebook.com/${META_API_VERSION}/${campaignId}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, access_token: token }),
      })
      const data = await res.json()
      if (data.error) {
        lastError = data.error.message
        if (/too many calls|access deactivated|rate.limit/i.test(data.error.message)) {
          markTokenDead(token, data.error.message)
        }
        continue
      }
      if (data.success) { markTokenAlive(token); return { success: true, token } }
    } catch (err) {
      lastError = err.message
    }
  }

  throw new Error(lastError || 'All tokens failed')
}

async function getCampaignsWithInsights(token, adAccountId) {
  const fields = [
    'id', 'name', 'status', 'effective_status',
    'insights.date_preset(today){spend,purchase_roas,actions,cost_per_action_type}'
  ].join(',')
  const url = `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/campaigns?fields=${fields}&limit=100&access_token=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.data || []
}

// Short-lived cache so multiple browser tabs (or a fast poll cycle) don't all
// trigger fresh Meta calls. The list page polls every 30s; we cache for 25s
// so one real fetch hits Meta per cycle regardless of how many clients ask.
const recentCampaignsCache = { result: null, sinceMs: 0, expiresAt: 0 }
const RECENT_CACHE_TTL_MS = 25 * 1000

// Recent campaigns across all accessible accounts. Lightweight — no insights
// call — so the campaign list loads fast. Filtered by created_time on the
// server (Meta side) using a since=<unix-seconds> param.
async function getRecentCampaigns(sinceMs) {
  if (recentCampaignsCache.result &&
      recentCampaignsCache.sinceMs === sinceMs &&
      recentCampaignsCache.expiresAt > Date.now()) {
    return recentCampaignsCache.result
  }
  const sinceSec = Math.floor(sinceMs / 1000)
  const results = []
  const seen = new Set()
  // Parallelize: fetch all accounts for each token, then dedupe so we call
  // Meta /campaigns ONCE per unique ad account (not once per token-account
  // pair). Without this dedupe, accounts visible to multiple tokens get hit
  // 2-3x per poll, blowing the per-ad-account rate limit fast.
  const accountToToken = new Map()  // accountId -> { token, account } (first seen wins)
  await Promise.all(META_TOKENS.map(async (token) => {
    try {
      const accounts = await getAdAccounts(token)
      for (const acc of accounts) {
        if (!accountToToken.has(acc.id)) accountToToken.set(acc.id, { token, account: acc })
      }
    } catch (err) {
      console.error('[RecentCampaigns] getAdAccounts failed for one token:', err.message)
    }
  }))

  await Promise.all([...accountToToken.values()].map(async ({ token, account }) => {
    try {
      const url = `https://graph.facebook.com/${META_API_VERSION}/${account.id}/campaigns?fields=id,name,status,effective_status,created_time,daily_budget,objective&limit=100&date_preset=last_7d&access_token=${token}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()
      if (data.error) return // already-handled deactivated tokens etc.
      for (const c of (data.data || [])) {
        const createdMs = c.created_time ? new Date(c.created_time).getTime() : 0
        if (createdMs < sinceMs) continue
        if (seen.has(c.id)) return
        seen.add(c.id)
        results.push({
          id: c.id,
          name: c.name,
          status: c.effective_status || c.status,
          objective: c.objective,
          dailyBudgetCents: c.daily_budget ? parseInt(c.daily_budget, 10) : null,
          createdMs,
          accountId: account.id,
          accountName: account.name,
        })
      }
    } catch (err) {
      console.error(`[RecentCampaigns] ${account.id} threw:`, err.message)
    }
  }))
  // Newest first
  results.sort((a, b) => b.createdMs - a.createdMs)
  recentCampaignsCache.result = results
  recentCampaignsCache.sinceMs = sinceMs
  recentCampaignsCache.expiresAt = Date.now() + RECENT_CACHE_TTL_MS
  return results
}

// The reporter is the heaviest Meta caller in this app — it fetches CAMPAIGN
// INSIGHTS across every account 4 times per day. Two protections:
//   (1) Dedupe accounts: one call per unique account, not per (token, account)
//       pair. Accounts visible to multiple tokens previously got 2-3× the load.
//   (2) Cache for 50 min: even if the cron fires twice or someone manually
//       triggers a report, we don't re-pummel Meta.
const reporterCache = { result: null, expiresAt: 0 }
const REPORTER_CACHE_TTL_MS = 50 * 60 * 1000

async function getAllCampaignsWithInsights() {
  if (reporterCache.result && reporterCache.expiresAt > Date.now()) {
    console.log('[Reporter] Returning cached campaigns (cached for', Math.round((reporterCache.expiresAt - Date.now()) / 1000), 's more)')
    return reporterCache.result
  }

  const results = []
  const seen = new Set()
  const accountToToken = new Map()
  for (const token of META_TOKENS) {
    if (isTokenDead(token)) continue
    try {
      const accounts = await getAdAccounts(token)
      for (const acc of accounts) {
        if (!accountToToken.has(acc.id)) accountToToken.set(acc.id, { token, account: acc })
      }
    } catch (err) {
      console.error('[Reporter] Error fetching ad accounts:', err.message)
    }
  }

  for (const { token, account } of accountToToken.values()) {
    try {
      const campaigns = await getCampaignsWithInsights(token, account.id)
      for (const c of campaigns) {
        if (!seen.has(c.id)) {
          seen.add(c.id)
          results.push(c)
        }
      }
    } catch (err) {
      console.error(`[Reporter] Error fetching campaigns for account ${account.id}:`, err.message)
    }
  }

  reporterCache.result = results
  reporterCache.expiresAt = Date.now() + REPORTER_CACHE_TTL_MS
  return results
}

// Tolerant Meta response parser. Meta sometimes returns an empty body or an
// HTML error page when an upload is rejected at the CDN edge (file too large,
// bad codec, rate-limit, timeout). Calling `res.json()` directly on those
// throws "Unexpected end of JSON input" with zero useful context. This helper
// produces an actionable error message instead.
async function parseMetaResponse(res, label = 'Meta') {
  const text = await res.text()
  if (!text.trim()) {
    throw new Error(
      `${label} returned an empty HTTP ${res.status} response. ` +
      `This usually means the upload was rejected at Meta's edge — common causes: ` +
      `file is too large or too long, unsupported codec, request timed out, or you hit a rate limit. ` +
      `Try re-encoding to a standard H.264 MP4 (<= 4 GB, <= 60 min) or retry in a minute.`
    )
  }
  try {
    return JSON.parse(text)
  } catch {
    const snippet = text.slice(0, 240).replace(/\s+/g, ' ').trim()
    throw new Error(`${label} returned non-JSON (HTTP ${res.status}): ${snippet}`)
  }
}

// ─── Video Upload ────────────────────────────────────────────────────────────
// Meta's CDN silently rejects single-POST video uploads above ~100MB with an
// empty HTTP 413. For anything above this threshold we use Meta's 3-phase
// resumable upload API (start → transfer chunks → finish), which handles up
// to 4GB. Small files stay on the simpler single-POST path.
const RESUMABLE_VIDEO_THRESHOLD = 50 * 1024 * 1024  // 50 MB

async function uploadVideo(token, adAccountId, fileBuffer, fileName, mimeType) {
  if (fileBuffer.length > RESUMABLE_VIDEO_THRESHOLD) {
    return uploadVideoResumable(token, adAccountId, fileBuffer, fileName)
  }

  const blob = new Blob([fileBuffer], { type: mimeType || 'video/mp4' })
  const fd = new FormData()
  fd.append('file', blob, fileName)
  fd.append('title', fileName.replace(/\.[^/.]+$/, ''))
  fd.append('access_token', token)

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/advideos`,
    { method: 'POST', body: fd }
  )
  const data = await parseMetaResponse(res, 'Meta video upload')
  if (data.error) throw new Error(data.error.message)
  return data // { id, title }
}

// 3-phase resumable upload. Meta drives chunk sizes via start_offset/end_offset
// returned in each response — we just slice the buffer accordingly. Phase 1
// returns the final video_id; phase 3 just confirms success.
async function uploadVideoResumable(token, adAccountId, fileBuffer, fileName) {
  const fileSize = fileBuffer.length
  const title = fileName.replace(/\.[^/.]+$/, '')
  const endpoint = `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/advideos`

  const startFd = new FormData()
  startFd.append('upload_phase', 'start')
  startFd.append('file_size', String(fileSize))
  startFd.append('access_token', token)
  const startRes = await fetch(endpoint, { method: 'POST', body: startFd })
  const startData = await parseMetaResponse(startRes, 'Meta video upload (start)')
  if (startData.error) throw new Error(startData.error.message)

  const uploadSessionId = startData.upload_session_id
  const videoId = startData.video_id
  let curStart = parseInt(startData.start_offset, 10)
  let curEnd = parseInt(startData.end_offset, 10)
  if (!uploadSessionId || !videoId || isNaN(curStart) || isNaN(curEnd)) {
    throw new Error(`Meta resumable upload start phase returned unexpected payload: ${JSON.stringify(startData)}`)
  }

  while (curStart < curEnd) {
    const chunk = fileBuffer.subarray(curStart, curEnd)
    const transferFd = new FormData()
    transferFd.append('upload_phase', 'transfer')
    transferFd.append('upload_session_id', uploadSessionId)
    transferFd.append('start_offset', String(curStart))
    transferFd.append('video_file_chunk', new Blob([chunk], { type: 'application/octet-stream' }), 'chunk')
    transferFd.append('access_token', token)
    const transferRes = await fetch(endpoint, { method: 'POST', body: transferFd })
    const transferData = await parseMetaResponse(transferRes, 'Meta video upload (transfer)')
    if (transferData.error) throw new Error(transferData.error.message)
    curStart = parseInt(transferData.start_offset, 10)
    curEnd = parseInt(transferData.end_offset, 10)
    if (isNaN(curStart) || isNaN(curEnd)) {
      throw new Error(`Meta resumable upload transfer phase returned unexpected payload: ${JSON.stringify(transferData)}`)
    }
  }

  const finishFd = new FormData()
  finishFd.append('upload_phase', 'finish')
  finishFd.append('upload_session_id', uploadSessionId)
  finishFd.append('title', title)
  finishFd.append('access_token', token)
  const finishRes = await fetch(endpoint, { method: 'POST', body: finishFd })
  const finishData = await parseMetaResponse(finishRes, 'Meta video upload (finish)')
  if (finishData.error) throw new Error(finishData.error.message)
  if (!finishData.success) throw new Error('Meta video upload finish phase did not return success')

  return { id: videoId, title }
}

// ─── Image Upload ────────────────────────────────────────────────────────────
async function uploadImage(token, adAccountId, fileBuffer, fileName, mimeType) {
  const blob = new Blob([fileBuffer], { type: mimeType || 'image/jpeg' })
  const fd = new FormData()
  fd.append('filename', blob, fileName)
  fd.append('access_token', token)

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adimages`,
    { method: 'POST', body: fd }
  )
  const data = await parseMetaResponse(res, 'Meta image upload')
  if (data.error) throw new Error(data.error.message)
  // Response: { images: { "<filename>": { hash, url } } }
  const first = data.images && Object.values(data.images)[0]
  if (!first || !first.hash) throw new Error('Image upload returned no hash')
  return { hash: first.hash, url: first.url, filename: fileName }
}

// ─── Get Video Thumbnail (image_hash preferred, image_url fallback) ───────────
async function getVideoThumbnail(token, adAccountId, videoId) {
  try {
    // Try to find the video's own thumbnail from the ad account library
    let nextUrl = `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/advideos?fields=id,picture&limit=200&access_token=${token}`
    while (nextUrl) {
      const data = await fetch(nextUrl).then(r => r.json())
      if (data.error || !data.data) break
      const video = data.data.find(v => String(v.id) === String(videoId))
      if (video?.picture) return { image_url: video.picture }
      nextUrl = data.paging?.next || null
    }
  } catch (_) {}

  try {
    // Fallback: use first available image hash from ad account images
    const imgData = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adimages?fields=hash&limit=1&access_token=${token}`
    ).then(r => r.json())
    const hash = imgData.data?.[0]?.hash
    if (hash) return { image_hash: hash }
  } catch (_) {}

  return null
}

// ─── Full Ad Creation Pipeline ────────────────────────────────────────────────
async function createFullAd(token, adAccountId, {
  campaignName,
  objective,          // 'OUTCOME_SALES' | 'OUTCOME_ENGAGEMENT'
  dailyBudgetCents,   // e.g. 500 = $5
  pageId,
  pixelId,
  videoId,
  primaryText,
  headline,
  description,
  cta,                // 'ORDER_NOW' | 'SHOP_NOW' | 'LEARN_MORE' | 'MESSAGE_PAGE'
  landingUrl,
  destination,        // 'WEBSITE' | 'MESSENGER'
  locationCountry,    // e.g. 'NP'
  ageMin,
  ageMax,
  genders,            // [] = all, [1] = male, [2] = female
}) {
  // 1. Campaign
  const campaignBody = {
    name: campaignName,
    objective,
    status: 'PAUSED',
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
    access_token: token,
  }
  const campRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/campaigns`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campaignBody) }
  )
  const campData = await campRes.json()
  if (campData.error) throw new Error(`Campaign: ${campData.error.message}`)
  const campaignId = campData.id

  // Build targeting
  const targeting = {
    geo_locations: { countries: [locationCountry || 'NP'] },
    age_min: ageMin || 18,
    age_max: ageMax || 65,
  }
  if (genders && genders.length > 0) targeting.genders = genders

  // Determine optimization goal & promoted object based on objective + destination
  let optimizationGoal
  const promotedObject = {}

  if (objective === 'OUTCOME_SALES') {
    if (destination === 'MESSENGER') {
      optimizationGoal = 'CONVERSATIONS'
      promotedObject.page_id = pageId
    } else {
      // Website sales — requires pixel with OFFSITE_CONVERSIONS
      optimizationGoal = 'OFFSITE_CONVERSIONS'
      promotedObject.pixel_id = pixelId
      promotedObject.custom_event_type = 'PURCHASE'
    }
  } else {
    // Engagement
    optimizationGoal = 'POST_ENGAGEMENT'
    promotedObject.page_id = pageId
  }

  // 2. Ad Set
  const adSetBody = {
    name: `${campaignName} - Ad Set`,
    campaign_id: campaignId,
    daily_budget: dailyBudgetCents,
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting,
    promoted_object: promotedObject,
    status: 'PAUSED',
    access_token: token,
  }
  const adSetRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adsets`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adSetBody) }
  )
  const adSetData = await adSetRes.json()
  if (adSetData.error) throw new Error(`Ad Set: ${adSetData.error.message}`)
  const adSetId = adSetData.id

  // 3. Creative — auto-fetch thumbnail (image_url from video or image_hash fallback)
  const thumbnailData = await getVideoThumbnail(token, adAccountId, videoId)

  const videoData = {
    video_id: videoId,
    title: headline,
    message: primaryText,
    ...(thumbnailData || {}),  // spreads { image_url } or { image_hash } or nothing
    call_to_action: {
      type: cta,
      value: destination === 'MESSENGER'
        ? { page_id: pageId }
        : { link: landingUrl },
    },
  }

  const creativeBody = {
    name: `${campaignName} - Creative`,
    object_story_spec: {
      page_id: pageId,
      video_data: videoData,
    },
    access_token: token,
  }
  const creativeRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adcreatives`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creativeBody) }
  )
  const creativeData = await creativeRes.json()
  if (creativeData.error) throw new Error(`Creative: ${creativeData.error.message}`)
  const creativeId = creativeData.id

  // 4. Ad
  const adBody = {
    name: `${campaignName} - Ad`,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: 'PAUSED',
    access_token: token,
  }
  const adRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/ads`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adBody) }
  )
  const adData = await adRes.json()
  if (adData.error) throw new Error(`Ad: ${adData.error.message}`)

  return {
    campaignId,
    adSetId,
    creativeId,
    adId: adData.id,
  }
}

// ─── Geo Location Resolver ───────────────────────────────────────────────────
// Cache: "Kathmandu, Nepal" -> Meta city key
const geoKeyCache = new Map()

async function resolveCityKeys(token, cityQueries) {
  const keys = []
  for (const q of cityQueries) {
    if (geoKeyCache.has(q)) { keys.push(geoKeyCache.get(q)); continue }
    try {
      const url = `https://graph.facebook.com/${META_API_VERSION}/search?type=adgeolocation&q=${encodeURIComponent(q)}&location_types=%5B%22city%22%5D&limit=5&access_token=${token}`
      const res = await fetch(url)
      const data = await res.json()
      // Prefer Nepal match if multiple
      const first = (data.data || []).find(c => c.country_code === 'NP') || (data.data || [])[0]
      if (first?.key) {
        geoKeyCache.set(q, first.key)
        keys.push(first.key)
      }
    } catch (e) {
      console.error(`[Meta] Could not resolve city "${q}":`, e.message)
    }
  }
  return keys
}

// preset: { countries: ['NP'] } OR { cities: ['Kathmandu, Nepal', ...], radiusKm: 25 }
async function buildGeoLocations(token, preset) {
  if (!preset) return { countries: ['NP'] }
  if (preset.countries?.length) return { countries: preset.countries }
  if (preset.cities?.length) {
    const cityKeys = await resolveCityKeys(token, preset.cities)
    if (cityKeys.length === 0) {
      throw new Error(`Could not resolve any cities for preset: ${preset.cities.join(', ')}`)
    }
    return {
      cities: cityKeys.map(key => ({
        key,
        radius: preset.radiusKm || 25,
        distance_unit: 'kilometer',
      })),
    }
  }
  return { countries: ['NP'] }
}

// ─── Bulk Ad Creation ────────────────────────────────────────────────────────
// Structure: 1 campaign → M ad sets → N ads per ad set (same creatives, replicated)
// settings.budgetLevel: 'CAMPAIGN' (CBO, default) | 'ADSET' (ABO)
// settings.dailyBudgetCents: applied at campaign level (CBO) or each ad set (ABO)
// settings.adSets: [{ name, geoPreset }] — one ad set per entry
// settings.initialStatus: 'ACTIVE' | 'PAUSED' (default 'PAUSED')
// settings.startTime: optional ISO datetime string
// settings.onProgress: optional (patch) => void  — called after each significant
//   step (campaign created, creative built, ad set created, individual ad
//   succeeded/failed) so an async job runner can stream progress to the UI.
async function createBulkAds(token, adAccountId, settings, mediaList) {
  const {
    campaignName,
    objective,
    budgetLevel,
    dailyBudgetCents,
    pageId,
    pixelId,
    primaryText,
    headline,
    description,
    copyVariants,    // [{primaryText, headline, description}, ...] — overrides single primaryText/headline/description
    cta,
    landingUrl,
    destination,
    ageMin,
    ageMax,
    genders,
    adSets,
    initialStatus,
    startTime,
    onProgress,
  } = settings

  // Safe progress emitter — never lets a bad callback break the launch.
  const emit = (patch) => {
    if (typeof onProgress !== 'function') return
    try { onProgress(patch) } catch (e) { console.warn('[createBulkAds] onProgress threw:', e.message) }
  }

  // Normalize copy: prefer copyVariants array; fall back to single legacy fields for back-compat.
  const variants = (Array.isArray(copyVariants) && copyVariants.length > 0)
    ? copyVariants
    : [{ primaryText, headline, description }]

  const status = initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED'
  const isCBO = budgetLevel !== 'ADSET'  // default CBO
  const adSetList = Array.isArray(adSets) && adSets.length > 0
    ? adSets
    : [{ name: 'Default', geoPreset: { countries: ['NP'] } }]

  // 1. Campaign (with budget + bid_strategy if CBO — Meta requires bid_strategy
  //    on the *campaign* when campaign-level budget is set, NOT on the ad set.
  //    Without this, Meta silently picks a default (often BID_CAP) and every
  //    ad set creation fails because their bid_strategy conflicts with it.)
  const campaignBody = {
    name: campaignName,
    objective,
    status,
    special_ad_categories: [],
    access_token: token,
  }
  if (isCBO) {
    campaignBody.daily_budget = dailyBudgetCents
    campaignBody.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
  }
  const campRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/campaigns`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campaignBody) }
  )
  const campData = await campRes.json()
  if (campData.error) {
    console.error('[Meta CreateBulkAds] Campaign creation failed:', campData.error)
    throw new Error(`Campaign: ${campData.error.message}`)
  }
  const campaignId = campData.id
  emit({ campaignId })

  // 2. Optimization goal + promoted object (same across all ad sets — same objective)
  let optimizationGoal
  const promotedObject = {}
  if (objective === 'OUTCOME_SALES') {
    if (destination === 'MESSENGER') {
      optimizationGoal = 'CONVERSATIONS'
      promotedObject.page_id = pageId
    } else {
      optimizationGoal = 'OFFSITE_CONVERSIONS'
      promotedObject.pixel_id = pixelId
      promotedObject.custom_event_type = 'PURCHASE'
    }
  } else {
    optimizationGoal = 'POST_ENGAGEMENT'
    promotedObject.page_id = pageId
  }

  // 3. Build creatives — one per (media × copy variant) combination.
  //    Thumbnails are fetched once per video and reused across that video's variants.
  const creatives = []
  const variantLetter = (i) => String.fromCharCode(65 + i)  // 0 -> 'A', 1 -> 'B', ...

  for (let i = 0; i < mediaList.length; i++) {
    const m = mediaList[i]
    const mediaShort = (m.name || `Media ${i + 1}`).replace(/\.[^/.]+$/, '').slice(0, 40)
    const thumb = m.type === 'video' ? await getVideoThumbnail(token, adAccountId, m.id) : null

    for (let v = 0; v < variants.length; v++) {
      const variant = variants[v] || {}
      const vText = variant.primaryText || ''
      const vHeadline = variant.headline || ''
      const vDesc = variant.description || ''
      const label = variants.length > 1
        ? `${mediaShort} - Copy ${variantLetter(v)}`
        : mediaShort
      try {
        let objectStorySpec
        if (m.type === 'video') {
          objectStorySpec = {
            page_id: pageId,
            video_data: {
              video_id: m.id,
              title: vHeadline,
              message: vText,
              ...(thumb || {}),
              call_to_action: {
                type: cta,
                value: destination === 'MESSENGER' ? { page_id: pageId } : { link: landingUrl },
              },
            },
          }
        } else if (m.type === 'image') {
          objectStorySpec = {
            page_id: pageId,
            link_data: {
              image_hash: m.hash,
              message: vText,
              link: destination === 'MESSENGER' ? `https://m.me/${pageId}` : landingUrl,
              name: vHeadline,
              description: vDesc || undefined,
              call_to_action: {
                type: cta,
                value: destination === 'MESSENGER' ? { page_id: pageId } : { link: landingUrl },
              },
            },
          }
        } else {
          throw new Error(`Unknown media type: ${m.type}`)
        }

        const creativeRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adcreatives`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${campaignName} - ${label} Creative`,
              object_story_spec: objectStorySpec,
              access_token: token,
            }),
          }
        )
        const creativeData = await creativeRes.json()
        if (creativeData.error) {
          console.error(`[Meta CreateBulkAds] Creative "${label}" failed:`, creativeData.error)
          throw new Error(`Creative: ${creativeData.error.message}`)
        }
        creatives.push({ creativeId: creativeData.id, label, mediaType: m.type })
      } catch (err) {
        creatives.push({ creativeId: null, label, mediaType: m.type, error: err.message })
      }
    }
  }

  // 4. For each ad set: create ad set + N ads (one per creative)
  const adSetsResult = []
  for (let s = 0; s < adSetList.length; s++) {
    const set = adSetList[s]
    const adSetName = set.name || `${campaignName} - Ad Set ${s + 1}`
    try {
      const geoLocations = await buildGeoLocations(token, set.geoPreset)
      const targeting = {
        geo_locations: geoLocations,
        age_min: ageMin || 18,
        age_max: ageMax || 65,
        // Meta now REQUIRES this flag to be set explicitly (error #1870227).
        // We disable Advantage Audience so the user's manual age/gender/location
        // targeting is respected. To opt into Meta's broad expansion, change to 1.
        targeting_automation: { advantage_audience: 0 },
      }
      if (genders && genders.length > 0) targeting.genders = genders

      // Under CBO, bid_strategy lives on the campaign — putting it on the ad set
      // causes a conflict and Meta rejects the ad set. Under ABO, ad set owns it.
      const adSetBody = {
        name: adSetName,
        campaign_id: campaignId,
        billing_event: 'IMPRESSIONS',
        optimization_goal: optimizationGoal,
        targeting,
        promoted_object: promotedObject,
        status,
        access_token: token,
      }
      if (!isCBO) {
        adSetBody.daily_budget = dailyBudgetCents
        adSetBody.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
      }
      if (startTime) {
        adSetBody.start_time = startTime
      }

      const adSetRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adsets`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adSetBody) }
      )
      const adSetData = await adSetRes.json()
      if (adSetData.error) {
        console.error(`[Meta CreateBulkAds] Ad set "${adSetName}" failed:`, adSetData.error)
        throw new Error(`Ad Set "${adSetName}": ${adSetData.error.message}`)
      }
      const adSetId = adSetData.id

      // Create one ad per creative under this ad set
      const ads = []
      for (const c of creatives) {
        if (!c.creativeId) {
          ads.push({ success: false, label: c.label, mediaType: c.mediaType, error: c.error || 'Creative not built' })
          emit({ adFinished: { success: false, label: c.label, error: c.error || 'Creative not built' } })
          continue
        }
        try {
          const adRes = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/ads`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: `${adSetName} - ${c.label}`,
                adset_id: adSetId,
                creative: { creative_id: c.creativeId },
                status,
                access_token: token,
              }),
            }
          )
          const adData = await adRes.json()
          if (adData.error) {
            console.error(`[Meta CreateBulkAds] Ad "${c.label}" failed:`, adData.error)
            throw new Error(adData.error.message)
          }
          ads.push({ success: true, label: c.label, mediaType: c.mediaType, creativeId: c.creativeId, adId: adData.id })
          emit({ adFinished: { success: true, label: c.label, adId: adData.id } })
        } catch (err) {
          ads.push({ success: false, label: c.label, mediaType: c.mediaType, error: `Ad: ${err.message}` })
          emit({ adFinished: { success: false, label: c.label, error: err.message } })
        }
      }

      adSetsResult.push({ success: true, name: adSetName, adSetId, ads })
      emit({ adSetFinished: { success: true, name: adSetName, adSetId } })
    } catch (err) {
      adSetsResult.push({ success: false, name: adSetName, error: err.message, ads: [] })
      emit({ adSetFinished: { success: false, name: adSetName, error: err.message } })
    }
  }

  // Flatten ads list (for backward-compatible response shape)
  const allAds = adSetsResult.flatMap(s => s.ads.map(a => ({ ...a, adSetName: s.name })))

  return { campaignId, adSets: adSetsResult, ads: allAds }
}

module.exports = {
  findTokenForAdAccount,
  getAllAdAccounts,
  searchAllCampaigns,
  updateCampaignStatus,
  getAdAccounts,
  getPagesForAccount,
  getPixels,
  uploadVideo,
  uploadImage,
  createFullAd,
  createBulkAds,
  getAllCampaignsWithInsights,
  getRecentCampaigns,
  resetMetaCaches,
}
