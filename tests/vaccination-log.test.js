const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateVaccinationLog, vaccinationLogFromFormData, formValuesFromVaccinationLog, VaccinationLogStore, getDaysUntil } = require('../public/vaccination-log');

describe('validateVaccinationLog', () => {
  it('should reject missing date', () => {
    const r = validateVaccinationLog({ vaccineName: '狂犬' });
    assert.strictEqual(r.valid, false);
  });

  it('should reject empty vaccine name', () => {
    const r = validateVaccinationLog({ date: '2026-01-01', vaccineName: '' });
    assert.strictEqual(r.valid, false);
  });

  it('should reject vaccine name > 50 chars', () => {
    const r = validateVaccinationLog({ date: '2026-01-01', vaccineName: 'x'.repeat(51) });
    assert.strictEqual(r.valid, false);
  });

  it('should reject nextDueDate before date', () => {
    const r = validateVaccinationLog({ date: '2026-02-01', vaccineName: '狂犬', nextDueDate: '2026-01-01' });
    assert.strictEqual(r.valid, false);
  });

  it('should reject future date', () => {
    const r = validateVaccinationLog({ date: '2099-01-01', vaccineName: '狂犬' });
    assert.strictEqual(r.valid, false);
  });

  it('should accept valid log', () => {
    const r = validateVaccinationLog({ date: '2026-01-01', vaccineName: '狂犬疫苗', nextDueDate: '2027-01-01' });
    assert.strictEqual(r.valid, true);
  });
});

describe('getDaysUntil', () => {
  it('should return positive for future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const d = future.toISOString().slice(0, 10);
    assert.ok(getDaysUntil(d) >= 29);
  });

  it('should return 0 for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = getDaysUntil(today);
    assert.ok(result >= -1 && result <= 0, `Expected 0 but got ${result} (timezone edge)`);
  });

  it('should return negative for past date', () => {
    assert.ok(getDaysUntil('2020-01-01') < 0);
  });

  it('should return null for null input', () => {
    assert.strictEqual(getDaysUntil(null), null);
  });

  it('should return null for invalid format', () => {
    assert.strictEqual(getDaysUntil('not-a-date'), null);
  });
});

describe('vaccinationLogFromFormData roundtrip', () => {
  it('should roundtrip petId', () => {
    const log = vaccinationLogFromFormData({ date: '2026-01-01', vaccineName: '狂犬', nextDueDate: '2027-01-01' }, 'pet_x');
    assert.strictEqual(log.petId, 'pet_x');
  });
});

describe('VaccinationLogStore', () => {
  function makeStorage() {
    const s = {};
    return { getItem: (k) => s[k] || null, setItem: (k, v) => { s[k] = v; }, removeItem: (k) => { delete s[k]; } };
  }

  it('should create with id and timestamps', () => {
    const vs = new VaccinationLogStore(makeStorage());
    const log = vs.create({ petId: 'p1', date: '2026-01-01', vaccineName: '狂犬' });
    assert.ok(log.id.startsWith('vax_'));
    assert.ok(log.createdAt);
  });

  it('should update and preserve id', () => {
    const vs = new VaccinationLogStore(makeStorage());
    const log = vs.create({ petId: 'p1', date: '2026-01-01', vaccineName: '狂犬' });
    const updated = vs.update(log.id, { vaccineName: '联苗' });
    assert.strictEqual(updated.vaccineName, '联苗');
    assert.strictEqual(updated.id, log.id);
  });

  it('should delete and return true', () => {
    const vs = new VaccinationLogStore(makeStorage());
    const log = vs.create({ petId: 'p1', date: '2026-01-01', vaccineName: '狂犬' });
    assert.strictEqual(vs.delete(log.id), true);
    assert.strictEqual(vs.loadAll().length, 0);
  });

  it('should filter upcoming and overdue', () => {
    const vs = new VaccinationLogStore(makeStorage());
    const today = new Date();
    const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
    const lastWeek = new Date(today); lastWeek.setDate(today.getDate() - 7);
    vs.create({ petId: 'p1', date: '2026-01-01', vaccineName: '狂犬', nextDueDate: nextWeek.toISOString().slice(0, 10) });
    vs.create({ petId: 'p1', date: '2026-01-01', vaccineName: '联苗', nextDueDate: lastWeek.toISOString().slice(0, 10) });
    assert.strictEqual(vs.filterUpcoming('p1').length, 1);
    assert.strictEqual(vs.filterOverdue('p1').length, 1);
  });

  it('should handle corrupted JSON', () => {
    const storage = makeStorage();
    storage.setItem('vaccinationLogs_v1', 'bad-json');
    const vs = new VaccinationLogStore(storage);
    assert.deepStrictEqual(vs.loadAll(), []);
  });
});
