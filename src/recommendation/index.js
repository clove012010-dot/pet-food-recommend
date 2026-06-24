const fs = require('fs');
const path = require('path');

const { calcEnergy } = require('./energy');
const { getRulesByIds, mergeRestrictions } = require('./rules');
const { scoreFood } = require('./scoring');

const foodsPath = path.join(__dirname, '..', '..', 'data', 'foods.json');
const breedsPath = path.join(__dirname, '..', '..', 'data', 'breeds.json');

let foodsData = null;
let breedsData = null;

function loadFoods() {
  if (!foodsData) {
    foodsData = JSON.parse(fs.readFileSync(foodsPath, 'utf-8')).foods;
  }
  return foodsData;
}

function loadBreeds() {
  if (!breedsData) {
    breedsData = JSON.parse(fs.readFileSync(breedsPath, 'utf-8')).breeds;
  }
  return breedsData;
}

function getBreedInfo(species, breedId) {
  const all = loadBreeds();
  const list = all[species];
  if (!list) return null;
  return list.find(b => b.id === breedId) || null;
}

function validateInput(input) {
  const errors = [];
  const { species, breedId, ageMonths, weightKg, bodyConditionScore, activityLevel,
          diseases, allergies, avoidIngredients, preferredProteins, sex, neutered,
          targetWeightKg, budgetLevel, foodType, preferredGoal } = input;

  if (species !== 'dog' && species !== 'cat') {
    errors.push('species must be "dog" or "cat"');
  }
  if (!breedId || typeof breedId !== 'string' || breedId.trim() === '') {
    errors.push('breedId must be a non-empty string');
  }
  if (typeof ageMonths !== 'number' || ageMonths < 1 || ageMonths > 300) {
    errors.push('ageMonths must be a number between 1 and 300');
  }
  if (typeof weightKg !== 'number' || weightKg < 0.5 || weightKg > 100) {
    errors.push('weightKg must be a number between 0.5 and 100');
  }
  if (bodyConditionScore !== undefined && bodyConditionScore !== null) {
    if (typeof bodyConditionScore !== 'number' || bodyConditionScore < 1 || bodyConditionScore > 9) {
      errors.push('bodyConditionScore must be a number between 1 and 9');
    }
  }
  if (activityLevel !== undefined && activityLevel !== null) {
    if (!['low', 'normal', 'high'].includes(activityLevel)) {
      errors.push('activityLevel must be "low", "normal", or "high"');
    }
  }
  if (diseases !== undefined && diseases !== null) {
    if (!Array.isArray(diseases)) {
      errors.push('diseases must be an array');
    }
  }
  if (allergies !== undefined && allergies !== null) {
    if (!Array.isArray(allergies)) {
      errors.push('allergies must be an array');
    }
  }
  if (avoidIngredients !== undefined && avoidIngredients !== null) {
    if (!Array.isArray(avoidIngredients)) {
      errors.push('avoidIngredients must be an array');
    }
  }
  if (preferredProteins !== undefined && preferredProteins !== null) {
    if (!Array.isArray(preferredProteins)) {
      errors.push('preferredProteins must be an array');
    }
  }
  if (sex !== undefined && sex !== null) {
    if (!['male', 'female', 'unknown'].includes(sex)) {
      errors.push('sex must be "male", "female", or "unknown"');
    }
  }
  if (neutered !== undefined && neutered !== null) {
    if (![true, false, 'unknown'].includes(neutered)) {
      errors.push('neutered must be true, false, or "unknown"');
    }
  }
  if (targetWeightKg !== undefined && targetWeightKg !== null) {
    if (typeof targetWeightKg !== 'number' || targetWeightKg <= 0) {
      errors.push('targetWeightKg must be a positive number');
    }
  }
  if (budgetLevel !== undefined && budgetLevel !== null) {
    if (!['low', 'medium', 'high', 'any'].includes(budgetLevel)) {
      errors.push('budgetLevel must be "low", "medium", "high", or "any"');
    }
  }
  if (foodType !== undefined && foodType !== null) {
    if (!Array.isArray(foodType)) {
      errors.push('foodType must be an array');
    } else {
      const validTypes = ['dry', 'freeze_dried', 'grain_free'];
      for (const ft of foodType) {
        if (!validTypes.includes(ft)) {
          errors.push(`foodType contains invalid value: ${ft}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

function determineLifeStage(species, ageMonths) {
  if (species === 'dog') {
    if (ageMonths < 12) return 'puppy';
    if (ageMonths > 84) return 'senior';
    return 'adult';
  } else {
    if (ageMonths < 12) return 'kitten';
    if (ageMonths > 120) return 'senior';
    return 'adult';
  }
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
    for (const rule of diseaseRules) {
      insights.push(`【${rule.name}】${rule.tips}`);
    }
  }

  if (lifeStage === 'senior') {
    insights.push('宠物已进入老年期，建议选择易消化、含关节保护成分和抗氧化剂的配方。');
  }

  if (bodyCondition === 'underweight') {
    insights.push('当前体重偏瘦，建议选择高能量密度配方帮助恢复健康体重。');
  }

  return insights;
}

function recommend(input) {
  const validation = validateInput(input);
  if (!validation.valid) {
    return { error: 'Invalid input', details: validation.errors };
  }

  const {
    species, breedId, ageMonths, weightKg, bodyConditionScore,
    activityLevel, diseases, allergies, avoidIngredients,
    preferredProteins, sex, neutered, targetWeightKg,
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
  const { restrictions, sources, tips, preferIngredients, avoidIngredients: ruleAvoidIngredients } =
    mergeRestrictions(diseaseRules);

  const highProteinNeed = restrictions.protein_min && restrictions.protein_min > 28;

  const allFoods = loadFoods();
  const candidates = [];
  const excludedFoods = [];

  const allAllergies = [...(allergies || []), ...(avoidIngredients || [])];
  const allAvoid = [...(ruleAvoidIngredients || [])];

  const hasPancreatitis = diseaseIds.includes('pancreatitis');
  const hasKidney = diseaseIds.includes('kidney');
  const hasHeart = diseaseIds.includes('heart');
  const hardExcludeFat = hasPancreatitis ? restrictions.fat_max : null;
  const hardExcludePhosphorus = hasKidney ? restrictions.phosphorus_max : null;
  const hardExcludeSodium = hasHeart ? restrictions.sodium_max : null;

  for (const food of allFoods) {
    if (food.species !== species) {
      excludedFoods.push({ food, reason: `物种不匹配（${food.species} vs ${species}）` });
      continue;
    }

    if (lifeStage === 'puppy' || lifeStage === 'kitten') {
      if (food.life_stage !== 'puppy' && food.life_stage !== 'kitten' && food.life_stage !== 'all') {
        excludedFoods.push({ food, reason: `生命周期不匹配：${lifeStage}需要puppy/kitten/all，当前为${food.life_stage}` });
        continue;
      }
    } else if (lifeStage === 'senior') {
      if (food.life_stage === 'puppy' || food.life_stage === 'kitten') {
        excludedFoods.push({ food, reason: `生命周期不匹配：${lifeStage}不适合puppy/kitten粮，当前为${food.life_stage}` });
        continue;
      }
    }

    if (species === 'dog' && breedSize) {
      if (food.breed_size !== 'all' && food.breed_size !== breedSize) {
        excludedFoods.push({ food, reason: `体型不匹配：${breedSize}型犬需要${breedSize}/all，当前为${food.breed_size}` });
        continue;
      }
    }

    if (allAllergies.length > 0) {
      const allergyHit = allAllergies.some(a => {
        return food.protein_sources.some(ps => {
          if (ps === a) return true;
          if (a === '鸡肉' && (ps.includes('鸡肉') || ps === '鸡')) return true;
          if (a === '牛肉' && (ps.includes('牛肉') || ps === '牛')) return true;
          if (a === '鱼' && (ps.includes('鱼'))) return true;
          if (a === '谷物' && (ps.includes('小麦') || ps.includes('玉米') || ps.includes('大米') || ps.includes('燕麦') || ps.includes('大麦'))) return true;
          if (a === '鸡蛋' && (ps.includes('蛋') && !ps.includes('火鸡'))) return true;
          if (a === '乳制品' && ps.includes('乳')) return true;
          return ps.includes(a);
        }) || (a === '谷物' && (food.desc.includes('小麦') || food.desc.includes('玉米') || food.desc.includes('谷物')));
      });
      if (allergyHit) {
        excludedFoods.push({ food, reason: '含过敏原或被规避的成分' });
        continue;
      }
    }

    if (allAvoid.length > 0) {
      const avoidHit = allAvoid.some(a =>
        food.protein_sources.some(ps => ps.includes(a) || a.includes(ps)) ||
        food.desc.includes(a) ||
        food.tags.some(t => t.includes(a) || a.includes(t))
      );
      if (avoidHit) {
        excludedFoods.push({ food, reason: '含疾病需规避的成分' });
        continue;
      }
    }

    if (hardExcludeFat !== null && food.fat > hardExcludeFat) {
      excludedFoods.push({ food, reason: `脂肪${food.fat}%超过限制${hardExcludeFat}%（胰腺炎）` });
      continue;
    }
    if (hardExcludePhosphorus !== null && food.phosphorus > hardExcludePhosphorus) {
      excludedFoods.push({ food, reason: `磷${food.phosphorus}%超过限制${hardExcludePhosphorus}%（肾病）` });
      continue;
    }
    if (hardExcludeSodium !== null && food.sodium > hardExcludeSodium) {
      excludedFoods.push({ food, reason: `钠${food.sodium}%超过限制${hardExcludeSodium}%（心脏病）` });
      continue;
    }

    // 粮食品类硬筛选 — 全部勾选的条件都必须满足
    if (foodTypeFilters && foodTypeFilters.length > 0) {
      let passes = true;
      for (const ft of foodTypeFilters) {
        if (ft === 'freeze_dried') {
          if (!food.tags.some(t => t.includes('冻干') || t.includes('风干') || t.includes('生食'))) { passes = false; break; }
        } else if (ft === 'grain_free') {
          if (!food.tags.some(t => t.includes('无谷'))) { passes = false; break; }
        }
        // 'dry' 默认通过（所有粮都是干粮）
      }
      if (!passes) {
        excludedFoods.push({ food, reason: `不符合粮食品类筛选：${foodTypeFilters.join('+')}` });
        continue;
      }
    }

    candidates.push(food);
  }

  const profile = {
    species,
    lifeStage,
    breedInfo,
    diseaseRestrictions: restrictions,
    budgetLevel,
    foodType: foodTypeFilters,
    preferredGoal,
    preferredProteins,
    highProteinNeed
  };

  const scored = candidates.map(food => {
    const result = scoreFood(food, profile);
    return { ...food, ...result };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  const recommendations = scored.map((food, index) => {
    const gramsPerDay = Math.round((adjustedMer / food.calorie_per_100g) * 100);
    const mealsPerDay = (lifeStage === 'puppy' || lifeStage === 'kitten') ? 3 : 2;
    const feedingGuide = {
      gramsPerDay,
      mealsPerDay,
      note: `基于MER ${adjustedMer}kcal/天，${food.brand} ${food.name}热量密度${food.calorie_per_100g}kcal/100g，建议每日${mealsPerDay}餐`
    };
    return { ...food, feedingGuide };
  });

  const profileInsights = generateProfileInsights(breedInfo, diseaseIds, lifeStage, bodyCondition, diseaseRules);

  return {
    inputSummary: {
      breedName,
      species,
      ageMonths,
      weightKg,
      lifeStage,
      bodyCondition,
      activityLevel: activityLevel || 'normal'
    },
    profileInsights,
    energy: {
      rer: energy.rer,
      mer: adjustedMer,
      factors: energy.factors
    },
    diseaseInfo: tips.length > 0 ? {
      ids: diseaseIds,
      tips,
      preferIngredients,
      avoidIngredients: ruleAvoidIngredients,
      restrictions
    } : null,
    recommendations,
    excludedFoods: excludedFoods.slice(0, 10).map(e => ({
      id: e.food.id,
      brand: e.food.brand,
      name: e.food.name,
      reason: e.reason
    })),
    totalMatched: scored.length,
    totalExcluded: excludedFoods.length
  };
}

module.exports = { recommend, validateInput };
