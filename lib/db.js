const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'scheduler.db')
const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT DEFAULT '',
    ad_account_id TEXT DEFAULT '',
    action TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'scheduled',
    error_message TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    executed_at TEXT
  );

  -- Automation rules: "IF <metric> <op> <value> over <window>h with min spend
  -- of X, THEN <action>". Evaluated hourly by the scheduler.
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    -- Scope: which campaigns this rule applies to. 'all' = every campaign in
    -- ad_account_id (or every account if ad_account_id is also NULL).
    -- 'campaign' = only the specific campaign_id below.
    scope TEXT NOT NULL DEFAULT 'all',
    ad_account_id TEXT,
    campaign_id TEXT,
    -- Condition (JSON): { metric, operator, value, window_hours, min_spend_cents }
    condition_json TEXT NOT NULL,
    -- Action (JSON): { type: 'pause' | 'increase_budget' | 'decrease_budget' | 'notify', percent?: number }
    action_json TEXT NOT NULL,
    -- Cool-down (hours) per campaign — after triggering on campaign X, don't
    -- re-trigger on X for this many hours. Prevents double-pauses / runaway
    -- budget escalations.
    cooldown_hours INTEGER NOT NULL DEFAULT 24,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_evaluated_at TEXT,
    trigger_count INTEGER DEFAULT 0
  );

  -- Audit log: every time a rule actually fires on a specific campaign.
  -- Used both for the in-app history and for the cool-down lookup.
  CREATE TABLE IF NOT EXISTS rule_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    rule_name TEXT,
    target_campaign_id TEXT NOT NULL,
    target_campaign_name TEXT,
    metric TEXT,
    metric_value REAL,
    threshold_value REAL,
    action_taken TEXT,           -- 'paused' | 'budget_increased_40%' | 'notify_only' | 'failed'
    action_detail TEXT,          -- e.g. 'budget Rs.500 -> Rs.700'
    status TEXT NOT NULL,        -- 'success' | 'failed' | 'skipped_cooldown'
    error_message TEXT,
    executed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (rule_id) REFERENCES rules(id)
  );

  CREATE INDEX IF NOT EXISTS idx_rule_executions_rule_id ON rule_executions(rule_id);
  CREATE INDEX IF NOT EXISTS idx_rule_executions_target ON rule_executions(target_campaign_id, executed_at);

  -- Pending approval queue: when a rule has requires_approval=1, we don't
  -- execute the action immediately. Instead we insert a row here, send a
  -- Telegram message with [Approve][Reject] buttons, and wait for the user
  -- to tap one. Auto-expires after expires_at.
  CREATE TABLE IF NOT EXISTS pending_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    rule_name TEXT,
    target_campaign_id TEXT NOT NULL,
    target_campaign_name TEXT,
    account_id TEXT,
    metric TEXT,
    metric_value REAL,
    threshold_value REAL,
    action_json TEXT NOT NULL,
    snapshot_json TEXT,                -- captured state at decision time (e.g. current daily_budget)
    status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | expired | executed | failed
    telegram_chat_id TEXT,
    telegram_message_id TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    execution_error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status, expires_at);

  -- Persisted chat threads for the Ad Chat. The history_json is the full
  -- OpenAI-format message array we send back to the LLM each turn — by storing
  -- it verbatim, resuming a conversation later is a matter of loading the row
  -- and feeding it back to /api/chat unchanged.
  CREATE TABLE IF NOT EXISTS chat_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'New chat',
    history_json TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_chat_threads_updated ON chat_threads(updated_at DESC);
`)

// ─── Idempotent column migrations ────────────────────────────────────────────
// SQLite has no CREATE TABLE IF NOT EXISTS WITH COLUMNS for new columns on
// an existing table, so we add them via PRAGMA + ALTER if missing.
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  }
}
addColumnIfMissing('rules', 'requires_approval', 'INTEGER NOT NULL DEFAULT 0')

module.exports = db
