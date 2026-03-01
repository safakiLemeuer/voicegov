// content/linkedin-gen.js — Auto-generate viral LinkedIn posts from scan data
// Generates 5 types of posts: ranking, shaming, praise, insight, weekly roundup
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const db = new Database(path.join(__dirname, '..', 'voicegov.db'), { readonly: true });

function generatePosts() {
  const posts = [];
  const leaderboard = db.prepare('SELECT * FROM leaderboard ORDER BY latest_score DESC').all();
  const recentScans = db.prepare("SELECT s.*, t.name, t.sector FROM scans s JOIN targets t ON s.target_id=t.id WHERE s.status='completed' ORDER BY s.scanned_at DESC LIMIT 20").all();

  if (leaderboard.length === 0) {
    console.log('No scan data yet. Run some scans first.');
    return;
  }

  // ═══ POST 1: Sector Ranking ═══
  const sectors = [...new Set(leaderboard.map(l => l.sector))];
  for (const sector of sectors.slice(0, 2)) {
    const sectorData = leaderboard.filter(l => l.sector === sector).slice(0, 5);
    if (sectorData.length >= 3) {
      posts.push({
        type: 'sector_ranking',
        content: `We called every major ${sector} company's customer service line this week.

Here's how their voice bots scored on AI governance:

${sectorData.map((s, i) => `${i + 1}. ${s.name}: ${s.latest_score}/100 (${s.annoyance_grade})`).join('\n')}

The scoring:
→ Can you escape to a human? (40%)
→ Does the bot disclose it's AI? (35%)
→ Does it actually resolve your issue? (25%)

${sectorData[0].latest_score >= 70 ? `${sectorData[0].name} leads the pack.` : 'Nobody scored above 70. That tells you everything.'}

Full methodology and live leaderboard: voicegov.thebhtlabs.com

#AIGovernance #VoiceAI #${sector} #CustomerExperience`,
      });
    }
  }

  // ═══ POST 2: Worst Offender ═══
  const worst = leaderboard[leaderboard.length - 1];
  if (worst && worst.latest_score < 40) {
    posts.push({
      type: 'shame',
      content: `We called ${worst.name}'s customer service line.

Their voice bot scored ${worst.latest_score}/100 on AI governance.

What we found:
→ No way to reach a human within 2 minutes
→ No disclosure that you're talking to AI
→ Zero resolution capability

The EU AI Act requires transparency for AI systems that interact with humans.

The question isn't whether regulators will notice.

It's when.

Live scores for 500 companies: voicegov.thebhtlabs.com

#AIGovernance #CustomerExperience #Compliance`,
    });
  }

  // ═══ POST 3: Best Performer ═══
  const best = leaderboard[0];
  if (best && best.latest_score >= 60) {
    posts.push({
      type: 'praise',
      content: `${best.name} gets it.

We scored their voice bot ${best.latest_score}/100 on AI governance.

What they do right:
→ Human reachable in under 60 seconds
→ Clear AI disclosure at the start
→ Actually resolves common requests

This is what "responsible AI" looks like in practice. Not a white paper. Not a committee. A phone system that doesn't trap you.

The bar is low. ${best.name} cleared it.

See all scores: voicegov.thebhtlabs.com

#AIGovernance #ResponsibleAI #VoiceAI`,
    });
  }

  // ═══ POST 4: Data Insight ═══
  const avgScore = leaderboard.reduce((s, l) => s + l.latest_score, 0) / leaderboard.length;
  const gradeF = leaderboard.filter(l => l.annoyance_grade === 'F').length;
  posts.push({
    type: 'insight',
    content: `We've now scanned ${leaderboard.length} Fortune 500 voice bots.

The average AI governance score: ${Math.round(avgScore)}/100.

${gradeF} companies got an F on our Annoyance Index.

The biggest pattern: companies deploy AI phone systems with zero governance layer.

No disclosure. No escape path. No resolution.

Just a bot that wastes your time and hopes you hang up.

The EU AI Act and NIST AI RMF both require transparency for customer-facing AI.

We publish every score publicly: voicegov.thebhtlabs.com

#AIGovernance #VoiceGov500 #CustomerExperience`,
  });

  // ═══ POST 5: Weekly Roundup ═══
  if (recentScans.length >= 5) {
    const weekScans = recentScans.slice(0, 10);
    posts.push({
      type: 'weekly_roundup',
      content: `This week's VoiceGov 500 scans:

${weekScans.map(s => `${s.name} (${s.sector}): ${s.governance_score}/100 ${s.annoyance_grade === 'A' ? '✓' : s.annoyance_grade === 'F' ? '✗' : '~'}`).join('\n')}

Total companies scanned: ${leaderboard.length}/500
Average governance score: ${Math.round(avgScore)}/100

The scanner calls real customer service lines, transcribes in real-time, and scores against 3 governance checks.

All automated. All public. Updated daily.

voicegov.thebhtlabs.com

#VoiceGov500 #AIGovernance #WeeklyUpdate`,
    });
  }

  // Save posts
  const outDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const filename = `linkedin-posts-${new Date().toISOString().split('T')[0]}.md`;
  const content = posts.map((p, i) => `## Post ${i + 1}: ${p.type}\n\n${p.content}\n\n---\n`).join('\n');
  fs.writeFileSync(path.join(outDir, filename), content);

  console.log(`\n✓ Generated ${posts.length} LinkedIn posts → output/${filename}\n`);
  posts.forEach((p, i) => console.log(`  ${i + 1}. ${p.type} (${p.content.length} chars)`));

  db.close();
  return posts;
}

generatePosts();
