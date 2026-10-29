/**
 * Installation: rename the original doPost(e) to handleRequest(e), then add this file.
 * Set Script Property LINE_LOGIN_CHANNEL_ID to your LINE Login channel ID.
 */
function doPost(e) {
  var lock = null;
  try {
    var payload = JSON.parse(e.postData.contents);
    // All writes share a lock so booking/deletion cannot race on remaining seats.
    var writes = ['registerUser', 'bookClass', 'addSlot', 'deleteSlot', 'approveBooking', 'updatePayment', 'addLog', 'deleteBooking'];
    if (writes.indexOf(payload.action) !== -1) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) throw new Error('系統忙碌中，請稍後再試。');
    }
    if (payload.action !== 'deleteBooking') return handleRequest(e);
    verifyBookingDeletionCoach_(payload.accessToken);
    var result = deleteApprovedBooking_(SpreadsheetApp.getActiveSpreadsheet(), payload.bookingId);
    return bookingDeletionResponse_(result);
  } catch (error) {
    // Do not echo tokens or upstream authentication responses.
    return bookingDeletionResponse_({ status: 'error', message: error.message || '刪除失敗' });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function bookingDeletionResponse_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function fetchLineForBookingDeletion_(url, options) {
  try {
    return UrlFetchApp.fetch(url, options);
  } catch (error) {
    // UrlFetch errors can include the URL, which may contain the access token.
    throw new Error('LINE 驗證服務暫時無法連線，請稍後再試。');
  }
}

function verifyBookingDeletionCoach_(accessToken) {
  var channelId = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
  if (!channelId) throw new Error('尚未設定 LINE_LOGIN_CHANNEL_ID。');
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('請重新登入 LINE 後再操作。');
  var verification = fetchLineForBookingDeletion_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken), { muteHttpExceptions: true });
  if (verification.getResponseCode() !== 200) throw new Error('LINE 登入已失效，請重新登入。');
  var token = JSON.parse(verification.getContentText());
  if (String(token.client_id) !== String(channelId) || !(Number(token.expires_in) > 0)) {
    throw new Error('LINE 登入驗證失敗。');
  }
  var response = fetchLineForBookingDeletion_('https://api.line.me/v2/profile', {
    headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('無法驗證教練身分，請重新登入。');
  var profile = JSON.parse(response.getContentText());
  if (ADMIN_LINE_IDS.indexOf(profile.userId) === -1) throw new Error('僅教練可刪除訂單。');
}

function deleteApprovedBooking_(ss, bookingId) {
  if (typeof bookingId !== 'string' || !bookingId.trim()) throw new Error('缺少訂單編號。');
  var bookings = ss.getSheetByName(SHEET_BOOKINGS);
  var slots = ss.getSheetByName(SHEET_SLOTS);
  if (!bookings || !slots) throw new Error('找不到預約名單或可用時段工作表。');
  var rows = bookings.getDataRange().getValues();
  var matches = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][7]) === bookingId) matches.push(i);
  }
  if (matches.length !== 1) throw new Error(matches.length ? '訂單編號重複，請先檢查資料。' : '訂單不存在或已刪除。');
  var index = matches[0];
  var booking = rows[index];
  var status = booking[5] || '預約成功';
  if (['審核中', '預約成功', '成功', '已完成'].indexOf(status) === -1) throw new Error('只能刪除審核中或預約成功且尚未完課的訂單。');
  var slotRows = slots.getDataRange().getValues();
  var slotIndex = -1;
  for (var j = 1; j < slotRows.length; j++) {
    if (String(slotRows[j][0]) === String(booking[1])) {
      if (slotIndex !== -1) throw new Error('課程編號重複，請先檢查資料。');
      slotIndex = j;
    }
  }
  // Deleted/unlisted classes have no seat counter to restore.
  var counter = null;
  var previous = null;
  if (slotIndex !== -1) {
    var capacity = Number(slotRows[slotIndex][5]);
    var remaining = Number(slotRows[slotIndex][6]);
    if (!Number.isInteger(capacity) || capacity < 0 || !Number.isInteger(remaining) || remaining < 0 || remaining > capacity) {
      throw new Error('課程名額資料異常，未刪除訂單，請先檢查。');
    }
    counter = slots.getRange(slotIndex + 1, 7);
    previous = slotRows[slotIndex][6];
  }
  try {
    if (counter) {
      counter.setValue(Math.min(capacity, Number(previous) + 1));
      SpreadsheetApp.flush();
    }
    bookings.deleteRow(index + 1);
  } catch (error) {
    if (counter) {
      counter.setValue(previous);
      SpreadsheetApp.flush();
    }
    throw new Error('訂單未刪除，請重新整理確認後再試。');
  }
  return { status: 'success', bookingId: bookingId };
}
