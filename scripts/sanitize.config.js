module.exports = {
  files: [
    {
      path: 'data/foods.json',
      fields: ['desc', 'tags'],
      rules: {
        '处方粮':'特殊配方','处方级':'特殊配方级','处方':'特殊配方',
        '胰腺炎':'低脂场景','胰腺':'胰腺护理',
        '心脏病':'心脏护理场景','心脏':'心脏护理',
        '糖尿病':'血糖管理',
        '肾病':'肾脏护理场景','肾功能不全':'肾脏调理',
        '兽医':'宠物营养师','医嘱':'专业建议','治疗':'辅助管理'
      }
    },
    {
      path: 'data/rules.json',
      fields: ['diseases[].name', 'diseases[].tips'],
      rules: {
        '处方粮':'特殊配方','处方':'特殊配方',
        '肾病':'肾脏护理','肾功能不全':'肾脏调理',
        '胰腺炎':'胰腺护理','糖尿病':'血糖管理','心脏病':'心脏护理'
      }
    },
    {
      path: 'data/breeds.json',
      fields: ['breeds.cat[].growthNeeds.healthRisks', 'breeds.cat[].growthNeeds.tips', 'breeds.dog[].growthNeeds.healthRisks', 'breeds.dog[].growthNeeds.tips'],
      rules: { '处方粮':'特殊配方','处方级':'特殊配方级','兽医':'宠物营养师','医嘱':'专业建议','治疗':'辅助管理' }
    }
  ],
  mirror: [
    { src: 'data/foods.json', dst: 'miniprogram/data/foods.json' },
    { src: 'data/rules.json', dst: 'miniprogram/data/rules.json' },
    { src: 'data/breeds.json', dst: 'miniprogram/data/breeds.json' }
  ]
};
