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
  if (isNeutered === true) {
    neuteredFactor = 0.8;
  }

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
    factors: {
      lifeStage: lifeStageFactor,
      neutered: neuteredFactor,
      activity: activityFactor,
      bodyCondition: bodyConditionFactor
    }
  };
}

module.exports = { calcEnergy };
