// Test du parsing utilisé dans src/app/api/fiches-horaires/route.js
function parseDesserviesRaw(rawDess) {
  const raw = rawDess || '';
  let dessRaw = [];
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) dessRaw = parsed.slice();
    else if (typeof parsed === 'string' && parsed.trim()) {
      if (/[,;]/.test(parsed)) dessRaw = parsed.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
      else dessRaw = [parsed.trim()];
    }
  } catch (e) {
    if (typeof raw === 'string' && raw.trim()) {
      const s = raw.trim();
      if (/[,;]/.test(s)) dessRaw = s.split(/[;,]+/).map(x => x.trim()).filter(Boolean);
      else if (/^\d+(?:\s+\d+)*$/.test(s)) dessRaw = s.split(/\s+/).map(x => x.trim()).filter(Boolean);
      else dessRaw = [s];
    } else dessRaw = [];
  }

  const normalized = dessRaw.map(x => String(x).trim()).filter(Boolean);
  const ids = normalized.length && normalized.every(s => /^\d+$/.test(s)) ? normalized.map(Number) : [];
  const names = ids.length ? [] : normalized;

  return { rawDess: rawDess, dessRaw, normalized, ids, names };
}

const tests = [
  '[1,2,3]',
  '["Dijon Ville","Beaune"]',
  '3,16',
  'Dijon Ville; Bourg-en-Bresse; Macon',
  '',
  ' [ "  5 ", "  7" ] ',
  'PARIS LUXEMBOURG, Lyon Part-Dieu',
  '12 34 56'
];

tests.forEach(t => {
  console.log('\n--- test:', JSON.stringify(t), '---');
  console.log(parseDesserviesRaw(t));
});
