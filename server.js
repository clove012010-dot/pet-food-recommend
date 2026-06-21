const http = require("http");
const fs = require("fs");
const path = require("path");

const foods = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "foods.json"), "utf-8")).foods;
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "rules.json"), "utf-8")).diseases;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res) {
  let filePath = path.join(__dirname, "public", req.url === "/" ? "index.html" : req.url);
  const ext = path.extname(filePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

// 计算 RER（静息能量需求）和 MER（维持能量需求）
function calcEnergy(species, weightKg, lifeStage, bodyCondition) {
  let rer = 70 * Math.pow(weightKg, 0.75);
  let factor = 1.6; // 默认成犬
  if (species === "dog") {
    if (lifeStage === "puppy") factor = 2.5;
    else if (lifeStage === "senior") factor = 1.4;
    else factor = bodyCondition === "overweight" ? 1.2 : 1.6;
  } else {
    if (lifeStage === "kitten") factor = 2.5;
    else if (lifeStage === "senior") factor = 1.2;
    else factor = bodyCondition === "overweight" ? 0.8 : 1.2;
  }
  return { rer: Math.round(rer), mer: Math.round(rer * factor) };
}

// 根据品种映射大致体重范围
function guessBreedSize(breed) {
  const smallBreeds = ["吉娃娃", "泰迪", "贵宾", "博美", "约克夏", "比熊", "雪纳瑞", "巴哥", "柯基", "迷你杜宾", "京巴"];
  const largeBreeds = ["金毛", "拉布拉多", "哈士奇", "阿拉斯加", "德牧", "边牧", "萨摩耶", "松狮", "古牧", "罗威纳", "大丹", "圣伯纳"];
  if (smallBreeds.some(b => breed.includes(b))) return "small";
  if (largeBreeds.some(b => breed.includes(b))) return "large";
  return "medium";
}

function getRestrictions(diseaseIds) {
  let restrictions = {};
  let tips = [];
  let preferIngredients = [];
  let avoidIngredients = [];
  for (const did of diseaseIds) {
    const rule = rules.find(r => r.id === did);
    if (!rule) continue;
    tips.push(rule.tips);
    preferIngredients.push(...rule.prefer_ingredients);
    avoidIngredients.push(...rule.avoid_ingredients);
    if (rule.restrictions) Object.assign(restrictions, rule.restrictions);
  }
  return { restrictions, tips, preferIngredients: [...new Set(preferIngredients)], avoidIngredients: [...new Set(avoidIngredients)] };
}

function recommend(input) {
  const { species, breed, ageMonths, weightKg, diseases, bodyCondition } = input;

  let lifeStage;
  if (species === "dog") {
    if (ageMonths < 12) lifeStage = "puppy";
    else if (ageMonths > 84) lifeStage = "senior";
    else lifeStage = "adult";
  } else {
    if (ageMonths < 12) lifeStage = "kitten";
    else if (ageMonths > 120) lifeStage = "senior";
    else lifeStage = "adult";
  }

  const breedSize = guessBreedSize(breed);
  const energy = calcEnergy(species, weightKg, lifeStage, bodyCondition);
  const { restrictions, tips, preferIngredients, avoidIngredients } = getRestrictions(diseases || []);

  // 筛选符合条件的粮
  let candidates = foods.filter(f => f.species === species);

  // 年龄阶段匹配
  if (lifeStage === "puppy" || lifeStage === "kitten") {
    candidates = candidates.filter(f => f.life_stage === "puppy" || f.life_stage === "kitten" || f.life_stage === "all");
  } else if (lifeStage === "senior") {
    candidates = candidates.filter(f => f.life_stage === "senior" || f.life_stage === "all" || f.life_stage === "adult");
  } else {
    candidates = candidates.filter(f => f.life_stage === "adult" || f.life_stage === "all");
  }

  // 品种体型匹配（犬）
  if (species === "dog" && breedSize) {
    candidates = candidates.filter(f => f.breed_size === "all" || f.breed_size === breedSize);
  }

  // 疾病限制过滤
  let scoreDetails = candidates.map(food => {
    let score = 100;
    let warnings = [];
    let goodPoints = [];

    // 硬性条件打分
    if (restrictions.protein_max && food.protein > restrictions.protein_max) {
      score -= 20;
      warnings.push(`蛋白质${food.protein}%超出推荐上限${restrictions.protein_max}%`);
    }
    if (restrictions.protein_min && food.protein < restrictions.protein_min) {
      score -= 15;
      warnings.push(`蛋白质${food.protein}%低于推荐下限${restrictions.protein_min}%`);
    }
    if (restrictions.fat_max && food.fat > restrictions.fat_max) {
      score -= 25;
      warnings.push(`脂肪${food.fat}%超出推荐上限${restrictions.fat_max}%`);
    }
    if (restrictions.fiber_min && food.fiber < restrictions.fiber_min) {
      score -= 5;
      warnings.push(`纤维素${food.fiber}%低于推荐下限${restrictions.fiber_min}%`);
    }
    if (restrictions.phosphorus_max && food.phosphorus > restrictions.phosphorus_max) {
      score -= 20;
      warnings.push(`磷${food.phosphorus}%超出推荐上限${restrictions.phosphorus_max}%`);
    }
    if (restrictions.sodium_max && food.sodium > restrictions.sodium_max) {
      score -= 15;
      warnings.push(`钠${food.sodium}%超出推荐上限${restrictions.sodium_max}%`);
    }
    if (restrictions.magnesium_max && food.magnesium > restrictions.magnesium_max) {
      score -= 15;
      warnings.push(`镁${food.magnesium}%超出推荐上限${restrictions.magnesium_max}%`);
    }
    if (restrictions.calorie_max && food.calorie_per_100g > restrictions.calorie_max) {
      score -= 10;
      warnings.push(`热量${food.calorie_per_100g}kcal/100g偏高`);
    }
    if (restrictions.carb_max) {
      const carb = 100 - food.protein - food.fat - food.fiber - food.moisture - 6; // 6%为灰分估算
      if (carb > restrictions.carb_max) {
        score -= 20;
        warnings.push(`碳水约${carb}%超出推荐上限${restrictions.carb_max}%`);
      }
    }
    if (restrictions.protein_source_limit) {
      if (food.protein_sources.length > restrictions.protein_source_limit) {
        score -= 30;
        warnings.push(`含${food.protein_sources.length}种蛋白源，建议单一蛋白源`);
      } else {
        goodPoints.push("单一蛋白源，适合过敏体质");
      }
    }

    // 加分项
    if (food.tags.some(t => preferIngredients.some(pi => food.desc.includes(pi) || t.includes(pi)))) {
      score += 15;
    }
    if (food.tags.includes("处方粮")) {
      score += 20;
      goodPoints.push("处方级配方");
    }
    if (food.tags.includes("无谷")) {
      goodPoints.push("无谷配方");
    }
    if (food.price_range === "中低" || food.price_range === "中") {
      goodPoints.push("价格友好");
    }

    // 如果有硬性警告，整体降分
    if (warnings.length > 0) {
      score = Math.min(score, 60);
    }

    return { ...food, score, warnings, goodPoints };
  });

  // 按分数排序
  scoreDetails.sort((a, b) => b.score - a.score);

  return {
    input: { species, breed, ageMonths, weightKg, lifeStage, breedSize, energy },
    diseaseInfo: tips.length > 0 ? { ids: diseases, tips, preferIngredients, avoidIngredients } : null,
    recommendations: scoreDetails.slice(0, 5),
    totalMatched: scoreDetails.length,
  };
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/recommend") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const input = JSON.parse(body);
        const result = recommend(input);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result, null, 2));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (!serveStatic(req, res)) {
    res.writeHead(404);
    res.end("Not found");
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`宠物粮推荐引擎已启动: http://localhost:${PORT}`);
});
