const fs = require('fs');
const path = require('path');
const config = require('./sanitize.config');

const args = process.argv.slice(2);
const writeMode = args.includes('--write');
const dryRun = !writeMode;

if (dryRun) console.log('DRY-RUN 模式，文件不会变更。加 --write 实际替换。\n');

function sanitizeString(str, rules) {
  let s = str;
  for (const [from, to] of Object.entries(rules)) {
    s = s.split(from).join(to);
  }
  return s;
}

function walkAndSanitize(obj, rules, counts) {
  if (typeof obj === 'string') {
    let s = obj;
    for (const [from, to] of Object.entries(rules)) {
      const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = (s.match(re) || []).length;
      if (matches > 0) {
        const key = `${from} → ${to}`;
        counts[key] = (counts[key] || 0) + matches;
      }
      s = s.split(from).join(to);
    }
    return s;
  }
  if (Array.isArray(obj)) return obj.map(v => walkAndSanitize(v, rules, counts));
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) obj[k] = walkAndSanitize(obj[k], rules, counts);
  }
  return obj;
}

for (const file of config.files) {
  const filePath = path.join(__dirname, '..', file.path);
  if (!fs.existsSync(filePath)) { console.log(`  SKIP: ${file.path} not found`); continue; }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const orig = JSON.parse(raw);
  const backup = JSON.parse(raw); // deep copy
  const counts = {};

  if (file.path === 'data/rules.json') {
    // Special handling for rules.json: sanitize diseases[].name and diseases[].tips
    if (orig.diseases) {
      for (const d of orig.diseases) {
        d.name = sanitizeString(d.name, file.rules);
        d.tips = sanitizeString(d.tips, file.rules);
        if (d.prefer_ingredients && Array.isArray(d.prefer_ingredients)) d.prefer_ingredients = d.prefer_ingredients.map(v => sanitizeString(v, file.rules));
        if (d.avoid_ingredients && Array.isArray(d.avoid_ingredients)) d.avoid_ingredients = d.avoid_ingredients.map(v => sanitizeString(v, file.rules));
      }
    }
    // Count changes
    const origStr = JSON.stringify(backup);
    const newStr = JSON.stringify(orig);
    for (const [from, to] of Object.entries(file.rules)) {
      const origC = (origStr.match(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      const newC = (newStr.match(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (origC > newC) counts[`${from} → ${to}`] = origC - newC;
    }
  } else if (file.path === 'data/breeds.json') {
    const counts = {};
    for (const species of ['cat', 'dog']) {
      const list = orig.breeds[species];
      if (!list) continue;
      for (const b of list) {
        if (b.growthNeeds) {
          if (b.growthNeeds.tips) b.growthNeeds.tips = sanitizeString(b.growthNeeds.tips, file.rules);
          if (b.growthNeeds.healthRisks && Array.isArray(b.growthNeeds.healthRisks)) {
            b.growthNeeds.healthRisks = b.growthNeeds.healthRisks.map(v => sanitizeString(v, file.rules));
          }
        }
      }
    }
    const origStr = JSON.stringify(backup);
    const newStr = JSON.stringify(orig);
    for (const [from, to] of Object.entries(file.rules)) {
      const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const origC = (origStr.match(re) || []).length;
      const newC = (newStr.match(re) || []).length;
      if (origC > newC) counts[`${from} → ${to}`] = origC - newC;
    }
  } else {
    walkAndSanitize(orig, file.rules, counts);
  }

  console.log(`=== ${file.path} ===`);
  if (Object.keys(counts).length === 0) {
    console.log('  (no changes)');
  } else {
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v} 处`);
  }

  if (writeMode) {
    fs.writeFileSync(filePath, JSON.stringify(orig, null, 2), 'utf-8');
    console.log('  已写入');
  }
}

// Mirror files
if (writeMode) {
  for (const m of config.mirror) {
    const srcPath = path.join(__dirname, '..', m.src);
    const dstPath = path.join(__dirname, '..', m.dst);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, dstPath);
      console.log(`Mirrored: ${m.src} → ${m.dst}`);
    }
  }
}

if (dryRun) console.log('\nDRY-RUN 模式，文件未变更。加 --write 实际替换。');
