// analyzer/scorer.js — VoiceGov 3-Check Governance Scoring Engine
// Scores voice bots on: Escape (40%), Disclosure (35%), Resolution (25%)

const { calculateAnnoyance, gradeAnnoyance } = require('./annoyance');

/**
 * Score a completed scan
 * Returns governance score 0-100 and component breakdowns
 */
function scoreScan(scanData) {
  const {
    transcript = '',
    duration_sec = 0,
    escape_time_sec = null,
    human_reached = false,
  } = scanData;

  const lower = transcript.toLowerCase();

  // ═══ CHECK 1: ESCAPE (40%) ═══
  // Can the caller reach a human? How fast?
  let escapeScore = 0;
  if (human_reached && escape_time_sec !== null) {
    if (escape_time_sec <= 30) escapeScore = 40;      // Excellent
    else if (escape_time_sec <= 60) escapeScore = 32;  // Good
    else if (escape_time_sec <= 90) escapeScore = 24;  // Fair
    else if (escape_time_sec <= 120) escapeScore = 16; // Poor
    else escapeScore = 8;                               // Terrible but reachable
  } else if (lower.includes('press 0') || lower.includes('press zero') || lower.includes('say agent') || lower.includes('say representative')) {
    escapeScore = 12; // Option exists but wasn't reached
  }
  // else 0 — no escape path detected

  // ═══ CHECK 2: DISCLOSURE (35%) ═══
  // Does the bot identify itself as AI/automated?
  let disclosureScore = 0;
  const disclosurePhrases = [
    'automated system', 'virtual assistant', 'ai assistant',
    'automated attendant', 'this call may be recorded',
    'this is an automated', 'powered by ai', 'artificial intelligence',
    'intelligent virtual', 'digital assistant', 'chatbot',
    'voice assistant', 'automated service',
  ];
  const disclosuresFound = disclosurePhrases.filter(p => lower.includes(p));

  if (disclosuresFound.length >= 2) disclosureScore = 35;      // Multiple disclosures
  else if (disclosuresFound.length === 1) disclosureScore = 25; // Basic disclosure
  else if (lower.includes('recorded') || lower.includes('monitoring')) disclosureScore = 10; // Partial
  // else 0 — no disclosure

  // Recording consent check (bonus within disclosure)
  if (lower.includes('this call may be recorded') || lower.includes('this call is being recorded')) {
    disclosureScore = Math.min(35, disclosureScore + 5);
  }

  // ═══ CHECK 3: RESOLUTION (25%) ═══
  // Does the bot actually help or just loop?
  let resolutionScore = 0;
  const resolutionPositive = [
    'how can i help', 'what can i help you with', 'your account',
    'i can help you with', 'let me look that up', 'i found',
    'your balance is', 'your claim', 'your order', 'your reservation',
    'transferred to', 'connecting you', 'one moment',
  ];
  const resolutionNegative = [
    'i didn\'t understand', 'please try again', 'invalid',
    'i\'m sorry', 'i cannot', 'not available', 'please hold',
    'all representatives are busy', 'call back later',
    'outside of business hours', 'please visit our website',
  ];

  const positives = resolutionPositive.filter(p => lower.includes(p)).length;
  const negatives = resolutionNegative.filter(p => lower.includes(p)).length;

  if (positives >= 3 && negatives <= 1) resolutionScore = 25;
  else if (positives >= 2) resolutionScore = 18;
  else if (positives >= 1) resolutionScore = 12;
  else if (negatives >= 3) resolutionScore = 3;
  else resolutionScore = 6; // Some interaction happened

  // ═══ TOTAL ═══
  const governanceScore = escapeScore + disclosureScore + resolutionScore;

  // Annoyance Index
  const annoyanceIndex = calculateAnnoyance(scanData);
  const { grade: annoyanceGrade, label: annoyanceLabel } = gradeAnnoyance(annoyanceIndex);

  return {
    overall: governanceScore,
    escape: { score: escapeScore, max: 40, pct: Math.round((escapeScore / 40) * 100) },
    disclosure: { score: disclosureScore, max: 35, pct: Math.round((disclosureScore / 35) * 100), found: disclosuresFound },
    resolution: { score: resolutionScore, max: 25, pct: Math.round((resolutionScore / 25) * 100) },
    annoyance: { index: annoyanceIndex, grade: annoyanceGrade, label: annoyanceLabel },
    meta: {
      duration_sec,
      escape_time_sec,
      human_reached,
      transcript_length: transcript.length,
    },
  };
}

module.exports = { scoreScan };
