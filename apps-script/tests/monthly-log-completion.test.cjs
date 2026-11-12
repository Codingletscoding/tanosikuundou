const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/backend-fixture.cjs');
const days = ['2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22'];
function setup(options = {}) {
  const f = fixture(options);
  assert.equal(f.run({ action: 'coachRegisterMonthly', lineId: 'account', slotId: 'monthly', studentIds: ['a', 'b'] }, 'coach').status, 'success');
  const [a, b] = f.rows['預約名單'].slice(1);
  for (const row of [a, b]) assert.equal(f.run({ action: 'approveBooking', bookingId: row[7] }, 'coach').status, 'success');
  return { f, a, b };
}
const log = (f, booking, date = days[0], extra = {}, token = 'coach') => f.run({ action: 'addLog', lineId: booking[2], studentId: booking[9], bookingId: booking[7], date, stats: { clears: 1 / 12 }, note: '本堂訓練', ...extra }, token);
const coach = (f, id) => f.run({ action: 'getCoachData' }, 'coach').bookings.find(b => b.bookingId === id);
const legacyLog = (booking, date = days[0]) => [0, booking[2], booking[3], date, 1 / 12, 0, 0, 0, 0, 0, 0, 0, 0, '舊日誌', booking[9]];

test('one monthly log completes exactly one date for exactly one student and keeps the rest available', () => {
  const { f, a, b } = setup(), prices = f.rows['預約名單'].slice(1).map(r => r[4]), remaining = f.rows['可用時段'][3][6];
  const result = log(f, a); assert.equal(result.status, 'success'); assert.equal(result.monthlyLogCompletionVersion, 1); assert.equal(result.isMonthlyBooking, true);
  assert.equal(a[5], '預約成功'); assert.equal(b[5], '預約成功');
  const first = coach(f, a[7]); assert.deepEqual(first.monthlyCompletion.completedDates, [days[0]]); assert.deepEqual(first.monthlyCompletion.availableDates, days.slice(1));
  assert.deepEqual(first.monthlyCompletion.sessions.map(s => s.status), ['已完課', '未結課', '未結課', '未結課']);
  assert.equal(coach(f, b[7]).monthlyCompletion.completedDates.length, 0);
  assert.deepEqual(f.rows['預約名單'].slice(1).map(r => r[4]), prices); assert.equal(f.rows['可用時段'][3][6], remaining);
  assert.equal(f.rows['訓練日誌'][0][15], '預約單號'); assert.equal(f.rows['訓練日誌'][1][15], a[7]); assert(f.rows['訓練日誌'][1][16]);
  const stats = f.run({ action: 'getStudentStats', studentId: 'a' }); assert.equal(stats.totalClasses, 1); assert.equal(stats.bookings.length, 1); assert.equal(stats.bookings[0].status, '預約成功');
  assert.equal(f.run({ action: 'getStudentStats', studentId: 'b' }).totalClasses, 0);
});
test('only the final distinct session closes the bundle and repeated submissions never add logs', () => {
  const { f, a, b } = setup();
  for (let i = 0; i < days.length; i++) {
    assert.equal(log(f, a, days[i]).status, 'success'); const before = JSON.stringify(f.rows);
    assert.equal(log(f, a, days[i]).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
    assert.equal(a[5], i === 3 ? '已完課' : '預約成功'); assert.equal(b[5], '預約成功');
  }
  assert.equal(coach(f, a[7]).monthlyCompletion.allCompleted, true);
  const stats = f.run({ action: 'getStudentStats', studentId: 'a' }); assert.equal(stats.bookings.length, 0); assert.equal(stats.bookingHistory[0].status, '已完課'); assert.equal(stats.totalClasses, 4);
  assert.equal(f.run({ action: 'getPaymentSummary', month: '2026-12' }, 'coach').paymentSummary.monthlyTuitionTotal, 2000);
  assert.equal(f.run({ action: 'cancelBooking', bookingId: a[7] }, 'coach').status, 'error');
});
test('old prematurely closed bundles reopen remaining dates from unambiguous legacy logs and persist their links', () => {
  const { f, a } = setup(); a[5] = '已完課'; f.rows['訓練日誌'].push(legacyLog(a));
  const before = JSON.stringify(f.rows), restored = coach(f, a[7]); assert.equal(restored.status, '預約成功'); assert.deepEqual(restored.monthlyCompletion.completedDates, [days[0]]); assert.equal(JSON.stringify(f.rows), before, 'read-only recovery never rewrites rows');
  assert.equal(f.run({ action: 'getStudentStats', studentId: 'a' }).bookings.length, 1);
  assert.equal(log(f, a, days[1]).status, 'success'); assert.equal(a[5], '預約成功'); assert.equal(f.rows['訓練日誌'][1][15], a[7]);
  // A later overlapping course must not erase a legacy completion that is now explicitly linked.
  f.rows['預約名單'].push([0, 'group', 'account', a[3], 300, '已完課', '', 'overlap', '', 'a']);
  assert.deepEqual(coach(f, a[7]).monthlyCompletion.completedDates, days.slice(0, 2));
  for (const date of days.slice(2)) assert.equal(log(f, a, date).status, 'success'); assert.equal(a[5], '已完課');
});
test('legacy UTC spreadsheet dates resolve to Taiwan dates and sibling IDs isolate identical names', () => {
  const { f, a, b } = setup(); b[3] = a[3]; a[5] = '已完課'; f.rows['訓練日誌'].push(legacyLog(a, '2026-11-30T16:00:00.000Z'));
  assert.deepEqual(coach(f, a[7]).monthlyCompletion.completedDates, [days[0]]); assert.equal(coach(f, b[7]).monthlyCompletion.completedDates.length, 0);
});
test('ambiguous old logs do not close multiple courses and require review only on the affected date', () => {
  const { f, a } = setup(); a[5] = '已完課'; f.rows['訓練日誌'].push(legacyLog(a));
  const clone = f.rows['可用時段'][3].slice(); clone[0] = 'other-monthly'; f.rows['可用時段'].push(clone);
  f.rows['預約名單'].push([0, 'other-monthly', 'account', a[3], 1000, '已完課', '', 'overlap', '', 'a']);
  const info = coach(f, a[7]).monthlyCompletion; assert.deepEqual(info.completedDates, []); assert.deepEqual(info.ambiguousDates, [days[0]]);
  const before = JSON.stringify(f.rows); assert.equal(log(f, a).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(log(f, a, days[1]).status, 'success'); assert.deepEqual(coach(f, 'overlap').monthlyCompletion.completedDates, []);
});
test('new manual logs remain independent and wrong student/account links cannot close a monthly session', () => {
  const { f, a } = setup();
  assert.equal(f.run({ action: 'addLog', lineId: 'account', studentId: 'a', date: days[0], stats: {}, note: '獨立補登日誌' }, 'coach').status, 'success');
  assert.equal(coach(f, a[7]).monthlyCompletion.completedDates.length, 0);
  const before = JSON.stringify(f.rows); assert.equal(log(f, a, days[0], { studentId: 'b' }).status, 'error'); assert.equal(log(f, a, days[0], { lineId: 'other' }).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(log(f, a).status, 'success'); assert.equal(coach(f, a[7]).monthlyCompletion.completedDates.length, 1);
});
test('invalid/off-schedule dates, pending/cancelled bookings and non-coach writes never mutate logs or money', () => {
  const { f, a } = setup();
  for (const date of ['2026-11-30', '2026-02-30', '2027-12-01']) { const before = JSON.stringify(f.rows); assert.equal(log(f, a, date).status, 'error'); assert.equal(JSON.stringify(f.rows), before); }
  const before = JSON.stringify(f.rows); assert.equal(log(f, a, days[0], {}, 'user').status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  for (const status of ['審核中', '已取消']) { a[5] = status; const before = JSON.stringify(f.rows); assert.equal(log(f, a).status, 'error'); assert.equal(JSON.stringify(f.rows), before); }
});
test('failed first/last saves roll back the log and whole-order status together', () => {
  const { f, a } = setup(); f.failNextFlush(); assert.equal(log(f, a).status, 'error'); assert.equal(f.rows['訓練日誌'].length, 1); assert.equal(a[5], '預約成功');
  for (const day of days.slice(0, 3)) assert.equal(log(f, a, day).status, 'success');
  const before = JSON.stringify(f.rows); f.failNextFlush(); assert.equal(log(f, a, days[3]).status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  assert.equal(log(f, a, days[3]).status, 'success'); assert.equal(a[5], '已完課');
});
test('failed legacy recovery restores old log links and the original raw completed flag', () => {
  const { f, a } = setup(); a[5] = '已完課'; const old = legacyLog(a); f.rows['訓練日誌'].push(old); f.failNextFlush();
  assert.equal(log(f, a, days[1]).status, 'error'); assert.equal(a[5], '已完課'); assert.equal(f.rows['訓練日誌'].length, 2); assert.equal(old[15] || '', ''); assert.equal(old[16] || '', '');
  assert.deepEqual(coach(f, a[7]).monthlyCompletion.completedDates, [days[0]]);
});
test('custom log metadata columns are preserved and unsafe writes are rejected', () => {
  for (const column of [15, 16]) {
    const { f, a } = setup(); f.rows['訓練日誌'][0][column] = '自訂'; const before = JSON.stringify(f.rows);
    assert.equal(log(f, a).status, 'error'); assert.equal(f.rows['訓練日誌'].length, 1); assert.equal(a[5], '預約成功'); assert.equal(f.rows['訓練日誌'][0][column], '自訂');
  }
});
test('single group and private logs still close only their one booking', () => {
  for (const slotId of ['group', 'private']) {
    const f = fixture(); assert.equal(f.run({ action: 'bookClass', slotId, ...(slotId === 'private' ? { coachType: '1對2', location: '場地A' } : {}) }).status, 'success');
    const [a, b] = f.rows['預約名單'].slice(1); f.run({ action: 'approveBooking', bookingId: a[7] }, 'coach');
    assert.equal(log(f, a).status, 'success'); assert.equal(a[5], '已完課'); assert.equal(b[5], '審核中'); assert.equal(log(f, a).status, 'error');
  }
});
test('completed dates cannot be moved or removed through the monthly schedule editor', () => {
  const { f, a } = setup(); log(f, a); const row = f.rows['可用時段'][3];
  const request = { action: 'updateSlot', slotId: 'monthly', title: row[1], date: row[2], time: row[3], location: row[4], capacity: row[5], prices: { 1: 1 }, monthlySessions: days.slice(1).map(date => ({ date, teachingCoachId: 'teacher' })) };
  const before = JSON.stringify(f.rows); assert.equal(f.run(request, 'coach').status, 'error'); assert.equal(JSON.stringify(f.rows), before);
  request.monthlySessions.unshift({ date: days[0], teachingCoachId: 'teacher' }); request.monthlySessions[1].date = '2026-12-09'; assert.equal(f.run(request, 'coach').status, 'success');
  assert.deepEqual(coach(f, a[7]).monthlyCompletion.completedDates, [days[0]]);
});
test('leave dates remain pending makeup; completing the linked makeup counts only that original session', () => {
  const { f, a } = setup(); f.rows['可用時段'][1][2] = '2026-12-02';
  f.rows['預約名單'].push([0, 'group', 'account', a[3], 0, '預約成功', '', 'makeup', 'leave', 'a']); const makeup = f.rows['預約名單'].at(-1);
  f.rows['請假補課'] = [['headers'], ['leave', 0, a[7], 'account', a[3], 'monthly', days[0], '19:00 - 20:00', '請假', '已安排', 'group', '2026-12-02', 'makeup']];
  assert.equal(coach(f, a[7]).monthlyCompletion.sessions[0].status, '待補課'); assert.equal(log(f, a).status, 'error');
  assert.equal(log(f, makeup, '2026-12-02').status, 'success'); const info = coach(f, a[7]); assert.deepEqual(info.monthlyCompletion.completedDates, [days[0]]); assert.equal(info.status, '預約成功');
});
test('five-session packages keep their remaining four dates after the first log', () => {
  const f = fixture(); f.rows['可用時段'][3][1] = '[月繳5堂] 團課'; f.rows['可用時段'][3][2] += ', 12/29';
  f.run({ action: 'coachRegisterMonthly', lineId: 'account', slotId: 'monthly', studentIds: ['a'] }, 'coach'); const a = f.rows['預約名單'][1]; f.run({ action: 'approveBooking', bookingId: a[7] }, 'coach');
  assert.equal(log(f, a).status, 'success'); assert.equal(coach(f, a[7]).monthlyCompletion.total, 5); assert.equal(coach(f, a[7]).monthlyCompletion.availableDates.length, 4); assert.equal(a[5], '預約成功');
});

test('cancelling an old partially completed bundle retains the dated legacy log and financial history', () => {
  const { f, a } = setup(); a[5] = '已完課'; f.rows['訓練日誌'].push(legacyLog(a));
  assert.equal(f.run({ action: 'cancelBooking', bookingId: a[7] }, 'coach').status, 'success');
  assert.equal(a[5], '已取消'); assert.equal(f.rows['訓練日誌'][1][15], a[7]);
  const stats = f.run({ action: 'getStudentStats', studentId: 'a' }); assert.equal(stats.totalClasses, 1); assert.equal(stats.bookingHistory[0].status, '已取消'); assert.deepEqual(stats.bookingHistory[0].monthlyCompletion.completedDates, [days[0]]);
});

test('duplicate old log rows on one date never count as multiple completed monthly sessions', () => {
  const { f, a } = setup(); a[5] = '已完課'; f.rows['訓練日誌'].push(legacyLog(a), legacyLog(a));
  assert.deepEqual(coach(f, a[7]).monthlyCompletion.completedDates, [days[0]]);
  assert.equal(log(f, a, days[1]).status, 'success'); assert.deepEqual(coach(f, a[7]).monthlyCompletion.completedDates, days.slice(0, 2)); assert.equal(a[5], '預約成功');
});
