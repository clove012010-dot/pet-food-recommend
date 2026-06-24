const fs = require('fs');
const path = require('path');

const rulesPath = path.join(__dirname, '..', '..', 'data', 'rules.json');
let rulesData = null;
let stageRulesData = null;

function loadRules() {
  if (!rulesData) {
    const raw = fs.readFileSync(rulesPath, 'utf-8');
    const data = JSON.parse(raw);
    rulesData = data.diseases;
    stageRulesData = data.life_stage_rules || [];
  }
  return rulesData;
}

function getLifeStageRules(species, lifeStage) {
  loadRules();
  return stageRulesData.filter(r =>
    r.applicableTo === species && r.lifeStage === lifeStage
  );
}

function getAllRules() {
  return loadRules();
}

function getRulesByIds(ids) {
  const all = loadRules();
  if (!ids || !ids.length) return [];
  return all.filter(r => ids.includes(r.id));
}

function mergeRestrictions(ruleList) {
  const restrictions = {};
  const sources = {};
  const tips = [];
  const preferIngredientsSet = new Set();
  const avoidIngredientsSet = new Set();

  for (const rule of ruleList) {
    tips.push(rule.tips);
    if (rule.prefer_ingredients) {
      rule.prefer_ingredients.forEach(i => preferIngredientsSet.add(i));
    }
    if (rule.avoid_ingredients) {
      rule.avoid_ingredients.forEach(i => avoidIngredientsSet.add(i));
    }
    if (rule.restrictions) {
      for (const [key, value] of Object.entries(rule.restrictions)) {
        if (sources[key]) {
          sources[key].push(rule.id);
        } else {
          sources[key] = [rule.id];
        }

        if (restrictions[key] === undefined) {
          restrictions[key] = value;
        } else if (key.endsWith('_max') || key === 'protein_source_limit') {
          restrictions[key] = Math.min(restrictions[key], value);
        } else if (key.endsWith('_min')) {
          restrictions[key] = Math.max(restrictions[key], value);
        }
      }
    }
  }

  return {
    restrictions,
    sources,
    tips,
    preferIngredients: [...preferIngredientsSet],
    avoidIngredients: [...avoidIngredientsSet]
  };
}

module.exports = { getAllRules, getRulesByIds, mergeRestrictions, getLifeStageRules };
