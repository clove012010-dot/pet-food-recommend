/* ===== 多宠物档案数据层 =====
 * 双环境导出：Node (module.exports) / 浏览器 (window.PetProfile)
 * 移植小程序时将 localStorage mock 为 wx.setStorageSync 即可
 */

const DEFAULT_PROFILE = {
  name: '',
  species: '',
  breedId: '',
  ageMonths: 12,
  weightKg: 5,
  sex: 'unknown',
  neutered: 'unknown',
  bodyConditionScore: 5,
  activityLevel: 'normal',
  targetWeightKg: null,
  budgetLevel: 'any',
  foodType: ['dry'],
  preferredGoal: '',
  allergies: [],
  diseases: [],
};

function generateId() {
  return 'pet_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizeProfile(p) {
  const base = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  const merged = { ...base, ...p };
  // normalize neutered: true/false/'unknown'
  if (merged.neutered === true) merged.neutered = 'true';
  else if (merged.neutered === false) merged.neutered = 'false';
  else if (!['true', 'false', 'unknown'].includes(merged.neutered)) merged.neutered = 'unknown';
  // normalize arrays
  if (!Array.isArray(merged.foodType)) merged.foodType = ['dry'];
  if (!Array.isArray(merged.allergies)) merged.allergies = [];
  if (!Array.isArray(merged.diseases)) merged.diseases = [];
  return merged;
}

function validateProfile(p) {
  const errors = [];
  if (!p.name || typeof p.name !== 'string' || p.name.trim() === '') {
    errors.push('宠物名称不能为空');
  }
  if (p.species !== 'dog' && p.species !== 'cat') {
    errors.push('物种必须为 dog 或 cat');
  }
  if (!p.breedId || typeof p.breedId !== 'string' || p.breedId.trim() === '') {
    errors.push('品种不能为空');
  }
  if (typeof p.ageMonths === 'number' && (p.ageMonths < 1 || p.ageMonths > 300)) {
    errors.push('年龄月份需在 1-300 之间');
  }
  if (typeof p.weightKg === 'number' && (p.weightKg < 0.5 || p.weightKg > 100)) {
    errors.push('体重需在 0.5-100kg 之间');
  }
  if (typeof p.bodyConditionScore === 'number' && (p.bodyConditionScore < 1 || p.bodyConditionScore > 9)) {
    errors.push('体态评分需在 1-9 之间');
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

/* ===== ProfileStore ===== */

class ProfileStore {
  constructor(storage) {
    this.storage = storage;
    this.key = 'petProfiles_v1';
    this.activeKey = 'activePetId_v1';
  }

  loadAll() {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data;
    } catch {
      return [];
    }
  }

  saveAll(profiles) {
    this.storage.setItem(this.key, JSON.stringify(profiles));
  }

  getById(id) {
    const all = this.loadAll();
    return all.find(p => p.id === id) || null;
  }

  getActive() {
    const activeId = this.storage.getItem(this.activeKey);
    if (!activeId) {
      const all = this.loadAll();
      if (all.length > 0) {
        this.storage.setItem(this.activeKey, all[0].id);
        return all[0];
      }
      return null;
    }
    const profile = this.getById(activeId);
    if (!profile) {
      const all = this.loadAll();
      if (all.length > 0) {
        this.storage.setItem(this.activeKey, all[0].id);
        return all[0];
      }
      this.storage.removeItem(this.activeKey);
      return null;
    }
    return profile;
  }

  setActiveId(id) {
    this.storage.setItem(this.activeKey, id);
  }

  create(profile) {
    const all = this.loadAll();
    const now = new Date().toISOString();
    const newProfile = {
      ...normalizeProfile(profile),
      id: generateId(),
      createdAt: now,
      updatedAt: now
    };
    all.push(newProfile);
    this.saveAll(all);
    if (all.length === 1) this.setActiveId(newProfile.id);
    return newProfile;
  }

  update(id, updates) {
    const all = this.loadAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const merged = normalizeProfile({ ...all[idx], ...updates });
    // remove timestamps from updates so they don't overwrite
    delete merged.createdAt;
    delete merged.updatedAt;
    delete merged.id;
    const updated = {
      ...all[idx],
      ...updates,
      id: all[idx].id,
      createdAt: all[idx].createdAt,
      updatedAt: new Date().toISOString()
    };
    all[idx] = updated;
    this.saveAll(all);
    return updated;
  }

  delete(id) {
    let all = this.loadAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    this.saveAll(all);
    const activeId = this.storage.getItem(this.activeKey);
    if (activeId === id) {
      if (all.length > 0) {
        this.setActiveId(all[0].id);
      } else {
        this.storage.removeItem(this.activeKey);
      }
    }
    return true;
  }

  duplicate(id) {
    const source = this.getById(id);
    if (!source) return null;
    const copy = JSON.parse(JSON.stringify(source));
    copy.name = (copy.name || '档案') + '（副本）';
    delete copy.id;
    delete copy.createdAt;
    delete copy.updatedAt;
    return this.create(copy);
  }

  // profileFormData ↔ formValuesForProfile roundtrip
  static profileFromFormData(formData) {
    return normalizeProfile({
      name: formData.get('name') || '',
      species: formData.get('species') || '',
      breedId: formData.get('breedId') || '',
      ageMonths: parseInt(formData.get('ageMonths'), 10) || 12,
      weightKg: parseFloat(formData.get('weightKg')) || 5,
      sex: formData.get('sex') || 'unknown',
      neutered: formData.get('neutered') || 'unknown',
      bodyConditionScore: parseInt(formData.get('bodyConditionScore'), 10) || 5,
      activityLevel: formData.get('activityLevel') || 'normal',
      targetWeightKg: formData.get('targetWeightKg') ? parseFloat(formData.get('targetWeightKg')) : null,
      budgetLevel: formData.get('budgetLevel') || 'any',
      foodType: formData.getAll ? formData.getAll('foodType') : (formData.foodType || ['dry']),
      preferredGoal: formData.get('preferredGoal') || '',
      allergies: formData.getAll ? formData.getAll('allergies') : (formData.allergies || []),
      diseases: formData.getAll ? formData.getAll('diseases') : (formData.diseases || []),
    });
  }

  static formValuesFromProfile(profile) {
    const p = normalizeProfile(profile);
    const neutered = p.neutered === 'true' ? true : (p.neutered === 'false' ? false : 'unknown');
    return {
      name: p.name,
      species: p.species,
      breedId: p.breedId,
      ageMonths: p.ageMonths,
      weightKg: p.weightKg,
      sex: p.sex,
      neutered,
      bodyConditionScore: p.bodyConditionScore,
      activityLevel: p.activityLevel,
      targetWeightKg: p.targetWeightKg || null,
      budgetLevel: p.budgetLevel,
      foodType: p.foodType,
      preferredGoal: p.preferredGoal,
      allergies: p.allergies,
      diseases: p.diseases,
    };
  }
}

/* ===== 双环境导出 ===== */
const api = { DEFAULT_PROFILE, generateId, normalizeProfile, validateProfile, ProfileStore };

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.PetProfile = api;
}
