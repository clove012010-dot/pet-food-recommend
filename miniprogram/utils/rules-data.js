const rules = require('../data/rules.json');
module.exports = {
  diseases: rules.diseases,
  lifeStageRules: rules.life_stage_rules || [],
  loadRules: () => rules.diseases,
  loadLifeStageRules: () => rules.life_stage_rules || []
};
