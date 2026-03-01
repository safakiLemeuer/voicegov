// scripts/init-db.js — Initialize VoiceGov SQLite database
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'voicegov.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    sector TEXT NOT NULL DEFAULT 'other',
    category TEXT DEFAULT '',
    fortune_rank INTEGER DEFAULT 0,
    website TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id INTEGER NOT NULL,
    call_sid TEXT UNIQUE,
    status TEXT DEFAULT 'initiated',
    duration_sec INTEGER DEFAULT 0,
    transcript TEXT DEFAULT '',
    raw_audio_url TEXT DEFAULT '',
    escape_time_sec REAL DEFAULT NULL,
    human_reached INTEGER DEFAULT 0,
    disclosure_found INTEGER DEFAULT 0,
    resolution_type TEXT DEFAULT 'none',
    annoyance_index REAL DEFAULT 0,
    annoyance_grade TEXT DEFAULT 'F',
    governance_score REAL DEFAULT 0,
    escape_score REAL DEFAULT 0,
    disclosure_score REAL DEFAULT 0,
    resolution_score REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_id) REFERENCES targets(id)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id INTEGER NOT NULL,
    scan_id INTEGER NOT NULL,
    overall REAL DEFAULT 0,
    escape_pct REAL DEFAULT 0,
    disclosure_pct REAL DEFAULT 0,
    resolution_pct REAL DEFAULT 0,
    annoyance_index REAL DEFAULT 0,
    annoyance_grade TEXT DEFAULT 'F',
    scored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_id) REFERENCES targets(id),
    FOREIGN KEY (scan_id) REFERENCES scans(id)
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    latest_score REAL DEFAULT 0,
    best_score REAL DEFAULT 0,
    worst_score REAL DEFAULT 0,
    scan_count INTEGER DEFAULT 0,
    annoyance_grade TEXT DEFAULT 'F',
    last_scanned DATETIME,
    FOREIGN KEY (target_id) REFERENCES targets(id)
  );

  CREATE INDEX IF NOT EXISTS idx_scans_target ON scans(target_id);
  CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
  CREATE INDEX IF NOT EXISTS idx_scores_target ON scores(target_id);
  CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(latest_score DESC);
  CREATE INDEX IF NOT EXISTS idx_leaderboard_sector ON leaderboard(sector);
`);

console.log('✓ VoiceGov database initialized');
db.close();
