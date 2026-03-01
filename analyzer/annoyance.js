// analyzer/annoyance.js — Annoyance Index™ Calculator
// Measures how frustrating a voice bot experience is for a real human caller

/**
 * Calculate Annoyance Index on a 0-100 scale
 * Lower = less annoying = better
 * 
 * Factors:
 *   - Time to reach human (40% weight)
 *   - Number of menu layers (20%)
 *   - Repetition of prompts (15%)
 *   - Dead ends / loops (15%)
 *   - Overall call duration vs resolution (10%)
 */
function calculateAnnoyance(scanData) {
  const {
    duration_sec = 0,
    escape_time_sec = null,
    human_reached = false,
    transcript = '',
    menu_depth = 0,
  } = scanData;

  let score = 0;

  // 1. Time to human (40%) — 0-30s = great, 30-60s = ok, 60-120s = bad, 120+s = terrible
  if (!human_reached || escape_time_sec === null) {
    score += 40; // Never reached a human = max annoyance
  } else if (escape_time_sec <= 30) {
    score += 0;
  } else if (escape_time_sec <= 60) {
    score += 10;
  } else if (escape_time_sec <= 120) {
    score += 25;
  } else {
    score += 35;
  }

  // 2. Menu depth (20%) — each layer adds frustration
  const depthScore = Math.min(20, menu_depth * 5);
  score += depthScore;

  // 3. Repetition (15%) — detect repeated phrases in transcript
  const lines = transcript.toLowerCase().split('\n').filter(l => l.trim());
  const unique = new Set(lines);
  const repetitionRatio = lines.length > 0 ? 1 - (unique.size / lines.length) : 0;
  score += Math.round(repetitionRatio * 15);

  // 4. Dead ends (15%) — phrases indicating loops or no resolution
  const deadEndPhrases = [
    'i didn\'t understand', 'please try again', 'invalid option',
    'let me transfer you', 'please hold', 'all representatives are busy',
    'your call is important', 'please stay on the line',
    'i\'m sorry, i didn\'t catch that', 'press or say',
  ];
  const lower = transcript.toLowerCase();
  const deadEnds = deadEndPhrases.filter(p => lower.includes(p)).length;
  score += Math.min(15, deadEnds * 3);

  // 5. Duration vs resolution (10%)
  if (duration_sec > 120 && !human_reached) {
    score += 10;
  } else if (duration_sec > 90) {
    score += 5;
  } else if (duration_sec > 60) {
    score += 2;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Convert annoyance score to letter grade
 * A = Excellent (0-15)   — fast, clean, human available
 * B = Good (16-30)       — minor friction
 * C = Fair (31-50)       — noticeable frustration
 * D = Poor (51-70)       — significant annoyance
 * F = Terrible (71-100)  — voice bot hell
 */
function gradeAnnoyance(score) {
  if (score <= 15) return { grade: 'A', label: 'Excellent', color: '#0D9488' };
  if (score <= 30) return { grade: 'B', label: 'Good', color: '#3B82F6' };
  if (score <= 50) return { grade: 'C', label: 'Fair', color: '#F59E0B' };
  if (score <= 70) return { grade: 'D', label: 'Poor', color: '#F97316' };
  return { grade: 'F', label: 'Terrible', color: '#EF4444' };
}

module.exports = { calculateAnnoyance, gradeAnnoyance };
