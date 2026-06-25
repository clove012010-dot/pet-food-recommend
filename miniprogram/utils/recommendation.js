/* 小程序版推荐引擎 — 零 fs，数据通过 utils/*-data.js 加载 */
const { loadFoods } = require('./foods-data');
const { loadBreeds } = require('./breeds-data');
const { loadRules, loadLifeStageRules } = require('./rules-data');

let rulesCache = null, stageCache = null, foodsCache = null, breedsCache = null;

function getRules() { if (!rulesCache) { rulesCache = loadRules(); stageCache = loadLifeStageRules(); } return rulesCache; }
function getLifeStageRules(species, lifeStage) { getRules(); return (stageCache || []).filter(r => r.applicableTo === species && r.lifeStage === lifeStage); }
function getAllRules() { return getRules(); }
function getRulesByIds(ids) { if (!ids || !ids.length) return []; return getRules().filter(r => ids.includes(r.id)); }

function mergeRestrictions(ruleList) {
  const restrictions = {}, sources = {}, tips = [];
  const preferSet = new Set(), avoidSet = new Set();
  for (const rule of ruleList) {
    tips.push(rule.tips);
    if (rule.prefer_ingredients) rule.prefer_ingredients.forEach(i => preferSet.add(i));
    if (rule.avoid_ingredients) rule.avoid_ingredients.forEach(i => avoidSet.add(i));
    if (rule.restrictions) {
      for (const [key, value] of Object.entries(rule.restrictions)) {
        if (sources[key]) sources[key].push(rule.id); else sources[key] = [rule.id];
        if (restrictions[key] === undefined) restrictions[key] = value;
        else if (key.endsWith('_max') || key === 'protein_source_limit') restrictions[key] = Math.min(restrictions[key], value);
        else if (key.endsWith('_min')) restrictions[key] = Math.max(restrictions[key], value);
      }
    }
  }
  return { restrictions, sources, tips, preferIngredients: [...preferSet], avoidIngredients: [...avoidSet] };
}

function calcEnergy(species, weightKg, lifeStage, bodyCondition, activityLevel, isNeutered) {
  const rer = 70 * Math.pow(weightKg, 0.75);
  let lf;
  if (species === 'dog') { if (lifeStage === 'puppy') lf = 2.5; else if (lifeStage === 'senior') lf = 1.4; else lf = 1.6; }
  else { if (lifeStage === 'kitten') lf = 2.5; else if (lifeStage === 'senior') lf = 1.2; else lf = 1.2; }
  let nf = 1.0; if (isNeutered === true) nf = 0.8;
  let af = 1.0; if (activityLevel === 'low') af = 0.8; else if (activityLevel === 'high') af = 1.2;
  let bf = 1.0; if (bodyCondition === 'overweight') bf = 0.8; else if (bodyCondition === 'underweight') bf = 1.15;
  return { rer: Math.round(rer), mer: Math.round(rer * lf * nf * af * bf), factors: { lifeStage: lf, neutered: nf, activity: af, bodyCondition: bf } };
}

function calcHealthSafety(food, restrictions, warnings) {
  let score = 40;
  if (!restrictions) return score;
  if (restrictions.protein_max && food.protein > restrictions.protein_max) { const e = (food.protein - restrictions.protein_max) / restrictions.protein_max; score -= Math.round(Math.min(20, e * 50)); warnings.push('蛋白质' + food.protein + '%超出上限' + restrictions.protein_max + '%'); }
  if (restrictions.protein_min && food.protein < restrictions.protein_min) { const d = (restrictions.protein_min - food.protein) / restrictions.protein_min; score -= Math.round(Math.min(15, d * 50)); warnings.push('蛋白质' + food.protein + '%低于下限' + restrictions.protein_min + '%'); }
  if (restrictions.fat_max && food.fat > restrictions.fat_max) { const e = (food.fat - restrictions.fat_max) / restrictions.fat_max; score -= Math.round(Math.min(25, e * 50)); warnings.push('脂肪' + food.fat + '%超出上限' + restrictions.fat_max + '%'); }
  if (restrictions.fiber_min && food.fiber < restrictions.fiber_min) { warnings.push('纤维' + food.fiber + '%低于下限' + restrictions.fiber_min + '%'); score -= 5; }
  if (restrictions.phosphorus_max && food.phosphorus > restrictions.phosphorus_max) { const e = (food.phosphorus - restrictions.phosphorus_max) / restrictions.phosphorus_max; score -= Math.round(Math.min(20, e * 40)); warnings.push('磷' + food.phosphorus + '%超出上限' + restrictions.phosphorus_max + '%'); }
  if (restrictions.sodium_max && food.sodium > restrictions.sodium_max) { const e = (food.sodium - restrictions.sodium_max) / restrictions.sodium_max; score -= Math.round(Math.min(15, e * 40)); warnings.push('钠' + food.sodium + '%超出上限' + restrictions.sodium_max + '%'); }
  if (restrictions.magnesium_max && food.magnesium > restrictions.magnesium_max) { score -= Math.round(Math.min(15, (food.magnesium - restrictions.magnesium_max) / restrictions.magnesium_max * 40)); warnings.push('镁' + food.magnesium + '%超出上限' + restrictions.magnesium_max + '%'); }
  if (restrictions.calorie_max && food.calorie_per_100g > restrictions.calorie_max) { score -= 10; warnings.push('热量' + food.calorie_per_100g + '偏高'); }
  if (restrictions.carb_max) { const ash = typeof food.ash === 'number' ? food.ash : 6; const carb = 100 - food.protein - food.fat - food.fiber - food.moisture - ash; if (typeof food.ash !== 'number') warnings.push('灰分缺失'); if (carb > restrictions.carb_max) { score -= Math.round(Math.min(20, (carb - restrictions.carb_max) / restrictions.carb_max * 40)); warnings.push('碳水约' + Math.round(carb) + '%超出上限' + restrictions.carb_max + '%'); } }
  if (restrictions.protein_source_limit && food.protein_sources.length > restrictions.protein_source_limit) { score -= 30; warnings.push('含' + food.protein_sources.length + '种蛋白源'); }
  if (warnings.length > 0) score = Math.min(score, 25);
  return Math.max(0, score);
}

function calcLifeStageFit(food, lifeStage) { const fs = food.life_stage; if (fs === 'all') return 15; if (fs === lifeStage) return 15; if ((lifeStage === 'senior' && fs === 'adult') || (lifeStage === 'adult' && fs === 'senior')) return 12; return 0; }
function calcBreedFit(food, breedInfo, matchReasons, warnings) { let s = 10; if (!breedInfo || !breedInfo.growthNeeds) return s; const n = breedInfo.growthNeeds; if (n.preferTags) { for (const t of n.preferTags) { if (food.tags.some(ft => ft.includes(t) || t.includes(ft)) || food.desc.includes(t)) { s += 5; matchReasons.push('品种偏好·' + t); break; } } } if (n.avoidTags) { for (const t of n.avoidTags) { if (food.tags.some(ft => ft.includes(t) || t.includes(ft))) { s -= 5; warnings.push(t + '不适合' + breedInfo.fullName); } } } return Math.max(0, s); }

function calcNutritionFit(food, species, highProteinNeed, matchReasons, cautions, goodPoints) { let s = 8; if (food.protein >= (highProteinNeed ? 35 : 28)) { s += 4; matchReasons.push('蛋白' + food.protein + '%满足需求'); } if (food.fat >= 12 && food.fat <= 20) { s += 3; goodPoints.push('脂肪均衡'); } else if (food.fat < 8) { s -= 2; cautions.push('脂肪偏低'); } else if (food.fat > 25) { s -= 3; cautions.push('脂肪偏高'); } return Math.max(0, s); }

function calcPreferenceFit(food, budgetLevel, foodType, preferredGoal, preferredProteins, matchReasons) { let s = 0; if (budgetLevel && budgetLevel !== 'any') { const m = { low: ['低','中低'], medium: ['中','中低','中高'], high: ['高','中高'] }; if (m[budgetLevel] && m[budgetLevel].includes(food.price_range)) { s += 3; matchReasons.push('符合预算'); } } if (preferredGoal && (food.tags.some(t => t.includes(preferredGoal)) || food.desc.includes(preferredGoal))) { s += 2; matchReasons.push('符合护理目标'); } if (preferredProteins && preferredProteins.length > 0 && preferredProteins.some(pp => food.protein_sources.some(ps => ps.includes(pp) || pp.includes(ps)))) { s += 2; matchReasons.push('偏好蛋白源'); } return s; }

function calcDataConfidence(food) { return food.tags.some(t => ['原装进口','正规进口','天津产','上海产','国产'].includes(t)) ? 5 : 3; }

function scoreFood(food, profile) {
  const sb = {}, mr = [], ct = [], w = [], gp = [];
  sb.healthSafety = calcHealthSafety(food, profile.diseaseRestrictions, w);
  sb.lifeStageFit = calcLifeStageFit(food, profile.lifeStage);
  sb.breedFit = calcBreedFit(food, profile.breedInfo, mr, w);
  sb.nutritionFit = calcNutritionFit(food, profile.species, profile.highProteinNeed, mr, ct, gp);
  sb.preferenceFit = calcPreferenceFit(food, profile.budgetLevel, profile.foodType, profile.preferredGoal, profile.preferredProteins, mr);
  sb.dataConfidence = calcDataConfidence(food);
  const ts = Math.round(sb.healthSafety + sb.lifeStageFit + sb.breedFit + sb.nutritionFit + sb.preferenceFit + sb.dataConfidence);
  if (food.tags.includes('处方粮')) gp.push('处方级配方');
  if (food.tags.includes('无谷')) gp.push('无谷配方');
  return { totalScore: ts, scoreBreakdown: sb, matchReasons: mr, cautions: ct, warnings: w, goodPoints: gp };
}

function validateInput(input) {
  const e = [];
  if (input.species !== 'dog' && input.species !== 'cat') e.push('species must be dog/cat');
  if (!input.breedId || typeof input.breedId !== 'string' || !input.breedId.trim()) e.push('breedId required');
  if (typeof input.ageMonths !== 'number' || input.ageMonths < 1 || input.ageMonths > 300) e.push('ageMonths 1-300');
  if (typeof input.weightKg !== 'number' || input.weightKg < 0.5 || input.weightKg > 100) e.push('weightKg 0.5-100');
  if (input.diseases && !Array.isArray(input.diseases)) e.push('diseases must be array');
  if (input.diseases && input.diseases.length > 0) { const v = new Set(getAllRules().map(r => r.id)); const inv = input.diseases.filter(d => !v.has(d)); if (inv.length) e.push('Unknown disease: ' + inv.join(',')); }
  return e.length > 0 ? { valid: false, errors: e } : { valid: true };
}

function getBreedInfo(species, breedId) {
  if (!breedsCache) breedsCache = loadBreeds();
  const list = breedsCache[species];
  if (!list) return null;
  return list.find(b => b.id === breedId) || null;
}

function determineLifeStage(species, ageMonths) {
  if (species === 'dog') { if (ageMonths < 12) return 'puppy'; if (ageMonths > 84) return 'senior'; return 'adult'; }
  if (ageMonths < 12) return 'kitten'; if (ageMonths > 120) return 'senior'; return 'adult';
}

function recommend(input) {
  const v = validateInput(input);
  if (!v.valid) return { error: 'Invalid input', details: v.errors };

  const { species, breedId, ageMonths, weightKg, bodyConditionScore, activityLevel, diseases, allergies, sex, neutered, budgetLevel, foodType: ft, preferredGoal } = input;
  const lifeStage = determineLifeStage(species, ageMonths);
  const breedInfo = getBreedInfo(species, breedId);

  let bc = 'normal';
  if (bodyConditionScore != null) { if (bodyConditionScore <= 3) bc = 'underweight'; else if (bodyConditionScore >= 7) bc = 'overweight'; }
  const energy = calcEnergy(species, weightKg, lifeStage, bc, activityLevel || 'normal', neutered === true);

  let bcf = 1.0;
  if (breedInfo && breedInfo.growthNeeds && breedInfo.growthNeeds.recommendCalorieFactor) bcf = breedInfo.growthNeeds.recommendCalorieFactor;
  const am = Math.round(energy.mer * bcf);

  const drIds = diseases || [];
  const dr = getRulesByIds(drIds);
  let lsrSources = [];
  if (lifeStage === 'senior') { const sr = getLifeStageRules(species, lifeStage); if (sr.length) { dr.push(...sr); lsrSources = sr.map(r => r.id); } }
  const { restrictions, tips, preferIngredients, avoidIngredients } = mergeRestrictions(dr);

  const hpNeed = restrictions.protein_min && restrictions.protein_min > 28;
  if (!foodsCache) foodsCache = loadFoods();

  const candidates = [], excluded = [];
  const hasP = drIds.includes('pancreatitis'), hasK = drIds.includes('kidney'), hasH = drIds.includes('heart'), hasO = drIds.includes('obesity');
  let hef = null; if (hasP) hef = restrictions.fat_max; if (hasO && restrictions.fat_max != null) hef = hef != null ? Math.min(hef, restrictions.fat_max) : restrictions.fat_max;
  const hep = hasK ? restrictions.phosphorus_max : null;
  const hes = hasH ? restrictions.sodium_max : null;

  for (const food of foodsCache) {
    if (food.species !== species) { excluded.push({ food, reason: '物种不匹配' }); continue; }
    if ((lifeStage === 'puppy' || lifeStage === 'kitten') && food.life_stage !== 'puppy' && food.life_stage !== 'kitten' && food.life_stage !== 'all') { excluded.push({ food, reason: '阶段不匹配' }); continue; }
    if (hef != null && food.fat > hef) { excluded.push({ food, reason: '脂肪超标' }); continue; }
    if (hep != null && food.phosphorus > hep) { excluded.push({ food, reason: '磷超标' }); continue; }
    if (hes != null && food.sodium > hes) { excluded.push({ food, reason: '钠超标' }); continue; }
    if (allergies && allergies.length > 0) {
      const hit = allergies.some(a => food.protein_sources.some(ps => ps.includes(a) || a.includes(ps)));
      if (hit) { excluded.push({ food, reason: '含过敏原' }); continue; }
    }
    if (ft && ft.length > 0) {
      let ok = true;
      for (const f of ft) { if (f === 'freeze_dried' && !food.tags.some(t => t.includes('冻干') || t.includes('风干') || t.includes('生食'))) { ok = false; break; } else if (f === 'grain_free' && !food.tags.some(t => t.includes('无谷'))) { ok = false; break; } }
      if (!ok) { excluded.push({ food, reason: '品类不匹配' }); continue; }
    }
    candidates.push(food);
  }

  const profile = { species, lifeStage, breedInfo, diseaseRestrictions: restrictions, budgetLevel, foodType: ft, preferredGoal, highProteinNeed: hpNeed };
  const scored = candidates.map(f => ({ ...f, ...scoreFood(f, profile) }));
  scored.sort((a, b) => { if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore; if (b.scoreBreakdown.healthSafety !== a.scoreBreakdown.healthSafety) return b.scoreBreakdown.healthSafety - a.scoreBreakdown.healthSafety; return a.id - b.id; });

  const recs = scored.map(f => {
    const gpd = Math.round((am / f.calorie_per_100g) * 100);
    const mpd = (lifeStage === 'puppy' || lifeStage === 'kitten') ? 3 : 2;
    return { ...f, feedingGuide: { gramsPerDay: gpd, mealsPerDay: mpd, note: '基于MER ' + am + 'kcal/天' } };
  });

  const profileInsights = generateProfileInsights(breedInfo, drIds, lifeStage, bc, dr);

  return {
    inputSummary: { breedName: breedInfo ? breedInfo.fullName : breedId, species, ageMonths, weightKg, lifeStage },
    energy: { rer: energy.rer, mer: am, factors: energy.factors },
    profileInsights,
    recommendations: recs,
    totalMatched: scored.length,
    totalExcluded: excluded.length
  };
}

function generateProfileInsights(breedInfo, diseases, lifeStage, bodyCondition, diseaseRules) {
  const insights = [];
  if (breedInfo && breedInfo.growthNeeds) {
    if (breedInfo.growthNeeds.proneToObesity && bodyCondition === 'overweight') {
      insights.push(breedInfo.fullName + '属于易胖品种, 当前超重, 需严格控制热量摄入, 选择低脂体重管理配方。');
    } else if (breedInfo.growthNeeds.proneToObesity) {
      insights.push(breedInfo.fullName + '属于易胖品种, 请注意控制日粮热量, 选择适中脂肪的配方避免过度肥胖。');
    }
    if (breedInfo.growthNeeds.healthRisks && breedInfo.growthNeeds.healthRisks.length > 0) {
      insights.push(breedInfo.fullName + '常见健康风险: ' + breedInfo.growthNeeds.healthRisks.join('、') + '。');
    }
    if (breedInfo.growthNeeds.specialNutrients && breedInfo.growthNeeds.specialNutrients.length > 0) {
      insights.push('重点营养: ' + breedInfo.growthNeeds.specialNutrients.join('、') + '。');
    }
  }
  if (diseases && diseases.length > 0) {
    for (const rule of diseaseRules) insights.push('【' + rule.name + '】' + rule.tips);
  }
  if (lifeStage === 'senior') {
    insights.push('宠物已进入老年期, 已自动叠加老年营养规则(磷/钠/脂肪上限进一步收紧), 建议选择易消化、含关节保护和抗氧化剂的配方。');
  }
  if (bodyCondition === 'underweight') {
    insights.push('当前体重偏瘦, 建议选择高能量密度配方帮助恢复健康体重。');
  }
  return insights;
}

module.exports = { recommend, validateInput, calcEnergy, getRulesByIds, mergeRestrictions, getLifeStageRules, scoreFood, generateProfileInsights };
