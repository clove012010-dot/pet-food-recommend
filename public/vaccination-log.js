/* ===== 疫苗日记数据层 ===== */
function generateVaxId() {
  return 'vax_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function validateVaccinationLog(input) {
  const errors = [];
  if (!input.date || typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.push('接种日期格式需为 YYYY-MM-DD');
  }
  if (input.date && new Date(input.date) > new Date()) {
    errors.push('接种日期不能是未来');
  }
  if (!input.vaccineName || typeof input.vaccineName !== 'string' || input.vaccineName.trim() === '') {
    errors.push('疫苗名称不能为空');
  }
  if (input.vaccineName && input.vaccineName.length > 50) {
    errors.push('疫苗名称不能超过50个字符');
  }
  if (input.nextDueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueDate)) {
      errors.push('下次接种日期格式需为 YYYY-MM-DD');
    } else if (new Date(input.nextDueDate) < new Date(input.date)) {
      errors.push('下次接种日期不能早于接种日期');
    }
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

function vaccinationLogFromFormData(formData, petId) {
  return {
    petId: petId,
    date: formData.date || new Date().toISOString().slice(0, 10),
    vaccineName: formData.vaccineName || '',
    nextDueDate: formData.nextDueDate || null,
    vet: formData.vet || '',
    note: formData.note || ''
  };
}

function formValuesFromVaccinationLog(log) {
  return {
    date: log.date || '',
    vaccineName: log.vaccineName || '',
    nextDueDate: log.nextDueDate || '',
    vet: log.vet || '',
    note: log.note || ''
  };
}

function getDaysUntil(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

class VaccinationLogStore {
  constructor(storage) {
    this.storage = storage;
    this.key = 'vaccinationLogs_v1';
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
    const log = { ...input, id: generateVaxId(), createdAt: new Date().toISOString() };
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

  filterUpcoming(petId) {
    const today = new Date().toISOString().slice(0, 10);
    return this.filterByPet(petId).filter(l => l.nextDueDate && l.nextDueDate >= today).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)).slice(0, 3);
  }

  filterOverdue(petId) {
    const today = new Date().toISOString().slice(0, 10);
    return this.filterByPet(petId).filter(l => l.nextDueDate && l.nextDueDate < today).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)).slice(0, 3);
  }
}

/* ===== 双环境导出 ===== */
const api = { generateVaxId, validateVaccinationLog, vaccinationLogFromFormData, formValuesFromVaccinationLog, VaccinationLogStore, getDaysUntil };

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.VaccinationLog = api;
}
