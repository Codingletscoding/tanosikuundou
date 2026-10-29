const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../BookingDeletion.gs'), 'utf8');
function setup(options = {}) {
  const bookingRows = [['headers'], [0, 'slot-1', 'student', '學生', 980, options.status ?? '預約成功', '', 'booking-1']];
  if (options.duplicate) bookingRows.push([...bookingRows[1]]);
  const slotRows = [['headers'], ['slot-1', '課程', '2026-10-29', '18:00', '', 5, options.remaining ?? 3]];
  const calls = []; let locked = false;
  const sheet = rows => ({
    getDataRange: () => ({ getValues: () => rows.map(row => [...row]) }),
    getRange: (row, col) => ({ setValue: value => { rows[row - 1][col - 1] = value; } }),
    deleteRow: row => { if (options.deleteError) throw new Error('write failed'); rows.splice(row - 1, 1); }
  });
  const bookings = sheet(bookingRows), slots = sheet(slotRows);
  const context = {
    SHEET_BOOKINGS: '預約名單', SHEET_SLOTS: '可用時段', ADMIN_LINE_IDS: ['coach'],
    SpreadsheetApp: { flush() {}, getActiveSpreadsheet: () => ({ getSheetByName: name => name === '預約名單' ? bookings : options.missingSlot ? { getDataRange: () => ({ getValues: () => [['headers']] }) } : slots }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { locked = true; return !options.busy; }, releaseLock: () => { locked = false; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => options.noChannel ? null : 'channel' }) },
    UrlFetchApp: { fetch: url => {
      calls.push(url.includes('/verify?') ? 'verify' : 'profile');
      if (options.authNetworkError) throw new Error('request failed: mock-token');
      return { getResponseCode: () => options.expired ? 401 : 200, getContentText: () => JSON.stringify(url.includes('/verify?') ? { client_id: options.wrongChannel ? 'other' : 'channel', expires_in: 3600 } : { userId: options.notCoach ? 'student' : 'coach' }) };
    } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    handleRequest: () => { calls.push(locked ? 'forward-locked' : 'forward'); return { text: '{"status":"success"}' }; }
  };
  vm.createContext(context); vm.runInContext(source, context);
  const run = (payload = {}) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ action: 'deleteBooking', bookingId: 'booking-1', accessToken: 'mock-token', ...payload }) } }).text);
  return { run, bookingRows, slotRows, calls, isLocked: () => locked };
}
test('authenticated coach deletes approved booking and restores one seat', () => {
  const state = setup(); assert.equal(state.run().status, 'success');
  assert.equal(state.bookingRows.length, 1); assert.equal(state.slotRows[1][6], 4);
  assert.deepEqual(state.calls, ['verify', 'profile']); assert.equal(state.isLocked(), false);
  assert.equal(state.run().status, 'error'); assert.equal(state.slotRows[1][6], 4);
});
for (const flag of ['notCoach', 'wrongChannel', 'expired', 'noChannel', 'busy']) {
  test(`rejects ${flag} without changing bookings or seats`, () => {
    const state = setup({ [flag]: true }); assert.equal(state.run().status, 'error');
    assert.equal(state.bookingRows.length, 2); assert.equal(state.slotRows[1][6], 3);
    assert.equal(state.isLocked(), false);
  });
}
for (const status of ['已完課', '審核中']) {
  test(`rejects ${status}`, () => {
    const state = setup({ status }); assert.equal(state.run().status, 'error');
    assert.equal(state.bookingRows.length, 2); assert.equal(state.slotRows[1][6], 3);
  });
}
test('rejects caller-supplied coach ID without a valid access token', () => {
  const state = setup(); assert.equal(state.run({ accessToken: '', lineId: 'coach' }).status, 'error');
  assert.equal(state.bookingRows.length, 2); assert.deepEqual(state.calls, []);
});
test('rejects ambiguous booking IDs and invalid seat counters', () => {
  for (const options of [{ duplicate: true }, { remaining: -1 }, { remaining: 6 }]) {
    const state = setup(options); const count = state.bookingRows.length;
    assert.equal(state.run().status, 'error'); assert.equal(state.bookingRows.length, count);
  }
});
test('restores previous seat counter when row deletion fails', () => {
  const state = setup({ deleteError: true }); assert.equal(state.run().status, 'error');
  assert.equal(state.bookingRows.length, 2); assert.equal(state.slotRows[1][6], 3);
});
test('supports existing legacy successful statuses and caps remaining at capacity', () => {
  for (const status of ['', '成功', '已完成']) {
    const state = setup({ status, remaining: 5 }); assert.equal(state.run().status, 'success');
    assert.equal(state.slotRows[1][6], 5);
  }
});
test('can remove booking for a previously deleted slot', () => {
  const state = setup({ missingSlot: true }); assert.equal(state.run().status, 'success');
  assert.equal(state.bookingRows.length, 1);
});
test('existing booking writes share the lock; reads forward normally', () => {
  const state = setup(); state.run({ action: 'bookClass' }); state.run({ action: 'getSlots' });
  assert.deepEqual(state.calls, ['forward-locked', 'forward']); assert.equal(state.isLocked(), false);
});

test('authentication network errors never echo credentials', () => {
  const state = setup({ authNetworkError: true }); const result = state.run();
  assert.equal(result.status, 'error'); assert(!result.message.includes('mock-token'));
  assert.equal(state.bookingRows.length, 2);
});
