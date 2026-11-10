const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fixture, ADMIN } = require('./helpers/backend-fixture.cjs');
const summary = (f, month = '2026-11') => f.run({ action: 'getPaymentSummary', month }, 'coach');
const cost = (f, extra = {}) => f.run({ action: 'addVenueExpense', date: '2026-11-10', location: '場地A', amount: 150, note: '一小時', requestId: 'expense-request-001', ...extra }, 'coach');
function paid(f, slot = 'group', extra = {}) {
  f.rows['預約名單'].push(['2026-10-01T00:00:00+08:00', slot, 'account', '王小明', 300, '預約成功', '12345', 'paid-order', '', 'a']);
  Object.entries(extra).forEach(([column, value]) => { f.rows['預約名單'].at(-1)[Number(column)] = value; });
}
test('only verified coaches can add, edit or cancel venue costs', () => {
  const f = fixture();
  for (const action of ['addVenueExpense', 'updateVenueExpense', 'cancelVenueExpense']) assert.equal(f.run({ action, isAdmin: true, lineId: ADMIN }).status, 'error');
  assert.equal(f.state().sheetReads, 0); assert.equal(f.rows['場地費紀錄'], undefined);
});
test('tuition follows course dates, never booking month, while lifetime totals remain unchanged', () => {
  const f = fixture(); paid(f);
  const nov = summary(f).paymentSummary, dec = summary(f, '2026-12').paymentSummary;
  assert.equal(nov.monthlyTuitionTotal, 0); assert.equal(dec.monthlyTuitionTotal, 300);
  assert.deepEqual(nov.studentTotals, dec.studentTotals); assert.equal(nov.studentTotals[0][1], 300);
  assert.equal(dec.tuitionDetails[0].dates[0], '2026-12-01'); assert.equal(f.rows['場地費紀錄'], undefined);
});
test('cross-month monthly plans allocate by each scheduled lesson and conserve cents', () => {
  const f = fixture(), row = f.rows['可用時段'].find(r => r[0] === 'monthly');
  row[2] = '2026年 11/25, 12/2, 12/9, 12/16, 12/23'; paid(f, 'monthly', { 4: 1250.01 });
  const nov = summary(f).paymentSummary, dec = summary(f, '2026-12').paymentSummary;
  assert.equal(nov.monthlyTuitionTotal, 250.01); assert.equal(dec.monthlyTuitionTotal, 1000);
  assert.equal(nov.tuitionDetails[0].sessionCount, 1); assert.equal(dec.tuitionDetails[0].sessionCount, 4);
});
test('historical tuition follows its actual class date instead of original booking date', () => {
  const f = fixture();
  f.rows['歷史預約紀錄'] = [Array.from(vm.runInContext('HISTORICAL_BOOKING_HEADERS', f.context)), ['history', new Date(), 'account', 'b', '王小美', '舊課程', '2026-11-03', '19:00', '20:00', '場地A', '教練', 250, 'paid', '2026-10-01', '已完課', 'old-key']];
  assert.equal(summary(f).paymentSummary.monthlyTuitionTotal, 250); assert.equal(summary(f, '2026-10').paymentSummary.monthlyTuitionTotal, 0);
});
test('venue use month controls subtraction, zero and negative net totals stay exact', () => {
  const f = fixture(); f.rows['可用時段'][1][2] = '2026-11-15'; paid(f);
  const result = cost(f); assert.equal(result.status, 'success');
  let s = summary(f).paymentSummary; assert.equal(s.monthlyTuitionTotal, 300); assert.equal(s.monthlyVenueCostTotal, 150); assert.equal(s.monthlyTotal, 150);
  cost(f, { amount: 400, requestId: 'expense-request-002' }); cost(f, { date: '2026-12-01', amount: 900, requestId: 'expense-request-003' });
  s = summary(f).paymentSummary; assert.equal(s.monthlyVenueCostTotal, 550); assert.equal(s.monthlyTotal, -250); assert.equal(s.venueExpenses.length, 2); assert.equal(s.studentTotals[0][1], 300);
  assert.equal(f.rows['場地費紀錄'][1][6], ADMIN); assert.equal(summary(f, '2026-12').paymentSummary.monthlyVenueCostTotal, 900);
});
test('retries are idempotent and a reused request key cannot change expense contents', () => {
  const f = fixture(), first = cost(f); assert.equal(cost(f).expense.id, first.expense.id); assert.equal(f.rows['場地費紀錄'].length, 2);
  assert.equal(cost(f, { amount: 1 }).status, 'error'); assert.equal(summary(f).paymentSummary.monthlyVenueCostTotal, 150);
});
test('edits and cancellation require the latest revision and cancelled records remain auditable', () => {
  const f = fixture(), first = cost(f).expense;
  const change = f.run({ action: 'updateVenueExpense', expenseId: first.id, expectedRevision: first.revision, date: '2026-11-11', location: '場地B', amount: 200, note: '' }, 'coach');
  assert.equal(change.status, 'success'); assert.notEqual(change.expense.revision, first.revision);
  assert.equal(f.run({ action: 'cancelVenueExpense', expenseId: first.id, expectedRevision: first.revision }, 'coach').status, 'error');
  assert.equal(summary(f).paymentSummary.monthlyVenueCostTotal, 200);
  assert.equal(f.run({ action: 'cancelVenueExpense', expenseId: first.id, expectedRevision: change.expense.revision }, 'coach').status, 'success');
  assert.equal(summary(f).paymentSummary.monthlyVenueCostTotal, 0); assert.equal(f.rows['場地費紀錄'].length, 2); assert.equal(f.rows['場地費紀錄'][1][9], '已作廢');
});
test('invalid dates, amounts, text, IDs and request keys never write costs', () => {
  const f = fixture();
  for (const extra of [{ date: '2026-02-30' }, { date: '2026/11/1' }, { amount: -1 }, { amount: 1.001 }, { amount: '' }, { amount: true }, { location: '=IMPORTXML("x")' }, { note: '=formula' }, { location: '' }, { requestId: '' }]) assert.equal(cost(f, extra).status, 'error');
  assert.equal(f.rows['場地費紀錄'], undefined); assert.equal(cost(f, { amount: 0 }).status, 'success');
});
test('failed expense appends, edits and cancellations roll back every changed value', () => {
  const f = fixture(); f.failNextFlush(); assert.equal(cost(f).status, 'error'); assert.equal(f.rows['場地費紀錄'].length, 1);
  const first = cost(f).expense, before = JSON.stringify(f.rows['場地費紀錄']);
  for (const action of ['updateVenueExpense', 'cancelVenueExpense']) {
    f.failNextFlush(); assert.equal(f.run({ action, expenseId: first.id, expectedRevision: first.revision, date: '2026-11-10', location: '場地B', amount: 200, note: '' }, 'coach').status, 'error');
    assert.equal(JSON.stringify(f.rows['場地費紀錄']), before);
  }
  assert.equal(f.state().locked, false); assert(f.network.every(call => !call.locked));
});
test('unknown or duplicated class dates are flagged instead of falling back to payment month', () => {
  const f = fixture(); paid(f); f.rows['可用時段'][1][2] = '';
  const s = summary(f).paymentSummary; assert.equal(s.monthlyTuitionTotal, 0); assert.equal(s.missingDates, 1); assert.equal(s.studentTotals[0][1], 300);
  f.rows['可用時段'][1][2] = '2026年 11/10, 11/10'; assert.equal(summary(f).paymentSummary.missingDates, 1);
});
test('both coach endpoints return the same accounting and costs never touch orders or student balances', () => {
  const f = fixture(); f.rows['可用時段'][1][2] = '2026-11-15'; paid(f); const before = JSON.stringify(f.rows['預約名單']); cost(f);
  const a = summary(f).paymentSummary, b = f.run({ action: 'getCoachData' }, 'coach').paymentSummary;
  assert.equal(a.monthlyAccountingVersion, 1); assert.equal(a.monthlyTotal, b.monthlyTotal); assert.deepEqual(a.studentTotals, b.studentTotals); assert.equal(JSON.stringify(f.rows['預約名單']), before);
});
test('spreadsheet dates and UTC timestamps follow Taiwan month boundaries', () => {
  const f = fixture(); paid(f); f.rows['可用時段'][1][2] = '2026-11-30T16:00:00.000Z';
  assert.equal(summary(f).paymentSummary.monthlyTuitionTotal, 0); assert.equal(summary(f, '2026-12').paymentSummary.monthlyTuitionTotal, 300);
  cost(f, { date: '2026-11-01' }); f.rows['場地費紀錄'][1][1] = vm.runInContext("new Date('2026-10-31T16:00:00.000Z')", f.context);
  assert.equal(summary(f).paymentSummary.monthlyVenueCostTotal, 150); assert.equal(summary(f, '2026-10').paymentSummary.monthlyVenueCostTotal, 0);
});
test('duplicate expense IDs, duplicate request keys and wrong headers stop an unreliable financial total', () => {
  for (const mode of ['id', 'request', 'header']) {
    const f = fixture(); cost(f);
    if (mode === 'header') f.rows['場地費紀錄'][0][1] = 'changed';
    else { const row = f.rows['場地費紀錄'][1].slice(); if (mode === 'request') row[0] = 'another-expense'; f.rows['場地費紀錄'].push(row); }
    assert.equal(summary(f).status, 'error');
  }
});
