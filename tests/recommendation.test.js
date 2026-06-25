const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mergeRestrictions, getRulesByIds, validateInput, calcEnergy, recommend } = require('../src/recommendation');

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
    const rules = [{ id: 'diabetes', name: '糖尿病', tips: '', restrictions: { protein_min: 35, carb_max: 25 } }, { id: 'heart', name: '心脏病', tips: '', restrictions: { protein_min: 25 } }];
    assert.strictEqual(mergeRestrictions(rules).restrictions.protein_min, 35);
  });
  it('should track sources', () => {
    const r = mergeRestrictions([{ id: 'kidney', name: '', tips: '', restrictions: { phosphorus_max: 0.8 } }, { id: 'urinary', name: '', tips: '', restrictions: { phosphorus_max: 0.9 } }]);
    assert.deepStrictEqual(r.sources.phosphorus_max, ['kidney', 'urinary']);
  });
  it('should collect tips and ingredients', () => {
    const r = mergeRestrictions([{ id: 'k', name: '', tips: 'a', prefer_ingredients: ['Omega-3'], avoid_ingredients: ['高磷'] }, { id: 'h', name: '', tips: 'b', prefer_ingredients: ['牛磺酸'], avoid_ingredients: ['高钠'] }]);
    assert.strictEqual(r.tips.length, 2);
    assert.ok(r.preferIngredients.includes('Omega-3'));
  });
});

describe('validateInput', () => {
  it('should accept valid input', () => assert.strictEqual(validateInput({ species:'cat',breedId:'british_shorthair',ageMonths:24,weightKg:5,diseases:[],allergies:[] }).valid, true));
  it('should reject invalid species', () => { const r = validateInput({ species:'bird',breedId:'x',ageMonths:12,weightKg:5 }); assert.ok(!r.valid); });
  it('should reject empty breedId', () => { const r = validateInput({ species:'cat',breedId:'',ageMonths:12,weightKg:5 }); assert.ok(!r.valid); });
  it('should reject out-of-range ageMonths', () => { const r = validateInput({ species:'cat',breedId:'x',ageMonths:500,weightKg:5 }); assert.ok(!r.valid); });
  it('should reject invalid bodyConditionScore', () => { const r = validateInput({ species:'cat',breedId:'x',ageMonths:12,weightKg:5,bodyConditionScore:15 }); assert.ok(!r.valid); });
  it('should reject unknown disease ids', () => { const r = validateInput({ species:'cat',breedId:'x',ageMonths:12,weightKg:5,diseases:['kidny'] }); assert.ok(!r.valid); assert.ok(r.errors.some(e => e.includes('Unknown'))); });
  it('should accept known disease id', () => { const r = validateInput({ species:'cat',breedId:'x',ageMonths:12,weightKg:5,diseases:['kidney'] }); assert.ok(r.valid); });
  it('should handle optional fields', () => assert.strictEqual(validateInput({ species:'dog',breedId:'golden_retriever',ageMonths:36,weightKg:30 }).valid, true));
});

describe('calcEnergy', () => {
  it('should calculate RER correctly', () => { const r = calcEnergy('dog',30,'adult','normal','normal',false); assert.ok(r.rer>0); assert.ok(r.mer>r.rer); });
  it('should apply neutered factor', () => { const i = calcEnergy('cat',5,'adult','normal','normal',false); const n = calcEnergy('cat',5,'adult','normal','normal',true); assert.ok(n.mer<i.mer); assert.strictEqual(n.factors.neutered,0.8); });
  it('should apply activity factor', () => { assert.ok(calcEnergy('dog',20,'adult','normal','high',false).mer>calcEnergy('dog',20,'adult','normal','low',false).mer); });
  it('should apply body condition factor', () => { const n = calcEnergy('cat',5,'adult','normal','normal',false); const o = calcEnergy('cat',5,'adult','overweight','normal',false); assert.ok(o.mer<n.mer); });
});

describe('Static file security', () => {
  it('should not allow path traversal', () => {
    const p = path.join(__dirname, '..', 'public');
    assert.ok(!path.normalize(path.join(p, '../server.js')).startsWith(p));
  });
});

describe('recommend (offline)', () => {
  it('should return error for invalid input', () => assert.ok(recommend({ species:'invalid' }).error));
  it('should return recommendations', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:36,weightKg:5,bodyConditionScore:5,activityLevel:'normal',diseases:[],allergies:[] }); assert.ok(r.recommendations.length>0); assert.ok(r.recommendations[0].feedingGuide.gramsPerDay>0); });
  it('kidney: top5 phosphorus <= 0.8', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:36,weightKg:5,bodyConditionScore:5,diseases:['kidney'] }); r.recommendations.slice(0,5).forEach(rec => assert.ok(rec.phosphorus<=0.8)); });
  it('pancreatitis: top5 fat <= 12', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:36,weightKg:5,bodyConditionScore:5,diseases:['pancreatitis'] }); r.recommendations.slice(0,5).forEach(rec => assert.ok(rec.fat<=12)); });
  it('heart: top5 sodium <= 0.25', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:36,weightKg:5,bodyConditionScore:5,diseases:['heart'] }); r.recommendations.slice(0,5).forEach(rec => assert.ok(rec.sodium<=0.25)); });
  it('allergy: exclude chicken', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:36,weightKg:5,bodyConditionScore:5,diseases:[],allergies:['鸡肉'] }); r.recommendations.forEach(rec => assert.ok(!rec.protein_sources.some(s=>s==='鸡肉'||s==='鸡'||(s.includes('鸡肉')&&!s.includes('火鸡'))))); });
  it('should return excludedFoods', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:36,weightKg:5,bodyConditionScore:5,diseases:['kidney','pancreatitis'] }); assert.ok(r.totalExcluded!==undefined); });
  it('obesity: top3 fat <= 14', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:36,weightKg:6,bodyConditionScore:8,diseases:['obesity'] }); r.recommendations.slice(0,3).forEach(rec => assert.ok(rec.fat<=14)); });
  it('senior dog: fat<=14 phosphorus<=1.0', () => { const r = recommend({ species:'dog',breedId:'golden_retriever',ageMonths:96,weightKg:30,bodyConditionScore:5,diseases:[] }); r.recommendations.slice(0,3).forEach(rec => { assert.ok(rec.fat<=14); assert.ok(rec.phosphorus<=1.0); }); });
  it('sort stability', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:36,weightKg:5,bodyConditionScore:5,diseases:['kidney','heart'] }); for(let i=1;i<r.recommendations.length;i++) assert.ok(r.recommendations[i-1].totalScore>=r.recommendations[i].totalScore); });
  it('senior cat: phosphorus<=0.9 sodium<=0.3', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:144,weightKg:4.5,bodyConditionScore:5,diseases:[] }); r.recommendations.slice(0,5).forEach(rec => { assert.ok(rec.phosphorus<=0.9); assert.ok(rec.sodium<=0.3); }); });
  it('kitten: >=3 recommendations', () => { const r = recommend({ species:'cat',breedId:'british_shorthair',ageMonths:4,weightKg:1.2,bodyConditionScore:5,diseases:[] }); assert.ok(r.recommendations.length>=3); });
});
