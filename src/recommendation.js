/* ===== energy ===== */
const { loadRules, loadLifeStageRules, loadFoods, loadBreeds } = require('./data');

function calcEnergy(species, weightKg, lifeStage, bodyCondition, activityLevel, isNeutered) {
  const rer = 70 * Math.pow(weightKg, 0.75);

  let lifeStageFactor;
  if (species === 'dog') {
    if (lifeStage === 'puppy') lifeStageFactor = 2.5;
    else if (lifeStage === 'senior') lifeStageFactor = 1.4;
    else lifeStageFactor = 1.6;
  } else {
    if (lifeStage === 'kitten') lifeStageFactor = 2.5;
    else if (lifeStage === 'senior') lifeStageFactor = 1.2;
    else lifeStageFactor = 1.2;
  }

  let neuteredFactor = 1.0;
  if (isNeutered === true) neuteredFactor = 0.8;

  let activityFactor = 1.0;
  if (activityLevel === 'low') activityFactor = 0.8;
  else if (activityLevel === 'high') activityFactor = 1.2;

  let bodyConditionFactor = 1.0;
  if (bodyCondition === 'overweight') bodyConditionFactor = 0.8;
  else if (bodyCondition === 'underweight') bodyConditionFactor = 1.15;

  const mer = rer * lifeStageFactor * neuteredFactor * activityFactor * bodyConditionFactor;
  return {
    rer: Math.round(rer),
    mer: Math.round(mer),
    factors: { lifeStage: lifeStageFactor, neutered: neuteredFactor, activity: activityFactor, bodyCondition: bodyConditionFactor }
  };
}

/* ===== rules ===== */
let rulesDataCache = null;
let stageRulesDataCache = null;

function getRules() {
  if (!rulesDataCache) {
    rulesDataCache = loadRules();
    stageRulesDataCache = loadLifeStageRules();
  }
  return rulesDataCache;
}

function getLifeStageRules(species, lifeStage) {
  getRules();
  return (stageRulesDataCache || []).filter(r => r.applicableTo === species && r.lifeStage === lifeStage);
}

function getAllRules() { return getRules(); }

function getRulesByIds(ids) {
  if (!ids || !ids.length) return [];
  return getRules().filter(r => ids.includes(r.id));
}

function mergeRestrictions(ruleList) {
  const restrictions = {}, sources = {}, tips = [];
  const preferIngredientsSet = new Set(), avoidIngredientsSet = new Set();

  for (const rule of ruleList) {
    tips.push(rule.tips);
    if (rule.prefer_ingredients) rule.prefer_ingredients.forEach(i => preferIngredientsSet.add(i));
    if (rule.avoid_ingredients) rule.avoid_ingredients.forEach(i => avoidIngredientsSet.add(i));
    if (rule.restrictions) {
      for (const [key, value] of Object.entries(rule.restrictions)) {
        if (sources[key]) sources[key].push(rule.id);
        else sources[key] = [rule.id];
        if (restrictions[key] === undefined) restrictions[key] = value;
        else if (key.endsWith('_max') || key === 'protein_source_limit') restrictions[key] = Math.min(restrictions[key], value);
        else if (key.endsWith('_min')) restrictions[key] = Math.max(restrictions[key], value);
      }
    }
  }
  return { restrictions, sources, tips, preferIngredients: [...preferIngredientsSet], avoidIngredients: [...avoidIngredientsSet] };
}

/* ===== scoring ===== */
function calcHealthSafety(food, restrictions, warnings) {
  let score = 40;
  if (!restrictions) return score;
  if (restrictions.protein_max && food.protein > restrictions.protein_max) {
    const excess = (food.protein - restrictions.protein_max) / restrictions.protein_max;
    score -= Math.round(Math.min(20, excess * 50));
    warnings.push(`蛋白质${food.protein}%超出推荐上限${restrictions.protein_max}%`);
  }
  if (restrictions.protein_min && food.protein < restrictions.protein_min) {
    const deficit = (restrictions.protein_min - food.protein) / restrictions.protein_min;
    score -= Math.round(Math.min(15, deficit * 50));
    warnings.push(`蛋白质${food.protein}%低于推荐下限${restrictions.protein_min}%`);
  }
  if (restrictions.fat_max && food.fat > restrictions.fat_max) {
    const excess = (food.fat - restrictions.fat_max) / restrictions.fat_max;
    score -= Math.round(Math.min(25, excess * 50));
    warnings.push(`脂肪${food.fat}%超出推荐上限${restrictions.fat_max}%`);
  }
  if (restrictions.fiber_min && food.fiber < restrictions.fiber_min) {
    warnings.push(`纤维素${food.fiber}%低于推荐下限${restrictions.fiber_min}%`);
    score -= 5;
  }
  if (restrictions.phosphorus_max && food.phosphorus > restrictions.phosphorus_max) {
    const excess = (food.phosphorus - restrictions.phosphorus_max) / restrictions.phosphorus_max;
    score -= Math.round(Math.min(20, excess * 40));
    warnings.push(`磷${food.phosphorus}%超出推荐上限${restrictions.phosphorus_max}%`);
  }
  if (restrictions.sodium_max && food.sodium > restrictions.sodium_max) {
    const excess = (food.sodium - restrictions.sodium_max) / restrictions.sodium_max;
    score -= Math.round(Math.min(15, excess * 40));
    warnings.push(`钠${food.sodium}%超出推荐上限${restrictions.sodium_max}%`);
  }
  if (restrictions.magnesium_max && food.magnesium > restrictions.magnesium_max) {
    const excess = (food.magnesium - restrictions.magnesium_max) / restrictions.magnesium_max;
    score -= Math.round(Math.min(15, excess * 40));
    warnings.push(`镁${food.magnesium}%超出推荐上限${restrictions.magnesium_max}%`);
  }
  if (restrictions.calorie_max && food.calorie_per_100g > restrictions.calorie_max) {
    score -= 10;
    warnings.push(`热量${food.calorie_per_100g}kcal/100g偏高`);
  }
  if (restrictions.carb_max) {
    const ash = (typeof food.ash === 'number') ? food.ash : 6;
    const carb = 100 - food.protein - food.fat - food.fiber - food.moisture - ash;
    if (typeof food.ash !== 'number') warnings.push('灰分数据缺失，碳水按默认6%估算');
    if (carb > restrictions.carb_max) {
      const excess = (carb - restrictions.carb_max) / restrictions.carb_max;
      score -= Math.round(Math.min(20, excess * 40));
      warnings.push(`碳水约${Math.round(carb)}%超出推荐上限${restrictions.carb_max}%`);
    }
  }
  if (restrictions.protein_source_limit) {
    if (food.protein_sources.length > restrictions.protein_source_limit) {
      score -= 30;
      warnings.push(`含${food.protein_sources.length}种蛋白源，建议单一蛋白源`);
    }
  }
  if (warnings.length > 0) score = Math.min(score, 25);
  return Math.max(0, score);
}

function calcLifeStageFit(food, lifeStage) {
  const foodStage = food.life_stage;
  if (foodStage === 'all') return 15;
  if (foodStage === lifeStage) return 15;
  if ((lifeStage === 'senior' && foodStage === 'adult') || (lifeStage === 'adult' && foodStage === 'senior')) return 12;
  return 0;
}

function calcBreedFit(food, breedInfo, matchReasons, warnings) {
  let score = 10;
  if (!breedInfo || !breedInfo.growthNeeds) return score;
  const needs = breedInfo.growthNeeds;
  if (needs.preferTags) {
    for (const t of needs.preferTags) {
      if (food.tags.some(ft => ft.includes(t) || t.includes(ft)) || food.desc.includes(t)) {
        score += 5;
        matchReasons.push(`符合${breedInfo.fullName}偏好·${t}`);
        break;
      }
    }
  }
  if (needs.avoidTags) {
    for (const t of needs.avoidTags) {
      if (food.tags.some(ft => ft.includes(t) || t.includes(ft))) {
        score -= 5;
        warnings.push(`${t}可能不适合${breedInfo.fullName}`);
      }
    }
  }
  return Math.max(0, score);
}

function calcNutritionFit(food, species, highProteinNeed, matchReasons, cautions, goodPoints) {
  let score = 8;
  const proteinThreshold = highProteinNeed ? 35 : 28;
  if (food.protein >= proteinThreshold) {
    score += 4;
    matchReasons.push(`蛋白质${food.protein}%满足${species === 'cat' ? '猫咪' : '犬只'}营养需求`);
  }
  if (food.fat >= 12 && food.fat <= 20) {
    score += 3;
    goodPoints.push('脂肪含量均衡(12-20%)');
  } else if (food.fat < 8) {
    score -= 2;
    cautions.push(`脂肪含量偏低(${food.fat}%)`);
  } else if (food.fat > 25) {
    score -= 3;
    cautions.push(`脂肪含量偏高(${food.fat}%)`);
  }
  return Math.max(0, score);
}

function calcPreferenceFit(food, budgetLevel, foodType, preferredGoal, preferredProteins, matchReasons) {
  let score = 0;
  if (budgetLevel && budgetLevel !== 'any') {
    const budgetMap = { low: ['低', '中低'], medium: ['中', '中低', '中高'], high: ['高', '中高'] };
    if (budgetMap[budgetLevel] && budgetMap[budgetLevel].includes(food.price_range)) {
      score += 3;
      matchReasons.push('符合预算偏好');
    }
  }
  if (preferredGoal) {
    if (food.tags.some(t => t.includes(preferredGoal)) || food.desc.includes(preferredGoal)) {
      score += 2;
      matchReasons.push('符合护理目标');
    }
  }
  if (preferredProteins && preferredProteins.length > 0) {
    if (preferredProteins.some(pp => food.protein_sources.some(ps => ps.includes(pp) || pp.includes(ps)))) {
      score += 2;
      matchReasons.push('含有偏好蛋白源');
    }
  }
  return score;
}

function calcDataConfidence(food) {
  const verifiedTags = ['原装进口', '正规进口', '天津产', '上海产', '国产'];
  return food.tags.some(t => verifiedTags.includes(t)) ? 5 : 3;
}

function scoreFood(food, profile) {
  const { species, lifeStage, breedInfo, diseaseRestrictions, budgetLevel, foodType, preferredGoal, preferredProteins } = profile;
  const scoreBreakdown = {}, matchReasons = [], cautions = [], warnings = [], goodPoints = [];

  scoreBreakdown.healthSafety = calcHealthSafety(food, diseaseRestrictions, warnings);
  scoreBreakdown.lifeStageFit = calcLifeStageFit(food, lifeStage);
  scoreBreakdown.breedFit = calcBreedFit(food, breedInfo, matchReasons, warnings);
  scoreBreakdown.nutritionFit = calcNutritionFit(food, species, profile.highProteinNeed, matchReasons, cautions, goodPoints);
  scoreBreakdown.preferenceFit = calcPreferenceFit(food, budgetLevel, foodType, preferredGoal, preferredProteins, matchReasons);
  scoreBreakdown.dataConfidence = calcDataConfidence(food);

  const totalScore = Math.round(scoreBreakdown.healthSafety + scoreBreakdown.lifeStageFit + scoreBreakdown.breedFit + scoreBreakdown.nutritionFit + scoreBreakdown.preferenceFit + scoreBreakdown.dataConfidence);

  if (food.tags.includes('处方粮')) goodPoints.push('处方级配方');
  if (food.tags.includes('无谷')) goodPoints.push('无谷配方');
  if (food.tags.includes('高蛋白') || food.protein >= 35) goodPoints.push('高蛋白配方');
  if (food.price_range === '中低' || food.price_range === '中') goodPoints.push('价格友好');

  return { totalScore, scoreBreakdown, matchReasons, cautions, warnings, goodPoints };
}

/* ===== recommendation engine ===== */
let foodsData = null;
let breedsData = null;

function getFoods() {
  if (!foodsData) foodsData = loadFoods();
  return foodsData;
}

function getBreeds() {
  if (!breedsData) breedsData = loadBreeds();
  return breedsData;
}

function getBreedInfo(species, breedId) {
  const list = getBreeds()[species];
  if (!list) return null;
  return list.find(b => b.id === breedId) || null;
}

function validateInput(input) {
  const errors = [];
  const { species, breedId, ageMonths, weightKg, bodyConditionScore, activityLevel,
    diseases, allergies, avoidIngredients, preferredProteins, sex, neutered,
    targetWeightKg, budgetLevel, foodType } = input;

  if (species !== 'dog' && species !== 'cat') errors.push('species must be "dog" or "cat"');
  if (!breedId || typeof breedId !== 'string' || breedId.trim() === '') errors.push('breedId must be a non-empty string');
  if (typeof ageMonths !== 'number' || ageMonths < 1 || ageMonths > 300) errors.push('ageMonths must be a number between 1 and 300');
  if (typeof weightKg !== 'number' || weightKg < 0.5 || weightKg > 100) errors.push('weightKg must be a number between 0.5 and 100');
  if (bodyConditionScore !== undefined && bodyConditionScore !== null) {
    if (typeof bodyConditionScore !== 'number' || bodyConditionScore < 1 || bodyConditionScore > 9) errors.push('bodyConditionScore must be between 1-9');
  }
  if (activityLevel !== undefined && activityLevel !== null) {
    if (!['low', 'normal', 'high'].includes(activityLevel)) errors.push('activityLevel must be low/normal/high');
  }
  if (diseases !== undefined && diseases !== null && !Array.isArray(diseases)) errors.push('diseases must be an array');
  if (Array.isArray(diseases) && diseases.length > 0) {
    const validIds = new Set(getAllRules().map(r => r.id));
    const invalid = diseases.filter(d => !validIds.has(d));
    if (invalid.length) errors.push(`Unknown disease id: ${invalid.join(',')}`);
  }
  if (allergies !== undefined && allergies !== null && !Array.isArray(allergies)) errors.push('allergies must be an array');
  if (avoidIngredients !== undefined && avoidIngredients !== null && !Array.isArray(avoidIngredients)) errors.push('avoidIngredients must be an array');
  if (preferredProteins !== undefined && preferredProteins !== null && !Array.isArray(preferredProteins)) errors.push('preferredProteins must be an array');
  if (sex !== undefined && sex !== null && !['male', 'female', 'unknown'].includes(sex)) errors.push('sex must be male/female/unknown');
  if (neutered !== undefined && neutered !== null && ![true, false, 'unknown'].includes(neutered)) errors.push('neutered must be true/false/unknown');
  if (targetWeightKg !== undefined && targetWeightKg !== null && (typeof targetWeightKg !== 'number' || targetWeightKg <= 0)) errors.push('targetWeightKg must be a positive number');
  if (budgetLevel !== undefined && budgetLevel !== null && !['low', 'medium', 'high', 'any'].includes(budgetLevel)) errors.push('budgetLevel must be low/medium/high/any');
  if (foodType !== undefined && foodType !== null) {
    if (!Array.isArray(foodType)) errors.push('foodType must be an array');
    else { const valid = ['dry', 'freeze_dried', 'grain_free', 'wet']; for (const ft of foodType) if (!valid.includes(ft)) errors.push(`foodType invalid: ${ft}`); }
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

function determineLifeStage(species, ageMonths) {
  if (species === 'dog') {
    if (ageMonths < 12) return 'puppy';
    if (ageMonths > 84) return 'senior';
    return 'adult';
  }
  if (ageMonths < 12) return 'kitten';
  if (ageMonths > 120) return 'senior';
  return 'adult';
}

function getBreedSize(species, breedId) {
  const info = getBreedInfo(species, breedId);
  return info ? info.size : 'medium';
}

function generateProfileInsights(breedInfo, diseases, lifeStage, bodyCondition, diseaseRules) {
  const insights = [];
  if (breedInfo && breedInfo.growthNeeds) {
    if (breedInfo.growthNeeds.proneToObesity && bodyCondition === 'overweight') {
      insights.push(`${breedInfo.fullName}属于易胖品种，当前超重，需严格控制热量摄入，选择低脂体重管理配方。`);
    } else if (breedInfo.growthNeeds.proneToObesity) {
      insights.push(`${breedInfo.fullName}属于易胖品种，请注意控制日粮热量，选择适中脂肪的配方避免过度肥胖。`);
    }
    if (breedInfo.growthNeeds.healthRisks && breedInfo.growthNeeds.healthRisks.length > 0) {
      insights.push(`${breedInfo.fullName}常见健康风险：${breedInfo.growthNeeds.healthRisks.join('、')}。`);
    }
  }
  if (diseases && diseases.length > 0) {
    for (const rule of diseaseRules) insights.push(`【${rule.name}】${rule.tips}`);
  }
  if (lifeStage === 'senior') {
    insights.push('宠物已进入老年期，已自动叠加老年营养规则（磷/钠/脂肪上限进一步收紧），建议选择易消化、含关节保护成分和抗氧化剂的配方。');
  }
  if (bodyCondition === 'underweight') {
    insights.push('当前体重偏瘦，建议选择高能量密度配方帮助恢复健康体重。');
  }
  return insights;
}

function recommend(input) {
  const validation = validateInput(input);
  if (!validation.valid) return { error: 'Invalid input', details: validation.errors };

  const {
    species, breedId, ageMonths, weightKg, bodyConditionScore,
    activityLevel, diseases, allergies, avoidIngredients,
    preferredProteins, sex, neutered,
    budgetLevel, foodType: foodTypeFilters, preferredGoal
  } = input;

  const lifeStage = determineLifeStage(species, ageMonths);
  const breedInfo = getBreedInfo(species, breedId);
  const breedName = breedInfo ? breedInfo.fullName : breedId;
  const breedSize = getBreedSize(species, breedId);

  let bodyCondition = 'normal';
  if (bodyConditionScore !== undefined && bodyConditionScore !== null) {
    if (bodyConditionScore <= 3) bodyCondition = 'underweight';
    else if (bodyConditionScore >= 7) bodyCondition = 'overweight';
  }

  const isNeutered = neutered === true;
  const energy = calcEnergy(species, weightKg, lifeStage, bodyCondition, activityLevel || 'normal', isNeutered);

  let breedCalorieFactor = 1.0;
  if (breedInfo && breedInfo.growthNeeds && breedInfo.growthNeeds.recommendCalorieFactor) {
    breedCalorieFactor = breedInfo.growthNeeds.recommendCalorieFactor;
  }
  const adjustedMer = Math.round(energy.mer * breedCalorieFactor);

  const diseaseIds = diseases || [];
  const diseaseRules = getRulesByIds(diseaseIds);

  // senior life stage rules
  let lifeStageRuleSources = [];
  if (lifeStage === 'senior') {
    const stageRules = getLifeStageRules(species, lifeStage);
    if (stageRules.length > 0) {
      diseaseRules.push(...stageRules);
      lifeStageRuleSources = stageRules.map(r => r.id);
    }
  }

  const { restrictions, sources, tips, preferIngredients, avoidIngredients: ruleAvoidIngredients } =
    mergeRestrictions(diseaseRules);

  const highProteinNeed = restrictions.protein_min && restrictions.protein_min > 28;

  const allFoods = getFoods();
  const candidates = [];
  const excludedFoods = [];

  const allAllergies = [...(allergies || []), ...(avoidIngredients || [])];
  const allAvoid = [...(ruleAvoidIngredients || [])];

  const hasPancreatitis = diseaseIds.includes('pancreatitis');
  const hasKidney = diseaseIds.includes('kidney');
  const hasHeart = diseaseIds.includes('heart');
  const hasObesity = diseaseIds.includes('obesity');

  let hardExcludeFat = null;
  if (hasPancreatitis) hardExcludeFat = restrictions.fat_max;
  if (hasObesity && restrictions.fat_max !== undefined) hardExcludeFat = hardExcludeFat !== null ? Math.min(hardExcludeFat, restrictions.fat_max) : restrictions.fat_max;

  let hardExcludePhosphorus = hasKidney ? restrictions.phosphorus_max : null;
  let hardExcludeSodium = hasHeart ? restrictions.sodium_max : null;

  // senior life stage rules also enforce fat/phosphorus/sodium hard limits
  let srHardExcludeFat = null, srHardExcludePhosphorus = null, srHardExcludeSodium = null;
  if (lifeStageRuleSources.length > 0) {
    const stageRules = getLifeStageRules(species, lifeStage);
    for (const sr of stageRules) {
      if (sr.restrictions) {
        if (sr.restrictions.fat_max !== undefined) srHardExcludeFat = srHardExcludeFat !== null ? Math.min(srHardExcludeFat, sr.restrictions.fat_max) : sr.restrictions.fat_max;
        if (sr.restrictions.phosphorus_max !== undefined) srHardExcludePhosphorus = srHardExcludePhosphorus !== null ? Math.min(srHardExcludePhosphorus, sr.restrictions.phosphorus_max) : sr.restrictions.phosphorus_max;
        if (sr.restrictions.sodium_max !== undefined) srHardExcludeSodium = srHardExcludeSodium !== null ? Math.min(srHardExcludeSodium, sr.restrictions.sodium_max) : sr.restrictions.sodium_max;
      }
    }
  }
  if (srHardExcludeFat !== null) hardExcludeFat = hardExcludeFat !== null ? Math.min(hardExcludeFat, srHardExcludeFat) : srHardExcludeFat;
  if (srHardExcludePhosphorus !== null) hardExcludePhosphorus = hardExcludePhosphorus !== null ? Math.min(hardExcludePhosphorus, srHardExcludePhosphorus) : srHardExcludePhosphorus;
  if (srHardExcludeSodium !== null) hardExcludeSodium = hardExcludeSodium !== null ? Math.min(hardExcludeSodium, srHardExcludeSodium) : srHardExcludeSodium;

  for (const food of allFoods) {
    if (food.species !== species) { excludedFoods.push({ food, reason: `物种不匹配（${food.species} vs ${species}）` }); continue; }

    if (lifeStage === 'puppy' || lifeStage === 'kitten') {
      if (food.life_stage !== 'puppy' && food.life_stage !== 'kitten' && food.life_stage !== 'all') {
        excludedFoods.push({ food, reason: `生命周期不匹配：需要puppy/kitten/all，当前为${food.life_stage}` }); continue;
      }
    } else if (lifeStage === 'senior') {
      if (food.life_stage === 'puppy' || food.life_stage === 'kitten') {
        excludedFoods.push({ food, reason: `生命周期不匹配：senior不适合puppy/kitten粮` }); continue;
      }
    }

    if (species === 'dog' && breedSize && food.breed_size !== 'all' && food.breed_size !== breedSize) {
      excludedFoods.push({ food, reason: `体型不匹配：${breedSize}型犬需要${breedSize}/all` }); continue;
    }

    if (allAllergies.length > 0) {
      const allergyHit = allAllergies.some(a =>
        food.protein_sources.some(ps => {
          if (ps === a) return true;
          if (a === '鸡肉' && (ps.includes('鸡肉') || ps === '鸡')) return true;
          if (a === '牛肉' && (ps.includes('牛肉') || ps === '牛')) return true;
          if (a === '鱼' && ps.includes('鱼')) return true;
          if (a === '谷物' && (ps.includes('小麦') || ps.includes('玉米') || ps.includes('大米') || ps.includes('燕麦') || ps.includes('大麦'))) return true;
          if (a === '鸡蛋' && (ps.includes('蛋') && !ps.includes('火鸡'))) return true;
          if (a === '乳制品' && ps.includes('乳')) return true;
          return ps.includes(a);
        }) || (a === '谷物' && (food.desc.includes('小麦') || food.desc.includes('玉米') || food.desc.includes('谷物')))
      );
      if (allergyHit) { excludedFoods.push({ food, reason: '含过敏原或被规避的成分' }); continue; }
    }

    if (allAvoid.length > 0) {
      const avoidHit = allAvoid.some(a =>
        food.protein_sources.some(ps => ps.includes(a) || a.includes(ps)) ||
        food.desc.includes(a) || food.tags.some(t => t.includes(a) || a.includes(t))
      );
      if (avoidHit) { excludedFoods.push({ food, reason: '含疾病需规避的成分' }); continue; }
    }

    if (hardExcludeFat !== null && food.fat > hardExcludeFat) { excludedFoods.push({ food, reason: `脂肪${food.fat}%超过限制${hardExcludeFat}%（胰腺炎）` }); continue; }
    if (hardExcludePhosphorus !== null && food.phosphorus > hardExcludePhosphorus) { excludedFoods.push({ food, reason: `磷${food.phosphorus}%超过限制${hardExcludePhosphorus}%（肾病）` }); continue; }
    if (hardExcludeSodium !== null && food.sodium > hardExcludeSodium) { excludedFoods.push({ food, reason: `钠${food.sodium}%超过限制${hardExcludeSodium}%（心脏病）` }); continue; }

    if (foodTypeFilters && foodTypeFilters.length > 0) {
      let passes = true;
      for (const ft of foodTypeFilters) {
        if (ft === 'freeze_dried') { if (!food.tags.some(t => t.includes('冻干') || t.includes('风干') || t.includes('生食'))) { passes = false; break; } }
        else if (ft === 'wet') { if (!food.tags.some(t => t.includes('湿粮') || t.includes('罐头') || t.includes('餐包'))) { passes = false; break; } }
        else if (ft === 'grain_free') { if (!food.tags.some(t => t.includes('无谷'))) { passes = false; break; } }
      }
      if (!passes) { excludedFoods.push({ food, reason: `不符合粮食品类筛选：${foodTypeFilters.join('+')}` }); continue; }
    }

    candidates.push(food);
  }

  const profile = { species, lifeStage, breedInfo, diseaseRestrictions: restrictions, budgetLevel, foodType: foodTypeFilters, preferredGoal, preferredProteins, highProteinNeed };

  const scored = candidates.map(food => ({ ...food, ...scoreFood(food, profile) }));

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.scoreBreakdown.healthSafety !== a.scoreBreakdown.healthSafety) return b.scoreBreakdown.healthSafety - a.scoreBreakdown.healthSafety;
    const blA = a.scoreBreakdown.breedFit + a.scoreBreakdown.lifeStageFit;
    const blB = b.scoreBreakdown.breedFit + b.scoreBreakdown.lifeStageFit;
    if (blB !== blA) return blB - blA;
    return a.id - b.id;
  });

  const recommendations = scored.map(food => {
    const gramsPerDay = Math.round((adjustedMer / food.calorie_per_100g) * 100);
    const mealsPerDay = (lifeStage === 'puppy' || lifeStage === 'kitten') ? 3 : 2;
    return { ...food, feedingGuide: { gramsPerDay, mealsPerDay, note: `基于MER ${adjustedMer}kcal/天，热量密度${food.calorie_per_100g}kcal/100g，建议每日${mealsPerDay}餐` } };
  });

  const profileInsights = generateProfileInsights(breedInfo, diseaseIds, lifeStage, bodyCondition, diseaseRules);

  return {
    inputSummary: { breedName, species, ageMonths, weightKg, lifeStage, bodyCondition, activityLevel: activityLevel || 'normal' },
    profileInsights,
    energy: { rer: energy.rer, mer: adjustedMer, factors: energy.factors },
    diseaseInfo: tips.length > 0 ? { ids: diseaseIds, tips, preferIngredients, avoidIngredients: ruleAvoidIngredients, restrictions, lifeStageRules: lifeStageRuleSources.length > 0 ? lifeStageRuleSources : undefined } : null,
    recommendations,
    excludedFoods: excludedFoods.slice(0, 10).map(e => ({ id: e.food.id, brand: e.food.brand, name: e.food.name, reason: e.reason })),
    totalMatched: scored.length,
    totalExcluded: excludedFoods.length,
    _debug: { sortKeys: ['totalScore', 'healthSafety', 'breedFit+lifeStageFit', 'id'] }
  };
}

module.exports = { recommend, validateInput, calcEnergy, getRulesByIds, mergeRestrictions, getLifeStageRules, scoreFood };
