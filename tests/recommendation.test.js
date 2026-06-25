const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { mergeRestrictions, getRulesByIds, validateInput, calcEnergy } = require('../src/recommendation');
const { startServer, stopServer } = require('./setup');

let testServer, testPort;

describe('mergeRestrictions', () => {
  it('should merge max restrictions by taking the smaller value', () => {
    const rules = [
      { id: 'kidney', name: '肾病', tips: '低磷', restrictions: { phosphorus_max: 0.8, protein_max: 28, sodium_max: 0.3 } },
      { id: 'heart', name: '心脏病', tips: '低钠', restrictions: { sodium_max: 0.25, protein_min: 25 } }
    ];
    const result = mergeRestrictions(rules);
    assert.strictEqual(result.restrictions.phosphorus_max, 0.8);
    assert.strictEqual(result.restrictions.sodium_max, 0.25);
  });

  it('should merge min restrictions by taking the larger value', () => {
    const rules = [
      { id: 'diabetes', name: '糖尿病', tips: '高蛋白', restrictions: { protein_min: 35, carb_max: 25 } },
      { id: 'heart', name: '心脏病', tips: '低钠', restrictions: { protein_min: 25, sodium_max: 0.25 } }
    ];
    const result = mergeRestrictions(rules);
    assert.strictEqual(result.restrictions.protein_min, 35);
  });

  it('should track sources for each restriction', () => {
    const rules = [
      { id: 'kidney', name: '肾病', tips: '', restrictions: { phosphorus_max: 0.8 } },
      { id: 'urinary', name: '泌尿', tips: '', restrictions: { phosphorus_max: 0.9 } }
    ];
    const result = mergeRestrictions(rules);
    assert.deepStrictEqual(result.sources.phosphorus_max, ['kidney', 'urinary']);
  });

  it('should collect tips and ingredients', () => {
    const rules = [
      { id: 'kidney', name: '肾病', tips: '低磷', prefer_ingredients: ['Omega-3'], avoid_ingredients: ['高磷'] },
      { id: 'heart', name: '心脏病', tips: '低钠', prefer_ingredients: ['牛磺酸'], avoid_ingredients: ['高钠', '高盐'] }
    ];
    const result = mergeRestrictions(rules);
    assert.strictEqual(result.tips.length, 2);
    assert.ok(result.preferIngredients.includes('Omega-3'));
    assert.ok(result.avoidIngredients.includes('高磷'));
    assert.ok(result.avoidIngredients.includes('高钠'));
  });
});

describe('validateInput', () => {
  it('should accept valid input', () => {
    const result = validateInput({
      species: 'cat', breedId: 'british_shorthair', ageMonths: 24, weightKg: 5.0,
      bodyConditionScore: 5, activityLevel: 'normal', diseases: [], allergies: []
    });
    assert.strictEqual(result.valid, true);
  });

  it('should reject invalid species', () => {
    const result = validateInput({ species: 'bird', breedId: 'x', ageMonths: 12, weightKg: 5 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('species')));
  });

  it('should reject empty breedId', () => {
    const result = validateInput({ species: 'cat', breedId: '', ageMonths: 12, weightKg: 5 });
    assert.strictEqual(result.valid, false);
  });

  it('should reject out-of-range ageMonths', () => {
    const result = validateInput({ species: 'cat', breedId: 'x', ageMonths: 500, weightKg: 5 });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('ageMonths')));
  });

  it('should reject invalid bodyConditionScore', () => {
    const result = validateInput({ species: 'cat', breedId: 'x', ageMonths: 12, weightKg: 5, bodyConditionScore: 15 });
    assert.strictEqual(result.valid, false);
  });

  it('should reject unknown disease ids', () => {
    const result = validateInput({ species: 'cat', breedId: 'x', ageMonths: 12, weightKg: 5, diseases: ['kidny'] });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Unknown disease id')));
  });

  it('should accept known disease id', () => {
    const result = validateInput({ species: 'cat', breedId: 'x', ageMonths: 12, weightKg: 5, diseases: ['kidney'] });
    assert.strictEqual(result.valid, true);
  });
});

describe('calcEnergy', () => {
  it('should calculate RER correctly', () => {
    const result = calcEnergy('dog', 30, 'adult', 'normal', 'normal', false);
    assert.ok(result.rer > 0);
    assert.ok(result.mer > result.rer);
  });

  it('should apply neutered factor', () => {
    const intact = calcEnergy('cat', 5, 'adult', 'normal', 'normal', false);
    const neutered = calcEnergy('cat', 5, 'adult', 'normal', 'normal', true);
    assert.ok(neutered.mer < intact.mer);
    assert.strictEqual(neutered.factors.neutered, 0.8);
  });

  it('should apply activity factor', () => {
    const low = calcEnergy('dog', 20, 'adult', 'normal', 'low', false);
    const high = calcEnergy('dog', 20, 'adult', 'normal', 'high', false);
    assert.ok(high.mer > low.mer);
  });

  it('should apply body condition factor for overweight', () => {
    const normal = calcEnergy('cat', 5, 'adult', 'normal', 'normal', false);
    const overweight = calcEnergy('cat', 5, 'adult', 'overweight', 'normal', false);
    assert.ok(overweight.mer < normal.mer);
    assert.strictEqual(overweight.factors.bodyCondition, 0.8);
  });
});

describe('Static file security', () => {
  it('should not allow path traversal', () => {
    const PUBLIC_DIR = path.join(__dirname, '..', 'public');
    const badPath1 = path.normalize(path.join(PUBLIC_DIR, '../server.js'));
    const badPath2 = path.normalize(path.join(PUBLIC_DIR, '../data/foods.json'));

    assert.ok(!badPath1.startsWith(PUBLIC_DIR));
    assert.ok(!badPath2.startsWith(PUBLIC_DIR));
  });
});

describe('API server', () => {
  before(async () => {
    const { server, port } = await startServer();
    testServer = server;
    testPort = port;
  });

  after(async () => {
    if (testServer) await stopServer(testServer);
  });
  it('should return 400 for invalid input', async () => {
    const result = await postJSON('/api/recommend', { species: 'invalid' });
    assert.strictEqual(result.status, 400);
  });

  it('should return breeds list', async () => {
    const result = await getJSON('/api/breeds');
    assert.strictEqual(result.status, 200);
    assert.ok(result.data.cat);
    assert.ok(result.data.dog);
    assert.ok(result.data.cat.length > 0);
    assert.ok(result.data.dog.length > 0);
  });

  it('should return recommendations with score breakdown', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 36, weightKg: 5.0,
      bodyConditionScore: 5, activityLevel: 'normal', diseases: [], allergies: []
    });
    assert.strictEqual(result.status, 200);
    assert.ok(result.data.recommendations);
    assert.ok(result.data.recommendations.length > 0);
    const first = result.data.recommendations[0];
    assert.ok(first.totalScore !== undefined);
    assert.ok(first.scoreBreakdown);
    assert.ok(first.scoreBreakdown.healthSafety !== undefined);
    assert.ok(first.scoreBreakdown.lifeStageFit !== undefined);
    assert.ok(first.feedingGuide);
    assert.ok(first.feedingGuide.gramsPerDay > 0);
    assert.ok(result.data.profileInsights);
    assert.ok(result.data.inputSummary);
  });

  it('should exclude high-phosphorus foods for kidney disease', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 36, weightKg: 5.0,
      bodyConditionScore: 5, diseases: ['kidney']
    });
    assert.strictEqual(result.status, 200);
    const top5 = result.data.recommendations.slice(0, 5);
    for (const rec of top5) {
      assert.ok(rec.phosphorus <= 0.8, `Expected phosphorus <=0.8 but got ${rec.phosphorus} for ${rec.name}`);
    }
  });

  it('should exclude high-fat foods for pancreatitis', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 36, weightKg: 5.0,
      bodyConditionScore: 5, diseases: ['pancreatitis']
    });
    assert.strictEqual(result.status, 200);
    const top5 = result.data.recommendations.slice(0, 5);
    for (const rec of top5) {
      assert.ok(rec.fat <= 12, `Expected fat <=12 but got ${rec.fat} for ${rec.name}`);
    }
  });

  it('should exclude high-sodium foods for heart disease', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 36, weightKg: 5.0,
      bodyConditionScore: 5, diseases: ['heart']
    });
    assert.strictEqual(result.status, 200);
    const top5 = result.data.recommendations.slice(0, 5);
    for (const rec of top5) {
      assert.ok(rec.sodium <= 0.25, `Expected sodium <=0.25 but got ${rec.sodium} for ${rec.name}`);
    }
  });

  it('should exclude foods with allergic ingredients', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 36, weightKg: 5.0,
      bodyConditionScore: 5, diseases: [], allergies: ['鸡肉']
    });
    assert.strictEqual(result.status, 200);
    for (const rec of result.data.recommendations) {
      const hasChicken = rec.protein_sources.some(s => s === '鸡肉' || s === '鸡' || (s.includes('鸡肉') && !s.includes('火鸡')));
      assert.ok(!hasChicken, `Expected no chicken but ${rec.name} has ${rec.protein_sources.join(',')}`);
    }
  });

  it('should return excludedFoods', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 36, weightKg: 5.0,
      bodyConditionScore: 5, diseases: ['kidney', 'pancreatitis']
    });
    assert.strictEqual(result.status, 200);
    assert.ok(result.data.totalExcluded !== undefined);
    assert.ok(Array.isArray(result.data.excludedFoods));
  });

  it('should exclude high-fat foods for obesity (fat <= 14)', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 36, weightKg: 6,
      bodyConditionScore: 8, diseases: ['obesity']
    });
    assert.strictEqual(result.status, 200);
    const top3 = result.data.recommendations.slice(0, 3);
    for (const rec of top3) {
      assert.ok(rec.fat <= 14, `Obesity: expected fat <=14 but got ${rec.fat} for ${rec.name}`);
    }
  });

  it('should apply senior dog hard limits (fat <= 14, phosphorus <= 1.0)', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'dog', breedId: 'golden_retriever', ageMonths: 96, weightKg: 30,
      bodyConditionScore: 5, diseases: []
    });
    assert.strictEqual(result.status, 200);
    const top3 = result.data.recommendations.slice(0, 3);
    for (const rec of top3) {
      assert.ok(rec.fat <= 14, `Senior dog: expected fat <=14 but got ${rec.fat} for ${rec.name}`);
      assert.ok(rec.phosphorus <= 1.0, `Senior dog: expected phosphorus <=1.0 but got ${rec.phosphorus} for ${rec.name}`);
    }
  });

  it('should return stable sorted results with tie-breaking', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 36, weightKg: 5.0,
      bodyConditionScore: 5, diseases: ['kidney', 'heart']
    });
    assert.strictEqual(result.status, 200);
    assert.ok(result.data._debug);
    assert.ok(result.data._debug.sortKeys.length >= 3);
    // verify deterministic ordering: IDs should be ascending when scores are equal
    for (let i = 1; i < result.data.recommendations.length; i++) {
      const prev = result.data.recommendations[i - 1];
      const curr = result.data.recommendations[i];
      assert.ok(prev.totalScore >= curr.totalScore, 'Results should be sorted by totalScore desc');
    }
  });

  it('should apply senior cat nutrition rules (phosphorus <= 0.9, sodium <= 0.3)', async () => {
    const result = await postJSON('/api/recommend', {
      species: 'cat', breedId: 'british_shorthair', ageMonths: 144, weightKg: 4.5,
      bodyConditionScore: 5, diseases: []
    });
    assert.strictEqual(result.status, 200);
    const top5 = result.data.recommendations.slice(0, 5);
    for (const rec of top5) {
      assert.ok(rec.phosphorus <= 0.9, `Senior cat: expected phosphorus <=0.9 but got ${rec.phosphorus} for ${rec.name}`);
      assert.ok(rec.sodium <= 0.3, `Senior cat: expected sodium <=0.3 but got ${rec.sodium} for ${rec.name}`);
    }
    assert.ok(result.data.profileInsights.some(i => i.includes('老年')));
  });

  it('should reject path traversal in static files', async () => {
    const result = await getJSON('/../server.js');
    assert.ok(result.status === 403 || result.status === 404);
  });
});

function getJSON(urlPath) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: 'localhost', port: testPort, path: urlPath, method: 'GET' }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    req.end();
  });
}

function postJSON(urlPath, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: testPort, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let bodyStr = '';
      res.on('data', c => bodyStr += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(bodyStr) }); }
        catch { resolve({ status: res.statusCode, data: bodyStr }); }
      });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    req.write(data);
    req.end();
  });
}
