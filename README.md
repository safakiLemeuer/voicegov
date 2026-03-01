# VoiceGov 500 — AI Voice Bot Governance Scanner

Automated scanner that calls Fortune 500 customer service lines, transcribes in real-time via Deepgram, and scores their voice bots on AI governance.

**By TheBHTLabs / BHT Solutions LLC**

## Architecture

```
Twilio (outbound call) → Customer Service IVR
         ↓ media stream
WebSocket → Deepgram Nova-2 (real-time transcription)
         ↓ transcript
Scorer → Governance Score (0-100) + Annoyance Index (A-F)
         ↓
SQLite DB → Public Leaderboard → LinkedIn Content
```

## Scoring (3 Checks)

| Check | Weight | What it measures |
|-------|--------|------------------|
| Escape Path | 40% | Can caller reach a human? How fast? |
| AI Disclosure | 35% | Does the bot identify itself as AI/automated? |
| Resolution | 25% | Does the bot actually help or just loop? |

## Annoyance Index™

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 0-15 | Fast, clean, human available |
| B | 16-30 | Minor friction |
| C | 31-50 | Noticeable frustration |
| D | 51-70 | Significant annoyance |
| F | 71-100 | Voice bot hell |

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill environment variables
cp .env.example .env
nano .env

# 3. Initialize database and seed targets
npm run init-db
npm run seed

# 4. Test a single call
npm run dial -- --target "Chase"

# 5. Start all services
pm2 start ecosystem.config.js

# 6. Configure nginx
cp config/nginx.conf /etc/nginx/sites-available/voicegov
ln -s /etc/nginx/sites-available/voicegov /etc/nginx/sites-enabled/
certbot --nginx -d voicegov.thebhtlabs.com
nginx -t && systemctl reload nginx
```

## Required Accounts

| Service | Cost | Signup |
|---------|------|--------|
| Twilio | ~$21 (upgrade + number) | twilio.com/try-twilio |
| Deepgram | Free ($200 credit) | console.deepgram.com |

## File Structure

```
voicegov/
├── server.js              # Express + WebSocket API server
├── ecosystem.config.js    # PM2 config (3 processes)
├── package.json
├── .env.example
├── analyzer/
│   ├── annoyance.js       # Annoyance Index calculator
│   └── scorer.js          # 3-check governance scoring
├── caller/
│   ├── dial-one.js        # Single call initiator
│   └── scheduler.js       # Cron daemon (50/day, M-F 9-5)
├── content/
│   └── linkedin-gen.js    # Auto LinkedIn post generator
├── scripts/
│   ├── init-db.js         # SQLite schema
│   ├── seed-targets.js    # 55 Fortune 500 targets
│   └── db-stats.js        # Quick stats utility
├── web/
│   ├── leaderboard-server.js  # Public leaderboard API
│   └── leaderboard.html       # VoiceGov 500 page
└── config/
    └── nginx.conf         # Reverse proxy config
```

## Legal

- Calls public customer service numbers as a normal consumer would
- No audio recording (transcribe-only via Deepgram)
- One-party consent applies (caller is a party to the call)
- Published scores are protected opinion (Consumer Reports model)
- Klearcom precedent: similar business model proven at enterprise scale

© 2026 Bluebery Hawaii Technology Solutions LLC. All rights reserved.
