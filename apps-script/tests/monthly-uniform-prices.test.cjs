const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/backend-fixture.cjs');

function monthly(f, count = 4, hours = 1) {
  const row = f.rows['可用時段'].find(row => row[0] === 'monthly');
  row[1] = `[月繳${count}堂] 團課`;
  row[2] = count === 5 ? '2026年 12/1, 12/8, 12/15, 12/22, 12/29' : '2026年 12/1, 12/8, 12/15, 12/22';
  row[3] = hours === 2 ? '19:00 - 21:00' : '19:00 - 20:00';
  return row;
}
for (const count of [4, 5]) for (const hours of [1, 2]) test(`${count} lessons / ${hours} hours use the same monthly price for all five membership levels`, () => {
  const f = fixture(); monthly(f, count, hours);
  for (let level = 1; level <= 5; level++) {
    f.rows['會員資料'][1][5] = level;
    const result = f.run({ action: 'getBookingQuote', slotId: 'monthly', level: 5, paidPrice: 1, count: count === 4 ? 5 : 4 });
    assert.equal(result.status, 'success'); assert.equal(result.quote.unitPrice, count * 250 * hours);
    assert.equal(result.quote.regularTotalPrice, count * 300 * hours * 2); assert.equal(result.quote.totalPrice, count * 250 * hours * 2);
  }
});
test('monthly preview derives four/five lessons from the selected month and ignores caller count, base and membership', () => {
  const f = fixture();
  for (const [date, count] of [['2026-11-04', 4], ['2026-12-01', 5]]) {
    const result = f.run({ action: 'getPricingPreview', mode: 'monthly', date, startTime: '19:00', endTime: '20:00', count: 99, basePrice: 1 }, 'coach');
    assert.equal(result.monthlyUniformPricingVersion, 1); assert.equal(result.tariff.count, count);
    assert.deepEqual(Object.values(result.prices), Array(5).fill(count * 250)); assert.equal(result.tariff.regular, count * 300);
  }
});
test('new monthly courses store one server-owned fee across all five legacy price columns', () => {
  const f = fixture(), template = monthly(f, 5);
  const result = f.run({ action: 'addSlot', title: template[1], date: template[2], time: template[3], location: '場地A', capacity: 6, teachingCoachId: 'teacher', prices: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 } }, 'coach');
  assert.equal(result.status, 'success'); assert.deepEqual(Array.from(f.rows['可用時段'].at(-1).slice(7, 12)), [1250, 1250, 1250, 1250, 1250]);
});
test('monthly editing normalizes future prices while keeping every existing order amount', () => {
  const f = fixture(), row = monthly(f, 4);
  f.rows['預約名單'].push([new Date(), 'monthly', 'account', '王小明', 980, '預約成功', '12345', 'old-order', '', 'a']);
  const orders = JSON.stringify(f.rows['預約名單']);
  const result = f.run({ action: 'updateSlot', slotId: 'monthly', title: row[1], date: row[2], time: row[3], location: row[4], capacity: 6, prices: { 1: 1, 2: 2 } }, 'coach');
  assert.equal(result.status, 'success'); assert.deepEqual(row.slice(7, 12), [1000, 1000, 1000, 1000, 1000]); assert.equal(JSON.stringify(f.rows['預約名單']), orders);
});
test('student booking and coach subset enrollment charge the uniform monthly price per selected learner', () => {
  for (const coach of [false, true]) {
    const f = fixture(); monthly(f, 5);
    const result = f.run({ action: coach ? 'coachRegisterMonthly' : 'bookClass', lineId: 'account', slotId: 'monthly', ...(coach ? { studentIds: ['b'] } : {}), expectedTotalPrice: coach ? 1250 : 2500, paidPrice: 1 }, coach ? 'coach' : 'user');
    assert.equal(result.status, 'success'); assert.equal(result.totalPrice, coach ? 1250 : 2500);
    assert.deepEqual(f.rows['預約名單'].slice(1).map(row => row[4]), coach ? [1250] : [1250, 1250]);
    assert.equal(f.rows['可用時段'].find(row => row[0] === 'monthly')[6], coach ? 4 : 3);
  }
});
test('old member-discount quotes cannot be silently charged at the new price', () => {
  const f = fixture(); monthly(f, 4); const before = JSON.stringify(f.rows);
  const result = f.run({ action: 'bookClass', slotId: 'monthly', expectedTotalPrice: 1960 });
  assert.equal(result.status, 'error'); assert.match(result.message, /價格已有變更/); assert.equal(JSON.stringify(f.rows), before);
});
test('mismatched or duplicate monthly dates cannot create a cheaper mislabeled package', () => {
  for (const date of ['2026年 12/1, 12/8, 12/15, 12/22', '2026年 12/1, 12/8, 12/15, 12/22, 12/22']) {
    const f = fixture(), before = JSON.stringify(f.rows);
    const result = f.run({ action: 'addSlot', title: '[月繳5堂] 團課', date, time: '19:00 - 20:00', location: '場地A', capacity: 5, teachingCoachId: 'teacher', prices: { 1: 1 } }, 'coach');
    assert.equal(result.status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  }
});
test('unannounced legacy monthly packages use the stored base price uniformly instead of any VIP tier', () => {
  const f = fixture(), row = monthly(f, 4); row[1] = '[月繳3堂] 團課'; row[2] = '2026年 12/1, 12/8, 12/15'; row[7] = 800; row[8] = 1;
  assert.equal(f.run({ action: 'getBookingQuote', slotId: 'monthly' }).quote.unitPrice, 800);
});
