// server.js — VoiceGov Scanner API Server
// Handles Twilio webhooks, Deepgram real-time transcription, scan management
require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');
const { scoreScan } = require('./analyzer/scorer');
const pino = require('pino');

const log = pino({ level: 'info' });
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/transcribe' });

const PORT = process.env.PORT || 3500;
const db = new Database(path.join(__dirname, 'voicegov.db'));
db.pragma('journal_mode = WAL');

// Active calls tracking
const activeCalls = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ═══ HEALTH CHECK ═══
app.get('/health', (req, res) => {
  const targets = db.prepare('SELECT COUNT(*) as c FROM targets').get();
  const scans = db.prepare('SELECT COUNT(*) as c FROM scans').get();
  res.json({
    status: 'ok',
    service: 'VoiceGov Scanner',
    version: '1.0.0',
    targets: targets.c,
    scans: scans.c,
    activeCalls: activeCalls.size,
    uptime: process.uptime(),
  });
});

// ═══ TWILIO VOICE WEBHOOK ═══
// Twilio calls this when the outbound call connects
app.post('/voice/connect', (req, res) => {
  const callSid = req.body.CallSid;
  log.info({ callSid }, 'Call connected');

  // Return TwiML to start media streaming to our WebSocket
  const host = process.env.HOST || req.headers.host;
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/ws/transcribe">
      <Parameter name="callSid" value="${callSid}" />
    </Stream>
  </Connect>
  <Pause length="${process.env.CALL_TIMEOUT_SEC || 120}" />
</Response>`);
});

// ═══ TWILIO STATUS CALLBACK ═══
app.post('/voice/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  log.info({ CallSid, CallStatus, CallDuration }, 'Call status update');

  if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(CallStatus)) {
    const callData = activeCalls.get(CallSid);
    if (callData) {
      // Score the scan
      const transcript = callData.transcript || '';
      const duration = parseInt(CallDuration) || 0;
      const scanResult = scoreScan({
        transcript,
        duration_sec: duration,
        escape_time_sec: callData.escapeTime || null,
        human_reached: callData.humanReached || false,
      });

      // Update scan in DB
      try {
        db.prepare(`UPDATE scans SET 
          status = 'completed', duration_sec = ?, transcript = ?,
          escape_time_sec = ?, human_reached = ?, disclosure_found = ?,
          resolution_type = ?, annoyance_index = ?, annoyance_grade = ?,
          governance_score = ?, escape_score = ?, disclosure_score = ?, resolution_score = ?
          WHERE call_sid = ?`
        ).run(
          duration, transcript,
          scanResult.meta.escape_time_sec, scanResult.meta.human_reached ? 1 : 0,
          scanResult.disclosure.found.length, scanResult.resolution.score > 12 ? 'resolved' : 'unresolved',
          scanResult.annoyance.index, scanResult.annoyance.grade,
          scanResult.overall, scanResult.escape.score, scanResult.disclosure.score, scanResult.resolution.score,
          CallSid
        );

        // Update leaderboard
        const scan = db.prepare('SELECT target_id FROM scans WHERE call_sid = ?').get(CallSid);
        if (scan) {
          db.prepare(`INSERT INTO leaderboard (target_id, name, sector, latest_score, best_score, worst_score, scan_count, annoyance_grade, last_scanned)
            SELECT t.id, t.name, t.sector, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP FROM targets t WHERE t.id = ?
            ON CONFLICT(target_id) DO UPDATE SET
            latest_score = ?, best_score = MAX(best_score, ?), worst_score = MIN(worst_score, ?),
            scan_count = scan_count + 1, annoyance_grade = ?, last_scanned = CURRENT_TIMESTAMP`
          ).run(
            scanResult.overall, scanResult.overall, scanResult.overall, scanResult.annoyance.grade, scan.target_id,
            scanResult.overall, scanResult.overall, scanResult.overall, scanResult.annoyance.grade
          );
        }

        log.info({ CallSid, score: scanResult.overall, grade: scanResult.annoyance.grade }, 'Scan scored');
      } catch (e) {
        log.error({ err: e, CallSid }, 'Failed to save scan results');
      }

      activeCalls.delete(CallSid);
    }
  }

  res.sendStatus(200);
});

// ═══ WEBSOCKET — Deepgram Real-time Transcription ═══
wss.on('connection', (ws) => {
  let callSid = null;
  let deepgramWs = null;
  let transcript = '';
  const startTime = Date.now();

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    if (msg.event === 'start') {
      callSid = msg.start?.customParameters?.callSid;
      log.info({ callSid }, 'Media stream started');

      // Initialize Deepgram WebSocket
      const dgKey = process.env.DEEPGRAM_API_KEY;
      if (dgKey) {
        const { createClient } = require('@deepgram/sdk');
        const deepgram = createClient(dgKey);
        const dgConnection = deepgram.listen.live({
          model: 'nova-2',
          language: 'en-US',
          smart_format: true,
          interim_results: false,
          endpointing: 300,
          utterance_end_ms: 1000,
          encoding: 'mulaw',
          sample_rate: 8000,
          channels: 1,
        });

        dgConnection.on('open', () => {
          log.info({ callSid }, 'Deepgram connection open');
          deepgramWs = dgConnection;
        });

        dgConnection.on('Results', (result) => {
          const text = result.channel?.alternatives?.[0]?.transcript;
          if (text && text.trim()) {
            transcript += text + '\n';
            log.info({ callSid, text }, 'Transcript chunk');

            // Detect human reached
            if (callSid && activeCalls.has(callSid)) {
              const call = activeCalls.get(callSid);
              const lower = text.toLowerCase();
              if ((lower.includes('how can i help') || lower.includes('my name is') || lower.includes('this is')) && !call.humanReached) {
                call.humanReached = true;
                call.escapeTime = (Date.now() - startTime) / 1000;
                log.info({ callSid, escapeTime: call.escapeTime }, 'Human detected');
              }
              call.transcript = transcript;
            }
          }
        });

        dgConnection.on('error', (e) => {
          log.error({ err: e, callSid }, 'Deepgram error');
        });
      }

      // Track the call
      activeCalls.set(callSid, { transcript: '', humanReached: false, escapeTime: null, startTime });

    } else if (msg.event === 'media' && deepgramWs) {
      // Forward audio to Deepgram
      const audio = Buffer.from(msg.media.payload, 'base64');
      try { deepgramWs.send(audio); } catch (e) {}

    } else if (msg.event === 'stop') {
      log.info({ callSid }, 'Media stream stopped');
      if (deepgramWs) {
        try { deepgramWs.finish(); } catch (e) {}
      }
    }
  });

  ws.on('close', () => {
    if (deepgramWs) {
      try { deepgramWs.finish(); } catch (e) {}
    }
  });
});

// ═══ API ENDPOINTS ═══
app.get('/api/targets', (req, res) => {
  const targets = db.prepare('SELECT * FROM targets ORDER BY sector, name').all();
  res.json(targets);
});

app.get('/api/leaderboard', (req, res) => {
  const { sector } = req.query;
  let query = 'SELECT * FROM leaderboard';
  const params = [];
  if (sector) { query += ' WHERE sector = ?'; params.push(sector); }
  query += ' ORDER BY latest_score DESC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/scan/:id', (req, res) => {
  const scan = db.prepare('SELECT s.*, t.name, t.sector FROM scans s JOIN targets t ON s.target_id = t.id WHERE s.id = ?').get(req.params.id);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  res.json(scan);
});

app.get('/api/stats', (req, res) => {
  const targets = db.prepare('SELECT COUNT(*) as c FROM targets').get();
  const scans = db.prepare('SELECT COUNT(*) as c FROM scans').get();
  const completed = db.prepare("SELECT COUNT(*) as c FROM scans WHERE status='completed'").get();
  const avgScore = db.prepare("SELECT AVG(governance_score) as avg FROM scans WHERE status='completed'").get();
  const bySector = db.prepare("SELECT sector, COUNT(*) as scans, AVG(governance_score) as avg_score FROM scans s JOIN targets t ON s.target_id=t.id WHERE s.status='completed' GROUP BY sector").all();

  res.json({
    targets: targets.c,
    total_scans: scans.c,
    completed_scans: completed.c,
    average_score: Math.round((avgScore.avg || 0) * 10) / 10,
    by_sector: bySector,
  });
});

// ═══ START ═══
server.listen(PORT, () => {
  log.info({ port: PORT }, 'VoiceGov Scanner running');
});
