const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/backend-fixture.cjs');

const dates = {
  4: '2026年 10/6, 10/13, 10/20, 10/27',
  5: '2026年 9/1, 9/8, 9/15, 9/22, 9/29'
};
const create = (f, count, hours) => f.run({
  action: 'addSlot', title: `[月繳${count}堂] 團課`, date: dates[count],
  time: hours === 1 ? '19:00 - 20:00' : '19:00 - 21:00',
  location: '場地A', capacity: 5, teachingCoachId: 'teacher', prices: { 1: 1 }
}, 'coach');

for (const count of [4, 5]) for (const hours of [1, 2]) test(`coaches can create, reload and register expired ${count}-lesson ${hours}-hour monthly courses at each learner's price`, () => {
  const f = fixture({ now: '2026-11-11T12:00:00+08:00' });
  assert.equal(create(f, count, hours).status, 'success');
  const row = f.rows['可用時段'].at(-1), slotId = row[0];
  const amount = count * hours * 250;
  assert.deepEqual(Array.from(row.slice(7, 12)), Array(5).fill(amount));
  assert.equal(f.run({ action: 'setStudentGroupPrices', lineId: 'account', studentId: 'a', groupPrices: { hour1: '', hour2: '' }, monthlyGroupPrices: { hour1: 200, hour2: 420 } }, 'coach').status, 'success');
  for (let i = 0; i < 2; i++) {
    assert.equal(f.run({ action: 'getCoachData' }, 'coach').status, 'success');
    const result = f.run({ action: 'getSlots' }, 'coach');
    assert.equal(result.status, 'success'); assert(result.slots.some(s => s.id === slotId));
  }
  const custom = count * (hours === 1 ? 200 : 420);
  const q = f.run({ action: 'getBookingQuote', lineId: 'account', kind: 'monthly', slotId, studentIds: ['a', 'b'] }, 'coach');
  assert.equal(q.status, 'success'); assert.equal(q.quote.totalPrice, custom + amount);
  const result = f.run({ action: 'coachRegisterMonthly', lineId: 'account', slotId, studentIds: ['a', 'b'], expectedTotalPrice: q.quote.totalPrice, expectedStudentPrices: q.quote.studentPrices }, 'coach');
  assert.equal(result.status, 'success'); assert.equal(result.registeredCount, 2);
  assert.deepEqual(f.rows['預約名單'].slice(1).map(r => [r[9], r[4], r[5]]), [['a', custom, '審核中'], ['b', amount, '審核中']]);
  assert.equal(row[6], 3);
  const before = JSON.stringify(f.rows);
  assert.equal(f.run({ action: 'coachRegisterMonthly', lineId: 'account', slotId, studentIds: ['a'] }, 'coach').status, 'error');
  assert.equal(JSON.stringify(f.rows), before);
  assert(f.run({ action: 'getSlots' }, 'coach').slots.some(s => s.id === slotId));
  assert.equal(f.state().locked, false);
});

test('expired monthly enrollment still enforces coach permissions and available seats', () => {
  const f = fixture({ now: '2026-11-11T12:00:00+08:00' });
  assert.equal(create(f, 4, 1).status, 'success'); const row = f.rows['可用時段'].at(-1);
  const request = { action: 'coachRegisterMonthly', lineId: 'account', slotId: row[0], studentIds: ['a'] };
  const before = JSON.stringify(f.rows);
  assert.equal(f.run(request).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  row[6] = 0;
  assert.equal(f.run(request, 'coach').status, 'error'); assert.equal(f.rows['預約名單'].length, 1);
  assert.equal(row[6], 0);
});

test('cancelled monthly reservations do not make the expired course eligible for cleanup', () => {
  const f = fixture({ now: '2026-11-11T12:00:00+08:00' }); create(f, 4, 1);
  const row = f.rows['可用時段'].at(-1);
  f.rows['預約名單'].push([new Date(), row[0], 'account', '王小明', 1000, '已取消', '', 'cancelled', '', 'a']);
  assert.equal(f.run({ action: 'getCoachData' }, 'coach').status, 'success');
  assert(f.run({ action: 'getSlots' }, 'coach').slots.some(s => s.id === row[0]));
  assert.equal(f.run({ action: 'coachRegisterMonthly', lineId: 'account', slotId: row[0], studentIds: ['a'] }, 'coach').status, 'success');
  assert.equal(f.rows['預約名單'].length, 3); assert.equal(row[6], 4);
});
