// Add this file once. It uses the original worksheet constants and ADMIN_LINE_IDS.
var MONTHLY_LEAVE_SHEET = '請假補課';
var MONTHLY_LEAVE_HEADERS = ['編號', '登記時間', '月繳訂單編號', 'LINE_ID', '學生姓名', '原課程編號', '請假日期', '原上課時間', '原因', '狀態', '補課課程編號', '補課日期', '補課訂單編號', '安排時間', '補課課程名稱', '補課時間', '補課場地', '月繳課程名稱'];

function monthlyLeaveAction_(ss, payload) {
  monthlyVerifyCoach_(payload.accessToken);
  if (payload.action === 'getMonthlyLeaves') {
    var existing = ss.getSheetByName(MONTHLY_LEAVE_SHEET);
    return { status: 'success', leaves: existing ? monthlyLeaveRows_(existing) : [] };
  }
  if (payload.action === 'registerMonthlyLeave') return registerMonthlyLeave_(ss, payload);
  if (payload.action === 'arrangeMonthlyMakeup') return arrangeMonthlyMakeup_(ss, payload);
  throw new Error('不支援的請假補課操作。');
}

function monthlyLeaveRows_(sheet) {
  return sheet.getDataRange().getValues().slice(1).filter(function(row) { return row[0]; }).map(function(row) {
    return { id: row[0], bookingId: row[2], lineId: row[3], name: row[4], slotId: row[5],
      originalDate: monthlyDate_(row[6]), originalTime: row[7], reason: row[8], status: row[9],
      makeupSlotId: row[10], makeupDate: monthlyDate_(row[11]), makeupBookingId: row[12],
      makeupTitle: row[14], makeupTime: row[15], makeupLocation: row[16], monthlyTitle: row[17] };
  });
}

function monthlyDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(value || '');
}

function monthlyStart_(date, time) {
  var day = String(date || '');
  var match = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error('日期或上課時間格式不正確。');
  }
  var start = new Date(day + 'T' + ('0' + match[1]).slice(-2) + ':' + match[2] + ':00+08:00');
  if (!isFinite(start.getTime()) || Utilities.formatDate(start, 'Asia/Taipei', 'yyyy-MM-dd') !== day) {
    throw new Error('日期不正確。');
  }
  return start;
}

function monthlyUniqueRow_(sheet, column, id, label) {
  if (!sheet || typeof id !== 'string' || !id) throw new Error('缺少' + label + '或工作表。');
  var rows = sheet.getDataRange().getValues();
  var found = [];
  for (var i = 1; i < rows.length; i++) if (String(rows[i][column]) === id) found.push({ row: rows[i], index: i + 1 });
  if (found.length !== 1) throw new Error(label + '不存在或編號重複。');
  return found[0];
}

function registerMonthlyLeave_(ss, payload) {
  var booking = monthlyUniqueRow_(ss.getSheetByName(SHEET_BOOKINGS), 7, payload.bookingId, '月繳訂單');
  if (['預約成功', '成功', '已完成'].indexOf(booking.row[5] || '預約成功') === -1) throw new Error('只能登記已預約成功且尚未完課的月繳學生。');
  var slot = monthlyUniqueRow_(ss.getSheetByName(SHEET_SLOTS), 0, String(booking.row[1]), '月繳課程');
  if (!/^\[月繳/.test(String(slot.row[1]))) throw new Error('此訂單不是月繳課程。');
  var day = String(payload.originalDate || '');
  var start = monthlyStart_(day, slot.row[3]);
  if (start.getTime() - Date.now() < 14 * 24 * 60 * 60 * 1000) throw new Error('請假需在上課開始前至少 14 天登記。');
  var schedule = monthlyDate_(slot.row[2]);
  var iso = schedule.match(/\d{4}-\d{2}-\d{2}/g);
  var matches = iso ? iso.indexOf(day) !== -1 : (schedule.match(/\b\d{1,2}\/\d{1,2}\b/g) || []).some(function(md) {
    var parts = md.split('/'); return Number(parts[0]) === Number(day.slice(5, 7)) && Number(parts[1]) === Number(day.slice(8, 10));
  });
  var year = schedule.match(/(\d{4})年/);
  if (!matches || (year && year[1] !== day.slice(0, 4))) throw new Error('請假日期不在此月繳課程的上課日期內。');
  if (!booking.row[2]) throw new Error('學生缺少 LINE_ID，無法建立補課紀錄。');
  var reason = String(payload.reason || '').trim();
  if (!reason || reason.length > 500) throw new Error('請填寫請假原因（最多 500 字）。');
  var sheet = ss.getSheetByName(MONTHLY_LEAVE_SHEET);
  if (!sheet) { sheet = ss.insertSheet(MONTHLY_LEAVE_SHEET); sheet.appendRow(MONTHLY_LEAVE_HEADERS); }
  if (monthlyLeaveRows_(sheet).some(function(row) { return row.bookingId === payload.bookingId && row.originalDate === day; })) {
    throw new Error('此學生這一天已登記請假，請勿重複登記。');
  }
  var id = Utilities.getUuid();
  sheet.appendRow([id, new Date(), payload.bookingId, booking.row[2], booking.row[3], slot.row[0], day, slot.row[3], reason, '待補課', '', '', '', '', '', '', '', slot.row[1]]);
  // Monthly capacity describes the whole series. A single absence must not free a seat for the whole month.
  return { status: 'success', leaveId: id };
}

function arrangeMonthlyMakeup_(ss, payload) {
  var sheet = ss.getSheetByName(MONTHLY_LEAVE_SHEET);
  var leave = monthlyUniqueRow_(sheet, 0, payload.leaveId, '請假紀錄');
  if (leave.row[9] !== '待補課' || leave.row[12]) throw new Error('此請假已安排補課，請勿重複安排。');
  var source = monthlyUniqueRow_(ss.getSheetByName(SHEET_BOOKINGS), 7, String(leave.row[2]), '原月繳訂單');
  if (['預約成功', '成功', '已完成', '已完課'].indexOf(source.row[5] || '預約成功') === -1) throw new Error('原月繳訂單尚未確認，無法安排補課。');
  var slots = ss.getSheetByName(SHEET_SLOTS);
  var target = monthlyUniqueRow_(slots, 0, payload.slotId, '補課時段');
  if (/^\[(月繳|專屬教練課)/.test(String(target.row[1]))) throw new Error('補課請選擇單堂團課，不能選擇月繳套裝或私人教練時段。');
  var dateMatch = monthlyDate_(target.row[2]).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) throw new Error('補課時段需有完整年月日。');
  var start = monthlyStart_(dateMatch[1], target.row[3]);
  if (start.getTime() <= Date.now()) throw new Error('不能安排已開始或過去的補課時段。');
  if (dateMatch[1] === monthlyDate_(leave.row[6])) throw new Error('請選擇請假日以外的補課日期。');
  var remaining = Number(target.row[6]), capacity = Number(target.row[5]);
  if (!Number.isInteger(remaining) || !Number.isInteger(capacity) || remaining < 1 || capacity < remaining) throw new Error('補課時段已滿或名額資料異常。');
  var bookings = ss.getSheetByName(SHEET_BOOKINGS);
  var bookingRows = bookings.getDataRange().getValues();
  if (bookingRows[0][8] && bookingRows[0][8] !== '來源請假編號') {
    throw new Error('預約名單第 I 欄已有其他用途，請先確認欄位，避免覆寫資料。');
  }
  if (bookingRows.slice(1).some(function(row) { return String(row[1]) === payload.slotId && String(row[2]) === String(leave.row[3]) && row[5] !== '已取消'; })) {
    throw new Error('此學生已預約該補課時段。');
  }
  if (!bookingRows[0][8]) bookings.getRange(1, 9).setValue('來源請假編號');
  var bookingId = Utilities.getUuid();
  var counter = slots.getRange(target.index, 7);
  var appended = false;
  var previous = leave.row.slice(9, 17);
  while (previous.length < 8) previous.push('');
  try {
    counter.setValue(remaining - 1);
    SpreadsheetApp.flush();
    bookings.appendRow([new Date(), payload.slotId, leave.row[3], leave.row[4], 0, '預約成功', '', bookingId, payload.leaveId]);
    appended = true;
    sheet.getRange(leave.index, 10, 1, 8).setValues([['已安排', payload.slotId, dateMatch[1], bookingId, new Date(), target.row[1], target.row[3], target.row[4]]]);
    SpreadsheetApp.flush();
  } catch (error) {
    if (appended) {
      var created = monthlyUniqueRow_(bookings, 7, bookingId, '補課訂單');
      bookings.deleteRow(created.index);
    }
    counter.setValue(remaining);
    sheet.getRange(leave.index, 10, 1, 8).setValues([previous]);
    SpreadsheetApp.flush();
    throw new Error('安排補課失敗，請重新整理核對紀錄後再試。');
  }
  return { status: 'success', bookingId: bookingId };
}

function validateBookingSlot_(ss, payload) {
  var target = monthlyUniqueRow_(ss.getSheetByName(SHEET_SLOTS), 0, payload.slotId, '課程');
  var remaining = Number(target.row[6]), capacity = Number(target.row[5]);
  if (!Number.isInteger(remaining) || !Number.isInteger(capacity) || remaining < 1 || capacity < remaining) {
    throw new Error('課程已滿或名額資料異常，無法預約。');
  }
}

function monthlyFetchLine_(url, options) {
  try {
    return UrlFetchApp.fetch(url, options);
  } catch (error) {
    // UrlFetch errors can include the URL, which may contain the access token.
    throw new Error('LINE 驗證服務暫時無法連線，請稍後再試。');
  }
}

function monthlyVerifyCoach_(accessToken) {
  var channelId = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
  if (!channelId) throw new Error('尚未設定 LINE_LOGIN_CHANNEL_ID。');
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('請重新登入 LINE 後再操作。');
  var verification = monthlyFetchLine_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken), { muteHttpExceptions: true });
  if (verification.getResponseCode() !== 200) throw new Error('LINE 登入已失效，請重新登入。');
  var token = JSON.parse(verification.getContentText());
  if (String(token.client_id) !== String(channelId) || !(Number(token.expires_in) > 0)) {
    throw new Error('LINE 登入驗證失敗。');
  }
  var response = monthlyFetchLine_('https://api.line.me/v2/profile', {
    headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('無法驗證教練身分，請重新登入。');
  var profile = JSON.parse(response.getContentText());
  if (ADMIN_LINE_IDS.indexOf(profile.userId) === -1) throw new Error('僅教練可登記請假及安排補課。');
}

