function scoreFood(food, profile) {
  const {
    species,
    lifeStage,
    breedInfo,
    diseaseRestrictions,
    budgetLevel,
    foodType,
    preferredGoal,
    preferredProteins
  } = profile;

  const scoreBreakdown = {};
  const matchReasons = [];
  const cautions = [];
  const warnings = [];
  const goodPoints = [];

  scoreBreakdown.healthSafety = calcHealthSafety(food, diseaseRestrictions, warnings);
  scoreBreakdown.lifeStageFit = calcLifeStageFit(food, lifeStage);
  scoreBreakdown.breedFit = calcBreedFit(food, breedInfo, matchReasons, warnings);
  scoreBreakdown.nutritionFit = calcNutritionFit(food, species, profile.highProteinNeed, matchReasons, cautions, goodPoints);
  scoreBreakdown.preferenceFit = calcPreferenceFit(food, budgetLevel, foodType, preferredGoal, preferredProteins, matchReasons);
  scoreBreakdown.dataConfidence = calcDataConfidence(food);

  const totalScore = Math.round(
    scoreBreakdown.healthSafety +
    scoreBreakdown.lifeStageFit +
    scoreBreakdown.breedFit +
    scoreBreakdown.nutritionFit +
    scoreBreakdown.preferenceFit +
    scoreBreakdown.dataConfidence
  );

  // generate goodPoints from overall analysis
  if (food.tags.includes('处方粮')) goodPoints.push('处方级配方');
  if (food.tags.includes('无谷')) goodPoints.push('无谷配方');
  if (food.tags.includes('高蛋白') || food.protein >= 35) goodPoints.push('高蛋白配方');
  if (food.price_range === '中低' || food.price_range === '中') goodPoints.push('价格友好');

  return {
    totalScore,
    scoreBreakdown,
    matchReasons,
    cautions,
    warnings,
    goodPoints
  };
}

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
    if (typeof food.ash !== 'number') {
      warnings.push('灰分数据缺失，碳水按默认6%估算');
    }
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

  if (warnings.length > 0) {
    score = Math.min(score, 25);
  }
  return Math.max(0, score);
}

function calcLifeStageFit(food, lifeStage) {
  const foodStage = food.life_stage;
  if (foodStage === 'all') return 15;
  if (foodStage === lifeStage) return 15;
  if ((lifeStage === 'senior' && foodStage === 'adult') ||
      (lifeStage === 'adult' && foodStage === 'senior')) return 12;
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
    const budgetMap = {
      low: ['低', '中低'],
      medium: ['中', '中低', '中高'],
      high: ['高', '中高']
    };
    const ranges = budgetMap[budgetLevel];
    if (ranges && ranges.includes(food.price_range)) {
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
    const hasMatch = preferredProteins.some(pp =>
      food.protein_sources.some(ps => ps.includes(pp) || pp.includes(ps))
    );
    if (hasMatch) {
      score += 2;
      matchReasons.push('含有偏好蛋白源');
    }
  }

  return score;
}

function calcDataConfidence(food) {
  const verifiedTags = ['原装进口', '正规进口', '天津产', '上海产', '国产'];
  const hasVerified = food.tags.some(t => verifiedTags.includes(t));
  return hasVerified ? 5 : 3;
}

module.exports = { scoreFood };
