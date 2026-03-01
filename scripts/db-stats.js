// scripts/db-stats.js — Quick database statistics
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'voicegov.db'), { readonly: true });

const targets = db.prepare('SELECT COUNT(*) as c FROM targets').get();
const scans = db.prepare('SELECT COUNT(*) as c FROM scans').get();
const completed = db.prepare("SELECT COUNT(*) as c FROM scans WHERE status='completed'").get();
const sectors = db.prepare('SELECT sector, COUNT(*) as c FROM targets GROUP BY sector ORDER BY c DESC').all();
const recent = db.prepare('SELECT t.name, s.governance_score, s.annoyance_grade, s.scanned_at FROM scans s JOIN targets t ON s.target_id=t.id ORDER BY s.scanned_at DESC LIMIT 10').all();

console.log('\n═══ VoiceGov Database Stats ═══');
console.log(`Targets: ${targets.c}`);
console.log(`Total scans: ${scans.c}`);
console.log(`Completed: ${completed.c}`);
console.log('\nBy sector:');
sectors.forEach(s => console.log(`  ${s.sector}: ${s.c}`));
if (recent.length) {
  console.log('\nRecent scans:');
  recent.forEach(r => console.log(`  ${r.name}: ${r.governance_score}% (${r.annoyance_grade}) — ${r.scanned_at}`));
}
console.log('');
db.close();
