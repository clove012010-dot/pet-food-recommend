const fs = require('fs');
const path = require('path');

const rulesPath = path.join(__dirname, '..', 'data', 'rules.json');
const foodsPath = path.join(__dirname, '..', 'data', 'foods.json');
const breedsPath = path.join(__dirname, '..', 'data', 'breeds.json');

let rulesData = null;
let stageRulesData = null;
let foodsData = null;
let breedsData = null;

function loadRules() {
  if (!rulesData) {
    const data = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    rulesData = data.diseases;
    stageRulesData = data.life_stage_rules || [];
  }
  return { diseases: rulesData, lifeStageRules: stageRulesData };
}

function loadRawRules() {
  loadRules();
  return rulesData;
}

function loadLifeStageRules() {
  loadRules();
  return stageRulesData;
}

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

module.exports = { loadRules: loadRawRules, loadLifeStageRules, loadFoods, loadBreeds };
