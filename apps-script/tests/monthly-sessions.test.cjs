const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/backend-fixture.cjs');
function setup() {
  const f = fixture(); f.rows['授課教練'].push(['second', '第二教練']); return f;
}
const sessions = () => [{ date: '2026-12-01', teachingCoachId: 'teacher' }, { date: '2026-12-09', teachingCoachId: 'second' }, { date: '2027-01-05', teachingCoachId: 'teacher' }];
const read = f => f.run({ action: 'getSlots' }, 'coach').slots.find(s => s.id === 'monthly');
const edit = (f, monthlySessions, extra = {}, token = 'coach') => {
  const r = f.rows['可用時段'].find(r => r[0] === 'monthly');
  return f.run({ action: 'updateSlot', slotId: 'monthly', title: r[1], date: r[2], time: r[3], location: r[4], capacity: r[5], prices: { 1: 1 }, teachingCoachId: 'teacher', monthlySessions, ...extra }, token);
};
test('legacy monthly dates expand to individual sessions without creating or writing columns', () => {
  const f = setup(), before = JSON.stringify(f.rows), slot = read(f);
  assert.equal(slot.monthlySessionsVersion, 1); assert.equal(slot.monthlySessions.length, 4);
  assert.deepEqual(slot.monthlySessions[1], { date: '2026-12-08', teachingCoachId: 'teacher', teachingCoachName: '測試教練' });
  assert.equal(JSON.stringify(f.rows), before);
});
test('individual dates and coaches persist, sort chronologically and retain explicit years', () => {
  const f = setup(), input = sessions().reverse(); assert.equal(edit(f, input).status, 'success');
  const slot = read(f); assert.equal(slot.title, '[月繳3堂] 團課'); assert.equal(slot.date, '2026-12-01, 2026-12-09, 2027-01-05');
  assert.deepEqual(slot.monthlySessions.map(({ date, teachingCoachId }) => ({ date, teachingCoachId })), sessions());
  assert.equal(slot.monthlySessions[1].teachingCoachName, '第二教練'); assert.equal(slot.teachingCoachName, '測試教練');
  assert.equal(f.rows['可用時段'][0][13], '月繳逐堂排程');
  assert.deepEqual(JSON.parse(f.rows['可用時段'][3][13]), sessions());
  assert.equal(f.run({ action: 'updateTeachingCoach', teachingCoachId: 'second', name: '新教練姓名' }, 'coach').status, 'success');
  assert.equal(read(f).monthlySessions[1].teachingCoachName, '新教練姓名');
});
for (const hours of [1, 2]) test(`added/removed sessions recalculate ${hours}-hour future quotes while preserving existing orders, capacity and individual rates`, () => {
  const f = setup(); f.rows['可用時段'][3][3] = hours === 1 ? '19:00 - 20:00' : '19:00 - 21:00';
  f.run({ action: 'setStudentGroupPrices', lineId: 'account', studentId: 'a', groupPrices: { hour1: '', hour2: '' }, monthlyGroupPrices: { hour1: 200, hour2: 420 } }, 'coach');
  f.rows['預約名單'].push([new Date(), 'monthly', 'account', '王小明', 999, '預約成功', '12345', 'old', '', 'a']); f.rows['可用時段'][3][6] = 4;
  const orders = JSON.stringify(f.rows['預約名單']);
  for (const schedule of [sessions(), [...sessions(), { date: '2027-01-12', teachingCoachId: 'second' }], [...sessions(), ...['2027-01-12', '2027-01-19', '2027-01-26'].map(date => ({ date, teachingCoachId: 'second' }))], sessions().slice(0, 1)]) {
    assert.equal(edit(f, schedule).status, 'success'); const slot = read(f), n = schedule.length;
    assert.equal(slot.capacity, 5); assert.equal(slot.remaining, 4); assert.equal(slot.monthlyTariff.price, n * 250 * hours);
    assert.equal(slot.monthlyTariff.regular, n * 300 * hours); assert.deepEqual(Object.values(slot.prices), Array(5).fill(n * 250 * hours));
    const q = f.run({ action: 'getBookingQuote', slotId: 'monthly' }).quote;
    assert.deepEqual(q.studentPrices.map(p => p.price), [n * (hours === 1 ? 200 : 420), n * 250 * hours]);
    assert.equal(JSON.stringify(f.rows['預約名單']), orders);
  }
});
test('unauthorized or invalid schedules cannot alter any data', () => {
  const f = setup();
  const invalid = [[], null, {}, [{ date: '2026-02-30', teachingCoachId: 'teacher' }], [{ date: '', teachingCoachId: 'teacher' }], [{ date: '2026-12-01', teachingCoachId: 'missing' }], [{ date: '2026-12-01', teachingCoachId: '' }], [sessions()[0], sessions()[0]], Array(32).fill(sessions()[0])];
  for (const input of invalid) { const before = JSON.stringify(f.rows); assert.equal(edit(f, input).status, 'error'); assert.equal(JSON.stringify(f.rows), before); }
  const before = JSON.stringify(f.rows); assert.equal(edit(f, sessions(), {}, 'user').status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(edit(f, sessions(), { slotId: 'group', title: '團課' }).status, 'error'); assert.equal(f.state().locked, false);
});
test('existing schedule changes reject stale coach edits and older clients cannot desynchronize its dates', () => {
  const f = setup(), first = read(f).monthlySessions; assert.equal(edit(f, sessions(), { expectedMonthlySessions: first }).status, 'success');
  const before = JSON.stringify(f.rows); assert.equal(edit(f, sessions().slice(1), { expectedMonthlySessions: first }).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  const row = f.rows['可用時段'][3], base = { action: 'updateSlot', slotId: 'monthly', title: row[1], date: row[2], time: row[3], location: row[4], capacity: row[5], prices: { 1: 1 } };
  assert.equal(f.run({ ...base, date: '2026-12-01' }, 'coach').status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(f.run({ ...base, capacity: 6 }, 'coach').status, 'success'); assert.equal(f.rows['可用時段'][3][13], row[13]);
});
test('dates referenced by leave records remain protected while unrelated dates and all coaches can change', () => {
  const f = setup(); f.rows['請假補課'] = [['headers'], ['leave', 0, 'order', 'account', '王小明', 'monthly', '2026-12-01', '19:00 - 20:00', 'reason', '待補課']];
  assert.equal(edit(f, sessions()).status, 'success');
  const before = JSON.stringify(f.rows);
  assert.equal(edit(f, sessions().slice(1)).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(edit(f, sessions(), { time: '20:00 - 21:00' }).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  const changed = sessions(); changed[0].teachingCoachId = 'second'; assert.equal(edit(f, changed).status, 'success');
  assert.equal(f.rows['請假補課'][1][6], '2026-12-01');
});
test('custom N columns are never exposed or overwritten and failed writes restore complete schedules', () => {
  const f = setup(); f.rows['可用時段'][0][13] = '自訂'; f.rows['可用時段'][3][13] = 'secret'; const before = JSON.stringify(f.rows);
  assert.equal(edit(f, sessions()).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(read(f).monthlySessions.length, 4); assert(!JSON.stringify(read(f)).includes('secret'));
  delete f.rows['可用時段'][0][13]; delete f.rows['可用時段'][3][13]; assert.equal(edit(f, sessions()).status, 'success');
  const old = JSON.stringify(f.rows); f.failNextFlush(); assert.equal(edit(f, sessions().slice(1)).status, 'error'); assert.equal(JSON.stringify(f.rows), old);
});
test('monthly leave validation and monthly income use revised dates including cross-year sessions', () => {
  const f = setup(); assert.equal(edit(f, sessions()).status, 'success');
  f.rows['預約名單'].push([new Date(), 'monthly', 'account', '王小明', 900, '預約成功', '12345', 'order', '', 'a']); f.rows['可用時段'][3][6] = 4;
  assert.equal(f.run({ action: 'registerMonthlyLeave', bookingId: 'order', originalDate: '2027-01-05', reason: '不在台灣' }, 'coach').status, 'success');
  assert.equal(f.run({ action: 'registerMonthlyLeave', bookingId: 'order', originalDate: '2026-12-08', reason: '改期前舊日期' }, 'coach').status, 'error');
  assert.equal(f.run({ action: 'getPaymentSummary', month: '2026-12' }, 'coach').paymentSummary.monthlyTuitionTotal, 600);
  assert.equal(f.run({ action: 'getPaymentSummary', month: '2027-01' }, 'coach').paymentSummary.monthlyTuitionTotal, 300);
});
test('corrupt stored session data blocks quotes and reads instead of displaying another date or coach', () => {
  const f = setup(); edit(f, sessions()); f.rows['可用時段'][3][13] = JSON.stringify([{ date: '2026-12-02', teachingCoachId: 'teacher' }]);
  assert.equal(f.run({ action: 'getSlots' }).status, 'error'); assert.equal(f.run({ action: 'getBookingQuote', slotId: 'monthly' }).status, 'error');
});

test('student and coach checkout reject a changed date or instructor even when the price is identical', () => {
  for (const coach of [false, true]) {
    const f = setup(); edit(f, sessions());
    const target = coach ? { lineId: 'account', studentIds: ['a'], kind: 'monthly' } : {};
    const q = f.run({ action: 'getBookingQuote', slotId: 'monthly', ...target }, coach ? 'coach' : 'user').quote;
    const changed = sessions(); changed[1].teachingCoachId = 'teacher'; changed[1].date = '2026-12-10'; edit(f, changed);
    const before = JSON.stringify(f.rows);
    const r = f.run({ action: coach ? 'coachRegisterMonthly' : 'bookClass', slotId: 'monthly', ...target, expectedTotalPrice: q.totalPrice, expectedMonthlyScheduleKey: q.monthlyScheduleKey }, coach ? 'coach' : 'user');
    assert.equal(r.status, 'error'); assert.match(r.message, /日期或授課教練已有變更/); assert.equal(JSON.stringify(f.rows), before);
  }
});
