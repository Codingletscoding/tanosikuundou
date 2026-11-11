const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../complete/Code.gs'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../complete/appsscript.json'), 'utf8'));
const cutoff = Date.parse('2026-11-05T13:00:00+08:00');
const course = (id = 'empty', extra = {}) => Object.assign(
  [id, '團課', '2026-11-05 (週四)', '19:00 - 21:00', '場地', 5, 5, 300, 294, 285, 270, 264], extra
);
function fixture(options = {}) {
  let now = options.now ?? cutoff, locked = false, locks = 0, releases = 0, deletions = 0;
  const rows = {
    '可用時段': [['headers'], course()], '預約名單': [['headers']],
    '會員資料': [['headers'], ['legacy','學生',20,'0912345678',0,1], ['second','第二位',20,'0912345678',0,1]], '訓練日誌': [['headers']], '請假補課': [['headers']]
  };
  const props = { EMPTY_COURSE_SPREADSHEET_ID: 'sheet-id' }, opened = [];
  const scopes = options.scopes ?? manifest.oauthScopes;
  const requireScope = name => {
    const scope = 'https://www.googleapis.com/auth/' + name;
    if (!scopes.includes(scope)) throw Error('Missing required permission: ' + scope);
  };
  const triggers = options.triggers || [];
  const ss = { getId: () => 'sheet-id', getSheetByName: name => rows[name] && ({
    getDataRange: () => ({ getValues: () => rows[name].map(row => row.slice()) }),
    deleteRow: index => {
      assert(locked, 'deletion shares the booking lock');
      if (++deletions === options.failDelete) throw Error('delete failed');
      rows[name].splice(index - 1, 1);
    },
    appendRow: row => { assert(locked); rows[name].push(row); },
    getRange: (r, c) => ({ setValue: value => { assert(locked); rows[name][r - 1][c - 1] = value; } })
  }) };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = {
    Date: Clock, console: { info() {} },
    UrlFetchApp: { fetch: (url, request) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(url.includes('/verify?') ? { client_id:'2012115245', expires_in:3600 } : { userId: request?.headers?.Authorization==='Bearer coach-token' ? 'U3a76953e63578ec8607297044ac54e5a' : request?.headers?.Authorization==='Bearer second-token' ? 'second' : 'legacy' }) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: id => { requireScope('spreadsheets'); opened.push(id); return ss; }, flush() {} },
    LockService: { getScriptLock: () => ({
      tryLock: () => { locks++; if (options.busy) return false; assert(!locked); locked = true; options.onLock?.(rows); return true; },
      releaseLock: () => { assert(locked); locked = false; releases++; }
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key], setProperty: (key, value) => { props[key] = value; } }) },
    ScriptApp: {
      getProjectTriggers: () => { requireScope('script.scriptapp'); return triggers.slice(); },
      deleteTrigger: trigger => { requireScope('script.scriptapp'); triggers.splice(triggers.indexOf(trigger), 1); },
      newTrigger: handler => ({ timeBased: () => ({ everyMinutes: interval => ({ create: () => {
        requireScope('script.scriptapp'); assert.equal(interval, 5); triggers.push({ getHandlerFunction: () => handler });
      } }) }) })
    },
    Utilities: { getUuid: () => 'new-booking', formatDate: (date, zone) => {
      assert.equal(zone, 'Asia/Taipei');
      return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  };
  vm.createContext(context); vm.runInContext(source, context);
  context.monthlyVerifyCoach_ = token => { if (token !== 'coach-token') throw Error('unauthorized'); };
  const run = payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({accessToken:'student-token',...payload}) } }).text);
  return { rows, props, opened, triggers, context, run, ss,
    setNow: value => { now = value; }, state: () => ({ locked, locks, releases }) };
}
test('keeps the class 1ms before the cutoff, deletes at exactly six hours, and is idempotent', () => {
  const f = fixture({ now: cutoff - 1 });
  assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0);
  f.setNow(cutoff);
  assert.deepEqual(Array.from(f.context.cleanupEmptyCourses().deletedSlotIds), ['empty']);
  assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0);
  assert.deepEqual(f.state(), { locked: false, locks: 3, releases: 3 });
  assert.deepEqual(f.opened, ['sheet-id', 'sheet-id', 'sheet-id']);
});
test('supports Taiwan midnight, UTC sheet timestamps, date cells and private courses', () => {
  for (const date of ['2026/11/5', '2026-11-04T16:00:00.000Z', new Date('2026-11-04T16:00:00Z')]) {
    const f = fixture({ now: Date.parse('2026-11-04T18:30:00+08:00') });
    f.rows['可用時段'][1] = course('private', { 1: '[專屬教練課] 1v1:1000|1v2:1500', 2: date, 3: '00:30 - 01:30' });
    assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds[0], 'private');
  }
});
test('monthly bundles survive the six-hour cutoff and remain after every session has ended', () => {
  for (const now of [cutoff, Date.parse('2026-12-31T23:59:59+08:00')]) {
    const f = fixture({ now });
    f.rows['可用時段'][1] = course('monthly', { 1: '  [月繳4堂] 團課', 2: '2026年 11/26, 11/5, 11/12, 11/19 (週四)' });
    const before = JSON.stringify(f.rows);
    assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0);
    assert.equal(JSON.stringify(f.rows), before);
  }
});
test('monthly exemption leaves the existing single and private course cutoff unchanged', () => {
  const f = fixture(); f.rows['可用時段'].push(
    course('monthly', { 1: '[月繳4堂] 團課', 2: '2026年 10/1, 10/8, 10/15, 10/22' }),
    course('private', { 1: '[專屬教練課] 1v1:1000|1v2:1500' })
  );
  assert.deepEqual(Array.from(f.context.cleanupEmptyCourses().deletedSlotIds), ['private', 'empty']);
  assert.equal(f.rows['可用時段'][1][0], 'monthly');
});
test('all active, pending, completed, legacy and unknown booking statuses protect the class', () => {
  for (const status of ['審核中', '預約成功', '已完課', '成功', '已完成', '', '未知']) {
    const f = fixture(); f.rows['預約名單'].push([0, 'empty', 'student', '學生', 300, status]);
    const before = JSON.stringify(f.rows);
    assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0, status);
    assert.equal(JSON.stringify(f.rows), before);
  }
});
test('cancelled reservations permit cleanup without removing bookings, logs or unrelated courses', () => {
  const f = fixture();
  f.rows['預約名單'].push([0, 'empty', 'student', '學生', 300, '已取消']);
  f.rows['訓練日誌'].push(['historical log']);
  f.rows['可用時段'].push(course('future', { 2: '2026-11-06' }), course('also-empty'));
  const bookings = JSON.stringify(f.rows['預約名單']), logs = JSON.stringify(f.rows['訓練日誌']);
  assert.deepEqual(Array.from(f.context.cleanupEmptyCourses().deletedSlotIds), ['also-empty', 'empty']);
  assert.equal(f.rows['可用時段'][1][0], 'future'); assert.equal(f.rows['可用時段'].length, 2);
  assert.equal(JSON.stringify(f.rows['預約名單']), bookings); assert.equal(JSON.stringify(f.rows['訓練日誌']), logs);
});
test('occupied or malformed capacities and duplicate slot IDs are preserved', () => {
  for (const extra of [{ 6: 4 }, { 5: '' }, { 6: null }, { 5: 0, 6: 0 }, { 6: 6 }, { 5: 'bad' }, { 5: 1.5, 6: 1.5 }]) {
    const f = fixture(); Object.assign(f.rows['可用時段'][1], extra);
    assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0);
  }
  const f = fixture(); f.rows['可用時段'].push(course());
  assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0);
});
test('preserves classes referenced by original or makeup leave records', () => {
  for (const column of [5, 10]) {
    const f = fixture(); const row = ['leave']; row[column] = 'empty'; f.rows['請假補課'].push(row);
    assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0);
  }
});
test('invalid or ambiguous dates and times never cause deletion', () => {
  for (const date of ['11/5', '2026-02-30', '2026-02-30T00:00:00Z', '2026年 11/5, 2/30', '2026年 11/5, error', '2026-11-05 and 2027-01-01', '']) {
    const f = fixture(); f.rows['可用時段'][1][2] = date;
    assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0, date);
  }
  for (const time of ['24:00', '19:60', '19:00 - 25:00', '', '晚上七點']) {
    const f = fixture(); f.rows['可用時段'][1][3] = time;
    assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0, time);
  }
});
test('read APIs clean under the shared lock and omit removed courses', () => {
  for (const action of ['getSlots', 'getCoachData']) {
    const f = fixture(); const result = f.run({ action, accessToken:'coach-token' });
    assert.equal(result.status, 'success'); assert.equal(f.rows['可用時段'].length, 1);
    if (action === 'getSlots') assert.equal(result.slots.length, 0);
    assert.deepEqual(f.state(), { locked: false, locks: 1, releases: 1 });
  }
});
test('stale student and coach registrations cannot book an empty class at or after cutoff', () => {
  for (const action of ['bookClass', 'coachRegisterMonthly', 'coachRegisterSingle']) {
    const f = fixture(); const result = f.run({ action, accessToken: 'coach-token', slotId: 'empty', lineId: 'student' });
    assert.equal(result.status, 'error'); assert.match(result.message, /6 小時/);
    assert.equal(f.rows['預約名單'].length, 1); assert.equal(f.rows['可用時段'].length, 1);
  }
});
test('ordinary booking before cutoff succeeds, and its pending reservation protects the class', () => {
  const f = fixture({ now: cutoff - 1 });
  assert.equal(f.run({ action: 'bookClass', slotId: 'empty', lineId: 'legacy', name: '學生', paidPrice: 300 }).status, 'success');
  f.setNow(cutoff + 1);
  assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0);
  assert.equal(f.rows['預約名單'][1][5], '審核中'); assert.equal(f.rows['可用時段'][1][6], 4);
});
test('classes with existing reservations can still accept an additional student after cutoff', () => {
  const f = fixture();
  f.rows['預約名單'].push([0, 'empty', 'first', '第一位', 300, '預約成功']);
  f.rows['可用時段'][1][6] = 4;
  assert.equal(f.run({ action: 'bookClass', slotId: 'empty', lineId: 'second', accessToken:'second-token', name: '第二位', paidPrice: 300 }).status, 'success');
  assert.equal(f.rows['預約名單'].length, 3); assert.equal(f.rows['可用時段'][1][6], 3);
});
test('makeup assignment cannot create the first reservation for an expired empty class', () => {
  const f = fixture();
  f.rows['預約名單'].push([0, 'monthly', 'student', '學生', 1200, '預約成功', '', 'original']);
  const leave = ['leave']; leave[2] = 'original'; leave[5] = 'monthly'; leave[9] = '待補課';
  f.rows['請假補課'].push(leave);
  const result = f.run({ action: 'arrangeMonthlyMakeup', accessToken: 'coach-token', leaveId: 'leave', slotId: 'empty' });
  assert.equal(result.status, 'error'); assert.match(result.message, /6 小時/);
  assert.equal(f.rows['可用時段'].length, 1); assert.equal(f.rows['預約名單'].length, 2);
  assert.equal(f.rows['請假補課'][1][9], '待補課');
});
test('unauthorized coach requests do not delete classes, and arbitrary payload clocks are ignored', () => {
  const f = fixture(); assert.equal(f.run({ action: 'coachRegisterSingle', slotId: 'empty' }).status, 'error');
  assert.equal(f.rows['可用時段'].length, 2);
  f.setNow(cutoff - 1);
  assert.equal(f.run({ action: 'getSlots', now: cutoff + 86400000 }).slots.length, 1);
});
test('a booking committed before cleanup acquires the lock prevents deletion', () => {
  const f = fixture({ onLock: rows => { rows['預約名單'].push([0, 'empty', 'student', '學生', 300, '審核中']); } });
  assert.equal(f.context.cleanupEmptyCourses().deletedSlotIds.length, 0);
});
test('lock contention, missing sheets/configuration and deletion errors release or avoid locks safely', () => {
  const busy = fixture({ busy: true }); assert.throws(() => busy.context.cleanupEmptyCourses(), /忙碌/);
  assert.deepEqual(busy.state(), { locked: false, locks: 1, releases: 0 });
  for (const sheet of ['可用時段', '預約名單']) {
    const f = fixture(); delete f.rows[sheet];
    assert.throws(() => f.context.cleanupEmptyCourses(), /工作表/); assert.equal(f.state().locked, false);
  }
  const missing = fixture(); delete missing.props.EMPTY_COURSE_SPREADSHEET_ID;
  assert.throws(() => missing.context.cleanupEmptyCourses(), /installEmptyCourseCleanup/); assert.equal(missing.state().locked, false);
  const failed = fixture({ failDelete: 1 }); assert.throws(() => failed.context.cleanupEmptyCourses(), /delete failed/);
  assert.equal(failed.state().locked, false); assert.equal(failed.rows['可用時段'].length, 2);
});
test('installer stores the bound spreadsheet and creates one recurring timer; repeated installation deduplicates only its own handler', () => {
  const other = { getHandlerFunction: () => 'anotherJob' };
  const f = fixture({ triggers: [other] }); delete f.props.EMPTY_COURSE_SPREADSHEET_ID;
  f.context.installEmptyCourseCleanup(); f.context.installEmptyCourseCleanup();
  assert.equal(f.props.EMPTY_COURSE_SPREADSHEET_ID, 'sheet-id'); assert.equal(f.triggers.length, 2);
  f.triggers.push({ getHandlerFunction: () => 'cleanupEmptyCourses' });
  f.context.installEmptyCourseCleanup(); assert.equal(f.triggers.length, 2); assert.ok(f.triggers.includes(other));
  assert.equal(f.rows['可用時段'].length, 2, 'installation itself does not delete data');
  assert.equal(f.state().locked, false);
});
test('old explicit scopes reproduce both reported trigger and background spreadsheet permission errors', () => {
  const oldScopes = ['https://www.googleapis.com/auth/spreadsheets.currentonly', 'https://www.googleapis.com/auth/script.external_request'];
  const f = fixture({ scopes: oldScopes });
  assert.throws(() => f.context.installEmptyCourseCleanup(), /script\.scriptapp/);
  assert.equal(f.triggers.length, 0); assert.equal(f.state().locked, false);
  assert.throws(() => f.context.cleanupEmptyCourses(), /auth\/spreadsheets$/);
  assert.equal(f.rows['可用時段'].length, 2); assert.equal(f.state().locked, false);
});
test('shipped manifest permits both installation and background cleanup while retaining LINE request access', () => {
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
  const f = fixture();
  f.context.installEmptyCourseCleanup();
  assert.equal(f.triggers.length, 1);
  assert.deepEqual(Array.from(f.context.cleanupEmptyCourses().deletedSlotIds), ['empty']);
});
