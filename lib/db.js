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
  )
`)

module.exports = db
