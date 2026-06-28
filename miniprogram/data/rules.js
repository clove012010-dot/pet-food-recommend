module.exports = {
  "diseases": [
    {
      "id": "kidney",
      "name": "肾脏护理/肾脏调理",
      "tips": "需控制磷、蛋白质含量，选择低磷特殊配方或优质低蛋白粮",
      "restrictions": {
        "phosphorus_max": 0.8,
        "protein_max": 28,
        "sodium_max": 0.3
      },
      "prefer_ingredients": [
        "Omega-3脂肪酸",
        "抗氧化剂",
        "低磷钙源"
      ],
      "avoid_ingredients": [
        "高磷添加剂",
        "高盐"
      ]
    },
    {
      "id": "pancreatitis",
      "name": "胰腺护理",
      "tips": "必须极低脂肪，易消化蛋白质，避免高脂粮",
      "restrictions": {
        "fat_max": 12,
        "protein_max": 30
      },
      "prefer_ingredients": [
        "低脂鸡肉",
        "易消化碳水",
        "消化酶"
      ],
      "avoid_ingredients": [
        "高脂红肉",
        "油炸成分"
      ]
    },
    {
      "id": "allergy",
      "name": "食物过敏",
      "tips": "推荐单一动物蛋白来源的粮，避开已知过敏原",
      "restrictions": {
        "protein_source_limit": 1
      },
      "prefer_ingredients": [
        "水解蛋白",
        "单一肉源",
        "无谷配方"
      ],
      "avoid_ingredients": [
        "混合肉源",
        "常见过敏原（牛肉/鸡肉/谷物）"
      ]
    },
    {
      "id": "obesity",
      "name": "肥胖/超重",
      "tips": "控制总热量和脂肪，选高蛋白低脂配方帮助减重",
      "restrictions": {
        "fat_max": 14,
        "calorie_max": 360
      },
      "prefer_ingredients": [
        "高蛋白",
        "L-肉碱",
        "高纤维"
      ],
      "avoid_ingredients": [
        "高碳水",
        "高脂"
      ]
    },
    {
      "id": "diabetes",
      "name": "血糖管理",
      "tips": "需要低碳水化合物、高蛋白配方稳定血糖",
      "restrictions": {
        "protein_min": 35,
        "carb_max": 25
      },
      "prefer_ingredients": [
        "低碳水",
        "高动物蛋白",
        "可溶纤维"
      ],
      "avoid_ingredients": [
        "高GI碳水",
        "糖",
        "玉米淀粉"
      ]
    },
    {
      "id": "digestive",
      "name": "肠胃敏感",
      "tips": "选择易消化配方，含益生菌和膳食纤维",
      "restrictions": {
        "fiber_min": 2,
        "protein_max": 32
      },
      "prefer_ingredients": [
        "益生菌",
        "益生元",
        "可溶纤维",
        "易消化蛋白"
      ],
      "avoid_ingredients": [
        "浓郁香精",
        "高灰分"
      ]
    },
    {
      "id": "urinary",
      "name": "泌尿系统疾病",
      "tips": "控制镁和磷含量，维持尿液pH平衡，增加水分摄入",
      "restrictions": {
        "magnesium_max": 0.1,
        "phosphorus_max": 0.9,
        "protein_max": 35
      },
      "prefer_ingredients": [
        "低镁",
        "DL-蛋氨酸",
        "蔓越莓"
      ],
      "avoid_ingredients": [
        "高镁原料",
        "高磷"
      ]
    },
    {
      "id": "heart",
      "name": "心脏护理",
      "tips": "严格控制钠含量，补充牛磺酸和Omega-3",
      "restrictions": {
        "sodium_max": 0.25,
        "protein_min": 25
      },
      "prefer_ingredients": [
        "牛磺酸",
        "Omega-3",
        "低钠",
        "辅酶Q10"
      ],
      "avoid_ingredients": [
        "高钠",
        "高盐"
      ]
    }
  ],
  "life_stage_rules": [
    {
      "id": "senior_cat",
      "applicableTo": "cat",
      "lifeStage": "senior",
      "name": "老年猫营养规则",
      "tips": "老年猫（>10岁）代谢减慢，需低磷护肾、易消化蛋白、关节保护和抗氧化剂",
      "restrictions": {
        "phosphorus_max": 0.9,
        "sodium_max": 0.3,
        "fiber_min": 2.5,
        "fat_max": 20
      },
      "prefer_ingredients": [
        "易消化蛋白",
        "关节保护",
        "抗氧化剂",
        "益生菌",
        "Omega-3"
      ],
      "avoid_ingredients": [
        "高磷",
        "高钠"
      ]
    },
    {
      "id": "senior_dog",
      "applicableTo": "dog",
      "lifeStage": "senior",
      "name": "老年犬营养规则",
      "tips": "老年犬（>7岁）关节退化风险升高，需控制脂肪、补充葡萄糖胺和软骨素",
      "restrictions": {
        "fat_max": 14,
        "fiber_min": 2.5,
        "sodium_max": 0.35
      },
      "prefer_ingredients": [
        "葡萄糖胺",
        "软骨素",
        "易消化蛋白",
        "抗氧化剂",
        "Omega-3"
      ],
      "avoid_ingredients": [
        "高脂",
        "高盐"
      ]
    }
  ]
};
