/**
 * migrate.js — Add client portal columns to VoiceGov DB
 * Run once: node migrate.js
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const db = new Database(path.join(__dirname, '..', 'voicegov.db'));
db.pragma('journal_mode = WAL');

console.log('Running client portal migration...');

// Check existing targets columns
const cols = db.prepare("PRAGMA table_info(targets)").all().map(c => c.name);
console.log('Existing targets columns:', cols.join(', '));

const add = (col, def) => {
  if (!cols.includes(col)) {
    db.prepare(`ALTER TABLE targets ADD COLUMN ${col} ${def}`).run();
    console.log(`  + Added: ${col}`);
  } else {
    console.log(`  ✓ Exists: ${col}`);
  }
};

add('client_name',  'TEXT');
add('client_email', 'TEXT');
add('client_token', 'TEXT');
add('report_sent',  'INTEGER DEFAULT 0');
add('notes',        'TEXT');
add('created_by',   'TEXT DEFAULT "scheduler"');

// Unique index on token
try {
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_targets_token 
    ON targets(client_token) WHERE client_token IS NOT NULL`).run();
  console.log('  + Token index created');
} catch(e) {
  console.log('  ✓ Token index exists');
}

console.log('\n✅ Migration complete');
db.close();
