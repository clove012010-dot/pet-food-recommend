const { PetProfile, wxStorage, FeedingLog, VaccinationLog } = require('../../utils/index.js');
const { recommend, validateInput } = require('../../utils/recommendation.js');
const { loadBreeds } = require('../../utils/breeds-data');

const speciesOptions = ['🐱 猫', '🐶 狗'];
const sexOptions = ['未知', '公', '母'];
const nuteredOptions = ['未知', '已绝育', '未绝育'];
const bcsOptions = ['1极瘦','2偏瘦','3略瘦','4稍瘦','5标准','6略胖','7偏胖','8胖','9极胖'];
const activityOptions = ['较少', '正常', '较多'];
const budgetOptions = ['不限', '实惠', '中等', '高端'];
const goalOptions = ['无', '减重', '美毛', '肠胃', '低敏', '关节', '泌尿', '性价比'];
const foodTypeOptions = ['干粮', '含冻干', '无谷'];
const stoolOptions = ['1稀软', '2偏软', '3正常', '4偏干', '5干硬'];
const tearOptions = ['1无', '2轻微', '3明显', '4偏多', '5严重'];
const skinOptions = ['1红痒', '2轻屑', '3一般', '4良好', '5健康光泽'];

Page({
  data: {
    currentTab: 'recommend',
    profiles: [], activeProfile: {}, activeIdx: 0, profileNames: [],
    speciesOptions, sexOptions, nuteredOptions, bcsOptions, activityOptions, budgetOptions, goalOptions, foodTypeOptions,
    stoolOptions, tearOptions, skinOptions,
    breedNames: [], speciesIdx: -1, breedIdx: -1,
    sexIdx: 1, nuteredIdx: 1, bcsIdx: 4, activityIdx: 1, budgetIdx: 0, goalIdx: 0,
    formData: { species: '', breedId: '', ageMonths: '', weightKg: '', sex: 'male', neutered: 'unknown', bodyConditionScore: 5, activityLevel: 'normal', budgetLevel: 'any', preferredGoal: '', foodType: ['dry'], allergies: [], diseases: [] },
    showResults: false, recommendations: [],
    feedDate: '', feedFoodName: '', feedGrams: '', feedStool: '', feedStoolLabel: '', feedTear: '', feedTearLabel: '', feedSkin: '', feedSkinLabel: '', feedNote: '', feedHint: '', feedList: [],
    vaxDate: '', vaxName: '', vaxNextDue: '', vaxVet: '', vaxNote: '', vaxHint: '', vaxAlerts: [], vaxList: [],
  },

  onLoad() {
    this.profileStore = new PetProfile.ProfileStore(wxStorage);
    this.feedingLogStore = new FeedingLog.FeedingLogStore(wxStorage);
    this.vaccinationLogStore = new VaccinationLog.VaccinationLogStore(wxStorage);
    this.initBreeds();
    this.initProfileBar();
  },

  initBreeds() { this.breeds = loadBreeds(); },

  /* ===== 通用 input handler ===== */
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field.startsWith('feed') || field.startsWith('vax')) {
      this.setData({ [field]: e.detail.value });
    } else {
      this.setData({ ['formData.' + field]: e.detail.value });
    }
  },

  /* ===== 品种联动 ===== */
  onSpeciesChange(e) {
    const idx = parseInt(e.detail.value);
    const species = idx === 0 ? 'cat' : 'dog';
    const list = (this.breeds[species] || []).map(b => b.fullName + '(' + b.typicalWeightKg + 'kg)');
    this.setData({
      speciesIdx: idx, breedNames: list, breedIdx: -1,
      'formData.species': species, 'formData.breedId': '', 'formData.ageMonths': '', 'formData.weightKg': ''
    });
  },

  onBreedChange(e) {
    const idx = parseInt(e.detail.value);
    const species = this.data.formData.species;
    const breed = (this.breeds[species] || [])[idx];
    if (breed) {
      this.setData({
        breedIdx: idx,
        'formData.breedId': breed.id,
        'formData.weightKg': breed.typicalWeightKg,
        'formData.ageMonths': this.data.formData.ageMonths || 12
      });
    }
  },

  onSexChange(e) { const m = ['unknown','male','female']; this.setData({ sexIdx: parseInt(e.detail.value), 'formData.sex': m[parseInt(e.detail.value)] }); },
  onNeuteredChange(e) { const m = ['unknown', true, false]; this.setData({ nuteredIdx: parseInt(e.detail.value), 'formData.neutered': m[parseInt(e.detail.value)] }); },
  onBcsChange(e) { this.setData({ bcsIdx: parseInt(e.detail.value), 'formData.bodyConditionScore': parseInt(e.detail.value) + 1 }); },
  onActivityChange(e) { const m = ['low','normal','high']; this.setData({ activityIdx: parseInt(e.detail.value), 'formData.activityLevel': m[parseInt(e.detail.value)] }); },
  onBudgetChange(e) { const m = ['any','low','medium','high']; this.setData({ budgetIdx: parseInt(e.detail.value), 'formData.budgetLevel': m[parseInt(e.detail.value)] }); },
  onGoalChange(e) { const m = ['','减重','美毛','肠胃','低敏','关节','泌尿','性价比']; this.setData({ goalIdx: parseInt(e.detail.value), 'formData.preferredGoal': m[parseInt(e.detail.value)] }); },

  onFoodTypeChange(e) {
    const vals = e.detail.value;
    this.setData({ 'formData.foodType': vals.map(v => {
      if (v === '干粮') return 'dry'; if (v === '含冻干') return 'freeze_dried'; if (v === '无谷') return 'grain_free'; return 'dry';
    })});
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    if (tab === 'feeding') this.renderFeeding();
    if (tab === 'vaccination') this.renderVax();
  },

  /* ===== 推荐 ===== */
  onSubmit() {
    const fd = this.data.formData;
    if (!fd.species) { wx.showToast({ title: '请先选择种类', icon: 'none' }); return; }
    if (!fd.breedId) { wx.showToast({ title: '请选择品种', icon: 'none' }); return; }
    const input = {
      species: fd.species, breedId: fd.breedId,
      ageMonths: parseInt(fd.ageMonths) || 12, weightKg: parseFloat(fd.weightKg) || 5,
      bodyConditionScore: fd.bodyConditionScore, activityLevel: fd.activityLevel,
      diseases: fd.diseases, allergies: fd.allergies, sex: fd.sex, neutered: fd.neutered,
      budgetLevel: fd.budgetLevel, foodType: fd.foodType, preferredGoal: fd.preferredGoal
    };
    const v = validateInput(input);
    if (!v.valid) { wx.showToast({ title: v.errors[0], icon: 'none' }); return; }
    const result = recommend(input);
    if (result.error) { wx.showToast({ title: '推荐失败', icon: 'none' }); return; }
    this.setData({ showResults: true, recommendations: result.recommendations, profileInsights: result.profileInsights || [] });
  },

  /* ===== 档案 ===== */
  initProfileBar() {
    const all = this.profileStore.loadAll();
    if (all.length === 0) {
      this.setData({ profiles: [], activeProfile: {}, profileNames: [], speciesIdx: -1, breedIdx: -1 });
      return;
    }
    let active = this.profileStore.getActive();
    if (!active) { active = all[0]; this.profileStore.setActiveId(active.id); }
    const idx = all.findIndex(p => p.id === active.id);
    this.setData({ profiles: all, activeProfile: active, activeIdx: Math.max(0, idx), profileNames: all.map(p => p.name) });
    this.fillFormFromProfile(active);
  },

  fillFormFromProfile(p) {
    const pf = PetProfile.normalizeProfile(p);
    const speciesIdx = pf.species === 'dog' ? 1 : 0;
    const list = (this.breeds[pf.species] || []).map(b => b.fullName + '(' + b.typicalWeightKg + 'kg)');
    const breedObj = (this.breeds[pf.species] || []).find(b => b.id === pf.breedId);
    this.setData({
      speciesIdx, breedNames: list,
      breedIdx: breedObj ? list.indexOf(breedObj.fullName + '(' + breedObj.typicalWeightKg + 'kg)') : -1,
      'formData.species': pf.species, 'formData.breedId': pf.breedId,
      'formData.ageMonths': pf.ageMonths, 'formData.weightKg': pf.weightKg,
    });
  },

  onNewProfile() {
    wx.showModal({ title: '新建档案', editable: true, placeholderText: '起个名字', success: (res) => {
      if (!res.confirm || !res.content || !res.content.trim()) return;
      this.profileStore.create({ name: res.content.trim(), species: 'cat', breedId: 'british_shorthair', ageMonths: 12, weightKg: 4 });
      this.initProfileBar();
    }});
  },
  onCopyProfile() { const a = this.profileStore.getActive(); if (a) { this.profileStore.duplicate(a.id); this.initProfileBar(); } },
  onSaveProfile() {
    const pf = PetProfile.normalizeProfile(this.data.formData);
    const v = PetProfile.validateProfile(pf);
    if (!v.valid) { wx.showToast({ title: v.errors[0], icon: 'none' }); return; }
    const a = this.profileStore.getActive();
    if (a) this.profileStore.update(a.id, pf);
    this.initProfileBar();
    wx.showToast({ title: '已保存', icon: 'success' });
  },
  onDeleteProfile() {
    const a = this.profileStore.getActive(); if (!a) return;
    wx.showModal({ title: '删除', content: '确定删除「' + a.name + '」？', success: (res) => {
      if (!res.confirm) return;
      this.profileStore.delete(a.id);
      this.initProfileBar();
    }});
  },
  onSwitchProfile(e) {
    const idx = parseInt(e.detail.value);
    const p = this.data.profiles[idx]; if (!p) return;
    this.profileStore.setActiveId(p.id);
    this.initProfileBar();
  },
  onProfileNameSave(e) {
    const name = e.detail.value; if (!name.trim()) return;
    const a = this.profileStore.getActive();
    if (a) this.profileStore.update(a.id, { name: name.trim() });
  },

  /* ===== 喂食日记 ===== */
  onFeedDate(e) { this.setData({ feedDate: e.detail.value }); },
  onFeedStool(e) {
    const v = parseInt(e.detail.value);
    this.setData({ feedStool: v, feedStoolLabel: v });
  },
  onFeedTear(e) {
    const v = parseInt(e.detail.value);
    this.setData({ feedTear: v, feedTearLabel: v });
  },
  onFeedSkin(e) {
    const v = parseInt(e.detail.value);
    this.setData({ feedSkin: v, feedSkinLabel: v });
  },

  onSubmitFeed() {
    const active = this.profileStore.getActive();
    if (!active) { wx.showToast({ title: '请先创建档案', icon: 'none' }); return; }
    const log = FeedingLog.feedingLogFromFormData({
      date: this.data.feedDate, foodId: 'manual', foodName: this.data.feedFoodName,
      grams: this.data.feedGrams, stoolScore: this.data.feedStool, tearStainScore: this.data.feedTear,
      skinScore: this.data.feedSkin, note: this.data.feedNote
    }, active.id);
    const v = FeedingLog.validateFeedingLog(log);
    if (!v.valid) { wx.showToast({ title: v.errors[0], icon: 'none' }); return; }
    this.feedingLogStore.create(log);
    this.renderFeeding();
    wx.showToast({ title: '已记录', icon: 'success' });
  },

  onDeleteFeed(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({ title: '删除', content: '删除这条记录？', success: (res) => { if (res.confirm) { this.feedingLogStore.delete(id); this.renderFeeding(); } } });
  },

  renderFeeding() {
    const active = this.profileStore.getActive();
    if (!active) { this.setData({ feedHint: '请先创建宠物档案', feedList: [] }); return; }
    this.setData({ feedHint: '当前为 ' + active.name + ' 记录', feedList: this.feedingLogStore.filterByPet(active.id).slice(0, 20) });
  },

  /* ===== 疫苗日记 ===== */
  onVaxDate(e) { this.setData({ vaxDate: e.detail.value }); },
  onVaxNext(e) { this.setData({ vaxNextDue: e.detail.value }); },

  onSubmitVax() {
    const active = this.profileStore.getActive();
    if (!active) { wx.showToast({ title: '请先创建档案', icon: 'none' }); return; }
    const log = VaccinationLog.vaccinationLogFromFormData({
      date: this.data.vaxDate, vaccineName: this.data.vaxName,
      nextDueDate: this.data.vaxNextDue || null, vet: this.data.vaxVet, note: this.data.vaxNote
    }, active.id);
    const v = VaccinationLog.validateVaccinationLog(log);
    if (!v.valid) { wx.showToast({ title: v.errors[0], icon: 'none' }); return; }
    this.vaccinationLogStore.create(log);
    this.renderVax();
    wx.showToast({ title: '已记录', icon: 'success' });
  },

  onDeleteVax(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({ title: '删除', content: '删除这条记录？', success: (res) => { if (res.confirm) { this.vaccinationLogStore.delete(id); this.renderVax(); } } });
  },

  renderVax() {
    const active = this.profileStore.getActive();
    if (!active) { this.setData({ vaxHint: '请先创建宠物档案', vaxAlerts: [], vaxList: [] }); return; }
    const upcoming = this.vaccinationLogStore.filterUpcoming(active.id);
    const overdue = this.vaccinationLogStore.filterOverdue(active.id);
    const alerts = [];
    overdue.forEach(l => { const d = VaccinationLog.getDaysUntil(l.nextDueDate); alerts.push({ type:'danger', text: l.vaccineName + ' 已过期 ' + Math.abs(d) + ' 天' }); });
    upcoming.forEach(l => { const d = VaccinationLog.getDaysUntil(l.nextDueDate); if (d <= 7) alerts.push({ type:'warning', text: l.vaccineName + ' 还有 ' + d + ' 天到期' }); });
    const all = this.vaccinationLogStore.filterByPet(active.id).slice(0, 20);
    this.setData({ vaxHint: '当前为 ' + active.name + ' 记录', vaxAlerts: alerts, vaxList: all.map(l => {
      const days = VaccinationLog.getDaysUntil(l.nextDueDate);
      let badge = ''; if (days !== null) { if (days < 0) badge = '过期' + Math.abs(days) + '天'; else if (days <= 7) badge = days + '天'; else badge = days + '天'; }
      return { ...l, daysBadge: badge };
    })});
  },

  /* ===== 图表 ===== */
  drawCharts(recommendations, pLimit) {
    const top5 = recommendations.slice(0, 5);
    const dims = ['蛋白', '脂肪', '纤维', '磷低优', '钠', '镁'];
    const maxes = [50, 30, 5, 1.5, 0.5, 0.12];
    const colors = ['#8B5E3C', '#c49a6c', '#e8a838', '#5b9bd5', '#4a8'];

    // Radar chart
    wx.createSelectorQuery().select('#radarChart').node(res => {
      if (!res || !res[0]) return;
      const node = res[0].node;
      const dpr = wx.getWindowInfo().pixelRatio;
      const w = 360, h = 360;
      node.width = w * dpr; node.height = h * dpr;
      const ctx = node.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2, cy = h / 2, r = 140;
      for (let i = 1; i <= 5; i++) {
        ctx.beginPath();
        for (let j = 0; j < dims.length; j++) {
          const a = (j / dims.length) * Math.PI * 2 - Math.PI / 2;
          const rr = (r / 5) * i;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.strokeStyle = '#f0e6d8'; ctx.stroke();
      }
      for (let i = 0; i < dims.length; i++) {
        const a = (i / dims.length) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.strokeStyle = '#e8d5c4'; ctx.stroke();
        ctx.fillStyle = '#3e2e23'; ctx.font = '11px sans-serif';
        ctx.textAlign = a > 1.2 && a < 2 ? 'center' : a > Math.PI / 2 ? 'right' : 'left';
        ctx.fillText(dims[i], cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14));
      }
      top5.forEach((food, fi) => {
        const vals = [food.protein, food.fat, food.fiber, Math.max(0, 1.5 - food.phosphorus), food.sodium, food.magnesium];
        ctx.beginPath();
        for (let i = 0; i < dims.length; i++) {
          const a = (i / dims.length) * Math.PI * 2 - Math.PI / 2;
          const radius = Math.min(1, vals[i] / maxes[i]) * r;
          if (i === 0) ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
          else ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        }
        ctx.closePath(); ctx.strokeStyle = colors[fi]; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = colors[fi] + '20'; ctx.fill();
      });
      ctx.font = '10px sans-serif';
      top5.forEach((f, i) => { ctx.fillStyle = colors[i]; ctx.fillText(f.brand, w - 60, 20 + i * 16); });
    }).exec();

    // Phosphorus bar chart
    wx.createSelectorQuery().select('#phosphorusChart').node(res => {
      if (!res || !res[0]) return;
      const node = res[0].node;
      const dpr = wx.getWindowInfo().pixelRatio;
      const w = 360, h = 260;
      node.width = w * dpr; node.height = h * dpr;
      const ctx = node.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const sorted = [...recommendations].sort((a, b) => a.phosphorus - b.phosphorus).slice(0, 8);
      const barW = w - 20, barX = 10, barY = 30, barH = 24, gap = 6;
      const limit = pLimit || 1.0;
      const maxP = Math.max(limit, ...sorted.map(f => f.phosphorus)) * 1.2;
      sorted.forEach((food, i) => {
        const y = barY + i * (barH + gap), bw = (food.phosphorus / maxP) * barW;
        ctx.fillStyle = food.phosphorus <= limit ? '#4a8' : '#e8a838';
        ctx.fillRect(barX, y, bw, barH);
        ctx.fillStyle = '#3e2e23'; ctx.font = '10px sans-serif';
        ctx.fillText(food.brand, barX + 4, y + barH / 2 + 4);
      });
      const limitX = barX + (limit / maxP) * barW;
      ctx.beginPath(); ctx.moveTo(limitX, barY - 2); ctx.lineTo(limitX, barY + sorted.length * (barH + gap));
      ctx.strokeStyle = '#c44'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#c44'; ctx.font = '10px sans-serif';
      ctx.fillText('限' + limit + '%', limitX + 4, barY - 4);
    }).exec();
  },
});
