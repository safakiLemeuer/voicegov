// caller/scheduler.js — Automated scanning scheduler
// Runs 50 calls/day, Mon-Fri, 9am-5pm EST, max 6 concurrent
require('dotenv').config();
const cron = require('node-cron');
const twilio = require('twilio');
const Database = require('better-sqlite3');
const path = require('path');
const pino = require('pino');

const log = pino({ level: 'info' });
const db = new Database(path.join(__dirname, '..', 'voicegov.db'));
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_CALLS) || 6;
const CALLS_PER_DAY = parseInt(process.env.CALLS_PER_DAY) || 50;
const HOST = process.env.HOST || 'voicegov.thebhtlabs.com';

let dailyCount = 0;
let activeCalls = 0;

async function dialNext() {
  if (activeCalls >= MAX_CONCURRENT) {
    log.info({ activeCalls }, 'Max concurrent calls reached, waiting...');
    return;
  }
  if (dailyCount >= CALLS_PER_DAY) {
    log.info({ dailyCount }, 'Daily limit reached');
    return;
  }

  // Pick a target: prioritize pending, then oldest scanned
  let target = db.prepare("SELECT * FROM targets WHERE status = 'pending' ORDER BY RANDOM() LIMIT 1").get();
  if (!target) {
    target = db.prepare("SELECT * FROM targets WHERE status != 'scanning' ORDER BY updated_at ASC LIMIT 1").get();
  }
  if (!target) {
    log.info('No targets available');
    return;
  }

  activeCalls++;
  dailyCount++;

  try {
    const scanId = db.prepare(
      "INSERT INTO scans (target_id, status) VALUES (?, 'initiated')"
    ).run(target.id).lastInsertRowid;

    const call = await client.calls.create({
      to: target.phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `https://${HOST}/voice/connect`,
      statusCallback: `https://${HOST}/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      timeout: 30,
      machineDetection: 'Enable',
      record: false,
    });

    db.prepare('UPDATE scans SET call_sid = ? WHERE id = ?').run(call.sid, scanId);
    db.prepare("UPDATE targets SET status = 'scanning', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(target.id);

    log.info({ target: target.name, callSid: call.sid, dailyCount, activeCalls }, 'Call placed');

    // Track completion to decrement active count
    const checkInterval = setInterval(async () => {
      try {
        const callInfo = await client.calls(call.sid).fetch();
        if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(callInfo.status)) {
          activeCalls--;
          db.prepare("UPDATE targets SET status = 'scanned', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(target.id);
          clearInterval(checkInterval);
        }
      } catch (e) {
        activeCalls--;
        clearInterval(checkInterval);
      }
    }, 10000); // Check every 10 seconds

    // Safety timeout — 3 minutes max per call
    setTimeout(() => {
      activeCalls = Math.max(0, activeCalls - 1);
      clearInterval(checkInterval);
    }, 180000);

  } catch (err) {
    activeCalls--;
    log.error({ err: err.message, target: target.name }, 'Call failed');
  }
}

// Reset daily count at midnight EST
cron.schedule('0 0 * * *', () => {
  dailyCount = 0;
  log.info('Daily count reset');
}, { timezone: 'America/New_York' });

// Run every 3 minutes, Mon-Fri, 9am-5pm EST
cron.schedule('*/3 9-16 * * 1-5', () => {
  dialNext();
}, { timezone: 'America/New_York' });

log.info({
  maxConcurrent: MAX_CONCURRENT,
  callsPerDay: CALLS_PER_DAY,
  schedule: 'Mon-Fri 9am-5pm EST, every 3 minutes',
}, 'VoiceGov Scheduler started');

// Keep process alive
process.on('SIGTERM', () => { db.close(); process.exit(0); });
process.on('SIGINT', () => { db.close(); process.exit(0); });
