/**
 * 樂動羽球 Apps Script 單檔完整版本（含多人帳號、請假補課、教練管理）
 * 整份取代原有 Code.gs；移除舊 BookingDeletion.gs、MonthlyLeave.gs、CoachManagement.gs，避免重複。
 * 設定指令碼屬性 LINE_LOGIN_CHANNEL_ID = LIFF 所屬 LINE Login channel 的 Channel ID。
 * 儲存並更新原有 Web App 部署為新版本，維持原 API 網址。
 */

const SHEET_USERS = "會員資料";
const SHEET_SLOTS = "可用時段";
const SHEET_BOOKINGS = "預約名單";
const SHEET_LOGS = "訓練日誌";

const ADMIN_LINE_IDS = ["U3a76953e63578ec8607297044ac54e5a"]; 

function doPost(e) {
  let requestLock = null;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("請透過網站操作；不要在 Apps Script 編輯器直接執行 doPost。");
    }
    const payload = JSON.parse(e.postData.contents);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("請求格式不正確。");
    }
    const action = payload.action;
    const writeActions = ["registerUser", "bookClass", "addSlot", "deleteSlot", "approveBooking", "updatePayment", "addLog", "deleteBooking", "registerMonthlyLeave", "arrangeMonthlyMakeup", "cancelBooking", "updateSlot", "confirmCashPayment"];
    if (writeActions.includes(action)) {
      const candidate = LockService.getScriptLock();
      if (!candidate.tryLock(30000)) throw new Error("系統忙碌中，請稍後再試。");
      requestLock = candidate;
    }
    if (action === "deleteBooking") verifyBookingDeletionCoach_(payload.accessToken);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表，請確認此 Apps Script 綁定在原本的試算表。");
    if (payload.bookingId && ['approveBooking', 'updatePayment', 'addLog'].includes(action)) rejectCancelledBookingWrite_(ss, payload);
    let result = {};

    if (action === 'checkUser' && ADMIN_LINE_IDS.includes(payload.lineId)) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', isAdmin: true, isRegistered: false, user: null })).setMimeType(ContentService.MimeType.JSON);
    }

    let sheetLogs = ss.getSheetByName(SHEET_LOGS);
    if (!sheetLogs && (action === "addLog" || action === "getStudentStats" || action === "getCoachData")) {
      sheetLogs = ss.insertSheet(SHEET_LOGS);
      sheetLogs.appendRow(["時間戳記", "LINE_ID", "姓名", "日期", "高遠球", "平抽", "挑球", "切球", "網前小球", "撲球", "殺球", "防守技術", "組合訓練", "日誌內容"]);
    }

    if (action === "checkUser") {
      const sheet = ss.getSheetByName(SHEET_USERS);
      const data = sheet.getDataRange().getValues();
      let isRegistered = false;
      let userData = null;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === payload.lineId) {
          isRegistered = true;
          userData = { name: data[i][1], age: data[i][2], phone: data[i][3], level: data[i][5] || 1, students: accountStudents_(data[i]), studentCount: accountStudents_(data[i]).length };
          break;
        }
      }
      const isAdmin = ADMIN_LINE_IDS.includes(payload.lineId);
      result = { status: "success", isRegistered: isRegistered, user: userData, isAdmin: isAdmin };
    } 
    
    else if (action === "registerUser") {
      const sheet = ss.getSheetByName(SHEET_USERS);
      const students = validateAccountStudents_(payload);
      accountReserveColumn_(sheet, 7, '帳號學生資料');
      accountReserveColumn_(sheet, 8, '代表身分證字號');
      if (sheet.getDataRange().getValues().slice(1).some(row => row[0] === payload.lineId)) throw new Error('此帳號已註冊，請重新登入。');
      sheet.appendRow([payload.lineId, students[0].name, students[0].age, payload.phone.replace(/[\s-]/g, ''), new Date(), 1, JSON.stringify(students), payload.idNumber.toUpperCase()]);
      result = { status: "success" };
    }
    
    else if (action === "getSlots") {
      const sheet = ss.getSheetByName(SHEET_SLOTS);
      const data = sheet.getDataRange().getValues();
      const slots = [];
      for (let i = 1; i < data.length; i++) {
        slots.push({
          id: data[i][0], title: data[i][1], date: data[i][2], time: data[i][3], location: data[i][4],
          capacity: data[i][5], remaining: data[i][6],
          prices: { 1: data[i][7], 2: data[i][8], 3: data[i][9], 4: data[i][10], 5: data[i][11] }
        });
      }
      result = { status: "success", slots: slots };
    }
    
    else if (action === "bookClass") {
      validateBookingSlot_(ss, payload);
      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const sheetSlots = ss.getSheetByName(SHEET_SLOTS);
      const userSheet = ss.getSheetByName(SHEET_USERS);
      const account = userSheet && userSheet.getDataRange().getValues().slice(1).find(row => row[0] === payload.lineId);
      if (!account && payload.accountBooking) throw new Error('找不到帳號學生資料，請重新登入。');
      const students = account ? accountStudents_(account) : [{ id: '', name: payload.name }];
      const bookedSlot = monthlyUniqueRow_(sheetSlots, 0, payload.slotId, '課程');
      if (Number(bookedSlot.row[6]) < students.length) throw new Error('剩餘名額不足以預約此帳號的全部學生。');
      const isCoach = /^\[專屬教練課\]/.test(String(bookedSlot.row[1]));
      let price = Number(payload.paidPrice);
      if (account) {
        const level = Math.min(5, Math.max(1, Number(account[5]) || 1));
        price = Number(bookedSlot.row[6 + level]);
        if (isCoach) {
          const tariff = String(bookedSlot.row[1]).match(/1v1:(\d+)\|1v2:(\d+)/);
          if (!tariff || !['1對1','1對2'].includes(payload.coachType || (account[6] ? '' : '1對1'))) throw new Error('請選擇教練課類型。');
          price = Math.round(Number(tariff[(payload.coachType || '1對1') === '1對1' ? 1 : 2]) * [1,1,0.98,0.95,0.90,0.88][level]);
        }
        if ((!isCoach && (bookedSlot.row[6 + level] === '' || bookedSlot.row[6 + level] == null)) || !Number.isFinite(price) || price < 0) throw new Error('課程價格設定不正確。');
      }
      const paymentCode = isCoach ? '現場現金' : (['現場現金', '現金已收'].includes(payload.paymentCode) ? '' : (payload.paymentCode || ''));
      accountReserveColumn_(sheetBookings, 10, '學生編號');
      const firstRow = sheetBookings.getDataRange().getValues().length + 1;
      try {
        students.forEach(student => sheetBookings.appendRow([new Date(), payload.slotId, payload.lineId, student.name + (isCoach ? ' [' + (payload.coachType || '1對1') + ' - ' + (payload.location || '') + ']' : ''), price, '審核中', paymentCode, Utilities.getUuid(), '', student.id]));
        sheetSlots.getRange(bookedSlot.index, 7).setValue(Number(bookedSlot.row[6]) - students.length);
        SpreadsheetApp.flush();
      } catch (error) {
        const lastRow = sheetBookings.getDataRange().getValues().length;
        for (let row = lastRow; row >= firstRow; row--) sheetBookings.deleteRow(row);
        sheetSlots.getRange(bookedSlot.index, 7).setValue(bookedSlot.row[6]);
        throw new Error('預約未完成，請重新讀取後再試。');
      }
      result = { status: "success" };
    }

    else if (action === "addSlot") {
      const sheet = ss.getSheetByName(SHEET_SLOTS);
      const newId = Utilities.getUuid();
      sheet.appendRow([
        newId, payload.title, payload.date, payload.time, payload.location, payload.capacity, payload.capacity,
        payload.prices[1], payload.prices[2], payload.prices[3], payload.prices[4], payload.prices[5]
      ]);
      result = { status: "success" };
    }

    else if (action === "deleteSlot") {
      const sheetSlots = ss.getSheetByName(SHEET_SLOTS);
      const data = sheetSlots.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === payload.slotId) {
          sheetSlots.deleteRow(i + 1);
          break;
        }
      }
      result = { status: "success" };
    }
    
    else if (action === "getCoachData") {
      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const bData = sheetBookings.getDataRange().getValues();
      const bookings = [];
      
      for (let i = 1; i < bData.length; i++) {
        let status = bData[i][5] || "預約成功"; 
        if (status === "成功" || status === "已完成") status = "預約成功"; // 舊資料相容

        bookings.push({ 
            timestamp: bData[i][0], 
            slotId: bData[i][1], 
            lineId: bData[i][2], // 新增：供日誌使用
            name: bData[i][3], 
            paidPrice: bData[i][4],
            status: status,
            paymentCode: bData[i][6] || "",
            bookingId: bData[i][7] || "",
            makeupLeaveId: bData[i][8] || "", studentId: bData[i][9] || ""
        });
      }

      // 改由「日誌表」來精準計算已完成的堂數
      const lData = sheetLogs ? sheetLogs.getDataRange().getValues() : [];
      const sheetUsers = ss.getSheetByName(SHEET_USERS);
      const uData = sheetUsers.getDataRange().getValues();
      const members = [];
      for (let i = 1; i < uData.length; i++) {
        const lId = uData[i][0];
        accountStudents_(uData[i]).forEach(student => members.push({
          lineId: lId, studentId: student.id, name: student.name, level: uData[i][5] || 1,
          totalClasses: lData.slice(1).filter(row => row[1] === lId && studentMatches_(row[14], row[2], student)).length
        }));
      }
      result = { status: "success", bookings: bookings, members: members };
    }

    else if (["getMonthlyLeaves", "registerMonthlyLeave", "arrangeMonthlyMakeup"].includes(action)) {
      result = monthlyLeaveAction_(ss, payload);
    }

    else if (["cancelBooking", "updateSlot", "confirmCashPayment"].includes(action)) {
      result = coachManagementAction_(ss, payload);
    }

    else if (action === "deleteBooking") {
      result = deleteApprovedBooking_(ss, payload.bookingId);
    }

    else if (action === "approveBooking") {
      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const bData = sheetBookings.getDataRange().getValues();
      for (let i = 1; i < bData.length; i++) {
        if (bData[i][7] === payload.bookingId) {
          sheetBookings.getRange(i + 1, 6).setValue("預約成功");
          break;
        }
      }
      result = { status: "success" };
    }

    else if (action === "updatePayment") {
      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const bData = sheetBookings.getDataRange().getValues();
      for (let i = 1; i < bData.length; i++) {
        if (bData[i][7] === payload.bookingId) {
          sheetBookings.getRange(i + 1, 7).setValue(payload.paymentCode);
          break;
        }
      }
      result = { status: "success" };
    }

    else if (action === "addLog") {
      const account = accountFor_(ss, payload.lineId);
      const students = account ? accountStudents_(account) : [];
      const booking = payload.bookingId ? monthlyUniqueRow_(ss.getSheetByName(SHEET_BOOKINGS), 7, payload.bookingId, '訂單').row : null;
      if (booking && booking[2] !== payload.lineId) throw new Error('學生與訂單不符。');
      const studentId = booking ? (booking[9] || '') : (payload.studentId || '');
      const student = students.find(item => item.id === studentId);
      if ((students.length > 1 || studentId) && !student) throw new Error('請選擇要填寫日誌的學生。');
      accountReserveColumn_(sheetLogs, 15, '學生編號');
      // 1. 寫入日誌
      sheetLogs.appendRow([
        new Date(), payload.lineId, student ? student.name : payload.name, payload.date,
        payload.stats.clears, payload.stats.drives, payload.stats.lifts, payload.stats.drops, payload.stats.net, 
        payload.stats.pushes, payload.stats.smashes, payload.stats.defense, payload.stats.combo, payload.note, studentId
      ]);
      
      // 2. 如果有帶入 bookingId，代表教練從預約單按下「結課」，則將該預約狀態改為「已完課」
      if (payload.bookingId) {
        const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
        const bData = sheetBookings.getDataRange().getValues();
        for (let i = 1; i < bData.length; i++) {
          if (bData[i][7] === payload.bookingId) {
            sheetBookings.getRange(i + 1, 6).setValue("已完課");
            break;
          }
        }
      }
      result = { status: "success" };
    }

    else if (action === "getStudentStats") {
      const account = accountFor_(ss, payload.lineId);
      const students = account ? accountStudents_(account) : [];
      const selectedStudent = students.find(student => student.id === payload.studentId) || students[0];
      if (payload.studentId && (!selectedStudent || selectedStudent.id !== payload.studentId)) throw new Error('找不到此帳號的學生。');
      const sheetSlots = ss.getSheetByName(SHEET_SLOTS);
      const sData = sheetSlots ? sheetSlots.getDataRange().getValues() : [];
      const slotMap = {};
      for(let j = 1; j < sData.length; j++) {
        slotMap[sData[j][0]] = { title: sData[j][1], date: sData[j][2], time: sData[j][3] };
      }

      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const bData = sheetBookings.getDataRange().getValues();
      let myBookings = [];

      for (let i = 1; i < bData.length; i++) {
        if (bData[i][2] === payload.lineId && (!selectedStudent || studentMatches_(bData[i][9], bData[i][3], selectedStudent))) {
          let status = bData[i][5] || "預約成功"; 
          if(status === "成功" || status === "已完成") status = "預約成功"; 
          
          // 若已完課，則不顯示在學員的「追蹤中」名單，製造消失結單的效果
          if (status === "已完課") continue;

          const sInfo = slotMap[bData[i][1]] || { title: "未知或已下架課程", date: "", time: "" };
          myBookings.push({
            bookingId: bData[i][7] || "",
            slotId: bData[i][1],
            slotTitle: sInfo.title,
            slotDate: sInfo.date,
            slotTime: sInfo.time,
            paidPrice: bData[i][4],
            status: status,
            paymentCode: bData[i][6] || ""
          });
        }
      }

      // 讀取日誌，並計算真正的總堂數與能力雷達
      let stats = { clears: 0, drives: 0, lifts: 0, drops: 0, net: 0, pushes: 0, smashes: 0, defense: 0, combo: 0 };
      let logs = [];
      let totalClasses = 0;
      const lData = sheetLogs ? sheetLogs.getDataRange().getValues() : [];
      for (let i = 1; i < lData.length; i++) {
        if (lData[i][1] === payload.lineId && (!selectedStudent || studentMatches_(lData[i][14], lData[i][2], selectedStudent))) {
          totalClasses++; // 每一筆日誌就是一堂完結的課
          stats.clears += Number(lData[i][4]) || 0; stats.drives += Number(lData[i][5]) || 0;
          stats.lifts += Number(lData[i][6]) || 0; stats.drops += Number(lData[i][7]) || 0;
          stats.net += Number(lData[i][8]) || 0; stats.pushes += Number(lData[i][9]) || 0;
          stats.smashes += Number(lData[i][10]) || 0; stats.defense += Number(lData[i][11]) || 0;
          stats.combo += Number(lData[i][12]) || 0;
          logs.push({ date: lData[i][3], note: lData[i][13] });
        }
      }
      
      result = { status: "success", students: students, studentId: selectedStudent ? selectedStudent.id : "", totalClasses: totalClasses, stats: stats, logs: logs.reverse(), bookings: myBookings.reverse(), monthlyLeaves: ss.getSheetByName('請假補課') ? monthlyLeaveRows_(ss.getSheetByName('請假補課')).filter(function(row) { return row.lineId === payload.lineId && (!selectedStudent || studentMatches_(row.studentId, row.name, selectedStudent)); }) : [] };
    }

    if (!result.status) throw new Error("不支援的操作：" + String(action || "未提供"));
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.message || "操作失敗"})).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (requestLock) requestLock.releaseLock();
  }
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
  var leaveSheet = ss.getSheetByName('請假補課');
  if (leaveSheet && leaveSheet.getDataRange().getValues().slice(1).some(function(row) {
    return String(row[2]) === bookingId || String(row[12]) === bookingId;
  })) throw new Error('此訂單已有請假或補課紀錄，請保留訂單以維持補課追蹤。');
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

// Existing columns are retained; new account metadata starts at column G.
function accountFor_(ss, lineId) {
  const sheet = ss.getSheetByName(SHEET_USERS);
  return sheet && sheet.getDataRange().getValues().slice(1).find(row => row[0] === lineId);
}
function accountStudents_(row) {
  if (row[6]) {
    const students = JSON.parse(row[6]);
    if (!Array.isArray(students) || students.length < 1 || students.length > 3) throw new Error('帳號學生資料異常。');
    return students;
  }
  return [{ id: '', name: row[1], nickname: '', gender: '', age: row[2] }];
}
function studentMatches_(id, name, student) {
  return id ? id === student.id : (!student.id || String(name).split(' [')[0] === student.name);
}
function validateAccountStudents_(payload) {
  if (!payload.lineId || !Array.isArray(payload.students) || payload.students.length < 1 || payload.students.length > 3) throw new Error('請選擇 1 到 3 位學生。');
  if (!/^09\d{8}$/.test(String(payload.phone || '').replace(/[\s-]/g, ''))) throw new Error('請填寫有效手機號碼。');
  const id = String(payload.idNumber || '').toUpperCase();
  if (!/^[A-Z][12]\d{8}$/.test(id)) throw new Error('請填寫有效身分證字號。');
  const code = 'ABCDEFGHJKLMNPQRSTUVXYWZIO'.indexOf(id[0]) + 10;
  const checksum = Math.floor(code / 10) + code % 10 * 9 + id.slice(1).split('').reduce((sum, digit, i) => sum + Number(digit) * (i === 8 ? 1 : 8 - i), 0);
  if (checksum % 10) throw new Error('身分證字號檢查碼錯誤。');
  return payload.students.map(student => {
    if (!student || !String(student.name || '').trim() || !String(student.nickname || '').trim() || !['男','女','其他'].includes(student.gender) || !Number.isInteger(Number(student.age)) || Number(student.age) < 5 || Number(student.age) > 100) throw new Error('請完整填寫每位學生的姓名、暱稱、性別與年齡（5～100 歲）。');
    return { id: Utilities.getUuid(), name: String(student.name).trim(), nickname: String(student.nickname).trim(), gender: student.gender, age: Number(student.age) };
  });
}

function accountReserveColumn_(sheet, column, title) {
  const rows = sheet.getDataRange().getValues();
  if (rows[0][column - 1] && rows[0][column - 1] !== title) throw new Error('工作表第 ' + column + ' 欄已有其他用途，請先確認欄位。');
  if (!rows[0][column - 1]) {
    if (rows.slice(1).some(row => row[column - 1] !== '' && row[column - 1] != null)) throw new Error('新增學生欄位已有資料，請先確認欄位標題。');
    sheet.getRange(1, column).setValue(title);
  }
}


// ===== 月繳請假與補課（已內建，不需另外新增分檔） =====
// Add this file once. It uses the original worksheet constants and ADMIN_LINE_IDS.
var MONTHLY_LEAVE_SHEET = '請假補課';
var MONTHLY_LEAVE_HEADERS = ['編號', '登記時間', '月繳訂單編號', 'LINE_ID', '學生姓名', '原課程編號', '請假日期', '原上課時間', '原因', '狀態', '補課課程編號', '補課日期', '補課訂單編號', '安排時間', '補課課程名稱', '補課時間', '補課場地', '月繳課程名稱', '學生編號'];

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
    return { id: row[0], studentId: row[18] || '', bookingId: row[2], lineId: row[3], name: row[4], slotId: row[5],
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
  sheet.appendRow([id, new Date(), payload.bookingId, booking.row[2], booking.row[3], slot.row[0], day, slot.row[3], reason, '待補課', '', '', '', '', '', '', '', slot.row[1], booking.row[9] || '']);
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
  if (bookingRows.slice(1).some(function(row) { return String(row[1]) === payload.slotId && String(row[2]) === String(leave.row[3]) && (source.row[9] ? row[9] === source.row[9] : !row[9]) && row[5] !== '已取消'; })) {
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
    bookings.appendRow([new Date(), payload.slotId, leave.row[3], leave.row[4], 0, '預約成功', '', bookingId, payload.leaveId, source.row[9] || '']);
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



// ===== 教練管理（已內建，不需另外新增分檔） =====
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
