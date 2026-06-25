const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateFeedingLog, feedingLogFromFormData, formValuesFromFeedingLog, FeedingLogStore } = require('../public/feeding-log');

describe('validateFeedingLog', () => {
  it('should reject missing date', () => {
    const r = validateFeedingLog({ foodId: 'x', grams: 50 });
    assert.strictEqual(r.valid, false);
  });

  it('should reject grams <= 0', () => {
    const r = validateFeedingLog({ date: '2026-01-01', foodId: 'x', grams: 0 });
    assert.strictEqual(r.valid, false);
  });

  it('should reject future date', () => {
    const r = validateFeedingLog({ date: '2099-01-01', foodId: 'x', grams: 50 });
    assert.strictEqual(r.valid, false);
  });

  it('should reject stoolScore out of 1-5', () => {
    const r = validateFeedingLog({ date: '2026-01-01', foodId: 'x', grams: 50, stoolScore: 6 });
    assert.strictEqual(r.valid, false);
  });

  it('should reject missing foodId', () => {
    const r = validateFeedingLog({ date: '2026-01-01', grams: 50 });
    assert.strictEqual(r.valid, false);
  });

  it('should accept valid log', () => {
    const r = validateFeedingLog({ date: '2026-01-01', foodId: 'x', grams: 50, stoolScore: 3 });
    assert.strictEqual(r.valid, true);
  });
});

describe('feedingLogFromFormData ↔ formValuesFromFeedingLog', () => {
  it('should roundtrip petId', () => {
    const log = feedingLogFromFormData({ date: '2026-01-01', foodId: '33', foodName: '渴望', grams: '80' }, 'pet_abc');
    assert.strictEqual(log.petId, 'pet_abc');
    assert.strictEqual(log.foodName, '渴望');
    assert.strictEqual(log.grams, 80);
  });

  it('should roundtrip scores as null when empty', () => {
    const log = feedingLogFromFormData({ date: '2026-01-01', foodId: '33', foodName: 'x', grams: '80' }, 'p1');
    assert.strictEqual(log.stoolScore, null);
  });
});

describe('FeedingLogStore', () => {
  function makeStorage() {
    const s = {};
    return { getItem: (k) => s[k] || null, setItem: (k, v) => { s[k] = v; }, removeItem: (k) => { delete s[k]; } };
  }

  it('should create log with id and timestamps', () => {
    const fs = new FeedingLogStore(makeStorage());
    const log = fs.create({ petId: 'p1', date: '2026-01-01', foodId: '33', foodName: '渴望', grams: 80 });
    assert.ok(log.id.startsWith('feed_'));
    assert.ok(log.createdAt);
  });

  it('should update without changing id or createdAt', () => {
    const fs = new FeedingLogStore(makeStorage());
    const log = fs.create({ petId: 'p1', date: '2026-01-01', foodId: '33', foodName: '渴望', grams: 80 });
    const updated = fs.update(log.id, { grams: 100 });
    assert.strictEqual(updated.grams, 100);
    assert.strictEqual(updated.id, log.id);
    assert.strictEqual(updated.createdAt, log.createdAt);
  });

  it('should filterByPet correctly', () => {
    const fs = new FeedingLogStore(makeStorage());
    fs.create({ petId: 'p1', date: '2026-01-01', foodId: 'x', foodName: 'a', grams: 50 });
    fs.create({ petId: 'p2', date: '2026-01-02', foodId: 'x', foodName: 'b', grams: 60 });
    fs.create({ petId: 'p1', date: '2026-01-03', foodId: 'x', foodName: 'c', grams: 70 });
    const p1Logs = fs.filterByPet('p1');
    assert.strictEqual(p1Logs.length, 2);
  });

  it('should filterByDateRange within endpoints', () => {
    const fs = new FeedingLogStore(makeStorage());
    fs.create({ petId: 'p1', date: '2026-01-01', foodId: 'x', foodName: 'a', grams: 50 });
    fs.create({ petId: 'p1', date: '2026-01-15', foodId: 'x', foodName: 'b', grams: 60 });
    fs.create({ petId: 'p1', date: '2026-02-01', foodId: 'x', foodName: 'c', grams: 70 });
    const filtered = fs.filterByDateRange('p1', '2026-01-01', '2026-01-31');
    assert.strictEqual(filtered.length, 2);
  });

  it('should handle corrupted JSON gracefully', () => {
    const storage = makeStorage();
    storage.setItem('feedingLogs_v1', 'not-json{{{');
    const fs = new FeedingLogStore(storage);
    assert.deepStrictEqual(fs.loadAll(), []);
  });

  it('should delete log and return true', () => {
    const fs = new FeedingLogStore(makeStorage());
    const log = fs.create({ petId: 'p1', date: '2026-01-01', foodId: 'x', foodName: 'a', grams: 50 });
    assert.strictEqual(fs.delete(log.id), true);
    assert.strictEqual(fs.loadAll().length, 0);
  });
});
