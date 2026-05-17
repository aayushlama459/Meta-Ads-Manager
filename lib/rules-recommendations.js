// Curated starter rules derived from Sam Piliero's playbook
// (see Sam_Piliero_Meta_Ads_Research_Report.md). These are presented in the UI
// as "Recommended Rules" with a one-click "Add" button — the user keeps full
// control, we just save them the work of designing rules from scratch.
//
// Tuned for Nepal e-com / dropshipping context:
//   - Lower minimum spend thresholds than Sam's US clients (smaller avg tickets)
//   - Patient kill windows (3-day) because COD returns distort same-day ROAS
//   - Conservative budget jumps (+40%) — Sam's recommended scaling step

// `requires_approval` policy per preset:
//   - SCALING actions → always ON (out-of-stock risk, money-moving)
//   - PAUSE actions on aggressive thresholds (ROAS < 1.0 fast) → OFF
//       (waiting for approval defeats the "kill fast" point)
//   - PAUSE actions on patient thresholds (3-day windows) → ON
//       (the loss is slow, you have time to verify)
//   - NOTIFY → always OFF (approval is meaningless for an alert)

const RECOMMENDED_RULES = [
  // ─── LOSS PREVENTION ──────────────────────────────────────────────────────
  {
    id: 'kill-losers-fast',
    category: 'Loss prevention',
    name: 'Kill losers fast',
    description: 'Pause any campaign with ROAS below 1.0 after $10 spent today.',
    rationale: 'Sam: "Restrict vs kill — but after enough data, kill it." $10 with zero return is enough data for a fast pause.',
    preset: {
      name: 'Kill losers fast (ROAS < 1.0 today)',
      scope: 'all',
      condition: { metric: 'roas', operator: '<', value: 1.0, window: 'today', min_spend_cents: 1000 },
      action: { type: 'pause' },
      cooldown_hours: 24,
      requires_approval: false,  // fast pause — approval defeats the purpose
    },
  },
  {
    id: 'patient-kill',
    category: 'Loss prevention',
    name: 'Patient kill (3-day window)',
    description: 'Pause if ROAS stays below 1.5 over the last 3 days with $30+ spent.',
    rationale: 'Sam: "Most advertisers kill ads too early." This rule waits 3 days so you don\'t kill a winner that had a slow start.',
    preset: {
      name: 'Patient kill (ROAS < 1.5 last 3d)',
      scope: 'all',
      condition: { metric: 'roas', operator: '<', value: 1.5, window: 'last_3d', min_spend_cents: 3000 },
      action: { type: 'pause' },
      cooldown_hours: 48,
      requires_approval: true,  // slower loss, worth double-checking before pause
    },
  },
  {
    id: 'creative-bottleneck',
    category: 'Loss prevention',
    name: 'Creative bottleneck pause',
    description: 'Pause if CTR drops below 0.5% after $10 spent — creative is the bottleneck.',
    rationale: 'Sam\'s bottleneck analysis: low CTR = nobody is interested in the creative. Pause and iterate, don\'t throw more money at it.',
    preset: {
      name: 'Creative bottleneck (CTR < 0.5%)',
      scope: 'all',
      condition: { metric: 'ctr', operator: '<', value: 0.5, window: 'today', min_spend_cents: 1000 },
      action: { type: 'pause' },
      cooldown_hours: 24,
      requires_approval: false,
    },
  },

  // ─── SCALING WINNERS ──────────────────────────────────────────────────────
  {
    id: 'scale-moderate-winners',
    category: 'Scaling winners',
    name: 'Scale moderate winners (+40%) — needs your OK',
    description: 'Increase budget by 40% when ROAS is above 2.0 today with $20+ spent. Asks for Telegram approval first.',
    rationale: 'Sam: 40-50% jumps when scaling. Approval gate is critical — if you\'re out of stock or about to relaunch, you don\'t want auto-scaling.',
    preset: {
      name: 'Scale moderate winners (ROAS > 2.0 → +40%)',
      scope: 'all',
      condition: { metric: 'roas', operator: '>', value: 2.0, window: 'today', min_spend_cents: 2000 },
      action: { type: 'increase_budget', percent: 40 },
      cooldown_hours: 24,
      requires_approval: true,  // out-of-stock safety
    },
  },
  {
    id: 'scale-strong-winners',
    category: 'Scaling winners',
    name: 'Scale strong winners (+50%) — needs your OK',
    description: 'Bigger 50% budget bump for proven winners (ROAS > 3.0). Asks for Telegram approval first.',
    rationale: 'Sam\'s "double down on winners". Approval guarantees you never auto-scale a campaign whose product is out of stock.',
    preset: {
      name: 'Scale strong winners (ROAS > 3.0 → +50%)',
      scope: 'all',
      condition: { metric: 'roas', operator: '>', value: 3.0, window: 'today', min_spend_cents: 3000 },
      action: { type: 'increase_budget', percent: 50 },
      cooldown_hours: 24,
      requires_approval: true,
    },
  },

  // ─── AUDIENCE HEALTH ──────────────────────────────────────────────────────
  {
    id: 'frequency-warning',
    category: 'Audience health',
    name: 'Audience fatigue warning',
    description: 'Send a Telegram alert when frequency exceeds 3.0 over 7 days.',
    rationale: 'When frequency climbs above 3, the same people are seeing your ad too many times. Sam: audience bottleneck → need new audiences.',
    preset: {
      name: 'Audience fatigue warning (freq > 3.0 last 7d)',
      scope: 'all',
      condition: { metric: 'frequency', operator: '>', value: 3.0, window: 'last_7d', min_spend_cents: 5000 },
      action: { type: 'notify' },
      cooldown_hours: 72,
      requires_approval: false,  // notify-only
    },
  },
  {
    id: 'frequency-pause',
    category: 'Audience health',
    name: 'Audience burned out — pause',
    description: 'Pause when frequency hits 5.0+ — audience is exhausted, ad becomes annoying. Asks for approval first.',
    rationale: 'Past frequency ~5 you\'re actively hurting your brand. Pause and rebuild the audience pool. Approval gate because frequency can be noisy.',
    preset: {
      name: 'Audience burned out (freq > 5.0 last 7d)',
      scope: 'all',
      condition: { metric: 'frequency', operator: '>', value: 5.0, window: 'last_7d', min_spend_cents: 5000 },
      action: { type: 'pause' },
      cooldown_hours: 168,
      requires_approval: true,
    },
  },

  // ─── BIG-SPEND SAFETY NET ─────────────────────────────────────────────────
  {
    id: 'big-spend-no-result',
    category: 'Safety net',
    name: 'Big spend, no result — notify',
    description: 'Telegram alert if a campaign burns $50+ with ROAS below 0.5 — something is broken.',
    rationale: 'Belt-and-suspenders. If "Kill losers fast" missed it for any reason (cool-down, off, etc.), at least you get notified before it burns more.',
    preset: {
      name: 'Big spend, no result (ROAS < 0.5 with $50+ spent)',
      scope: 'all',
      condition: { metric: 'roas', operator: '<', value: 0.5, window: 'today', min_spend_cents: 5000 },
      action: { type: 'notify' },
      cooldown_hours: 12,
      requires_approval: false,
    },
  },
]

module.exports = { RECOMMENDED_RULES }
