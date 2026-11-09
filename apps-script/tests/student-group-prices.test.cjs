const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/backend-fixture.cjs');

const save = (f, studentId, hour1, hour2, token = 'coach') => f.run({ action: 'setStudentGroupPrices', lineId: 'account', studentId, groupPrices: { hour1, hour2 } }, token);
const quote = (f, extra = {}) => f.run({ action: 'getBookingQuote', slotId: 'group', ...extra });
test('only verified coaches can set individual prices and ownership/IDs must match a unique registered student', () => {
  const f = fixture(), before = JSON.stringify(f.rows);
  assert.equal(save(f, 'a', 250, 450, 'user').status, 'error');
  assert.equal(save(f, 'missing', 250, 450).status, 'error');
  assert.equal(JSON.stringify(f.rows), before);
  assert.equal(save(f, 'a', 250, 450).status, 'success');
  const row = f.rows['學員團課價格'][1]; assert.equal(row[0], 'account'); assert.equal(row[1], 'a');
  assert(f.network.every(call => !call.locked)); assert.equal(f.state().locked, false);
});
test('unset single-class prices are exactly 300/550 regardless of stored membership tiers', () => {
  const f = fixture(); assert.equal(quote(f).quote.totalPrice, 600);
  f.rows['可用時段'][1][3] = '19:00 - 21:00';
  f.rows['會員資料'][1][5] = 5;
  const result = quote(f).quote; assert.equal(result.totalPrice, 1100); assert.equal(result.regularTotalPrice, 1100);
  assert.deepEqual(result.studentPrices.map(p => p.price), [550, 550]);
});
test('same-account siblings receive different prices without further membership discounts', () => {
  const f = fixture(); save(f, 'a', 250, 450); save(f, 'b', 270, 480);
  const result = quote(f).quote; assert.equal(result.totalPrice, 520); assert.equal(result.regularTotalPrice, 600); assert.equal(result.unitPrice, null);
  assert.deepEqual(result.studentPrices.map(p => [p.studentId, p.label, p.price]), [['a', '甲', 250], ['b', '乙', 270]]);
  f.rows['可用時段'][1][3] = '19:00 - 21:00';
  assert.equal(quote(f).quote.totalPrice, 930); assert.equal(quote(f).quote.regularTotalPrice, 1100);
  assert.equal(quote(f, { lineId: 'other', accessToken: 'other' }).quote.totalPrice, 550);
});
test('bookings ignore caller rates and write each student charge to that student order', () => {
  const f = fixture(); save(f, 'a', '250.25', 450); save(f, 'b', 260, 480);
  const q = quote(f).quote;
  const result = f.run({ action: 'bookClass', slotId: 'group', expectedTotalPrice: q.totalPrice, expectedStudentPrices: q.studentPrices, paidPrice: 1, groupPrices: { hour1: 1 }, studentPrices: [{ price: 1 }] });
  assert.equal(result.status, 'success'); assert.equal(result.totalPrice, 510.25);
  assert.deepEqual(f.rows['預約名單'].slice(1).map(r => [r[9], r[4]]), [['a', 250.25], ['b', 260]]);
  assert.equal(f.rows['可用時段'][1][6], 3);
});
test('changed line items reject stale checkout even when their aggregate stays the same', () => {
  const f = fixture(); save(f, 'a', 250, 450); save(f, 'b', 270, 480); const q = quote(f).quote;
  save(f, 'a', 260, 450); save(f, 'b', 260, 480); const before = JSON.stringify(f.rows);
  const result = f.run({ action: 'bookClass', slotId: 'group', expectedTotalPrice: q.totalPrice, expectedStudentPrices: q.studentPrices });
  assert.equal(result.status, 'error'); assert.match(result.message, /價格已有變更/); assert.equal(JSON.stringify(f.rows), before);
});
test('coach single registration quotes and charges only the selected learner', () => {
  const f = fixture(); save(f, 'a', 250, 450); save(f, 'b', 270, 480);
  const payload = { lineId: 'account', slotId: 'group', studentIds: ['b'], kind: 'single' };
  const q = f.run({ action: 'getBookingQuote', ...payload }, 'coach').quote; assert.equal(q.totalPrice, 270);
  const result = f.run({ action: 'coachRegisterSingle', ...payload, expectedTotalPrice: q.totalPrice, expectedStudentPrices: q.studentPrices }, 'coach');
  assert.equal(result.status, 'success'); assert.equal(f.rows['預約名單'][1][9], 'b'); assert.equal(f.rows['預約名單'][1][4], 270);
});
test('monthly packages and private lessons retain their existing prices', () => {
  const f = fixture(); save(f, 'a', 1, 2); save(f, 'b', 3, 4);
  assert.equal(quote(f, { slotId: 'monthly' }).quote.totalPrice, 1960);
  assert.equal(quote(f, { slotId: 'private', coachType: '1對2', location: '場地A' }).quote.totalPrice, 1470);
});
test('clearing one price restores only that duration; zero is a real free price', () => {
  const f = fixture(); save(f, 'a', 0, 450); assert.equal(quote(f).quote.totalPrice, 300);
  save(f, 'a', '', 450); assert.equal(quote(f).quote.totalPrice, 600);
  f.rows['可用時段'][1][3] = '19:00 - 21:00'; assert.equal(quote(f).quote.totalPrice, 1000);
  save(f, 'a', '', null); assert.equal(quote(f).quote.totalPrice, 1100);
});
test('invalid fees, duplicate records, and changed headers fail without charging or mutating data', () => {
  const f = fixture();
  for (const value of [-1, 1.001, true, '=1', {}, 10000001]) { const before = JSON.stringify(f.rows); assert.equal(save(f, 'a', value, 450).status, 'error'); assert.equal(JSON.stringify(f.rows), before); }
  save(f, 'a', 250, 450); f.rows['學員團課價格'].push(f.rows['學員團課價格'][1].slice());
  assert.equal(quote(f).status, 'error'); assert.equal(save(f, 'a', 260, 460).status, 'error');
  f.rows['學員團課價格'].pop(); f.rows['學員團課價格'][0][2] = 'custom';
  assert.equal(save(f, 'a', 260, 460).status, 'error');
});
test('failed inserts and updates restore saved prices, and prior booking amounts remain unchanged', () => {
  const f = fixture(); f.failNextFlush(); assert.equal(save(f, 'a', 250, 450).status, 'error'); assert.equal(f.rows['學員團課價格'].length, 1);
  save(f, 'a', 250, 450); const previous = JSON.stringify(f.rows['學員團課價格']); f.failNextFlush();
  assert.equal(save(f, 'a', 260, 460).status, 'error'); assert.equal(JSON.stringify(f.rows['學員團課價格']), previous);
  f.run({ action: 'bookClass', slotId: 'group' }); const orders = JSON.stringify(f.rows['預約名單']);
  save(f, 'a', 280, 500); assert.equal(JSON.stringify(f.rows['預約名單']), orders);
});
test('legacy single-student accounts keep their empty student ID and read-only APIs never create the price sheet', () => {
  const f = fixture(); f.rows['會員資料'][1][6] = '';
  assert.equal(f.run({ action: 'getSlots' }).status, 'success'); assert.equal(f.rows['學員團課價格'], undefined);
  assert.equal(save(f, '', 240, 440).status, 'success'); assert.equal(quote(f).quote.totalPrice, 240);
  const members = f.run({ action: 'getCoachData' }, 'coach'); assert.equal(members.studentGroupPricingVersion, 1);
  assert.deepEqual(members.members[0].groupPrices, { hour1: 240, hour2: 440 }); assert.equal(members.groupPriceDefaults.hour2, 550);
});
