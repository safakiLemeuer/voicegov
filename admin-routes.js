/**
 * admin-routes.js — Admin + Client Portal API
 * 
 * ADD TO server.js (after db is initialized, before server.listen):
 *   require('./admin-routes')(app, db, log);
 */

require('dotenv').config();
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const BASE_URL = process.env.BASE_URL || 'https://voicegov.thebhtlabs.com';

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function getTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.hostinger.com',
    port:   parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
      user: process.env.SMTP_USER || 'info@bhtsolutions.com',
      pass: process.env.SMTP_PASS,
    },
  });
}

module.exports = function(app, db, log) {

  // ── SERVE ADMIN HTML ────────────────────────────────────────────────────
  const path = require('path');
  app.use('/admin-static', require('express').static(path.join(__dirname, 'web')));
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'admin.html'));
  });

  // ── SERVE CLIENT PORTAL ─────────────────────────────────────────────────
  app.get('/client/:token', (req, res) => {
    const target = db.prepare(`
      SELECT t.name, t.sector, t.client_name,
             l.latest_score, l.best_score, l.annoyance_grade, l.last_scanned, l.scan_count,
             s.governance_score, s.escape_score, s.disclosure_score, s.resolution_score,
             s.annoyance_index, s.annoyance_grade as scan_grade,
             s.transcript, s.duration_sec, s.created_at
      FROM targets t
      LEFT JOIN leaderboard l ON l.target_id = t.id
      LEFT JOIN scans s ON s.target_id = t.id AND s.status = 'completed'
      WHERE t.client_token = ?
      ORDER BY s.created_at DESC
      LIMIT 1
    `).get(req.params.token);

    if (!target) return res.status(404).send(notFoundHtml());
    res.send(clientPortalHtml(target, req.params.token));
  });

  // ── API: GET TARGETS ────────────────────────────────────────────────────
  // Extend existing /api/targets for admin use
  app.get('/api/admin/targets', requireAdmin, (req, res) => {
    const targets = db.prepare('SELECT * FROM targets ORDER BY sector, name').all();
    res.json({ targets });
  });

  // ── API: ADD TARGET (admin + client) ────────────────────────────────────
  app.post('/api/admin/targets', requireAdmin, (req, res) => {
    const { name, phone, sector } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });

    const normalized = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g,'')}`;
    try {
      // Check what columns exist in targets
      const cols = db.prepare("PRAGMA table_info(targets)").all().map(c => c.name);
      const hasPhone = cols.includes('phone');
      const hasSector = cols.includes('sector');

      let stmt, result;
      if (hasPhone && hasSector) {
        stmt = db.prepare('INSERT INTO targets (name, phone, sector) VALUES (?,?,?)');
        result = stmt.run(name, normalized, sector || 'General');
      } else if (hasPhone) {
        stmt = db.prepare('INSERT INTO targets (name, phone) VALUES (?,?)');
        result = stmt.run(name, normalized);
      } else {
        stmt = db.prepare('INSERT INTO targets (name) VALUES (?)');
        result = stmt.run(name);
      }
      res.json({ success: true, id: result.lastInsertRowid });
    } catch(e) {
      if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Phone already exists' });
      res.status(500).json({ error: e.message });
    }
  });

  // ── API: ADD CLIENT TARGET ───────────────────────────────────────────────
  app.post('/api/admin/clients', requireAdmin, (req, res) => {
    const { name, phone, sector, client_name, client_email, notes } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });

    const normalized = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g,'')}`;
    const token = crypto.randomBytes(20).toString('hex');

    try {
      const cols = db.prepare("PRAGMA table_info(targets)").all().map(c => c.name);
      const fields = ['name', 'phone', 'sector', 'client_token', 'created_by'];
      const vals = [name, normalized, sector || 'General', token, 'portal'];
      const placeholders = ['?','?','?','?','?'];

      if (cols.includes('client_name') && client_name) { fields.push('client_name'); vals.push(client_name); placeholders.push('?'); }
      if (cols.includes('client_email') && client_email) { fields.push('client_email'); vals.push(client_email); placeholders.push('?'); }
      if (cols.includes('notes') && notes) { fields.push('notes'); vals.push(notes); placeholders.push('?'); }

      const result = db.prepare(
        `INSERT INTO targets (${fields.join(',')}) VALUES (${placeholders.join(',')})`
      ).run(...vals);

      res.json({
        success: true,
        id: result.lastInsertRowid,
        token,
        portal_url: `${BASE_URL}/client/${token}`,
      });
    } catch(e) {
      if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Phone already exists' });
      res.status(500).json({ error: e.message });
    }
  });

  // ── API: LIST CLIENT TARGETS ─────────────────────────────────────────────
  app.get('/api/admin/clients', requireAdmin, (req, res) => {
    try {
      const clients = db.prepare(`
        SELECT t.id, t.name, t.sector, t.client_name, t.client_email,
               t.client_token, t.report_sent, t.notes,
               l.latest_score, l.annoyance_grade, l.scan_count, l.last_scanned
        FROM targets t
        LEFT JOIN leaderboard l ON l.target_id = t.id
        WHERE t.created_by = 'portal'
        ORDER BY t.id DESC
      `).all();
      res.json({ clients });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── API: MANUAL DIAL ────────────────────────────────────────────────────
  app.post('/api/admin/dial', requireAdmin, async (req, res) => {
    const { target_id } = req.body;
    if (!target_id) return res.status(400).json({ error: 'target_id required' });

    const target = db.prepare('SELECT * FROM targets WHERE id = ?').get(target_id);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    const phone = target.phone;
    if (!phone) return res.status(400).json({ error: 'Target has no phone number' });

    try {
      const twilio = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN,
      );
      const host = process.env.HOST || 'voicegov.thebhtlabs.com';

      const call = await twilio.calls.create({
        to:  phone,
        from: process.env.TWILIO_FROM_NUMBER,
        url: `https://${host}/voice/connect`,
        statusCallback: `https://${host}/voice/status`,
        statusCallbackMethod: 'POST',
      });

      // Create scan record
      const scan = db.prepare(`
        INSERT INTO scans (target_id, call_sid, status)
        VALUES (?, ?, 'in-progress')
      `).run(target_id, call.sid);

      if (log) log.info({ callSid: call.sid, target: target.name }, 'Manual dial initiated');
      res.json({ success: true, call_sid: call.sid, scan_id: scan.lastInsertRowid });
    } catch(e) {
      if (log) log.error({ err: e }, 'Manual dial failed');
      res.status(500).json({ error: e.message });
    }
  });

  // ── API: LIST SCANS ─────────────────────────────────────────────────────
  app.get('/api/admin/scans', requireAdmin, (req, res) => {
    try {
      const scans = db.prepare(`
        SELECT s.*, t.name, t.sector
        FROM scans s
        JOIN targets t ON s.target_id = t.id
        ORDER BY s.id DESC
        LIMIT 100
      `).all();
      res.json({ scans });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── API: SEND REPORT EMAIL ───────────────────────────────────────────────
  app.post('/api/admin/clients/:token/send-report', requireAdmin, async (req, res) => {
    const { token } = req.params;

    const target = db.prepare(`
      SELECT t.*, l.latest_score, l.annoyance_grade, l.last_scanned,
             s.governance_score, s.escape_score, s.disclosure_score,
             s.resolution_score, s.annoyance_index, s.duration_sec, s.created_at
      FROM targets t
      LEFT JOIN leaderboard l ON l.target_id = t.id
      LEFT JOIN scans s ON s.target_id = t.id AND s.status = 'completed'
      WHERE t.client_token = ?
      ORDER BY s.created_at DESC
      LIMIT 1
    `).get(token);

    if (!target) return res.status(404).json({ error: 'Client not found' });
    if (!target.client_email) return res.status(400).json({ error: 'No email on file' });
    if (!target.governance_score && !target.latest_score) {
      return res.status(400).json({ error: 'No score yet — run the audit first' });
    }

    const portalUrl = `${BASE_URL}/client/${token}`;
    const score = Math.round(target.governance_score || target.latest_score || 0);
    const grade = target.scan_grade || target.annoyance_grade || '?';
    const gc = {A:'#10B981',B:'#22D3EE',C:'#F59E0B',D:'#F97316',F:'#EF4444'}[grade]||'#94A3B8';

    try {
      await getTransport().sendMail({
        from: `"VoiceGov by TheBHTLabs" <${process.env.SMTP_USER||'info@bhtsolutions.com'}>`,
        to: target.client_email,
        subject: `Your Voice AI Governance Report — ${target.name}`,
        html: buildEmail(target, score, grade, gc, portalUrl),
      });

      db.prepare('UPDATE targets SET report_sent = 1 WHERE client_token = ?').run(token);
      res.json({ success: true, sent_to: target.client_email, portal_url: portalUrl });
    } catch(e) {
      res.status(500).json({ error: 'Email failed: ' + e.message });
    }
  });

  // ── API: CLIENT DATA (public) ────────────────────────────────────────────
  app.get('/api/client/:token', (req, res) => {
    const target = db.prepare(`
      SELECT t.name, t.sector, t.client_name,
             s.governance_score, s.escape_score, s.disclosure_score,
             s.resolution_score, s.annoyance_index, s.annoyance_grade,
             s.transcript, s.duration_sec, s.created_at
      FROM targets t
      LEFT JOIN scans s ON s.target_id = t.id AND s.status = 'completed'
      WHERE t.client_token = ?
      ORDER BY s.created_at DESC LIMIT 1
    `).get(req.params.token);
    if (!target) return res.status(404).json({ error: 'Not found' });
    res.json({ report: target });
  });

};

// ════════════════════════════════════════════════════════════════════════════
// CLIENT PORTAL HTML
// ════════════════════════════════════════════════════════════════════════════
function clientPortalHtml(t, token) {
  const score   = Math.round(t.governance_score || t.latest_score || 0);
  const grade   = t.scan_grade || t.annoyance_grade || null;
  const esc_s   = Math.round(t.escape_score || 0);
  const dis_s   = Math.round(t.disclosure_score || 0);
  const res_s   = Math.round(t.resolution_score || 0);
  const ann     = Math.round(t.annoyance_index || 0);
  const gc      = {A:'#10B981',B:'#22D3EE',C:'#F59E0B',D:'#F97316',F:'#EF4444'}[grade]||'#94A3B8';
  const ac      = ann > 70 ? '#EF4444' : ann > 40 ? '#F59E0B' : '#10B981';
  const calledAt = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : null;
  const duration = t.duration_sec ? `${Math.floor(t.duration_sec/60)}m ${t.duration_sec%60}s` : null;

  const transcript = (t.transcript||'').split('\n').filter(Boolean)
    .map(l=>`<p style="padding:4px 0;border-bottom:1px solid #1F2937;font-size:11px;color:#9CA3AF">${e(l)}</p>`).join('');

  const remItems = buildRemediation(esc_s, dis_s, res_s, ann);

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voice AI Report · ${e(t.name)} · VoiceGov</title>
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0A0E14;color:#F9FAFB;font-family:'DM Mono',monospace;min-height:100vh}
.topbar{background:#0E7490;padding:12px 24px;display:flex;justify-content:space-between;align-items:center}
.tb-brand{font-size:12px;letter-spacing:3px;color:#A5F3FC}
.tb-conf{font-size:11px;color:rgba(255,255,255,.6)}
.hero{max-width:860px;margin:0 auto;padding:48px 24px 32px;border-bottom:1px solid #1F2937}
.eyebrow{font-size:10px;letter-spacing:4px;color:#22D3EE;margin-bottom:8px}
.company{font-family:'Syne',sans-serif;font-size:clamp(24px,5vw,48px);font-weight:800;line-height:1.1;margin-bottom:8px}
.meta{font-size:12px;color:#9CA3AF}
.grade-row{display:flex;flex-wrap:wrap;gap:14px;margin-top:28px}
.grade-card{background:#111827;border:2px solid var(--gc);border-radius:10px;padding:20px 28px;text-align:center}
.grade-letter{font-family:'Syne',sans-serif;font-size:64px;font-weight:800;line-height:1}
.grade-sub{font-size:11px;color:#9CA3AF;margin-top:4px}
.stat{background:#111827;border:1px solid #1F2937;border-radius:10px;padding:16px 20px;flex:1;min-width:110px}
.stat-l{font-size:10px;letter-spacing:3px;color:#9CA3AF;margin-bottom:6px}
.stat-v{font-family:'Syne',sans-serif;font-size:28px;font-weight:700}
.main{max-width:860px;margin:0 auto;padding:0 24px 80px}
.sec{padding:36px 0;border-bottom:1px solid #1F2937}
.sec-label{font-size:10px;letter-spacing:4px;color:#22D3EE;margin-bottom:18px}
.bar-row{display:grid;grid-template-columns:150px 1fr 56px;align-items:center;gap:12px;margin-bottom:14px}
.bar-label{font-size:12px}
.bar-wt{font-size:10px;color:#6B7280}
.bar-track{background:#1F2937;border-radius:4px;height:7px;overflow:hidden}
.bar-fill{height:7px;border-radius:4px}
.bar-score{text-align:right;font-size:12px;font-weight:500}
.ann-block{background:#111827;border-left:4px solid var(--ac);border-radius:8px;padding:20px}
.ann-num{font-family:'Syne',sans-serif;font-size:52px;font-weight:800;line-height:1}
.ann-sub{font-size:11px;color:#9CA3AF;margin-top:4px}
.ann-desc{font-size:12px;color:#9CA3AF;margin-top:12px;line-height:1.7}
.rem{background:#111827;border-left:3px solid #EF4444;border-radius:6px;padding:14px 18px;margin-bottom:10px}
.rem-pri{font-size:10px;letter-spacing:2px;font-weight:700;margin-bottom:5px}
.rem-issue{font-size:13px;font-weight:500;margin-bottom:6px}
.rem-action{font-size:11px;color:#9CA3AF;line-height:1.7}
.xscript{background:#111827;border:1px solid #1F2937;border-radius:8px;padding:16px;max-height:360px;overflow-y:auto}
.cta{text-align:center;padding:32px 0}
.btn-cta{display:inline-block;background:#0E7490;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:500;font-size:13px;letter-spacing:1px;margin:6px}
.btn-out{background:transparent;color:#22D3EE;border:1px solid #22D3EE}
.footer{background:#111827;border-top:1px solid #1F2937;padding:20px 24px;text-align:center}
.footer p{font-size:11px;color:#4B5563;margin:3px 0}
.footer a{color:#22D3EE;text-decoration:none}
.pending{text-align:center;padding:64px 24px}
.pending-icon{font-size:48px;margin-bottom:16px}
.pending-title{font-family:'Syne',sans-serif;font-size:24px;font-weight:700;margin-bottom:12px}
.pending-sub{font-size:13px;color:#9CA3AF;line-height:1.7}
</style>
<style>:root{--gc:${gc};--ac:${ac}}</style>
</head><body>

<div class="topbar">
  <span class="tb-brand">VOICEGOV · THEBHTLABS</span>
  <span class="tb-conf">CONFIDENTIAL · ${e(t.client_name||t.name)}</span>
</div>

<div class="hero">
  <p class="eyebrow">VOICE AI GOVERNANCE REPORT</p>
  <h1 class="company">${e(t.name)}</h1>
  <p class="meta">${e(t.sector||'')}${calledAt?' · Audited '+calledAt:''}${duration?' · '+duration:''}</p>

  ${grade ? `
  <div class="grade-row">
    <div class="grade-card">
      <div class="grade-letter" style="color:var(--gc)">${grade}</div>
      <div class="grade-sub">${score}/100</div>
    </div>
    <div class="stat"><div class="stat-l">ANNOYANCE™</div><div class="stat-v" style="color:var(--ac)">${ann}</div><div style="font-size:10px;color:#6B7280;margin-top:4px">0=seamless · 100=rage-quit</div></div>
    <div class="stat"><div class="stat-l">DURATION</div><div class="stat-v" style="color:#22D3EE">${duration||'—'}</div></div>
    <div class="stat"><div class="stat-l">VERDICT</div><div class="stat-v" style="color:var(--gc)">${score<40?'FAIL':score<70?'PARTIAL':'PASS'}</div></div>
  </div>` : ''}
</div>

<div class="main">
${!grade ? `
  <div class="sec" style="border:none">
    <div class="pending">
      <div class="pending-icon">⏳</div>
      <div class="pending-title">Audit Scheduled</div>
      <div class="pending-sub">Your Voice AI audit is queued.<br>Results appear here automatically once the call completes.<br><br>Questions? <a href="mailto:info@bhtsolutions.com" style="color:#22D3EE">info@bhtsolutions.com</a></div>
    </div>
  </div>
` : `
  <div class="sec">
    <p class="sec-label">GOVERNANCE CHECKS</p>
    <div class="bar-row">
      <div><div class="bar-label">Escape Path</div><div class="bar-wt">40 pts · reach a human?</div></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((esc_s/40)*100)}%;background:#22D3EE"></div></div>
      <div class="bar-score" style="color:#22D3EE">${esc_s}/40</div>
    </div>
    <div class="bar-row">
      <div><div class="bar-label">AI Disclosure</div><div class="bar-wt">35 pts · discloses automated?</div></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((dis_s/35)*100)}%;background:#F59E0B"></div></div>
      <div class="bar-score" style="color:#F59E0B">${dis_s}/35</div>
    </div>
    <div class="bar-row">
      <div><div class="bar-label">Resolution</div><div class="bar-wt">25 pts · resolves issues?</div></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((res_s/25)*100)}%;background:#8B5CF6"></div></div>
      <div class="bar-score" style="color:#8B5CF6">${res_s}/25</div>
    </div>
  </div>

  <div class="sec">
    <p class="sec-label">ANNOYANCE INDEX™</p>
    <div class="ann-block">
      <div class="ann-num" style="color:var(--ac)">${ann}</div>
      <div class="ann-sub">/ 100 — ${ann>70?'HIGH FRICTION':ann>40?'MODERATE FRICTION':'LOW FRICTION'}</div>
      <div class="ann-desc">${ann>70?'Significant caller frustration. High abandoned-call and escalation risk.':ann>40?'Moderate friction detected. Targeted improvements will reduce frustration.':'Caller experience well-managed. Maintain with quarterly audits.'}</div>
    </div>
  </div>

  <div class="sec">
    <p class="sec-label">REMEDIATION PRIORITIES</p>
    ${remItems.length===0
      ? '<p style="color:#10B981;font-size:13px">✓ No critical items. Maintain governance posture with quarterly audits.</p>'
      : remItems.map(r=>`<div class="rem" style="border-left-color:${r.color}">
          <div class="rem-pri" style="color:${r.color}">${r.priority}</div>
          <div class="rem-issue">${e(r.issue)}</div>
          <div class="rem-action">${e(r.action)}</div>
        </div>`).join('')}
  </div>

  <div class="sec">
    <p class="sec-label">FULL CALL TRANSCRIPT</p>
    <div class="xscript">${transcript||'<p style="color:#4B5563;font-style:italic">Transcript not captured.</p>'}</div>
  </div>
`}

  <div class="cta">
    <p style="font-size:13px;color:#9CA3AF;margin-bottom:16px">Questions or ready to begin remediation?</p>
    <a href="mailto:info@bhtsolutions.com" class="btn-cta">Contact BHT Solutions →</a>
    <a href="https://thebhtlabs.com" class="btn-cta btn-out">TheBHTLabs</a>
  </div>
</div>

<div class="footer">
  <p>VoiceGov by <a href="https://thebhtlabs.com">TheBHTLabs</a> · BHT Solutions LLC · <a href="mailto:info@bhtsolutions.com">info@bhtsolutions.com</a></p>
  <p>Confidential — prepared exclusively for ${e(t.client_name||t.name)}</p>
  <p style="margin-top:6px">Scored against TCPA §227 · FTC AI Disclosure Guidelines · FCC AI Call Disclosure Rules 2025</p>
</div>

</body></html>`;
}

function buildRemediation(esc_s, dis_s, res_s, ann) {
  const items = [];
  if (esc_s < 20) items.push({ issue:'Human escape path missing or buried 3+ menu levels deep.', action:'Add "Press 0 for agent" at every menu level. Target: caller reaches human within 2 prompts.', priority:'CRITICAL', color:'#EF4444' });
  if (dis_s < 20) items.push({ issue:'AI/automated system not disclosed within first 30 seconds.', action:'Add disclosure in opening greeting before any data collection. Required under FTC AI guidelines and FCC 2025 rules.', priority:'CRITICAL', color:'#EF4444' });
  if (res_s < 15) items.push({ issue:'IVR loop detected — caller cannot reach resolution.', action:'Map all dead-end branches. Each path must terminate at resolution, transfer, or callback — not loop.', priority:'HIGH', color:'#F97316' });
  if (ann > 60)  items.push({ issue:'High Annoyance Index — caller experience rated poor.', action:'Review menu depth (target ≤3 levels), hold time (callback after 90s), repeat-prompt logic.', priority:'MEDIUM', color:'#F59E0B' });
  return items;
}

function e(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function notFoundHtml() {
  return `<!DOCTYPE html><html><head><title>Not Found · VoiceGov</title>
  <style>body{background:#0A0E14;color:#F9FAFB;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#22D3EE}</style>
  </head><body><div><h1 style="font-size:48px;color:#22D3EE">404</h1><p>Report not found or link expired.<br><a href="mailto:info@bhtsolutions.com">info@bhtsolutions.com</a></p></div></body></html>`;
}

// ── EMAIL TEMPLATE ────────────────────────────────────────────────────────
function buildEmail(t, score, grade, gc, portalUrl) {
  const esc_s = Math.round(t.escape_score||0);
  const dis_s = Math.round(t.disclosure_score||0);
  const res_s = Math.round(t.resolution_score||0);
  const ann   = Math.round(t.annoyance_index||0);
  const ac    = ann>70?'#EF4444':ann>40?'#F59E0B':'#10B981';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0A0E14;font-family:'Courier New',monospace">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:12px;overflow:hidden;border:1px solid #1F2937">

<tr><td style="background:#0E7490;padding:24px 32px">
  <p style="margin:0 0 4px;color:#A5F3FC;font-size:11px;letter-spacing:3px">VOICEGOV · THEBHTLABS</p>
  <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Voice AI Governance Report</h1>
</td></tr>

<tr><td style="padding:28px 32px;border-bottom:1px solid #1F2937">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><p style="margin:0 0 4px;color:#9CA3AF;font-size:11px;letter-spacing:2px">ORGANIZATION</p>
        <p style="margin:0;color:#F9FAFB;font-size:18px;font-weight:700">${e(t.name)}</p>
        <p style="margin:4px 0 0;color:#9CA3AF;font-size:12px">${e(t.sector||'')}</p></td>
    <td width="110" align="center" style="background:#0A0E14;border-radius:8px;padding:14px;border:2px solid ${gc}">
      <p style="margin:0;color:${gc};font-size:44px;font-weight:700;line-height:1;font-family:'Courier New',monospace">${grade}</p>
      <p style="margin:4px 0 0;color:#9CA3AF;font-size:11px">${score}/100</p>
    </td>
  </tr></table>
</td></tr>

<tr><td style="padding:24px 32px;border-bottom:1px solid #1F2937">
  <p style="margin:0 0 14px;color:#22D3EE;font-size:10px;letter-spacing:3px">GOVERNANCE CHECKS</p>
  ${emailBar('Escape Path', esc_s, 40, '#22D3EE')}
  ${emailBar('AI Disclosure', dis_s, 35, '#F59E0B')}
  ${emailBar('Resolution', res_s, 25, '#8B5CF6')}
</td></tr>

<tr><td style="padding:24px 32px;border-bottom:1px solid #1F2937">
  <p style="margin:0 0 8px;color:#9CA3AF;font-size:10px;letter-spacing:2px">ANNOYANCE INDEX™</p>
  <p style="margin:0;color:${ac};font-size:32px;font-weight:700;font-family:'Courier New',monospace">${ann}<span style="font-size:14px;color:#9CA3AF">/100</span></p>
  <p style="margin:4px 0 0;color:#9CA3AF;font-size:11px">${ann>70?'High friction — abandoned call risk':ann>40?'Moderate friction detected':'Low friction — good experience'}</p>
</td></tr>

<tr><td style="padding:28px 32px" align="center">
  <p style="margin:0 0 16px;color:#9CA3AF;font-size:13px">View your full interactive report with transcript:</p>
  <a href="${portalUrl}" style="display:inline-block;background:#0E7490;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:1px">View Full Report →</a>
</td></tr>

<tr><td style="background:#0A0E14;padding:16px 32px;border-top:1px solid #1F2937">
  <p style="margin:0;color:#4B5563;font-size:11px">VoiceGov by TheBHTLabs · BHT Solutions LLC · info@bhtsolutions.com</p>
  <p style="margin:4px 0 0;color:#4B5563;font-size:11px">Confidential — prepared exclusively for ${e(t.client_name||t.name)}</p>
</td></tr>

</table></td></tr></table>
</body></html>`;
}

function emailBar(label, score, max, color) {
  const pct = Math.round(((score||0)/max)*100);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr>
    <td width="130"><p style="margin:0;color:#F9FAFB;font-size:12px">${label}</p></td>
    <td><div style="background:#1F2937;border-radius:4px;height:6px"><div style="background:${color};width:${pct}%;height:6px;border-radius:4px"></div></div></td>
    <td width="60" align="right"><p style="margin:0;color:${color};font-size:12px;font-weight:700">${score}/${max}</p></td>
  </tr></table>`;
}

function e(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
