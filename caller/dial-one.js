// caller/dial-one.js — Dial a single target
// Usage: node caller/dial-one.js --target "Chase"
//        node caller/dial-one.js --phone "+18009359935"
require('dotenv').config();
const twilio = require('twilio');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'voicegov.db'));
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const args = process.argv.slice(2);
const targetName = args.find((a, i) => args[i - 1] === '--target');
const phoneOverride = args.find((a, i) => args[i - 1] === '--phone');

async function dial() {
  let target;

  if (targetName) {
    target = db.prepare('SELECT * FROM targets WHERE name LIKE ? LIMIT 1').get(`%${targetName}%`);
    if (!target) {
      console.error(`Target "${targetName}" not found. Available targets:`);
      const all = db.prepare('SELECT name, sector FROM targets ORDER BY name').all();
      all.forEach(t => console.log(`  ${t.name} (${t.sector})`));
      process.exit(1);
    }
  } else if (phoneOverride) {
    target = { id: 0, name: 'Manual', phone: phoneOverride, sector: 'manual' };
  } else {
    // Pick next pending target
    target = db.prepare("SELECT * FROM targets WHERE status = 'pending' ORDER BY RANDOM() LIMIT 1").get();
    if (!target) {
      console.log('No pending targets. All have been scanned.');
      process.exit(0);
    }
  }

  console.log(`\n═══ Dialing: ${target.name} (${target.phone}) ═══\n`);

  const host = process.env.HOST || 'voicegov.thebhtlabs.com';

  try {
    // Create scan record
    const scanId = target.id ? db.prepare(
      "INSERT INTO scans (target_id, status) VALUES (?, 'initiated')"
    ).run(target.id).lastInsertRowid : null;

    // Place the call
    const call = await client.calls.create({
      to: target.phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `https://${host}/voice/connect`,
      statusCallback: `https://${host}/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      timeout: 30,
      machineDetection: 'Enable',
      record: false, // We only transcribe, no audio recording
    });

    console.log(`Call SID: ${call.sid}`);
    console.log(`Status: ${call.status}`);

    // Update scan with call SID
    if (scanId) {
      db.prepare('UPDATE scans SET call_sid = ? WHERE id = ?').run(call.sid, scanId);
      db.prepare("UPDATE targets SET status = 'scanning', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(target.id);
    }

    console.log(`\nCall initiated. Monitor at: https://${host}/api/scan/${scanId}`);
    console.log('Transcription will stream to WebSocket in real-time.\n');

  } catch (err) {
    console.error('Call failed:', err.message);
    if (err.code === 21215) console.error('→ Phone number not verified. Upgrade Twilio account or verify this number.');
    if (err.code === 20003) console.error('→ Authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    process.exit(1);
  }

  db.close();
}

dial();
