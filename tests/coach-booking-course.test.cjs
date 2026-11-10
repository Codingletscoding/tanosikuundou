const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { fixture } = require('../apps-script/tests/helpers/backend-fixture.cjs');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const code = source.slice(source.indexOf('const formatTrainingDate ='), source.indexOf('const getDayOfWeek =')) + source.slice(source.indexOf('const coachBookingCourseInfo ='), source.indexOf('const CoachSlotsView =')) + '\nthis.info = coachBookingCourseInfo;';
const context = { Date, Intl }; vm.createContext(context); vm.runInContext(code, context);
const info = context.info;

test('new student bookings resolve their class date/time from the actual coach API responses', () => {
  const f = fixture(); assert.equal(f.run({ action: 'bookClass', slotId: 'group' }).status, 'success');
  const bookings = f.run({ action: 'getCoachData' }, 'coach').bookings, slots = f.run({ action: 'getSlots' }, 'coach').slots;
  assert.equal(bookings.length, 2);
  for (const booking of bookings) { const course = info(booking, slots); assert.equal(course.title, '團課'); assert.equal(course.date, '2026-12-01'); assert.equal(course.time, '19:00 - 20:00'); }
});
test('monthly reservations retain every scheduled date and the course time', () => {
  const f = fixture(), slots = f.run({ action: 'getSlots' }, 'coach').slots;
  const course = info({ slotId: 'monthly' }, slots);
  assert.equal(course.date, '2026年 12/1, 12/8, 12/15, 12/22'); assert.equal(course.time, '19:00 - 20:00');
});
test('spreadsheet UTC timestamps display the Taiwan class date, including a year boundary', () => {
  for (const [raw, date] of [['2026-11-03T16:00:00.000Z', '2026-11-04'], ['2026-12-31T16:00:00.000Z', '2027-01-01']]) {
    assert.equal(info({ slotId: 'one' }, [{ id: 'one', date: raw, time: '09:00 - 10:00' }]).date, date);
  }
});
test('the exact course ID determines the schedule instead of the course name or array order', () => {
  const slots = [{ id: 'other', title: '團課', date: '2026-11-01', time: '09:00 - 10:00' }, { id: 7, title: '團課', date: '2026-11-20', time: '19:00 - 21:00' }];
  const course = info({ slotId: '7', slotTitle: '舊名稱', slotDate: '2026-10-01' }, slots);
  assert.equal(course.date, '2026-11-20'); assert.equal(course.time, '19:00 - 21:00');
});
test('missing courses use available booking metadata and never guess another course schedule', () => {
  const old = info({ slotId: 'removed', slotTitle: '原課程', slotDate: '2026-11-04', slotTime: '18:00 - 19:00' }, [{ id: 'other', date: '2026-12-01' }]);
  assert.equal(old.title, '原課程'); assert.equal(old.date, '2026-11-04'); assert.equal(old.time, '18:00 - 19:00');
  const missing = info({ slotId: 'removed' }, []); assert.equal(missing.title, '未知或已下架課程'); assert.equal(missing.date, ''); assert.equal(missing.time, '');
  assert.equal(info({ courseDates: ['2026-11-04', '2026-11-11'] }, []).date, '2026-11-04、2026-11-11');
});
test('duplicate or empty course IDs cannot silently attach a different reservation date', () => {
  assert.equal(info({ slotId: 'same' }, [{ id: 'same', date: '2026-11-01' }, { id: 'same', date: '2026-12-01' }]).date, '');
  assert.equal(info({ slotId: '' }, [{ id: '', date: '2026-11-01' }]).date, '');
});
test('private lessons show a readable class name and preserve the booked time', () => {
  const course = info({ slotId: 'private' }, [{ id: 'private', title: '[專屬教練課] 1v1:1000|1v2:1500', date: '2026-11-10', time: '20:00 - 21:00' }]);
  assert.equal(course.title, '專屬教練課'); assert.equal(course.time, '20:00 - 21:00');
});
