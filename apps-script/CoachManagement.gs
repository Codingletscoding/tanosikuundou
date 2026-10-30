// Requires MonthlyLeave.gs and the original worksheet constants.
function coachManagementAction_(ss, payload) {
  monthlyVerifyCoach_(payload.accessToken);
  if (payload.action === 'confirmCashPayment') {
    var sheet = ss.getSheetByName(SHEET_BOOKINGS);
    var cashBooking = monthlyUniqueRow_(sheet, 7, payload.bookingId, '訂單');
    if (['預約成功', '已完課', '成功', '已完成'].indexOf(cashBooking.row[5] || '預約成功') < 0) throw new Error('請先確認預約，已取消訂單不能登記收款。');
    if (cashBooking.row[6] === '現金已收') return { status: 'success' };
    if (cashBooking.row[6] !== '現場現金') throw new Error('此訂單不是現場現金付款。');
    sheet.getRange(cashBooking.index, 7).setValue('現金已收');
    return { status: 'success' };
  }
  if (payload.action === 'cancelBooking') {
    var bookings = ss.getSheetByName(SHEET_BOOKINGS);
    var booking = monthlyUniqueRow_(bookings, 7, payload.bookingId, '訂單');
    if (['審核中', '預約成功', '成功', '已完成'].indexOf(booking.row[5] || '預約成功') < 0) throw new Error('只能取消審核中或預約成功的訂單。');
    var leaves = ss.getSheetByName('請假補課');
    if (leaves && leaves.getDataRange().getValues().slice(1).some(function(row) { return String(row[2]) === payload.bookingId || String(row[12]) === payload.bookingId; })) throw new Error('此訂單已有請假補課紀錄，請保留關聯訂單。');
    var slots = ss.getSheetByName(SHEET_SLOTS);
    var rows = slots.getDataRange().getValues();
    var matches = rows.map(function(row,i) { return i > 0 && String(row[0]) === String(booking.row[1]) ? i : -1; }).filter(function(i) { return i > 0; });
    if (matches.length > 1) throw new Error('課程編號重複。');
    var counter = null, remaining = 0, capacity = 0;
    if (matches.length) {
      var index = matches[0]; remaining = Number(rows[index][6]); capacity = Number(rows[index][5]);
      if (!Number.isInteger(remaining) || !Number.isInteger(capacity) || remaining < 0 || capacity < remaining) throw new Error('名額資料異常。');
      counter = slots.getRange(index + 1, 7);
    }
    try {
      bookings.getRange(booking.index, 6).setValue('已取消');
      if (counter) counter.setValue(Math.min(capacity, remaining + 1));
      SpreadsheetApp.flush();
    } catch(error) {
      bookings.getRange(booking.index, 6).setValue(booking.row[5]);
      if (counter) counter.setValue(remaining);
      throw new Error('取消失敗，請重新讀取確認。');
    }
    return { status: 'success' };
  }
  if (payload.action !== 'updateSlot') throw new Error('不支援的管理操作。');
  var sheet = ss.getSheetByName(SHEET_SLOTS);
  var slot = monthlyUniqueRow_(sheet, 0, payload.slotId, '課程');
  var old = slot.row.slice(1,12);
  var title = String(payload.title || '').trim(), date = String(payload.date || '').trim(), time = String(payload.time || '').trim(), location = String(payload.location || '').trim();
  if (!title || !date || !time || !location) throw new Error('請完整填寫課程名稱、日期、時間及場地。');
  var times = time.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!times || Number(times[1]) > 23 || Number(times[3]) > 23 || Number(times[2]) > 59 || Number(times[4]) > 59 || Number(times[3])*60+Number(times[4]) <= Number(times[1])*60+Number(times[2])) throw new Error('時間需為開始至結束，例如 19:00 - 21:00。');
  if (!/^\[月繳/.test(title)) {
    var day = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!day) throw new Error('請填寫完整日期，例如 2026-12-01。');
    monthlyStart_(day[1], time);
  }
  var kind = function(value) { return /^\[月繳/.test(value) ? 'monthly' : /^\[專屬教練課\]/.test(value) ? 'coach' : 'single'; };
  if (kind(title) !== kind(String(slot.row[1]))) throw new Error('編輯不能變更課程類型，請保留原名稱前綴。');
  var oldCapacity = Number(slot.row[5]), oldRemaining = Number(slot.row[6]), capacity = Number(payload.capacity);
  if (!Number.isInteger(oldCapacity) || !Number.isInteger(oldRemaining) || oldRemaining < 0 || oldCapacity < oldRemaining) throw new Error('原課程名額異常。');
  var booked = oldCapacity - oldRemaining;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity < booked) throw new Error('總名額不可小於已預約人數，且至少為 1。');
  var leaveSheet = ss.getSheetByName('請假補課');
  var linked = leaveSheet && leaveSheet.getDataRange().getValues().slice(1).some(function(row) { return String(row[5]) === payload.slotId || String(row[10]) === payload.slotId; });
  if (linked && [title,date,time,location].some(function(value,i) { return value !== (slot.row[i+1] instanceof Date ? slot.row[i+1].toISOString() : String(slot.row[i+1])); })) throw new Error('此課程已有請假補課紀錄，只能修改名額及收費，以保留原排程。');
  var prices = [1,2,3,4,5].map(function(level) {
    var value = payload.prices && payload.prices[level];
    if (value === '' || value === null || value === undefined || !isFinite(Number(value)) || Number(value) < 0) throw new Error('各等級收費需為非負數。');
    return Number(value);
  });
  try {
    sheet.getRange(slot.index, 2, 1, 11).setValues([[title,date,time,location,capacity,capacity-booked].concat(prices)]);
    SpreadsheetApp.flush();
  } catch(error) {
    sheet.getRange(slot.index, 2, 1, 11).setValues([old]);
    throw new Error('修改失敗，請重新讀取確認。');
  }
  return { status: 'success' };
}

function rejectCancelledBookingWrite_(ss, payload) {
  if (payload.bookingId && ['approveBooking','updatePayment','addLog'].indexOf(payload.action) !== -1) {
    var booking = monthlyUniqueRow_(ss.getSheetByName(SHEET_BOOKINGS), 7, payload.bookingId, '訂單');
    if (payload.action === 'updatePayment' && (['現場現金', '現金已收'].indexOf(booking.row[6]) !== -1 || ['現場現金', '現金已收'].indexOf(payload.paymentCode) !== -1)) throw new Error('現金付款須由教練確認收款，不適用匯款後五碼修改。');
    if (booking.row[5] === '已取消') throw new Error('已取消訂單不可核准、更新付款或結課。');
  }
}
