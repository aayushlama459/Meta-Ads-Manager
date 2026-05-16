import { NextResponse } from 'next/server'
import { createBulkAds, findTokenForAdAccount } from '@/lib/meta'
import { createJob, updateJob } from '@/lib/launch-jobs'

export const maxDuration = 300

export async function POST(request) {
  try {
    const body = await request.json()

    const {
      adAccountId,
      campaignName,
      objective,
      budgetLevel,     // 'CAMPAIGN' (default) | 'ADSET'
      dailyBudget,
      pageId,
      pixelId,
      mediaList,       // [{ type: 'video', id, name } | { type: 'image', hash, name }]
      copyVariants,    // [{primaryText, headline, description}, ...] — one ad created per (media × variant)
      cta,
      landingUrl,
      destination,
      adSets,          // [{ name, geoPreset: { countries?: ['NP'], cities?: ['Kathmandu, Nepal', ...] } }]
      ageMin,
      ageMax,
      genders,
      initialStatus,   // 'ACTIVE' | 'PAUSED'
      startTime,       // ISO datetime in UTC (optional)
    } = body

    const variants = Array.isArray(copyVariants)
      ? copyVariants.filter(v => v && v.primaryText && v.headline)
      : []
    if (variants.length === 0) {
      return NextResponse.json(
        { success: false, error: 'copyVariants must contain at least one variant with primaryText and headline' },
        { status: 400 }
      )
    }

    const required = { adAccountId, campaignName, objective, dailyBudget, pageId, cta }
    const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k)
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    if (!Array.isArray(mediaList) || mediaList.length === 0) {
      return NextResponse.json(
        { success: false, error: 'mediaList must contain at least one uploaded media item' },
        { status: 400 }
      )
    }

    const token = await findTokenForAdAccount(adAccountId)
    const dailyBudgetCents = Math.round(parseFloat(dailyBudget) * 100)
    const resolvedAdSets = Array.isArray(adSets) && adSets.length
      ? adSets
      : [{ name: 'Default', geoPreset: { countries: ['NP'] } }]
    const totalAds = mediaList.length * variants.length * resolvedAdSets.length

    // Register the job up front so the UI can poll for status immediately.
    // We store the original POST body too, so /api/launcher/jobs/<id>/retry can
    // re-launch with identical settings (the user's most common failure response).
    const job = createJob({
      campaignName,
      adAccountId,
      dailyBudget,
      totalAds,
      mediaCount: mediaList.length,
      variantCount: variants.length,
      adSetCount: resolvedAdSets.length,
      initialStatus: initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      scheduledStart: startTime || null,
      originalBody: body,  // for retry — full POST shape
    })

    // Fire off the actual creation in the background. We deliberately do NOT
    // await this so the HTTP response returns within a few ms — the UI then
    // polls /api/launcher/jobs/<id> for progress.
    runLaunchInBackground({
      jobId: job.id,
      token,
      adAccountId,
      dailyBudgetCents,
      resolvedAdSets,
      variants,
      mediaList,
      settings: {
        campaignName,
        objective,
        budgetLevel: budgetLevel === 'ADSET' ? 'ADSET' : 'CAMPAIGN',
        pageId,
        pixelId,
        cta,
        landingUrl,
        destination: destination || 'WEBSITE',
        ageMin: ageMin || 18,
        ageMax: ageMax || 65,
        genders: genders || [],
        initialStatus: initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        startTime: startTime || undefined,
      },
    })

    return NextResponse.json({
      success: true,
      queued: true,
      jobId: job.id,
      totalAds,
      message: `Launch queued: ${totalAds} ad${totalAds === 1 ? '' : 's'} will be created in the background. You can move on or close this page.`,
    })
  } catch (error) {
    console.error('[CreateAd] Error:', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// Worker: runs the actual Meta calls and pipes progress into the job registry.
// Lives in the same Node process (single dev worker) so the job state shared
// via globalThis is reachable by the polling endpoint.
async function runLaunchInBackground({
  jobId, token, adAccountId, dailyBudgetCents, resolvedAdSets, variants, mediaList, settings,
}) {
  try {
    const result = await createBulkAds(token, adAccountId, {
      ...settings,
      dailyBudgetCents,
      copyVariants: variants,
      adSets: resolvedAdSets,
      onProgress: (patch) => {
        // Three event shapes from createBulkAds: { campaignId }, { adSetFinished }, { adFinished }
        if (patch.campaignId) {
          updateJob(jobId, { campaignId: patch.campaignId })
        }
        if (patch.adFinished) {
          const j = updateJob(jobId, {})
          if (j && patch.adFinished.success) {
            updateJob(jobId, { adsCreated: j.adsCreated + 1 })
          }
        }
        if (patch.adSetFinished) {
          const j = updateJob(jobId, {})
          if (j) {
            updateJob(jobId, { adSets: [...j.adSets, patch.adSetFinished] })
          }
        }
      },
    }, mediaList)

    const successCount = result.ads.filter(a => a.success).length
    updateJob(jobId, {
      status: 'done',
      doneAt: Date.now(),
      campaignId: result.campaignId,
      adsCreated: successCount,
      adSets: result.adSets,
    })
  } catch (err) {
    console.error('[CreateAd worker] Job', jobId, 'failed:', err.message)
    updateJob(jobId, {
      status: 'failed',
      doneAt: Date.now(),
      error: err.message,
    })
  }
}
