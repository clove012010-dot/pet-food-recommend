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

Page({
  data: {
    currentTab: 'recommend',
    profiles: [], activeProfile: {}, activeIdx: 0, profileNames: [],
    speciesOptions, sexOptions, nuteredOptions, bcsOptions, activityOptions, budgetOptions, goalOptions, foodTypeOptions,
    breedNames: [], breedIdx: 0,
    sexIdx: 1, nuteredIdx: 1, bcsIdx: 4, activityIdx: 1, budgetIdx: 0, goalIdx: 0,
    formData: { species: 'cat', breedId: '', ageMonths: 12, weightKg: 5, sex: 'male', neutered: 'unknown', bodyConditionScore: 5, activityLevel: 'normal', budgetLevel: 'any', preferredGoal: '', foodType: ['干粮'], allergies: [], diseases: [] },
    showResults: false, recommendations: [],
    feedDate: '', feedFoodName: '', feedGrams: '', feedStool: '', feedTear: '', feedSkin: '', feedNote: '', feedHint: '', feedList: [],
    vaxDate: '', vaxName: '', vaxNextDue: '', vaxVet: '', vaxNote: '', vaxHint: '', vaxAlerts: [], vaxList: [],
    scoreOptions: ['-','1','2','3','4','5'],
  },

  onLoad() {
    this.profileStore = new PetProfile.ProfileStore(wxStorage);
    this.feedingLogStore = new FeedingLog.FeedingLogStore(wxStorage);
    this.vaccinationLogStore = new VaccinationLog.VaccinationLogStore(wxStorage);
    this.initBreeds();
    this.initProfileBar();
  },

  initBreeds() {
    this.breeds = loadBreeds();
  },

  onSpeciesChange(e) {
    const idx = parseInt(e.detail.value);
    const species = idx === 0 ? 'cat' : 'dog';
    const list = (this.breeds[species] || []).map(b => b.fullName + '(' + b.typicalWeightKg + 'kg)');
    this.setData({ 'formData.species': species, breedNames: list, breedIdx: 0, 'formData.breedId': '' });
  },

  onBreedChange(e) { this.setData({ breedIdx: parseInt(e.detail.value) }); },

  onInput(e) { this.setData({ ['formData.' + e.currentTarget.dataset.field]: e.detail.value }); },

  onSexChange(e) { const m = ['unknown','male','female']; this.setData({ sexIdx: parseInt(e.detail.value), 'formData.sex': m[parseInt(e.detail.value)] }); },
  onNeuteredChange(e) { const m = ['unknown', true, false]; this.setData({ nuteredIdx: parseInt(e.detail.value), 'formData.neutered': m[parseInt(e.detail.value)] }); },
  onBcsChange(e) { this.setData({ bcsIdx: parseInt(e.detail.value), 'formData.bodyConditionScore': parseInt(e.detail.value) + 1 }); },
  onActivityChange(e) { const m = ['low','normal','high']; this.setData({ activityIdx: parseInt(e.detail.value), 'formData.activityLevel': m[parseInt(e.detail.value)] }); },
  onBudgetChange(e) { const m = ['any','low','medium','high']; this.setData({ budgetIdx: parseInt(e.detail.value), 'formData.budgetLevel': m[parseInt(e.detail.value)] }); },
  onGoalChange(e) { const m = ['','减重','美毛','肠胃','低敏','关节','泌尿','性价比']; this.setData({ goalIdx: parseInt(e.detail.value), 'formData.preferredGoal': m[parseInt(e.detail.value)] }); },

  onFoodTypeChange(e) {
    const vals = e.detail.value;
    this.setData({ 'formData.foodType': vals.map(v => {
      if (v === '干粮') return 'dry';
      if (v === '含冻干') return 'freeze_dried';
      if (v === '无谷') return 'grain_free';
      return 'dry';
    })});
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    if (tab === 'feeding') this.renderFeeding();
    if (tab === 'vaccination') this.renderVax();
  },

  onSubmit() {
    const fd = this.data.formData;
    if (!fd.breedId) { wx.showToast({ title: '请选择品种', icon: 'none' }); return; }
    const input = {
      species: fd.species, breedId: fd.breedId, ageMonths: parseInt(fd.ageMonths),
      weightKg: parseFloat(fd.weightKg), bodyConditionScore: fd.bodyConditionScore,
      activityLevel: fd.activityLevel, diseases: fd.diseases, allergies: fd.allergies,
      sex: fd.sex, neutered: fd.neutered, budgetLevel: fd.budgetLevel,
      foodType: fd.foodType, preferredGoal: fd.preferredGoal
    };
    const v = validateInput(input);
    if (!v.valid) { wx.showToast({ title: v.errors[0], icon: 'none' }); return; }
    const result = recommend(input);
    if (result.error) { wx.showToast({ title: '推荐失败', icon: 'none' }); return; }
    this.setData({ showResults: true, recommendations: result.recommendations });
  },

  initProfileBar() {
    const all = this.profileStore.loadAll();
    if (all.length === 0) {
      this.setData({ profiles: [], activeProfile: {}, profileNames: [] });
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
      'formData.species': pf.species, speciesIdx,
      breedNames: list, breedIdx: breedObj ? list.indexOf(breedObj.fullName + '(' + breedObj.typicalWeightKg + 'kg)') : 0,
      'formData.breedId': pf.breedId, 'formData.ageMonths': pf.ageMonths, 'formData.weightKg': pf.weightKg,
    });
  },

  onNewProfile() {
    const that = this;
    wx.showModal({ title: '新建档案', editable: true, placeholderText: '起个名字', success(res) {
      if (!res.confirm || !res.content || !res.content.trim()) return;
      const p = that.profileStore.create({ name: res.content.trim(), species: 'cat', breedId: 'british_shorthair', ageMonths: 12, weightKg: 4 });
      that.initProfileBar();
    }});
  },

  onCopyProfile() {
    const active = this.profileStore.getActive();
    if (!active) return;
    this.profileStore.duplicate(active.id);
    this.initProfileBar();
  },

  onSaveProfile() {
    const pf = PetProfile.normalizeProfile(this.data.formData);
    const v = PetProfile.validateProfile(pf);
    if (!v.valid) { wx.showToast({ title: v.errors[0], icon: 'none' }); return; }
    const active = this.profileStore.getActive();
    if (active) this.profileStore.update(active.id, pf);
    this.initProfileBar();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onDeleteProfile() {
    const active = this.profileStore.getActive();
    if (!active) return;
    const that = this;
    wx.showModal({ title: '删除', content: '确定删除「' + active.name + '」？', success(res) {
      if (!res.confirm) return;
      that.profileStore.delete(active.id);
      that.initProfileBar();
    }});
  },

  onSwitchProfile(e) {
    const idx = parseInt(e.detail.value);
    const p = this.data.profiles[idx];
    if (!p) return;
    this.profileStore.setActiveId(p.id);
    this.initProfileBar();
  },

  onProfileNameSave(e) {
    const name = e.detail.value;
    if (!name.trim()) return;
    const active = this.profileStore.getActive();
    if (active) this.profileStore.update(active.id, { name: name.trim() });
  },

  /* ===== 喂食日记 ===== */
  onSubmitFeed() {
    const active = this.profileStore.getActive();
    if (!active) { wx.showToast({ title: '请先创建档案', icon: 'none' }); return; }
    const log = FeedingLog.feedingLogFromFormData({
      date: this.data.feedDate, foodId: this.data.feedFoodId, foodName: this.data.feedFoodName,
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
    const that = this;
    wx.showModal({ title: '删除', content: '删除这条记录？', success(res) { if (res.confirm) { that.feedingLogStore.delete(id); that.renderFeeding(); } } });
  },

  renderFeeding() {
    const active = this.profileStore.getActive();
    if (!active) { this.setData({ feedHint: '请先创建宠物档案', feedList: [] }); return; }
    const logs = this.feedingLogStore.filterByPet(active.id).slice(0, 20);
    this.setData({ feedHint: '当前为 ' + active.name + ' 记录', feedList: logs });
  },

  /* ===== 疫苗日记 ===== */
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
    const that = this;
    wx.showModal({ title: '删除', content: '删除这条记录？', success(res) { if (res.confirm) { that.vaccinationLogStore.delete(id); that.renderVax(); } } });
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
});
