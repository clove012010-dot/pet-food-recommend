const { describe, it } = require('node:test');
const assert = require('node:assert');
const { DEFAULT_PROFILE, generateId, normalizeProfile, validateProfile, ProfileStore } = require('../public/pet-profile');

describe('validateProfile', () => {
  it('should reject empty name', () => {
    const r = validateProfile({ ...DEFAULT_PROFILE, name: '' });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('名称')));
  });

  it('should reject invalid species', () => {
    const r = validateProfile({ ...DEFAULT_PROFILE, name: 'test', species: 'bird' });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('物种')));
  });

  it('should reject empty breedId', () => {
    const r = validateProfile({ ...DEFAULT_PROFILE, name: 'test', species: 'cat', breedId: '' });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('品种')));
  });

  it('should reject age out of range', () => {
    const r = validateProfile({ ...DEFAULT_PROFILE, name: 'test', species: 'cat', breedId: 'x', ageMonths: 400 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('年龄')));
  });

  it('should reject weight out of range', () => {
    const r = validateProfile({ ...DEFAULT_PROFILE, name: 'test', species: 'cat', breedId: 'x', weightKg: 0.1 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('体重')));
  });

  it('should reject BCS out of range', () => {
    const r = validateProfile({ ...DEFAULT_PROFILE, name: 'test', species: 'cat', breedId: 'x', bodyConditionScore: 15 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('体态')));
  });

  it('should accept valid profile', () => {
    const r = validateProfile({ ...DEFAULT_PROFILE, name: '小花', species: 'cat', breedId: 'british_shorthair' });
    assert.strictEqual(r.valid, true);
  });
});

describe('normalizeProfile', () => {
  it('should normalize neutered true/false/unknown', () => {
    assert.strictEqual(normalizeProfile({ neutered: true }).neutered, 'true');
    assert.strictEqual(normalizeProfile({ neutered: false }).neutered, 'false');
    assert.strictEqual(normalizeProfile({ neutered: 'unknown' }).neutered, 'unknown');
    assert.strictEqual(normalizeProfile({ neutered: 'bad' }).neutered, 'unknown');
  });

  it('should normalize null targetWeightKg', () => {
    const p = normalizeProfile({ targetWeightKg: null });
    assert.strictEqual(p.targetWeightKg, null);
  });

  it('should preserve foodType array', () => {
    const p = normalizeProfile({ foodType: ['freeze_dried', 'grain_free'] });
    assert.deepStrictEqual(p.foodType, ['freeze_dried', 'grain_free']);
  });

  it('should default foodType to dry if not array', () => {
    const p = normalizeProfile({});
    assert.deepStrictEqual(p.foodType, ['dry']);
  });

  it('should default arrays for allergies and diseases', () => {
    const p = normalizeProfile({});
    assert.deepStrictEqual(p.allergies, []);
    assert.deepStrictEqual(p.diseases, []);
  });
});

describe('profileFromFormData ↔ formValuesFromProfile roundtrip', () => {
  it('should roundtrip neutered three states', () => {
    const orig = { ...DEFAULT_PROFILE, name: 't', species: 'cat', breedId: 'x', neutered: 'true' };
    const form = ProfileStore.formValuesFromProfile(orig);
    assert.strictEqual(form.neutered, true);
    const back = normalizeProfile(form);
    assert.strictEqual(back.neutered, 'true');
  });

  it('should roundtrip targetWeightKg null', () => {
    const orig = { ...DEFAULT_PROFILE, name: 't', species: 'cat', breedId: 'x', targetWeightKg: null };
    const form = ProfileStore.formValuesFromProfile(orig);
    assert.strictEqual(form.targetWeightKg, null);
  });

  it('should preserve array order', () => {
    const orig = { ...DEFAULT_PROFILE, name: 't', species: 'cat', breedId: 'x', diseases: ['kidney', 'heart'] };
    const form = ProfileStore.formValuesFromProfile(orig);
    assert.deepStrictEqual(form.diseases, ['kidney', 'heart']);
  });

  it('should handle empty arrays', () => {
    const orig = { ...DEFAULT_PROFILE, name: 't', species: 'cat', breedId: 'x', allergies: [] };
    const form = ProfileStore.formValuesFromProfile(orig);
    assert.deepStrictEqual(form.allergies, []);
  });
});

describe('ProfileStore CRUD', () => {
  function makeStorage() {
    const store = {};
    return {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; }
    };
  }

  it('should create profile with id and timestamps', () => {
    const ps = new ProfileStore(makeStorage());
    const p = ps.create({ name: 'test', species: 'cat', breedId: 'x' });
    assert.ok(p.id.startsWith('pet_'));
    assert.ok(p.createdAt);
    assert.ok(p.updatedAt);
  });

  it('should return null for unknown id', () => {
    const ps = new ProfileStore(makeStorage());
    assert.strictEqual(ps.getById('nonexistent'), null);
  });

  it('should update and bump updatedAt', async () => {
    const ps = new ProfileStore(makeStorage());
    const p = ps.create({ name: 'test', species: 'cat', breedId: 'x' });
    await new Promise(r => setTimeout(r, 10));
    const updated = ps.update(p.id, { name: 'updated' });
    assert.strictEqual(updated.name, 'updated');
    assert.strictEqual(updated.id, p.id);
    assert.ok(updated.updatedAt > p.updatedAt);
  });

  it('should delete and reassign active', () => {
    const ps = new ProfileStore(makeStorage());
    const p1 = ps.create({ name: 'a', species: 'cat', breedId: 'x' });
    const p2 = ps.create({ name: 'b', species: 'dog', breedId: 'x' });
    ps.setActiveId(p1.id);
    ps.delete(p1.id);
    const active = ps.getActive();
    assert.strictEqual(active.id, p2.id);
  });

  it('should clear active when last profile deleted', () => {
    const ps = new ProfileStore(makeStorage());
    const p1 = ps.create({ name: 'a', species: 'cat', breedId: 'x' });
    ps.delete(p1.id);
    assert.strictEqual(ps.getActive(), null);
  });

  it('should duplicate with (副本) suffix', () => {
    const ps = new ProfileStore(makeStorage());
    const p = ps.create({ name: '小花', species: 'cat', breedId: 'x' });
    const dup = ps.duplicate(p.id);
    assert.ok(dup.name.includes('（副本）'));
    assert.notStrictEqual(dup.id, p.id);
  });

  it('should survive JSON storage roundtrip', () => {
    const ps = new ProfileStore(makeStorage());
    ps.create({ name: 'a', species: 'cat', breedId: 'x' });
    ps.create({ name: 'b', species: 'dog', breedId: 'x' });
    const all = ps.loadAll();
    assert.strictEqual(all.length, 2);
  });

  it('should return empty array for corrupted JSON', () => {
    const storage = makeStorage();
    storage.setItem('petProfiles_v1', 'not-json{{{');
    const ps = new ProfileStore(storage);
    assert.deepStrictEqual(ps.loadAll(), []);
  });

  it('should getActive return first if active not set', () => {
    const ps = new ProfileStore(makeStorage());
    const p1 = ps.create({ name: 'a', species: 'cat', breedId: 'x' });
    const active = ps.getActive();
    assert.strictEqual(active.id, p1.id);
  });

  it('should return null from update on nonexistent id', () => {
    const ps = new ProfileStore(makeStorage());
    assert.strictEqual(ps.update('nope', { name: 'x' }), null);
  });

  it('should return false from delete on nonexistent id', () => {
    const ps = new ProfileStore(makeStorage());
    assert.strictEqual(ps.delete('nope'), false);
  });

  it('should return null from duplicate on nonexistent id', () => {
    const ps = new ProfileStore(makeStorage());
    assert.strictEqual(ps.duplicate('nope'), null);
  });
});

/* ===== pet-records schema ===== */
const { FeedingLogSchema, VaccinationLogSchema, createFeedingLog, createVaccinationLog } = require('../public/pet-profile');

describe('pet-records schema', () => {
  it('should createFeedingLog with id + timestamps and not mutate input', () => {
    const input = { petId: 'p1', date: '2026-01-01', foodId: '33', foodName: '渴望', grams: 80 };
    const log = createFeedingLog(input);
    assert.ok(log.id.startsWith('feed_'));
    assert.ok(log.createdAt);
    assert.strictEqual(log.petId, 'p1');
    assert.strictEqual(typeof input.id, 'undefined');
  });

  it('should createVaccinationLog with id + timestamps', () => {
    const log = createVaccinationLog({ petId: 'p1', date: '2026-01-01', vaccineName: '狂犬' });
    assert.ok(log.id.startsWith('vax_'));
    assert.ok(log.createdAt);
  });

  it('should have distinct id prefixes for different record types', () => {
    const feedLog = createFeedingLog({ petId: 'p1', date: '2026-01-01', foodId: '33' });
    const vaxLog = createVaccinationLog({ petId: 'p1', date: '2026-01-01', vaccineName: '狂犬' });
    assert.ok(feedLog.id.startsWith('feed_'));
    assert.ok(vaxLog.id.startsWith('vax_'));
  });

  it('should return null when required fields missing', () => {
    assert.strictEqual(createFeedingLog({ petId: 'p1' }), null);
    assert.strictEqual(createVaccinationLog({ petId: 'p1', date: '2026-01-01' }), null);
  });
});
