const crypto = require('crypto')

// In-process registry of running/recent ad-launch jobs. Anchored on globalThis
// so Next.js dev-mode hot-reloads don't drop in-flight work. Each job tracks
// progress so the UI can poll while a 30-ad launch runs in the background.
//
// Job shape:
//   id          string  — random hex
//   status      'creating' | 'done' | 'failed'
//   createdAt   ms timestamp
//   doneAt      ms timestamp | null
//   payload     { campaignName, adAccountId, dailyBudget, totalAds, ... }  // summary for UI
//   campaignId  string | null     // set once Meta accepts the campaign
//   adsCreated  number            // running count
//   adsTotal    number            // expected total = media × variants × adSets
//   adSets      array             // per-ad-set results, mirrors createBulkAds output
//   error       string | null     // top-level failure reason if status === 'failed'

const TTL_MS = 24 * 60 * 60 * 1000  // 24h — long enough to outlive a session
const MAX_ENTRIES = 200             // hard cap

const jobs = globalThis.__launchJobs || (globalThis.__launchJobs = new Map())

function gcExpired() {
  const cutoff = Date.now() - TTL_MS
  for (const [k, v] of jobs) {
    if (v.createdAt < cutoff) jobs.delete(k)
  }
}

function createJob(payload) {
  gcExpired()
  if (jobs.size >= MAX_ENTRIES) {
    let oldest = null, oldestTs = Infinity
    for (const [k, v] of jobs) {
      if (v.createdAt < oldestTs) { oldestTs = v.createdAt; oldest = k }
    }
    if (oldest) jobs.delete(oldest)
  }
  const id = crypto.randomBytes(8).toString('hex')
  const job = {
    id,
    status: 'creating',
    createdAt: Date.now(),
    doneAt: null,
    payload,
    campaignId: null,
    adsCreated: 0,
    adsTotal: payload.totalAds || 0,
    adSets: [],
    error: null,
  }
  jobs.set(id, job)
  return job
}

function updateJob(id, patch) {
  const j = jobs.get(id)
  if (!j) return null
  Object.assign(j, patch)
  return j
}

function getJob(id) {
  return jobs.get(id) || null
}

// Active and recently-completed jobs, newest first. Used by the campaign list
// to merge in-progress launches above what Meta reports.
function listJobs({ since = 0 } = {}) {
  return [...jobs.values()]
    .filter(j => j.createdAt >= since)
    .sort((a, b) => b.createdAt - a.createdAt)
}

module.exports = { createJob, updateJob, getJob, listJobs }
