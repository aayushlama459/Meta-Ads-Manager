// Lists all active campaigns across all ad accounts the tokens can see,
// fetches one ad's creative landing-page link, and prints campaign + URL.

const { META_TOKENS, META_API_VERSION } = require('../lib/config')

const V = META_API_VERSION

async function gget(url) {
  const r = await fetch(url)
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j
}

async function getAccounts(token) {
  const url = `https://graph.facebook.com/${V}/me/adaccounts?fields=id,name,account_status&limit=200&access_token=${token}`
  const j = await gget(url)
  return j.data || []
}

async function getActiveCampaigns(token, adAccountId) {
  // ACTIVE campaigns only
  const filtering = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]))
  const url = `https://graph.facebook.com/${V}/${adAccountId}/campaigns?fields=id,name,status,effective_status,objective&filtering=${filtering}&limit=200&access_token=${token}`
  const j = await gget(url)
  return j.data || []
}

async function getCampaignLink(token, campaignId) {
  // Pull ads under campaign, then read creative link.
  const adsUrl = `https://graph.facebook.com/${V}/${campaignId}/ads?fields=id,name,status,effective_status,creative{id,object_story_spec,asset_feed_spec,object_story_id,effective_object_story_id,thumbnail_url,template_url}&limit=25&access_token=${token}`
  const j = await gget(adsUrl)
  const ads = j.data || []

  for (const ad of ads) {
    const c = ad.creative
    if (!c) continue

    // direct link from object_story_spec link_data
    const linkData = c.object_story_spec?.link_data
    if (linkData?.link) return { adName: ad.name, link: linkData.link }

    // video_data call_to_action link value
    const ctaLink = c.object_story_spec?.video_data?.call_to_action?.value?.link
    if (ctaLink) return { adName: ad.name, link: ctaLink }

    // asset_feed_spec link_urls
    const afsLink = c.asset_feed_spec?.link_urls?.[0]?.website_url
    if (afsLink) return { adName: ad.name, link: afsLink }

    // fallback: fetch creative directly
    if (c.id) {
      try {
        const cu = `https://graph.facebook.com/${V}/${c.id}?fields=object_story_spec,asset_feed_spec,template_url&access_token=${token}`
        const cj = await gget(cu)
        const l1 = cj.object_story_spec?.link_data?.link
        if (l1) return { adName: ad.name, link: l1 }
        const l2 = cj.object_story_spec?.video_data?.call_to_action?.value?.link
        if (l2) return { adName: ad.name, link: l2 }
        const l3 = cj.asset_feed_spec?.link_urls?.[0]?.website_url
        if (l3) return { adName: ad.name, link: l3 }
        if (cj.template_url) return { adName: ad.name, link: cj.template_url }
      } catch {}
    }
  }
  return null
}

function inferProductSlug(url) {
  try {
    const u = new URL(url)
    // shopify pattern /products/<slug>
    const m = u.pathname.match(/\/products\/([^\/?#]+)/i)
    if (m) return m[1].replace(/-/g, ' ')
    // /product/<slug>
    const m2 = u.pathname.match(/\/product\/([^\/?#]+)/i)
    if (m2) return m2[1].replace(/-/g, ' ')
    // last meaningful path segment
    const seg = u.pathname.split('/').filter(Boolean).pop()
    if (seg && seg !== '') return seg.replace(/-/g, ' ')
    return u.hostname
  } catch {
    return '(unparseable url)'
  }
}

async function run() {
  const seenAccounts = new Map() // id -> { name, token }

  // 1) discover accounts across all tokens
  for (const token of META_TOKENS) {
    try {
      const accts = await getAccounts(token)
      for (const a of accts) {
        if (!seenAccounts.has(a.id)) {
          seenAccounts.set(a.id, { name: a.name, token, status: a.account_status })
        }
      }
    } catch (e) {
      console.error('token failed:', e.message)
    }
  }

  console.log(`\nFound ${seenAccounts.size} ad accounts:`)
  for (const [id, info] of seenAccounts) console.log(` - ${id} :: ${info.name} (status=${info.status})`)

  // 2) for each account, list active campaigns + landing page
  const results = []
  for (const [id, info] of seenAccounts) {
    let camps = []
    try { camps = await getActiveCampaigns(info.token, id) } catch (e) {
      console.error(`campaigns failed for ${id}:`, e.message); continue
    }
    if (camps.length === 0) continue
    console.log(`\n=== ${info.name} (${id}) — ${camps.length} active campaign(s) ===`)
    for (const c of camps) {
      let link = null
      try {
        link = await getCampaignLink(info.token, c.id)
      } catch (e) {
        link = { adName: '(error)', link: `ERR: ${e.message}` }
      }
      const product = link?.link?.startsWith('http') ? inferProductSlug(link.link) : '(no link)'
      const row = {
        account: info.name,
        campaign: c.name,
        objective: c.objective,
        link: link?.link || null,
        product,
      }
      results.push(row)
      console.log(`  • ${c.name}`)
      console.log(`      objective : ${c.objective}`)
      console.log(`      landing   : ${row.link || '(no link found)'}`)
      console.log(`      product   : ${product}`)
    }
  }

  console.log('\n\n--- SUMMARY ---')
  console.log(JSON.stringify(results, null, 2))
}

run().catch(e => { console.error(e); process.exit(1) })
