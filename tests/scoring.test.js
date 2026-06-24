const { describe, it } = require('node:test');
const assert = require('node:assert');
const { scoreFood } = require('../src/recommendation/scoring');

describe('calcHealthSafety', () => {
  const baseProfile = { species: 'cat', lifeStage: 'adult', breedInfo: null };

  it('should return 40 when no restrictions', () => {
    const result = scoreFood(makeFood({ protein: 30, fat: 15, phosphorus: 1.0 }), { ...baseProfile, diseaseRestrictions: null });
    assert.strictEqual(result.scoreBreakdown.healthSafety, 40);
  });

  it('should cap at 25 when warnings exist', () => {
    const profile = { ...baseProfile, diseaseRestrictions: { phosphorus_max: 0.5 } };
    const result = scoreFood(makeFood({ phosphorus: 1.2 }), profile);
    assert.ok(result.scoreBreakdown.healthSafety <= 25);
    assert.ok(result.warnings.some(w => w.includes('磷')));
  });

  it('should penalize excess protein', () => {
    const profile = { ...baseProfile, diseaseRestrictions: { protein_max: 28 } };
    const result = scoreFood(makeFood({ protein: 40 }), profile);
    assert.ok(result.scoreBreakdown.healthSafety < 40);
    assert.ok(result.warnings.some(w => w.includes('蛋白质')));
  });

  it('should penalize excess fat', () => {
    const profile = { ...baseProfile, diseaseRestrictions: { fat_max: 12 } };
    const result = scoreFood(makeFood({ fat: 20 }), profile);
    assert.ok(result.warnings.some(w => w.includes('脂肪')));
    assert.ok(result.scoreBreakdown.healthSafety < 40);
  });

  it('should penalize multiple protein sources for allergy restriction', () => {
    const profile = { ...baseProfile, diseaseRestrictions: { protein_source_limit: 1 } };
    const result = scoreFood(makeFood({ protein_sources: ['鸡肉', '牛肉', '鱼肉'] }), profile);
    assert.ok(result.warnings.some(w => w.includes('蛋白源')));
    assert.ok(result.scoreBreakdown.healthSafety < 25);
  });
});

describe('calcLifeStageFit', () => {
  it('should return 15 for all life stage', () => {
    const result = scoreFood(makeFood({ life_stage: 'all' }), { species: 'cat', lifeStage: 'kitten' });
    assert.strictEqual(result.scoreBreakdown.lifeStageFit, 15);
  });

  it('should return 15 for exact match', () => {
    const result = scoreFood(makeFood({ life_stage: 'adult' }), { species: 'cat', lifeStage: 'adult' });
    assert.strictEqual(result.scoreBreakdown.lifeStageFit, 15);
  });

  it('should return 12 for adult<->senior interchange', () => {
    const result = scoreFood(makeFood({ life_stage: 'adult' }), { species: 'cat', lifeStage: 'senior' });
    assert.strictEqual(result.scoreBreakdown.lifeStageFit, 12);
  });

  it('should return 0 for puppy feed given adult dog', () => {
    const result = scoreFood(makeFood({ life_stage: 'puppy' }), { species: 'dog', lifeStage: 'adult' });
    assert.strictEqual(result.scoreBreakdown.lifeStageFit, 0);
  });
});

describe('calcBreedFit', () => {
  const bshBreed = {
    fullName: '英国短毛猫',
    growthNeeds: {
      proneToObesity: true,
      preferTags: ['体重管理'],
      avoidTags: ['高热量'],
      recommendCalorieFactor: 0.85
    }
  };

  it('should boost score when food matches breed prefer tag', () => {
    const result = scoreFood(makeFood({ tags: ['国产', '体重管理', '室内猫'] }), { species: 'cat', lifeStage: 'adult', breedInfo: bshBreed });
    assert.ok(result.scoreBreakdown.breedFit > 10);
    assert.ok(result.matchReasons.some(r => r.includes('体重管理')));
  });

  it('should penalize when food hits avoid tag', () => {
    const result = scoreFood(makeFood({ tags: ['高蛋白', '高热量'] }), { species: 'cat', lifeStage: 'adult', breedInfo: bshBreed });
    assert.ok(result.warnings.some(w => w.includes('高热量')) || result.scoreBreakdown.breedFit <= 10);
  });

  it('should return default 10 when no breed info', () => {
    const result = scoreFood(makeFood(), { species: 'cat', lifeStage: 'adult', breedInfo: null });
    assert.strictEqual(result.scoreBreakdown.breedFit, 10);
  });
});

describe('calcNutritionFit', () => {
  it('should boost for high protein when highProteinNeed', () => {
    const result = scoreFood(makeFood({ protein: 38 }), { species: 'cat', lifeStage: 'adult', breedInfo: null, highProteinNeed: true });
    assert.ok(result.scoreBreakdown.nutritionFit > 8);
    assert.ok(result.matchReasons.some(r => r.includes('蛋白质')));
  });

  it('should boost for balanced fat (12-20%)', () => {
    const result = scoreFood(makeFood({ fat: 15 }), { species: 'cat', lifeStage: 'adult', breedInfo: null });
    assert.ok(result.goodPoints.some(p => p.includes('均衡')));
  });

  it('should warn for fat > 25%', () => {
    const result = scoreFood(makeFood({ fat: 30 }), { species: 'cat', lifeStage: 'adult', breedInfo: null });
    assert.ok(result.cautions.some(c => c.includes('脂肪')));
  });

  it('should warn for fat < 8%', () => {
    const result = scoreFood(makeFood({ fat: 6 }), { species: 'cat', lifeStage: 'adult', breedInfo: null });
    assert.ok(result.cautions.some(c => c.includes('偏低')));
  });
});

describe('calcPreferenceFit', () => {
  it('should score budget match', () => {
    const result = scoreFood(makeFood({ price_range: '中' }), { species: 'cat', lifeStage: 'adult', breedInfo: null, budgetLevel: 'medium' });
    assert.ok(result.scoreBreakdown.preferenceFit > 0);
    assert.ok(result.matchReasons.some(r => r.includes('预算')));
  });

  it('should score preferred goal match', () => {
    const result = scoreFood(makeFood({ tags: ['体重管理'], desc: '减重专用' }), { species: 'cat', lifeStage: 'adult', breedInfo: null, preferredGoal: '减重' });
    assert.ok(result.scoreBreakdown.preferenceFit > 0);
    assert.ok(result.matchReasons.some(r => r.includes('护理目标')));
  });

  it('should score preferred protein match', () => {
    const result = scoreFood(makeFood({ protein_sources: ['鸡肉', '三文鱼'] }), { species: 'cat', lifeStage: 'adult', breedInfo: null, preferredProteins: ['三文鱼'] });
    assert.ok(result.matchReasons.some(r => r.includes('偏好蛋白源')));
  });
});

describe('calcDataConfidence', () => {
  it('should return 5 for verified source tags', () => {
    const result = scoreFood(makeFood({ tags: ['原装进口'] }), { species: 'cat', lifeStage: 'adult', breedInfo: null });
    assert.strictEqual(result.scoreBreakdown.dataConfidence, 5);
  });

  it('should return 5 for 国产 tag', () => {
    const result = scoreFood(makeFood({ tags: ['国产'] }), { species: 'cat', lifeStage: 'adult', breedInfo: null });
    assert.strictEqual(result.scoreBreakdown.dataConfidence, 5);
  });

  it('should return 3 for no verified tag', () => {
    const result = scoreFood(makeFood({ tags: ['高蛋白', '处方粮'] }), { species: 'cat', lifeStage: 'adult', breedInfo: null });
    assert.strictEqual(result.scoreBreakdown.dataConfidence, 3);
  });
});

describe('carb estimation with ash', () => {
  it('should use real ash when available for carb calculation', () => {
    const profile = { species: 'cat', lifeStage: 'adult', breedInfo: null, diseaseRestrictions: { carb_max: 25 } };
    // food with ash=8, protein=38, fat=18, fiber=3, moisture=10 => carb = 100-38-18-3-10-8 = 23 (<25, should not warn about carb excess)
    const result = scoreFood(makeFood({ protein: 38, fat: 18, fiber: 3, moisture: 10, ash: 8 }), profile);
    const hasCarbExcess = result.warnings.some(w => w.includes('碳水') && w.includes('超出'));
    assert.ok(!hasCarbExcess, 'Should not have carb excess with real ash');
  });

  it('should warn ash missing when carb_max evaluated and ash not present', () => {
    const profile = { species: 'cat', lifeStage: 'adult', breedInfo: null, diseaseRestrictions: { carb_max: 20 } };
    const result = scoreFood(makeFood({ protein: 30, fat: 16, fiber: 3, moisture: 8 }), profile);
    const hasAshWarning = result.warnings.some(w => w.includes('灰分') && w.includes('缺失'));
    assert.ok(hasAshWarning, 'Should warn about missing ash data');
  });
});

function makeFood(overrides = {}) {
  return {
    id: 999,
    brand: '测试',
    name: '测试粮',
    species: 'cat',
    life_stage: 'adult',
    breed_size: 'all',
    protein: 34,
    fat: 16,
    fiber: 3,
    moisture: 8,
    phosphorus: 1.0,
    sodium: 0.3,
    magnesium: 0.08,
    calorie_per_100g: 380,
    protein_sources: ['鸡肉'],
    tags: [],
    price_range: '中',
    desc: '测试用粮',
    ...overrides
  };
}
