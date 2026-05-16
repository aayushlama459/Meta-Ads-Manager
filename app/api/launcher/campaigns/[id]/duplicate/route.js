import { NextResponse } from 'next/server'
import { findTokenForAdAccount } from '@/lib/meta'

export const runtime = 'nodejs'

const API_VERSION = require('@/lib/config').META_API_VERSION

// Pull the campaign's settings + first ad set + first ad's creative so we can
// pre-fill the launcher form with sensible defaults. The user picks fresh
// media (option B) and tweaks anything else before re-launching.
export async function GET(request, { params }) {
  try {
    const campaignId = params.id
    const adAccountIdHint = request.nextUrl.searchParams.get('adAccountId') // optional, helps route token

    let token
    try {
      token = await findTokenForAdAccount(adAccountIdHint || '')
    } catch (_) { token = null }

    // We try each token until one returns the campaign. Most accounts will hit
    // the right token on the first try since findTokenForAdAccount caches.
    const { META_TOKENS } = require('@/lib/config')
    const tokens = token ? [token, ...META_TOKENS.filter(t => t !== token)] : META_TOKENS

    let campaign = null
    let usedToken = null
    for (const t of tokens) {
      const url = `https://graph.facebook.com/${API_VERSION}/${campaignId}?fields=id,name,objective,daily_budget,status,effective_status,account_id&access_token=${t}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()
      if (!data.error && data.id) {
        campaign = data
        usedToken = t
        break
      }
    }
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Could not load campaign (no token has access)' }, { status: 404 })
    }

    // First ad set — for targeting (age, gender, location) and budget level inference
    const adSetsRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${campaignId}/adsets?fields=id,name,targeting,daily_budget,billing_event,optimization_goal,promoted_object&limit=10&access_token=${usedToken}`,
      { cache: 'no-store' }
    )
    const adSetsData = await adSetsRes.json()
    const adSets = adSetsData.data || []
    const firstAdSet = adSets[0] || null

    // First ad → its creative → primary text / headline / description / cta / link
    let creative = null
    if (firstAdSet) {
      const adsRes = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${firstAdSet.id}/ads?fields=id,creative{object_story_spec,call_to_action_type}&limit=1&access_token=${usedToken}`,
        { cache: 'no-store' }
      )
      const adsData = await adsRes.json()
      const firstAd = adsData.data?.[0]
      creative = firstAd?.creative || null
    }

    // Pull primaryText / headline / description / cta / landingUrl out of the creative
    let primaryText = '', headline = '', description = '', cta = 'ORDER_NOW', landingUrl = '', pageId = ''
    if (creative?.object_story_spec) {
      const spec = creative.object_story_spec
      pageId = spec.page_id || ''
      const linkData = spec.link_data
      const videoData = spec.video_data
      if (videoData) {
        primaryText = videoData.message || ''
        headline = videoData.title || ''
        cta = videoData.call_to_action?.type || cta
        landingUrl = videoData.call_to_action?.value?.link || ''
      } else if (linkData) {
        primaryText = linkData.message || ''
        headline = linkData.name || ''
        description = linkData.description || ''
        cta = linkData.call_to_action?.type || cta
        landingUrl = linkData.call_to_action?.value?.link || linkData.link || ''
      }
    }

    // Targeting → audience defaults
    const targeting = firstAdSet?.targeting || {}
    const dailyBudgetCents = campaign.daily_budget ? parseInt(campaign.daily_budget, 10)
      : firstAdSet?.daily_budget ? parseInt(firstAdSet.daily_budget, 10) : 500
    const budgetLevel = campaign.daily_budget ? 'CAMPAIGN' : 'ADSET'

    return NextResponse.json({
      success: true,
      data: {
        // Form-friendly shape — same shape the form's `setForm` expects (where applicable).
        campaignName: `${campaign.name} - Copy`,
        objective: campaign.objective || 'OUTCOME_SALES',
        budgetLevel,
        dailyBudget: (dailyBudgetCents / 100).toFixed(2),
        pageId,
        adAccountId: `act_${campaign.account_id}`,
        ageMin: targeting.age_min || 18,
        ageMax: targeting.age_max || 65,
        genders: Array.isArray(targeting.genders) && targeting.genders.length === 1
          ? (targeting.genders[0] === 1 ? 'male' : 'female')
          : '',
        cta,
        landingUrl,
        copyVariants: [
          { primaryText, headline, description },
        ],
        // Metadata so the form can show a hint "duplicated from ..."
        sourceCampaignId: campaign.id,
        sourceCampaignName: campaign.name,
        adSetCount: adSets.length,
      },
    })
  } catch (err) {
    console.error('[DuplicateCampaign]', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
