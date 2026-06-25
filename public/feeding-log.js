/* ===== 喂食日记数据层 ===== */
const FEEDING_LOG_SCHEMA = {
  id: 'string',
  petId: 'string',
  date: 'string (YYYY-MM-DD)',
  foodId: 'string',
  foodName: 'string',
  grams: 'number',
  stoolScore: 'number (1-5)',
  tearStainScore: 'number (1-5)',
  skinScore: 'number (1-5)',
  note: 'string',
  createdAt: 'string (ISO)'
};

function generateLogId() {
  return 'feed_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function validateFeedingLog(input) {
  const errors = [];
  if (!input.date || typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.push('日期格式需为 YYYY-MM-DD');
  }
  if (input.date && new Date(input.date) > new Date()) {
    errors.push('日期不能是未来');
  }
  if (!input.foodId || typeof input.foodId !== 'string' || input.foodId.trim() === '') {
    errors.push('粮食品种不能为空');
  }
  if (typeof input.grams !== 'number' || input.grams <= 0) {
    errors.push('喂食克数需大于 0');
  }
  if (input.stoolScore !== undefined && input.stoolScore !== null && input.stoolScore !== '') {
    const s = parseInt(input.stoolScore, 10);
    if (isNaN(s) || s < 1 || s > 5) errors.push('便便评分需在 1-5 之间');
  }
  if (input.tearStainScore !== undefined && input.tearStainScore !== null && input.tearStainScore !== '') {
    const s = parseInt(input.tearStainScore, 10);
    if (isNaN(s) || s < 1 || s > 5) errors.push('泪痕评分需在 1-5 之间');
  }
  if (input.skinScore !== undefined && input.skinScore !== null && input.skinScore !== '') {
    const s = parseInt(input.skinScore, 10);
    if (isNaN(s) || s < 1 || s > 5) errors.push('皮肤评分需在 1-5 之间');
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

function feedingLogFromFormData(formData, petId) {
  return {
    petId: petId,
    date: formData.date || new Date().toISOString().slice(0, 10),
    foodId: formData.foodId || '',
    foodName: formData.foodName || '',
    grams: parseFloat(formData.grams) || 0,
    stoolScore: formData.stoolScore ? parseInt(formData.stoolScore, 10) : null,
    tearStainScore: formData.tearStainScore ? parseInt(formData.tearStainScore, 10) : null,
    skinScore: formData.skinScore ? parseInt(formData.skinScore, 10) : null,
    note: formData.note || ''
  };
}

function formValuesFromFeedingLog(log) {
  return {
    date: log.date || '',
    foodId: log.foodId || '',
    foodName: log.foodName || '',
    grams: log.grams || '',
    stoolScore: log.stoolScore || '',
    tearStainScore: log.tearStainScore || '',
    skinScore: log.skinScore || '',
    note: log.note || ''
  };
}

class FeedingLogStore {
  constructor(storage) {
    this.storage = storage;
    this.key = 'feedingLogs_v1';
  }

  loadAll() {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  saveAll(logs) {
    this.storage.setItem(this.key, JSON.stringify(logs));
  }

  getById(id) {
    return this.loadAll().find(l => l.id === id) || null;
  }

  create(input) {
    const all = this.loadAll();
    const log = {
      ...input,
      id: generateLogId(),
      createdAt: new Date().toISOString()
    };
    all.push(log);
    this.saveAll(all);
    return log;
  }

  update(id, updates) {
    const all = this.loadAll();
    const idx = all.findIndex(l => l.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates, id: all[idx].id, createdAt: all[idx].createdAt };
    this.saveAll(all);
    return all[idx];
  }

  delete(id) {
    const all = this.loadAll();
    const idx = all.findIndex(l => l.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    this.saveAll(all);
    return true;
  }

  filterByPet(petId) {
    return this.loadAll().filter(l => l.petId === petId).sort((a, b) => b.date.localeCompare(a.date));
  }

  filterByDateRange(petId, startDate, endDate) {
    return this.filterByPet(petId).filter(l => l.date >= startDate && l.date <= endDate);
  }
}

/* ===== 双环境导出 ===== */
const api = { FEEDING_LOG_SCHEMA, generateLogId, validateFeedingLog, feedingLogFromFormData, formValuesFromFeedingLog, FeedingLogStore };

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.FeedingLog = api;
}
