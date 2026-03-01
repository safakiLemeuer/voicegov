// web/leaderboard-server.js — Public VoiceGov 500 Leaderboard
require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.LEADERBOARD_PORT || 3501;
const db = new Database(path.join(__dirname, '..', 'voicegov.db'), { readonly: true });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

app.get('/api/data', (req, res) => {
  const { sector, sort } = req.query;
  let query = 'SELECT * FROM leaderboard';
  const params = [];
  if (sector && sector !== 'all') { query += ' WHERE sector = ?'; params.push(sector); }
  query += ` ORDER BY ${sort === 'annoyance' ? 'annoyance_grade ASC' : 'latest_score DESC'}`;
  res.json(db.prepare(query).all(...params));
});

app.get('/api/sectors', (req, res) => {
  res.json(db.prepare('SELECT DISTINCT sector FROM leaderboard ORDER BY sector').all().map(r => r.sector));
});

app.get('/api/summary', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM leaderboard').get();
  const avg = db.prepare('SELECT AVG(latest_score) as avg FROM leaderboard').get();
  const best = db.prepare('SELECT name, latest_score FROM leaderboard ORDER BY latest_score DESC LIMIT 1').get();
  const worst = db.prepare('SELECT name, latest_score FROM leaderboard ORDER BY latest_score ASC LIMIT 1').get();
  res.json({
    scanned: total.c, target: 500,
    avgScore: Math.round((avg.avg || 0) * 10) / 10,
    best: best || { name: 'N/A', latest_score: 0 },
    worst: worst || { name: 'N/A', latest_score: 0 },
  });
});

app.listen(PORT, () => {
  console.log(`VoiceGov 500 Leaderboard: http://localhost:${PORT}`);
});
