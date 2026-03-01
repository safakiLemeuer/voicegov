// scripts/seed-targets.js — Pre-load 55 Fortune 500 targets
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'voicegov.db'));

const targets = [
  // Banks (10)
  { name: 'Chase', phone: '+18009359935', sector: 'banking', category: 'Big 4 Bank', fortune_rank: 1, website: 'chase.com' },
  { name: 'Bank of America', phone: '+18004321000', sector: 'banking', category: 'Big 4 Bank', fortune_rank: 2, website: 'bankofamerica.com' },
  { name: 'Wells Fargo', phone: '+18008693557', sector: 'banking', category: 'Big 4 Bank', fortune_rank: 3, website: 'wellsfargo.com' },
  { name: 'Citibank', phone: '+18009504472', sector: 'banking', category: 'Big 4 Bank', fortune_rank: 4, website: 'citi.com' },
  { name: 'US Bank', phone: '+18008722657', sector: 'banking', category: 'Regional Bank', fortune_rank: 5, website: 'usbank.com' },
  { name: 'PNC Bank', phone: '+18887622265', sector: 'banking', category: 'Regional Bank', fortune_rank: 6, website: 'pnc.com' },
  { name: 'Truist', phone: '+18442874820', sector: 'banking', category: 'Regional Bank', fortune_rank: 7, website: 'truist.com' },
  { name: 'Capital One', phone: '+18004819239', sector: 'banking', category: 'Credit Card', fortune_rank: 8, website: 'capitalone.com' },
  { name: 'TD Bank', phone: '+18889517522', sector: 'banking', category: 'Regional Bank', fortune_rank: 9, website: 'td.com' },
  { name: 'Goldman Sachs Marcus', phone: '+18555300505', sector: 'banking', category: 'Investment Bank', fortune_rank: 10, website: 'marcus.com' },

  // Insurance (10)
  { name: 'State Farm', phone: '+18007828332', sector: 'insurance', category: 'P&C Insurance', fortune_rank: 36, website: 'statefarm.com' },
  { name: 'GEICO', phone: '+18008614532', sector: 'insurance', category: 'Auto Insurance', fortune_rank: 37, website: 'geico.com' },
  { name: 'Progressive', phone: '+18007766483', sector: 'insurance', category: 'Auto Insurance', fortune_rank: 38, website: 'progressive.com' },
  { name: 'Allstate', phone: '+18002554700', sector: 'insurance', category: 'P&C Insurance', fortune_rank: 39, website: 'allstate.com' },
  { name: 'USAA', phone: '+18005318722', sector: 'insurance', category: 'Military Insurance', fortune_rank: 40, website: 'usaa.com' },
  { name: 'Liberty Mutual', phone: '+18002908711', sector: 'insurance', category: 'P&C Insurance', fortune_rank: 41, website: 'libertymutual.com' },
  { name: 'Nationwide', phone: '+18772636657', sector: 'insurance', category: 'P&C Insurance', fortune_rank: 42, website: 'nationwide.com' },
  { name: 'MetLife', phone: '+18006381274', sector: 'insurance', category: 'Life Insurance', fortune_rank: 43, website: 'metlife.com' },
  { name: 'Prudential', phone: '+18007782255', sector: 'insurance', category: 'Life Insurance', fortune_rank: 44, website: 'prudential.com' },
  { name: 'Aetna', phone: '+18008727898', sector: 'insurance', category: 'Health Insurance', fortune_rank: 45, website: 'aetna.com' },

  // Airlines (5)
  { name: 'United Airlines', phone: '+18008648331', sector: 'airlines', category: 'Major Airline', fortune_rank: 48, website: 'united.com' },
  { name: 'Delta Airlines', phone: '+18002211212', sector: 'airlines', category: 'Major Airline', fortune_rank: 49, website: 'delta.com' },
  { name: 'American Airlines', phone: '+18004337300', sector: 'airlines', category: 'Major Airline', fortune_rank: 50, website: 'aa.com' },
  { name: 'Southwest Airlines', phone: '+18004359792', sector: 'airlines', category: 'Major Airline', fortune_rank: 51, website: 'southwest.com' },
  { name: 'JetBlue', phone: '+18005385285', sector: 'airlines', category: 'Major Airline', fortune_rank: 52, website: 'jetblue.com' },

  // Telecom (5)
  { name: 'AT&T', phone: '+18003310500', sector: 'telecom', category: 'Major Carrier', fortune_rank: 13, website: 'att.com' },
  { name: 'Verizon', phone: '+18009220204', sector: 'telecom', category: 'Major Carrier', fortune_rank: 14, website: 'verizon.com' },
  { name: 'T-Mobile', phone: '+18009378997', sector: 'telecom', category: 'Major Carrier', fortune_rank: 15, website: 't-mobile.com' },
  { name: 'Comcast Xfinity', phone: '+18009346489', sector: 'telecom', category: 'Cable/ISP', fortune_rank: 16, website: 'xfinity.com' },
  { name: 'Spectrum', phone: '+18558574931', sector: 'telecom', category: 'Cable/ISP', fortune_rank: 17, website: 'spectrum.com' },

  // Healthcare (5)
  { name: 'UnitedHealth Group', phone: '+18008278937', sector: 'healthcare', category: 'Health Insurance', fortune_rank: 5, website: 'uhc.com' },
  { name: 'CVS Health', phone: '+18007464786', sector: 'healthcare', category: 'Pharmacy', fortune_rank: 6, website: 'cvs.com' },
  { name: 'Cigna', phone: '+18009971654', sector: 'healthcare', category: 'Health Insurance', fortune_rank: 12, website: 'cigna.com' },
  { name: 'Humana', phone: '+18004574708', sector: 'healthcare', category: 'Health Insurance', fortune_rank: 20, website: 'humana.com' },
  { name: 'Kaiser Permanente', phone: '+18004644000', sector: 'healthcare', category: 'HMO', fortune_rank: 25, website: 'kaiserpermanente.org' },

  // Retail (7)
  { name: 'Amazon', phone: '+18882804331', sector: 'retail', category: 'E-Commerce', fortune_rank: 2, website: 'amazon.com' },
  { name: 'Walmart', phone: '+18009256278', sector: 'retail', category: 'Big Box', fortune_rank: 1, website: 'walmart.com' },
  { name: 'Target', phone: '+18004400680', sector: 'retail', category: 'Big Box', fortune_rank: 30, website: 'target.com' },
  { name: 'Costco', phone: '+18007742678', sector: 'retail', category: 'Warehouse', fortune_rank: 11, website: 'costco.com' },
  { name: 'Home Depot', phone: '+18004663337', sector: 'retail', category: 'Home Improvement', fortune_rank: 18, website: 'homedepot.com' },
  { name: "Lowe's", phone: '+18004456937', sector: 'retail', category: 'Home Improvement', fortune_rank: 19, website: 'lowes.com' },
  { name: 'Best Buy', phone: '+18882378289', sector: 'retail', category: 'Electronics', fortune_rank: 64, website: 'bestbuy.com' },

  // Tech (5)
  { name: 'Apple', phone: '+18002752273', sector: 'tech', category: 'Consumer Tech', fortune_rank: 3, website: 'apple.com' },
  { name: 'Microsoft', phone: '+18006427676', sector: 'tech', category: 'Enterprise Tech', fortune_rank: 15, website: 'microsoft.com' },
  { name: 'Google', phone: '+18554524622', sector: 'tech', category: 'Search/Cloud', fortune_rank: 8, website: 'google.com' },
  { name: 'Dell', phone: '+18006249897', sector: 'tech', category: 'Hardware', fortune_rank: 31, website: 'dell.com' },
  { name: 'HP', phone: '+18004746836', sector: 'tech', category: 'Hardware', fortune_rank: 32, website: 'hp.com' },

  // Utilities (3)
  { name: 'Duke Energy', phone: '+18007770246', sector: 'utilities', category: 'Electric', fortune_rank: 120, website: 'duke-energy.com' },
  { name: 'Southern Company', phone: '+18002413952', sector: 'utilities', category: 'Electric', fortune_rank: 121, website: 'southerncompany.com' },
  { name: 'Dominion Energy', phone: '+18669663788', sector: 'utilities', category: 'Electric', fortune_rank: 122, website: 'dominionenergy.com' },

  // Federal (5)
  { name: 'IRS', phone: '+18008291040', sector: 'federal', category: 'Tax', fortune_rank: 0, website: 'irs.gov' },
  { name: 'Social Security Admin', phone: '+18007721213', sector: 'federal', category: 'Benefits', fortune_rank: 0, website: 'ssa.gov' },
  { name: 'Medicare', phone: '+18006334227', sector: 'federal', category: 'Healthcare', fortune_rank: 0, website: 'medicare.gov' },
  { name: 'VA Benefits', phone: '+18008271000', sector: 'federal', category: 'Veterans', fortune_rank: 0, website: 'va.gov' },
  { name: 'FEMA', phone: '+18006213362', sector: 'federal', category: 'Emergency', fortune_rank: 0, website: 'fema.gov' },
];

const insert = db.prepare(`INSERT OR IGNORE INTO targets (name, phone, sector, category, fortune_rank, website, status)
  VALUES (?, ?, ?, ?, ?, ?, 'pending')`);

const tx = db.transaction(() => {
  for (const t of targets) {
    insert.run(t.name, t.phone, t.sector, t.category, t.fortune_rank, t.website);
  }
});

tx();
console.log(`✓ Seeded ${targets.length} targets`);

const count = db.prepare('SELECT COUNT(*) as c FROM targets').get();
console.log(`✓ Total targets in DB: ${count.c}`);
db.close();
