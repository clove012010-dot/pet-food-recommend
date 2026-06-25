# 🐾 宠物粮智能推荐 — 微信小程序版

## 快速开始

1. 下载[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目 → 选择 `miniprogram/` 目录
3. 填入 AppID（测试用 `touristappid`）
4. 模拟器运行 → 点"预览"手机扫码

## 技术栈

- 小程序：原生 WXML/WXSS/JS，零依赖
- 推荐引擎：纯 JS 逻辑，可 Node 可小程序
- 数据：JSON 文件 + 双环境导出
- 测试：Node `node:test`，118 项

## 数据规模

- 79 款宠粮（39 犬 + 40 猫）
- 20 猫 + 20 犬品种
- 8 疾病规则 + 老年猫/犬专项规则
- 全部含 RMB 参考价格 + 灰分

## 测试

```bash
npm test  # 118 项全部通过
```

## 季度粮库更新

```
攒批季度数据 → 改 data/*.json → npm test 绿
→ 开发者工具"上传" → 微信后台审核 (1-7 天) → 全量发布
（约 4 次/年，审核期总计 4-28 天/年）
```

## 未来路线图

- v1.x：喂食日记 + 疫苗日记（schema 已预留）
- v2：健康观察回流影响推荐算法
- 跨设备同步：日记数据云端存储

## 小程序目录结构

```
miniprogram/
├── app.js/json/wxss
├── project.config.json
├── data/          ← foods/breeds/rules JSON
├── pages/index/   ← 首页（推荐/喂食/疫苗 3 tab）
└── utils/
    ├── recommendation.js  ← 纯 JS 推荐引擎
    ├── pet-profile.js     ← 多宠物档案
    ├── storage.js         ← wxStorage 适配器
    └── index.js           ← 统一 re-export
```

## 免责声明

本工具仅供日常选粮参考，处方粮使用请咨询执业兽医。疫苗日期按设备本地时区，跨时区可能差 1 天。

## License

MIT
