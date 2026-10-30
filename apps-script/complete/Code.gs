/**
 * 樂動羽球 Apps Script 主檔（直接依原程式整合；另需加入 MonthlyLeave.gs）
 * 整份取代原有 Code.gs。若曾加入 BookingDeletion.gs，請刪除該額外檔案，避免函式重複。
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
    const writeActions = ["registerUser", "bookClass", "addSlot", "deleteSlot", "approveBooking", "updatePayment", "addLog", "deleteBooking", "registerMonthlyLeave", "arrangeMonthlyMakeup", "cancelBooking", "updateSlot"];
    if (writeActions.includes(action)) {
      const candidate = LockService.getScriptLock();
      if (!candidate.tryLock(30000)) throw new Error("系統忙碌中，請稍後再試。");
      requestLock = candidate;
    }
    if (action === "deleteBooking") verifyBookingDeletionCoach_(payload.accessToken);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表，請確認此 Apps Script 綁定在原本的試算表。");
    rejectCancelledBookingWrite_(ss, payload);
    let result = {};

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
          userData = { name: data[i][1], age: data[i][2], phone: data[i][3], level: data[i][5] || 1 };
          break;
        }
      }
      const isAdmin = ADMIN_LINE_IDS.includes(payload.lineId);
      result = { status: "success", isRegistered: isRegistered, user: userData, isAdmin: isAdmin };
    } 
    
    else if (action === "registerUser") {
      const sheet = ss.getSheetByName(SHEET_USERS);
      sheet.appendRow([payload.lineId, payload.name, payload.age, payload.phone, new Date(), 1]);
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
      const bookingId = Utilities.getUuid();
      const paymentCode = payload.paymentCode || "";
      
      sheetBookings.appendRow([new Date(), payload.slotId, payload.lineId, payload.name, payload.paidPrice, "審核中", paymentCode, bookingId]);
      
      const slotData = sheetSlots.getDataRange().getValues();
      for (let i = 1; i < slotData.length; i++) {
        if (slotData[i][0] === payload.slotId) {
          let currentRem = parseInt(slotData[i][6]);
          if (currentRem > 0) sheetSlots.getRange(i + 1, 7).setValue(currentRem - 1);
          break;
        }
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
            makeupLeaveId: bData[i][8] || ""
        });
      }

      // 改由「日誌表」來精準計算已完成的堂數
      const lData = sheetLogs ? sheetLogs.getDataRange().getValues() : [];
      const userClassCounts = {};
      for (let i = 1; i < lData.length; i++) {
        const lId = lData[i][1];
        userClassCounts[lId] = (userClassCounts[lId] || 0) + 1;
      }

      const sheetUsers = ss.getSheetByName(SHEET_USERS);
      const uData = sheetUsers.getDataRange().getValues();
      const members = [];
      for (let i = 1; i < uData.length; i++) {
        const lId = uData[i][0];
        members.push({
          lineId: lId, name: uData[i][1], level: uData[i][5] || 1, totalClasses: userClassCounts[lId] || 0
        });
      }
      result = { status: "success", bookings: bookings, members: members };
    }

    else if (["getMonthlyLeaves", "registerMonthlyLeave", "arrangeMonthlyMakeup"].includes(action)) {
      result = monthlyLeaveAction_(ss, payload);
    }

    else if (["cancelBooking", "updateSlot"].includes(action)) {
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
      // 1. 寫入日誌
      sheetLogs.appendRow([
        new Date(), payload.lineId, payload.name, payload.date,
        payload.stats.clears, payload.stats.drives, payload.stats.lifts, payload.stats.drops, payload.stats.net, 
        payload.stats.pushes, payload.stats.smashes, payload.stats.defense, payload.stats.combo, payload.note
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
        if (bData[i][2] === payload.lineId) {
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
        if (lData[i][1] === payload.lineId) {
          totalClasses++; // 每一筆日誌就是一堂完結的課
          stats.clears += Number(lData[i][4]) || 0; stats.drives += Number(lData[i][5]) || 0;
          stats.lifts += Number(lData[i][6]) || 0; stats.drops += Number(lData[i][7]) || 0;
          stats.net += Number(lData[i][8]) || 0; stats.pushes += Number(lData[i][9]) || 0;
          stats.smashes += Number(lData[i][10]) || 0; stats.defense += Number(lData[i][11]) || 0;
          stats.combo += Number(lData[i][12]) || 0;
          logs.push({ date: lData[i][3], note: lData[i][13] });
        }
      }
      
      result = { status: "success", totalClasses: totalClasses, stats: stats, logs: logs.reverse(), bookings: myBookings.reverse(), monthlyLeaves: ss.getSheetByName('請假補課') ? monthlyLeaveRows_(ss.getSheetByName('請假補課')).filter(function(row) { return row.lineId === payload.lineId; }) : [] };
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
