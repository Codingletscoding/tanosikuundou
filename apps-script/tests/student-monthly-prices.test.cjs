const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/backend-fixture.cjs');
const save = (f, studentId, hour1, hour2, extra = {}, token = 'coach') => f.run({ action: 'setStudentGroupPrices', lineId: 'account', studentId, groupPrices: { hour1: '', hour2: '' }, monthlyGroupPrices: { hour1, hour2 }, ...extra }, token);
const quote = (f, extra = {}, token = 'user') => f.run({ action: 'getBookingQuote', slotId: 'monthly', ...extra }, token);
function monthly(f, count, hours) {
  const row = f.rows['可用時段'].find(r => r[0] === 'monthly');
  row[1] = `[月繳${count}堂] 團課`;
  row[2] = '2026年 12/1, 12/8, 12/15, 12/22' + (count === 5 ? ', 12/29' : '');
  row[3] = hours === 2 ? '19:00 - 21:00' : '19:00 - 20:00';
}
for (const count of [4, 5]) for (const hours of [1, 2]) test(`${hours}-hour monthly rates multiply the stored per-lesson price by ${count}, independently for siblings`, () => {
  const f = fixture(); monthly(f, count, hours);
  assert.equal(save(f, 'a', 200.25, 420.5).status, 'success');
  assert.equal(save(f, 'b', 220, 440).status, 'success');
  for (const level of [1, 5]) {
    f.rows['會員資料'][1][5] = level;
    const q = quote(f).quote, rates = hours === 1 ? [200.25, 220] : [420.5, 440];
    assert.deepEqual(q.studentPrices.map(p => p.price), rates.map(rate => rate * count));
    assert.equal(q.totalPrice, rates.reduce((a, b) => a + b) * count);
    assert.equal(q.regularTotalPrice, count * 300 * hours * 2);
    assert.equal(q.unitPrice, null); assert(q.studentPrices.every(p => p.isCustom));
  }
  assert.equal(quote(f, { lineId: 'other', accessToken: 'other' }).quote.totalPrice, count * 250 * hours);
});
test('coach members and student slots expose saved monthly prices and actual personalized quotes', () => {
  const f = fixture(); save(f, 'a', 200, 420);
  const members = f.run({ action: 'getCoachData' }, 'coach');
  assert.equal(members.studentMonthlyPricingVersion, 1);
  assert.deepEqual(members.monthlyGroupPriceDefaults, { hour1: 250, hour2: 500 });
  assert.deepEqual(members.members[0].monthlyGroupPrices, { hour1: 200, hour2: 420 });
  const slots = f.run({ action: 'getSlots' });
  assert.equal(slots.studentMonthlyPricingVersion, 1);
  assert.deepEqual(slots.slots.find(s => s.id === 'monthly').priceQuote.studentPrices.map(p => p.price), [800, 1000]);
  assert(!JSON.stringify(slots).includes('monthlyGroupPrices')); // Only that account's quotes are public to it.
});
test('student bookings and coach selected-learner registrations store only server-computed monthly charges', () => {
  for (const coach of [false, true]) {
    const f = fixture(); monthly(f, 5, 2); save(f, 'a', 200, 420); save(f, 'b', 220, 440);
    const subset = coach ? { lineId: 'account', studentIds: ['b'], kind: 'monthly' } : {};
    const q = quote(f, subset, coach ? 'coach' : 'user').quote;
    const r = f.run({ action: coach ? 'coachRegisterMonthly' : 'bookClass', slotId: 'monthly', ...subset, expectedTotalPrice: q.totalPrice, expectedStudentPrices: q.studentPrices, paidPrice: 1, monthlyGroupPrices: { hour1: 1, hour2: 1 }, count: 1 }, coach ? 'coach' : 'user');
    assert.equal(r.status, 'success');
    assert.deepEqual(f.rows['預約名單'].slice(1).map(r => [r[9], r[4]]), coach ? [['b', 2200]] : [['a', 2100], ['b', 2200]]);
    assert.equal(f.rows['可用時段'].find(r => r[0] === 'monthly')[6], coach ? 4 : 3);
  }
});
test('stale monthly line items fail even if combined totals match; existing orders never change', () => {
  const f = fixture(); save(f, 'a', 200, 420); save(f, 'b', 220, 440); const q = quote(f).quote;
  save(f, 'a', 210, 420); save(f, 'b', 210, 440); const before = JSON.stringify(f.rows);
  const stale = f.run({ action: 'bookClass', slotId: 'monthly', expectedTotalPrice: q.totalPrice, expectedStudentPrices: q.studentPrices });
  assert.equal(stale.status, 'error'); assert.match(stale.message, /價格已有變更/); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(f.run({ action: 'bookClass', slotId: 'monthly' }).status, 'success'); const orders = JSON.stringify(f.rows['預約名單']);
  save(f, 'a', 180, 400); assert.equal(JSON.stringify(f.rows['預約名單']), orders);
});
test('blank restores the general promotion separately for each duration; zero means free', () => {
  const f = fixture(); save(f, 'a', 0, 400); assert.equal(quote(f).quote.totalPrice, 1000);
  save(f, 'a', '', 400); assert.equal(quote(f).quote.totalPrice, 2000);
  monthly(f, 4, 2); assert.equal(quote(f).quote.totalPrice, 3600);
  save(f, 'a', '', null); assert.equal(quote(f).quote.totalPrice, 4000);
});
test('monthly prices cannot change single or private lesson prices, and old clients preserve monthly settings', () => {
  const f = fixture(); save(f, 'a', 200, 400, { groupPrices: { hour1: 260, hour2: 480 } });
  assert.equal(f.run({ action: 'getBookingQuote', slotId: 'group' }).quote.totalPrice, 560);
  assert.equal(f.run({ action: 'getBookingQuote', slotId: 'private', coachType: '1對2', location: '場地A' }).quote.totalPrice, 1470);
  const result = f.run({ action: 'setStudentGroupPrices', lineId: 'account', studentId: 'a', groupPrices: { hour1: 240, hour2: 450 } }, 'coach');
  assert.deepEqual(result.monthlyGroupPrices, { hour1: 200, hour2: 400 }); assert.equal(quote(f).quote.totalPrice, 1800);
});
test('legacy six-column price rows read without migration and expand only when a coach saves monthly prices', () => {
  const f = fixture(); f.rows['會員資料'][1][6] = '';
  f.rows['學員團課價格'] = [['LINE_ID', '學生編號', '一小時團課價格', '二小時團課價格', '更新時間', '設定教練'], ['account', '', 240, 440, 'old time', 'old coach']];
  const before = JSON.stringify(f.rows); assert.equal(quote(f).quote.totalPrice, 1000); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(save(f, '', 200, 420, { groupPrices: { hour1: 240, hour2: 440 } }).status, 'success');
  assert.deepEqual(f.rows['學員團課價格'][1].slice(2, 4), [240, 440]);
  assert.deepEqual(f.rows['學員團課價格'][1].slice(6, 8), [200, 420]); assert.equal(quote(f).quote.totalPrice, 800);
});
test('only verified coaches may save monthly prices; malformed, partial or invalid requests never mutate data', () => {
  const f = fixture();
  for (const [id, one, two, extra, token] of [['a', 200, 400, {}, 'user'], ['missing', 200, 400, {}, 'coach'], ...[-1, true, 0.001, '=200', {}, 10000001].map(v => ['a', v, 400, {}, 'coach']), ['a', 200, 400, { monthlyGroupPrices: { hour1: 200 } }, 'coach']]) {
    const before = JSON.stringify(f.rows); assert.equal(save(f, id, one, two, extra, token).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  }
  assert.equal(f.state().locked, false);
});
test('failed price inserts and updates roll back single and monthly prices together', () => {
  const f = fixture(); f.failNextFlush(); assert.equal(save(f, 'a', 200, 420).status, 'error'); assert.equal(f.rows['學員團課價格'].length, 1);
  save(f, 'a', 200, 420); const before = JSON.stringify(f.rows['學員團課價格']); f.failNextFlush();
  assert.equal(save(f, 'a', 210, 440, { groupPrices: { hour1: 200, hour2: 400 } }).status, 'error');
  assert.equal(JSON.stringify(f.rows['學員團課價格']), before); assert.equal(quote(f).quote.totalPrice, 1800);
});
test('duplicate price records and unexpected monthly columns fail before a reservation is charged', () => {
  const f = fixture(); save(f, 'a', 200, 420); f.rows['學員團課價格'].push(f.rows['學員團課價格'][1].slice());
  assert.equal(quote(f).status, 'error'); f.rows['學員團課價格'].pop(); f.rows['學員團課價格'][0][6] = 'unexpected';
  assert.equal(quote(f).status, 'error'); assert.equal(f.rows['預約名單'].length, 1);
});

test('a failed first monthly migration preserves old single rates and never installs partial custom rates', () => {
  const f = fixture();
  f.run({ action: 'setStudentGroupPrices', lineId: 'account', studentId: 'a', groupPrices: { hour1: 240, hour2: 440 } }, 'coach');
  f.failNextFlush(); assert.equal(save(f, 'a', 200, 420, { groupPrices: { hour1: 260, hour2: 460 } }).status, 'error');
  assert.equal(quote(f).quote.totalPrice, 2000);
  assert.equal(f.run({ action: 'getBookingQuote', slotId: 'group' }).quote.totalPrice, 540);
});
test('partial or missing monthly headers cannot silently reinterpret existing rate data', () => {
  for (const missing of [6, 7]) {
    const f = fixture(); save(f, 'a', 200, 420); f.rows['學員團課價格'][0][missing] = '';
    const before = JSON.stringify(f.rows); assert.equal(quote(f).status, 'error'); assert.equal(save(f, 'a', 210, 430).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  }
});
