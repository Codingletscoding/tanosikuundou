/**
 * 樂動羽球 Apps Script 單檔完整版本（含多人帳號、請假補課、教練管理）
 * 整份取代原有 Code.gs；移除舊 BookingDeletion.gs、MonthlyLeave.gs、CoachManagement.gs，避免重複。
 * LIFF 登入 Channel ID 為 2012115245；相容處理先前錯填的 2012115242，其他明確的指令碼屬性仍優先。
 * 儲存並更新原有 Web App 部署為新版本，維持原 API 網址。
 */

const SHEET_USERS = "會員資料";
const SHEET_SLOTS = "可用時段";
const SHEET_BOOKINGS = "預約名單";
const SHEET_LOGS = "訓練日誌";
const LOG_BOOKING_HEADER = '預約單號';
const LOG_ID_HEADER = '日誌編號';
const SHEET_TEACHING_COACHES = '授課教練';
const SLOT_TEACHING_COACH_HEADER = '授課教練編號';
const SLOT_MONTHLY_SESSIONS_HEADER = '月繳逐堂排程';
const SHEET_HISTORICAL_BOOKINGS = '歷史預約紀錄';
const SHEET_STUDENT_GROUP_PRICES = '學員團課價格';
const STUDENT_GROUP_PRICE_HEADERS = ['LINE_ID', '學生編號', '一小時團課價格', '二小時團課價格', '更新時間', '設定教練'];
const STUDENT_MONTHLY_PRICE_HEADERS = ['一小時月繳每堂價格', '二小時月繳每堂價格'];
const MONTHLY_PRICE_DEFAULTS = { hour1: 250, hour2: 500 };
const GROUP_PRICE_DEFAULTS = { hour1: 300, hour2: 550 };
const SHEET_VENUE_EXPENSES = '場地費紀錄';
const VENUE_EXPENSE_HEADERS = ['費用編號', '場地使用日期', '場地', '金額', '備註', '建立時間', '建立教練', '更新時間', '更新教練', '狀態', '請求編號', '版本'];
const MONTHLY_GROUP_TARIFFS = {
  60: { 4: { regular: 1200, price: 1000 }, 5: { regular: 1500, price: 1250 } },
  120: { 4: { regular: 2400, price: 2000 }, 5: { regular: 3000, price: 2500 } }
};
const HISTORICAL_BOOKING_HEADERS = ['紀錄編號', '補登時間', 'LINE_ID', '學生編號', '學生姓名', '課程名稱', '上課日期', '開始時間', '結束時間', '上課地點', '授課教練姓名', '課程金額', '付款狀態', '原預約日期', '課程狀態', '送出識別碼'];

const ADMIN_LINE_IDS = ["U3a76953e63578ec8607297044ac54e5a"]; 

// Server-owned channel for this LIFF app; configured overrides exclude the known wrong legacy value.
const DEFAULT_LINE_LOGIN_CHANNEL_ID = '2012115245';
const API_SECURITY_VERSION = 2;
const ADMIN_API_ACTIONS = ['getCoachData', 'getPaymentSummary', 'getPricingPreview', 'getStudentProfile', 'getHistoricalBookingOptions', 'coachAddHistoricalBooking', 'coachRegisterMonthly', 'coachRegisterSingle', 'addSlot', 'deleteSlot', 'approveBooking', 'addLog', 'deleteBooking', 'getMonthlyLeaves', 'registerMonthlyLeave', 'arrangeMonthlyMakeup', 'cancelBooking', 'updateSlot', 'confirmCashPayment', 'addTeachingCoach', 'updateTeachingCoach', 'setStudentGroupPrices', 'addVenueExpense', 'updateVenueExpense', 'cancelVenueExpense'];
const MEMBER_API_ACTIONS = ['checkUser', 'registerUser', 'completeAccountRegistration', 'getSlots', 'getBookingQuote', 'bookClass', 'getStudentStats', 'updatePayment'];

function authenticatedActor_(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('請重新登入 LINE。');
  var verification = monthlyFetchLine_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken), { muteHttpExceptions: true });
  if (verification.getResponseCode() !== 200) throw new Error('LINE 登入已失效，請重新登入。');
  var token;
  try { token = JSON.parse(verification.getContentText()); } catch (error) { throw new Error('無法驗證 LINE 登入，請重新登入。'); }
  assertLineLoginToken_(token, lineLoginChannelId_());
  var response = monthlyFetchLine_('https://api.line.me/v2/profile', { headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('無法驗證 LINE 帳號，請重新登入。');
  var profile;
  try { profile = JSON.parse(response.getContentText()); } catch (error) { throw new Error('無法驗證 LINE 帳號，請重新登入。'); }
  if (!profile || typeof profile.userId !== 'string' || !profile.userId) throw new Error('無法驗證 LINE 帳號，請重新登入。');
  return { lineId: profile.userId, isAdmin: ADMIN_LINE_IDS.indexOf(profile.userId) !== -1 };
}

function authorizeRequest_(payload) {
  var action = payload.action;
  if (ADMIN_API_ACTIONS.indexOf(action) < 0 && MEMBER_API_ACTIONS.indexOf(action) < 0) throw new Error('不支援的操作：' + String(action || '未提供'));
  var actor = authenticatedActor_(payload.accessToken);
  if (ADMIN_API_ACTIONS.indexOf(action) >= 0 && !actor.isAdmin) throw new Error('僅教練可執行此操作。');
  if (MEMBER_API_ACTIONS.indexOf(action) >= 0 && action !== 'updatePayment') {
    if (payload.lineId == null || payload.lineId === '') payload.lineId = actor.lineId;
    if (typeof payload.lineId !== 'string') throw new Error('帳號格式不正確。');
    var selfOnly = ['registerUser', 'completeAccountRegistration'].indexOf(action) >= 0;
    if (payload.lineId !== actor.lineId && (selfOnly || !actor.isAdmin)) throw new Error('只能操作自己帳號的資料。');
  }
  return actor;
}

function lineLoginChannelId_() {
  const configured = String(PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID') || '').trim();
  // Correct the previous wrong channel for this site's fixed LIFF app; never trust a caller-provided ID.
  const channelId = (!configured || configured === '2012115242') ? DEFAULT_LINE_LOGIN_CHANNEL_ID : configured;
  if (!channelId) throw new Error('尚未設定 LINE_LOGIN_CHANNEL_ID。請在 Apps Script 專案設定的指令碼屬性填入 LINE Login Channel ID。');
  return channelId;
}

function assertLineLoginToken_(token, channelId) {
  if (!token || String(token.client_id) !== String(channelId)) {
    // Channel IDs are public. Only echo digits, never tokens or arbitrary response/configuration text.
    const actual = token && /^\d+$/.test(String(token.client_id)) ? String(token.client_id) : '無法辨識';
    const expected = /^\d+$/.test(String(channelId)) ? String(channelId) : '無法辨識';
    throw new Error('LINE 登入驗證失敗：登入頻道不符（LINE：' + actual + '；後端：' + expected + '）。請確認 LINE_LOGIN_CHANNEL_ID，並重新登入。');
  }
  if (!(Number(token.expires_in) > 0)) throw new Error('LINE 登入已失效，請重新登入。');
}

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
    // LINE 回傳的身分才是授權依據；不採信 lineId、isAdmin 或任何前端權限旗標。
    const actor = authorizeRequest_(payload);
    const writeActions = ["registerUser", "completeAccountRegistration", "bookClass", "coachRegisterMonthly", "coachRegisterSingle", "addSlot", "deleteSlot", "approveBooking", "updatePayment", "addLog", "deleteBooking", "registerMonthlyLeave", "arrangeMonthlyMakeup", "cancelBooking", "updateSlot", "confirmCashPayment", "addTeachingCoach", "updateTeachingCoach", "setStudentGroupPrices"];
    if (writeActions.includes(action) || ['coachAddHistoricalBooking', 'getSlots', 'getCoachData', 'getPaymentSummary', 'addVenueExpense', 'updateVenueExpense', 'cancelVenueExpense'].includes(action)) {
      const candidate = LockService.getScriptLock();
      if (!candidate.tryLock(30000)) throw new Error("系統忙碌中，請稍後再試。");
      requestLock = candidate;
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表，請確認此 Apps Script 綁定在原本的試算表。");
    if (action === 'updatePayment') {
      const target = monthlyUniqueRow_(ss.getSheetByName(SHEET_BOOKINGS), 7, payload.bookingId, '訂單');
      if (!actor.isAdmin && target.row[2] !== actor.lineId) throw new Error('只能修改自己帳號的付款資料。');
    }
    if (payload.bookingId && ['approveBooking', 'updatePayment', 'addLog'].includes(action)) rejectCancelledBookingWrite_(ss, payload);
    let result = {};

    if (action === 'checkUser' && actor.isAdmin && payload.lineId === actor.lineId) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', isAdmin: true, isRegistered: false, user: null, securityVersion: API_SECURITY_VERSION })).setMimeType(ContentService.MimeType.JSON);
    }

    let sheetLogs = ss.getSheetByName(SHEET_LOGS);
    if (!sheetLogs && action === "addLog") {
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
          userData = accountUser_(data[i]);
          break;
        }
      }
      const isAdmin = actor.isAdmin && payload.lineId === actor.lineId;
      result = { status: "success", isRegistered: isRegistered, user: userData, isAdmin: isAdmin, accountRegistrationVersion: 1, registrationProfileVersion: 2 };
    } 
    
    else if (action === "getStudentProfile") {
      result = { status: 'success', profile: coachStudentProfile_(ss, payload) };
    }

    else if (action === 'setStudentGroupPrices') {
      result = saveStudentGroupPrices_(ss, payload, actor);
    }

    else if (action === 'getHistoricalBookingOptions' || action === 'coachAddHistoricalBooking') {
      result = action === 'getHistoricalBookingOptions'
        ? { status: 'success', historicalBookingVersion: 1, teachingCoaches: teachingCoaches_(ss) }
        : addHistoricalBooking_(ss, payload);
    }

    else if (action === "registerUser" || action === "completeAccountRegistration") {
      const sheet = ss.getSheetByName(SHEET_USERS);
      const students = validateAccountStudents_(payload);
      students.forEach(student => safeSheetName_(student.name));
      const rows = sheet.getDataRange().getValues();
      const matches = rows.map((row, i) => i > 0 && row[0] === payload.lineId ? i : -1).filter(i => i > 0);
      let oldRow = null;
      if (action === 'completeAccountRegistration') {
        if (matches.length !== 1) throw new Error('找不到唯一的帳號資料，請聯絡教練確認。');
        oldRow = rows[matches[0]];
        if (oldRow[6]) throw new Error('此帳號已完成學生資料登記，請重新登入。');
        // Preserve the original student's legacy logs and bookings, even if names were missing.
        students[0].id = '';
      } else if (matches.length) throw new Error('此帳號已註冊，請重新登入並使用補登學生資料。');
      accountReserveColumn_(sheet, 7, '帳號學生資料');
      const isProfile = payload.registrationProfileVersion === 2;
      if (!isProfile) accountReserveColumn_(sheet, 8, '代表身分證字號');
      const phone = isProfile ? students[0].phone : payload.phone.replace(/[\s-]/g, '');
      const idNumber = isProfile ? (oldRow ? (oldRow[7] || '') : '') : payload.idNumber.toUpperCase();
      const row = [payload.lineId, students[0].name, students[0].age, phone, oldRow ? oldRow[4] : new Date(), oldRow ? (oldRow[5] || 1) : 1, JSON.stringify(students), idNumber];
      if (oldRow) sheet.getRange(matches[0] + 1, 1, 1, 8).setValues([row]);
      else sheet.appendRow(row);
      result = { status: 'success', user: accountUser_(row), studentCount: students.length };

    }
    
    else if (action === "getSlots") {
      cleanupEmptyCourses_(ss, Date.now());
      const sheet = ss.getSheetByName(SHEET_SLOTS);
      const data = sheet.getDataRange().getValues();
      const teachingCoaches = teachingCoaches_(ss);
      const coachNames = new Map(teachingCoaches.map(coach => [coach.id, coach.name]));
      const account = accountFor_(ss, payload.lineId);
      const groupPriceData = studentGroupPriceData_(ss);
      const slots = [];
      for (let i = 1; i < data.length; i++) {
        const slot = {
          id: data[i][0], title: data[i][1], date: data[i][2], time: data[i][3], location: data[i][4],
          capacity: data[i][5], remaining: data[i][6],
          teachingCoachId: data[0][12] === SLOT_TEACHING_COACH_HEADER ? String(data[i][12] || '') : '',
          teachingCoachName: data[0][12] === SLOT_TEACHING_COACH_HEADER ? (coachNames.get(String(data[i][12] || '')) || '') : '',
          prices: { 1: data[i][7], 2: data[i][8], 3: data[i][9], 4: data[i][10], 5: data[i][11] }
        };
        slot.availableLocations = privateLocations_(data[i]);
        if (/^\[月繳/.test(String(slot.title).trim())) {
          slot.monthlyTariff = monthlySlotTariff_(data[0][13] === SLOT_MONTHLY_SESSIONS_HEADER ? data[i] : data[i].slice(0, 13));
          slot.monthlySessionsVersion = 1;
          slot.monthlySessions = monthlySessions_(data[i], data[0]).map(function(session) { return { ...session, teachingCoachName: coachNames.get(session.teachingCoachId) || '' }; });
        }
        if (account) slot.priceQuote = bookingQuote_(ss, { lineId: payload.lineId, slotId: String(data[i][0]) }, actor, true, data[i], account, groupPriceData, data[0]);
        if (!actor.isAdmin) {
          delete slot.prices;
          if (/^\[專屬教練課\]/.test(String(slot.title))) slot.title = '[專屬教練課]';
        }
        slots.push(slot);
      }
      result = { status: "success", slots: slots, monthlyGroupTariffs: MONTHLY_GROUP_TARIFFS, monthlyUniformPricingVersion: 1, studentMonthlyPricingVersion: 1, studentGroupPricingVersion: 1, coachAccountPricingVersion: 1, coachSingleRegistrationVersion: 1, teachingCoachesVersion: 1, monthlySessionsVersion: 1, teachingCoaches: teachingCoaches };
    }

    else if (action === 'addTeachingCoach' || action === 'updateTeachingCoach') {
      result = saveTeachingCoach_(ss, payload);
    }

    else if (action === 'getBookingQuote') {
      result = { status: 'success', quote: bookingQuote_(ss, payload, actor, false) };
    }

    else if (action === 'getPricingPreview') {
      result = { status: 'success', ...pricingPreview_(payload) };
    }

    else if (action === 'getPaymentSummary') {
      result = { status: 'success', paymentSummary: paymentSummary_(ss, payload.month) };
    }

    else if (['addVenueExpense', 'updateVenueExpense', 'cancelVenueExpense'].includes(action)) {
      result = saveVenueExpense_(ss, payload, actor);
    }
    
    else if (action === "bookClass" || action === "coachRegisterMonthly" || action === "coachRegisterSingle") {
      const coachMonthly = action === "coachRegisterMonthly";
      const coachSingle = action === "coachRegisterSingle";
      const coachRegistration = coachMonthly || coachSingle;
      cleanupEmptyCoursesBeforeBooking_(ss, payload.slotId);
      validateBookingSlot_(ss, payload);
      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const sheetSlots = ss.getSheetByName(SHEET_SLOTS);
      const quote = bookingQuote_(ss, payload, actor, false);
      const students = quote.students;
      const bookedSlot = monthlyUniqueRow_(sheetSlots, 0, payload.slotId, '課程');
      {
        const rows = sheetBookings.getDataRange().getValues();
        if (rows.slice(1).some(row => row[1] === payload.slotId && row[2] === payload.lineId && row[5] !== '已取消' && students.some(student => studentMatches_(row[9], row[3], student)))) throw new Error(coachMonthly ? '所選學生已登記此月繳團課，請勿重複登記。' : '此學員已預約此課程，請勿重複登記。');
      }
      const isCoach = quote.isCoach, seats = quote.seatsRequired, price = quote.unitPrice;
      if (payload.expectedTotalPrice != null && (!Number.isFinite(Number(payload.expectedTotalPrice)) || Math.round(Number(payload.expectedTotalPrice) * 100) !== Math.round(quote.totalPrice * 100))) throw new Error('課程價格已有變更，請重新讀取並確認報價。');
      if (!isCoach && payload.expectedStudentPrices != null && (!Array.isArray(payload.expectedStudentPrices) || payload.expectedStudentPrices.length !== quote.studentPrices.length || payload.expectedStudentPrices.some(function(item, index) { return !item || item.studentId !== quote.studentPrices[index].studentId || !Number.isFinite(Number(item.price)) || Math.round(Number(item.price) * 100) !== Math.round(quote.studentPrices[index].price * 100); }))) throw new Error('課程價格已有變更，請重新讀取並確認報價。');
      if (payload.expectedMonthlyScheduleKey != null && payload.expectedMonthlyScheduleKey !== quote.monthlyScheduleKey) throw new Error('課程日期或授課教練已有變更，請重新讀取並確認排程。');
      const suppliedPaymentCode = ['現場現金', '現金已收'].includes(payload.paymentCode) ? '' : (payload.paymentCode || '');
      if (!isCoach && suppliedPaymentCode !== '' && !/^\d{5}$/.test(String(suppliedPaymentCode))) throw new Error('匯款後五碼必須為五位數字。');
      const paymentCode = isCoach ? '現場現金' : String(suppliedPaymentCode);
      accountReserveColumn_(sheetBookings, 10, '學生編號');
      if (isCoach) accountReserveColumn_(sheetBookings, 11, '專屬教練課預約組別');
      const groupId = isCoach ? Utilities.getUuid() : '';
      const totalCents = Math.round(price * 100);
      const firstRow = sheetBookings.getDataRange().getValues().length + 1;
      try {
        students.forEach((student, index) => sheetBookings.appendRow([new Date(), payload.slotId, payload.lineId, student.name + (isCoach ? ' [' + (payload.coachType || '1對1') + ' - ' + (payload.location || '') + ']' : ''), isCoach ? (Math.floor(totalCents / students.length) + (index < totalCents % students.length ? 1 : 0)) / 100 : quote.studentPrices[index].price, '審核中', paymentCode, Utilities.getUuid(), '', student.id, groupId]));
        sheetSlots.getRange(bookedSlot.index, 7).setValue(Number(bookedSlot.row[6]) - seats);
        SpreadsheetApp.flush();
      } catch (error) {
        const lastRow = sheetBookings.getDataRange().getValues().length;
        for (let row = lastRow; row >= firstRow; row--) sheetBookings.deleteRow(row);
        sheetSlots.getRange(bookedSlot.index, 7).setValue(bookedSlot.row[6]);
        throw new Error('預約未完成，請重新讀取後再試。');
      }
      result = { status: 'success', registeredCount: students.length, totalPrice: quote.totalPrice };
    }

    else if (action === "addSlot") {
      const coach = requireTeachingCoach_(ss, payload.teachingCoachId);
      const sheet = ss.getSheetByName(SHEET_SLOTS);
      normalizeMonthlySlotPrices_(payload, true);
      validateNewSlot_(payload);
      accountReserveColumn_(sheet, 13, SLOT_TEACHING_COACH_HEADER);
      const newId = Utilities.getUuid();
      sheet.appendRow([
        newId, payload.title.trim(), payload.date, payload.time, payload.location.trim(), Number(payload.capacity), Number(payload.capacity),
        money_(payload.prices[1]), money_(payload.prices[2]), money_(payload.prices[3]), money_(payload.prices[4]), money_(payload.prices[5]), coach.id
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
      cleanupEmptyCourses_(ss, Date.now());
      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const bData = sheetBookings.getDataRange().getValues();
      const bookings = [];
      const completionData = monthlyLogCompletionData_(ss, bData);
      
      for (let i = 1; i < bData.length; i++) {
        let status = bData[i][5] || "預約成功"; 
        if (status === "成功" || status === "已完成") status = "預約成功"; // 舊資料相容

        const completion = completionData.get(String(bData[i][7] || '')) || null;
        status = monthlyCompletionStatus_(status, completion);
        bookings.push({ monthlyCompletion: completion, monthlyLogCompletionVersion: 1,
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
      const groupPriceData = studentGroupPriceData_(ss);
      const members = [];
      for (let i = 1; i < uData.length; i++) {
        const lId = uData[i][0];
        accountStudents_(uData[i]).forEach(student => members.push({
          lineId: lId, studentId: student.id, name: student.name, nickname: student.nickname || '', level: uData[i][5] || 1,
          groupPrices: studentGroupPrices_(groupPriceData, lId, student.id),
          monthlyGroupPrices: studentMonthlyGroupPrices_(groupPriceData, lId, student.id),
          totalClasses: lData.slice(1).filter(row => row[1] === lId && studentMatches_(row[14], row[2], student)).length
        }));
      }
      const historical = historicalBookings_(ss);
      attachCourseSchedule_(ss, bookings);
      const month = taipeiMonth_(new Date());
      const summary = monthlyAccounting_(ss, calculateCoachPayments_(bookings.concat(historical), month, members), month);
      result = { status: "success", monthlyLogCompletionVersion: 1, studentGroupPricingVersion: 1, studentMonthlyPricingVersion: 1, groupPriceDefaults: GROUP_PRICE_DEFAULTS, monthlyGroupPriceDefaults: MONTHLY_PRICE_DEFAULTS, bookings: bookings, members: members, historicalBookingVersion: 1, historicalBookings: historical, paymentSummary: paymentSummaryJSON_(summary) };
    }

    else if (["getMonthlyLeaves", "registerMonthlyLeave", "arrangeMonthlyMakeup"].includes(action)) {
      result = monthlyLeaveAction_(ss, payload, actor);
    }

    else if (["cancelBooking", "updateSlot", "confirmCashPayment"].includes(action)) {
      result = coachManagementAction_(ss, payload, actor);
    }

    else if (action === "deleteBooking") {
      result = deleteApprovedBooking_(ss, payload.bookingId);
    }

    else if (action === "approveBooking") {
      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const booking = monthlyUniqueRow_(sheetBookings, 7, payload.bookingId, '訂單');
      if (['審核中', '預約成功', '成功', '已完成'].indexOf(booking.row[5] || '預約成功') < 0) throw new Error('只能核准審核中或已確認且尚未完課的訂單。');
      sheetBookings.getRange(booking.index, 6).setValue('預約成功');
      result = { status: "success" };
    }

    else if (action === "updatePayment") {
      const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
      const booking = monthlyUniqueRow_(sheetBookings, 7, payload.bookingId, '訂單');
      if (!actor.isAdmin && booking.row[2] !== actor.lineId) throw new Error('只能修改自己帳號的付款資料。');
      if (!actor.isAdmin && booking.row[5] !== '審核中') throw new Error('已核准的付款資料請由教練核對修改。');
      if (!/^\d{5}$/.test(String(payload.paymentCode || ''))) throw new Error('匯款後五碼必須為五位數字。');
      sheetBookings.getRange(booking.index, 7).setValue(String(payload.paymentCode));
      result = { status: "success" };
    }

    else if (action === "addLog") {
      const account = accountFor_(ss, payload.lineId);
      if (!account) throw new Error('找不到學員帳號，無法寫入日誌。');
      const students = accountStudents_(account);
      const bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);
      const booked = payload.bookingId ? monthlyUniqueRow_(bookingSheet, 7, payload.bookingId, '訂單') : null;
      const booking = booked ? booked.row : null;
      if (booking && booking[2] !== payload.lineId) throw new Error('學生與訂單不符。');
      const completionData = booking ? monthlyLogCompletionData_(ss) : null;
      const monthlyCompletion = completionData ? completionData.get(String(booking[7] || '')) || null : null;
      if (booking && (monthlyCompletion ? ['預約成功', '成功', '已完成', '已完課'] : ['預約成功', '成功', '已完成']).indexOf(booking[5] || '預約成功') < 0) throw new Error('請先核准預約；已完課訂單不能重複建立日誌。');
      const studentId = booking ? (booking[9] || '') : (payload.studentId || '');
      if (booking && payload.studentId != null && String(payload.studentId) !== String(studentId)) throw new Error('學生與訂單不符。');
      const matches = students.filter(item => item.id === studentId);
      if (matches.length !== 1) throw new Error('請選擇唯一且有效的學生。');
      const student = matches[0];
      safeSheetName_(student.name);
      validateLogPayload_(payload);
      if (monthlyCompletion) {
        const session = monthlyCompletion.sessions.find(item => item.date === payload.date);
        if (!session) throw new Error('日誌日期不在此月繳課程的上課日期內。');
        if (session.status !== '未結課') throw new Error(session.status === '已完課' ? '此學員這一天已結課，請勿重複建立日誌。' : session.status === '待補課' ? '此日期已有請假紀錄，請從補課訂單登錄日誌。' : '此日期的舊日誌無法唯一對應課程，請先核對原紀錄。');
      }
      const nextStatus = monthlyCompletion ? (monthlyCompletion.scheduleComplete && monthlyCompletion.completedDates.length + 1 === monthlyCompletion.total ? '已完課' : '預約成功') : '已完課';
      accountReserveColumn_(sheetLogs, 15, '學生編號');
      accountReserveColumn_(sheetLogs, 16, LOG_BOOKING_HEADER);
      accountReserveColumn_(sheetLogs, 17, LOG_ID_HEADER);
      const firstRow = sheetLogs.getDataRange().getValues().length + 1;
      const legacyLinks = monthlyCompletion ? completionData.legacyAssignments.filter(item => item.bookingId === payload.bookingId) : [];
      try {
        legacyLinks.forEach(item => sheetLogs.getRange(item.index, 16, 1, 2).setValues([[item.bookingId, Utilities.getUuid()]]));
        sheetLogs.appendRow([
          new Date(), payload.lineId, student.name, payload.date,
          payload.stats.clears, payload.stats.drives, payload.stats.lifts, payload.stats.drops, payload.stats.net,
          payload.stats.pushes, payload.stats.smashes, payload.stats.defense, payload.stats.combo, payload.note, studentId, payload.bookingId || '', Utilities.getUuid()
        ]);
        if (booked) bookingSheet.getRange(booked.index, 6).setValue(nextStatus);
        SpreadsheetApp.flush();
      } catch (error) {
        legacyLinks.forEach(item => sheetLogs.getRange(item.index, 16, 1, 2).setValues([item.previous]));
        for (let row = sheetLogs.getDataRange().getValues().length; row >= firstRow; row--) sheetLogs.deleteRow(row);
        if (booked) bookingSheet.getRange(booked.index, 6).setValue(booking[5]);
        SpreadsheetApp.flush();
        throw new Error('日誌未完成儲存，請重新讀取後再試。');
      }
      result = { status: "success", monthlyLogCompletionVersion: 1, isMonthlyBooking: !!monthlyCompletion, bookingStatus: booked ? nextStatus : null, completedDate: payload.date };
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
      const completionData = monthlyLogCompletionData_(ss, bData);
      let myBookings = [];
      let bookingHistory = [];

      for (let i = 1; i < bData.length; i++) {
        if (bData[i][2] === payload.lineId && (!selectedStudent || studentMatches_(bData[i][9], bData[i][3], selectedStudent))) {
          let status = bData[i][5] || "預約成功"; 
          if(status === "成功" || status === "已完成") status = "預約成功"; 
          
          const sInfo = slotMap[bData[i][1]] || { title: "未知或已下架課程", date: "", time: "" };
          const completion = completionData.get(String(bData[i][7] || '')) || null;
          status = monthlyCompletionStatus_(status, completion);
          const item = { monthlyCompletion: completion, monthlyLogCompletionVersion: 1,
            bookingId: bData[i][7] || "",
            slotId: bData[i][1],
            slotTitle: sInfo.title,
            slotDate: sInfo.date,
            slotTime: sInfo.time,
            paidPrice: bData[i][4],
            status: status,
            paymentCode: bData[i][6] || ""
          };
          bookingHistory.push(item);
          // 追蹤中預約單維持原行為；完整歷史另外保留已完課訂單。
          if (status !== '已完課') myBookings.push(item);
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
      
      bookingHistory = bookingHistory.reverse().concat(historicalBookings_(ss).filter(function(row) {
        return row.lineId === payload.lineId && selectedStudent && row.studentId === selectedStudent.id;
      }).reverse());
      result = { status: "success", monthlyLogCompletionVersion: 1, students: publicAccountStudents_(students), studentId: selectedStudent ? selectedStudent.id : "", totalClasses: totalClasses, stats: stats, logs: logs.reverse(), bookings: myBookings.reverse(), bookingHistory: bookingHistory, monthlyLeaves: ss.getSheetByName('請假補課') ? monthlyLeaveRows_(ss.getSheetByName('請假補課')).filter(function(row) { return row.lineId === payload.lineId && (!selectedStudent || studentMatches_(row.studentId, row.name, selectedStudent)); }) : [] };
    }

    if (!result.status) throw new Error("不支援的操作：" + String(action || "未提供"));
    return ContentService.createTextOutput(JSON.stringify({ ...result, securityVersion: API_SECURITY_VERSION })).setMimeType(ContentService.MimeType.JSON);
    
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", securityVersion: API_SECURITY_VERSION, message: error.message || "操作失敗"})).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (requestLock) requestLock.releaseLock();
  }
}

// ===== 所有費用與付款彙總均由伺服器計算 =====
function getVIPDiscount_(level) {
  // 保留現行團課價格建議政策；既有課程仍以試算表收費欄位為準。
  return [1, 1, 0.98, 0.95, 0.90, 0.53][Number(level)] || 1;
}

function groupTariff_(mode, startTime, endTime, count) {
  if (count == null) count = 4;
  var minutes = function(value) {
    var match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  var duration = minutes(endTime) - minutes(startTime);
  if ([60, 120].indexOf(duration) < 0 || ['single', 'monthly'].indexOf(mode) < 0) return null;
  if (mode === 'monthly') {
    var monthly = MONTHLY_GROUP_TARIFFS[duration][count];
    return monthly ? { duration: duration, count: count, regular: monthly.regular, price: monthly.price } : null;
  }
  var single = duration === 60 ? GROUP_PRICE_DEFAULTS.hour1 : GROUP_PRICE_DEFAULTS.hour2;
  return { duration: duration, regular: single, price: single };
}

function monthlySessions_(row, headers) {
  var dates = emptyCourseDates_(row[2]);
  var defaultCoach = headers[12] === SLOT_TEACHING_COACH_HEADER ? String(row[12] || '') : '';
  if (headers[13] !== SLOT_MONTHLY_SESSIONS_HEADER || !row[13]) return dates.map(function(date) { return { date: date, teachingCoachId: defaultCoach }; });
  var sessions;
  try { sessions = JSON.parse(row[13]); } catch (error) { throw new Error('月繳逐堂排程資料無法讀取。'); }
  if (!Array.isArray(sessions) || sessions.length !== dates.length || new Set(dates).size !== dates.length || sessions.some(function(item, i) { return !item || item.date !== dates[i] || typeof item.teachingCoachId !== 'string'; })) throw new Error('月繳逐堂排程與上課日期不符，請核對課程。');
  return sessions.map(function(item) { return { date: item.date, teachingCoachId: item.teachingCoachId }; });
}

function validateMonthlySessions_(ss, sessions, allowUnassigned) {
  if (!Array.isArray(sessions) || sessions.length < 1 || sessions.length > 31) throw new Error('月繳課程需有 1 至 31 堂完整排程。');
  var coaches = new Set(teachingCoaches_(ss).map(function(coach) { return coach.id; }));
  var dates = new Set();
  var normalized = sessions.map(function(item) {
    if (!item || typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || emptyCourseDateKey_(item.date.slice(0, 4), item.date.slice(5, 7), item.date.slice(8, 10)) !== item.date) throw new Error('請填寫每堂有效的完整上課日期。');
    if (dates.has(item.date)) throw new Error('月繳上課日期不可重複。');
    dates.add(item.date);
    if (typeof item.teachingCoachId !== 'string' || (!coaches.has(item.teachingCoachId) && !(allowUnassigned && item.teachingCoachId === ''))) throw new Error('請為每堂選擇有效授課教練。');
    return { date: item.date, teachingCoachId: item.teachingCoachId };
  });
  return normalized.sort(function(a, b) { return a.date.localeCompare(b.date); });
}

function monthlySlotTariff_(row) {
  var title = String(row[1] || '').trim();
  if (!/^\[月繳/.test(title)) return null;
  var match = title.match(/^\[月繳(\d+)堂\]/);
  var dates = emptyCourseDates_(row[2]), count = match ? Number(match[1]) : dates.length;
  if (dates.length > 1 && match && dates.length !== count) throw new Error('月繳堂數與上課日期不符，請聯絡教練確認。');
  if (dates.length > 1 && new Set(dates).size !== dates.length) throw new Error('月繳上課日期重複，請聯絡教練確認。');
  var time = String(row[3] || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  var duration = time ? Number(time[3]) * 60 + Number(time[4]) - Number(time[1]) * 60 - Number(time[2]) : null;
  var tariff = MONTHLY_GROUP_TARIFFS[duration] && MONTHLY_GROUP_TARIFFS[duration][count];
  if (row[13]) {
    if (!time || [60, 120].indexOf(duration) < 0 || !Number.isInteger(count) || count < 1 || count > 31 || dates.length !== count) throw new Error('月繳逐堂排程與堂數或時長不符。');
    return { count: count, duration: duration, regular: count * (duration === 60 ? 300 : 600), price: count * (duration === 60 ? MONTHLY_PRICE_DEFAULTS.hour1 : MONTHLY_PRICE_DEFAULTS.hour2), fixed: true };
  }
  if (tariff) return { count: count, duration: duration, regular: tariff.regular, price: tariff.price, fixed: true };
  // 未公告的舊方案保留第一級方案價，但不再依會員等級打折。
  var price = money_(row[7]);
  return { count: count, regular: price, price: price, fixed: false };
}

function normalizeMonthlySlotPrices_(payload, creating) {
  if (!/^\[月繳/.test(String(payload.title || '').trim())) return;
  var dates = emptyCourseDates_(payload.date);
  var row = ['', payload.title, payload.date, payload.time, '', '', '', payload.prices && payload.prices[1]];
  if (!creating && payload.monthlySessions) row[13] = JSON.stringify(payload.monthlySessions);
  var tariff = monthlySlotTariff_(row);
  if (creating && tariff.fixed && (dates.length !== tariff.count || new Set(dates).size !== dates.length)) throw new Error('月繳堂數與上課日期不符，請確認完整四堂或五堂日期。');
  payload.prices = { 1: tariff.price, 2: tariff.price, 3: tariff.price, 4: tariff.price, 5: tariff.price };
}

function slotGroupTariff_(slot) {
  var time = String(slot.time || '').match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!time || /^\[專屬教練課\]/.test(slot.title)) return null;
  var monthly = String(slot.title).match(/^\[月繳(\d+)堂\]/);
  var tariff = groupTariff_(monthly ? 'monthly' : 'single', time[1], time[2], monthly ? Number(monthly[1]) : 4);
  return tariff && (monthly || Number(slot.prices[1]) === tariff.price) ? tariff : null;
}

function money_(value) {
  if (value === '' || value == null || typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 10000000 || Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) > 0.00001) throw new Error('金額需為有效非負數，最多小數點後兩位。');
  return Number(value);
}

function safeSheetName_(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100 || /^[=+@-]/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('學員姓名資料不正確，請核對資料。');
  return value;
}

function pricingPreview_(payload) {
  var coachDefaults = { oneToOne: 1000, oneToTwo: 1400 };
  var dates = emptyCourseDates_(payload.date || '');
  // 新增表單以完整日期選擇當月星期；堂數由後端重新計算，不採信前端 count。
  var count = 4;
  if (payload.mode === 'monthly') {
    if (!dates.length) return { tariff: null, prices: {}, coachDefaults: coachDefaults, monthlyUniformPricingVersion: 1 };
    var day = new Date(dates[0] + 'T00:00:00Z'), month = day.getUTCMonth(), weekday = day.getUTCDay();
    count = 0;
    for (var i = 1; i <= 31; i++) { var date = new Date(Date.UTC(day.getUTCFullYear(), month, i)); if (date.getUTCMonth() !== month) break; if (date.getUTCDay() === weekday) count++; }
  }
  var tariff = groupTariff_(payload.mode, payload.startTime, payload.endTime, count);
  var base = payload.mode === 'monthly' ? (tariff ? tariff.price : null) : payload.basePrice != null ? money_(payload.basePrice) : tariff ? tariff.price : null;
  var prices = {};
  if (base !== null) [1, 2, 3, 4, 5].forEach(function(level) { prices[level] = payload.mode === 'monthly' || level === 1 ? base : Math.round(base * getVIPDiscount_(level)); });
  return { tariff: tariff, prices: prices, coachDefaults: coachDefaults, monthlyUniformPricingVersion: 1 };
}

function studentGroupPriceKey_(lineId, studentId) { return JSON.stringify([lineId, studentId]); }

function studentGroupPriceData_(ss) {
  var sheet = ss.getSheetByName(SHEET_STUDENT_GROUP_PRICES);
  var rows = sheet ? sheet.getDataRange().getValues() : [];
  if (sheet && (!rows.length || STUDENT_GROUP_PRICE_HEADERS.some(function(header, i) { return rows[0][i] !== header; }))) throw new Error('學員團課價格工作表欄位不符，請聯絡管理員。');
  var hasMonthlyColumns = rows.some(function(row) { return row.slice(6, 8).some(function(value) { return value != null && value !== ''; }); });
  if (hasMonthlyColumns && STUDENT_MONTHLY_PRICE_HEADERS.some(function(header, i) { return rows[0][i + 6] !== header; })) throw new Error('學員月繳價格工作表欄位不符，請聯絡管理員。');
  var index = new Map();
  rows.slice(1).forEach(function(row, i) {
    if (!row[0]) return;
    var key = studentGroupPriceKey_(String(row[0]), String(row[1] || ''));
    if (index.has(key)) throw new Error('學員團課價格有重複紀錄，請聯絡管理員。');
    index.set(key, { row: row, index: i + 2 });
  });
  return { sheet: sheet, index: index };
}

function studentMonthlyGroupPrices_(data, lineId, studentId) { return studentGroupPrices_(data, lineId, studentId, true); }

function studentGroupPrices_(data, lineId, studentId, monthly) {
  var record = data.index.get(studentGroupPriceKey_(lineId, studentId));
  var optionalPrice = function(value) { return value === '' || value == null ? null : money_(value); };
  var offset = monthly ? 6 : 2;
  return { hour1: record ? optionalPrice(record.row[offset]) : null, hour2: record ? optionalPrice(record.row[offset + 1]) : null };
}

function saveStudentGroupPrices_(ss, payload, actor) {
  if (typeof payload.lineId !== 'string' || !payload.lineId || typeof payload.studentId !== 'string') throw new Error('請選擇有效學員。');
  var accounts = ss.getSheetByName(SHEET_USERS).getDataRange().getValues().slice(1).filter(function(row) { return row[0] === payload.lineId; });
  if (accounts.length !== 1 || accountStudents_(accounts[0]).filter(function(student) { return student.id === payload.studentId; }).length !== 1) throw new Error('找不到唯一的指定學員。');
  if (!payload.groupPrices || !Object.prototype.hasOwnProperty.call(payload.groupPrices, 'hour1') || !Object.prototype.hasOwnProperty.call(payload.groupPrices, 'hour2')) throw new Error('請提供一小時及二小時團課價格，留空可清除設定。');
  var optionalPrice = function(value) { return value === '' || value === null ? '' : money_(value); };
  var one = optionalPrice(payload.groupPrices.hour1), two = optionalPrice(payload.groupPrices.hour2);
  var data = studentGroupPriceData_(ss), record = data.index.get(studentGroupPriceKey_(payload.lineId, payload.studentId));
  var hasMonthly = Object.prototype.hasOwnProperty.call(payload, 'monthlyGroupPrices');
  if (hasMonthly && (!payload.monthlyGroupPrices || !Object.prototype.hasOwnProperty.call(payload.monthlyGroupPrices, 'hour1') || !Object.prototype.hasOwnProperty.call(payload.monthlyGroupPrices, 'hour2'))) throw new Error('請提供一小時及二小時月繳每堂價格，留空可清除設定。');
  var monthlyOne = hasMonthly ? optionalPrice(payload.monthlyGroupPrices.hour1) : record && record.row[6] != null ? record.row[6] : '';
  var monthlyTwo = hasMonthly ? optionalPrice(payload.monthlyGroupPrices.hour2) : record && record.row[7] != null ? record.row[7] : '';
  if (!data.sheet && one === '' && two === '' && monthlyOne === '' && monthlyTwo === '') return { status: 'success', studentGroupPricingVersion: 1, studentMonthlyPricingVersion: 1, groupPrices: { hour1: null, hour2: null }, monthlyGroupPrices: { hour1: null, hour2: null } };
  var sheet = data.sheet;
  if (!sheet) { sheet = ss.insertSheet(SHEET_STUDENT_GROUP_PRICES); sheet.appendRow(STUDENT_GROUP_PRICE_HEADERS); }
  var extended = hasMonthly || sheet.getDataRange().getValues()[0].length > 6;
  if (extended) sheet.getRange(1, 7, 1, 2).setValues([STUDENT_MONTHLY_PRICE_HEADERS]);
  var row = [payload.lineId, payload.studentId, one, two, new Date(), actor.lineId];
  if (extended) row.push(monthlyOne, monthlyTwo);
  var firstRow = sheet.getDataRange().getValues().length + 1;
  try {
    if (record) sheet.getRange(record.index, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    SpreadsheetApp.flush();
  } catch (error) {
    if (record) sheet.getRange(record.index, 1, 1, row.length).setValues([row.map(function(value, i) { return record.row[i] == null ? '' : record.row[i]; })]);
    else for (var i = sheet.getDataRange().getValues().length; i >= firstRow; i--) sheet.deleteRow(i);
    SpreadsheetApp.flush();
    throw new Error('學員團課價格儲存失敗，請重新讀取後再試。');
  }
  return { status: 'success', studentGroupPricingVersion: 1, studentMonthlyPricingVersion: 1, groupPrices: { hour1: one === '' ? null : one, hour2: two === '' ? null : two }, monthlyGroupPrices: { hour1: monthlyOne === '' ? null : monthlyOne, hour2: monthlyTwo === '' ? null : monthlyTwo } };
}

function privateLocations_(row) {
  if (!/^\[專屬教練課\]/.test(String(row[1] || ''))) return [];
  var location = String(row[4] || '');
  return Array.from(new Set((location.indexOf('coach_loc:') === 0 ? location.slice(10).split(',') : [location]).map(function(value) { return value.trim(); }).filter(Boolean)));
}

function bookingQuote_(ss, payload, actor, forDisplay, suppliedSlot, suppliedAccount, suppliedGroupPrices, suppliedSlotHeaders) {
  var account = suppliedAccount || accountFor_(ss, payload.lineId);
  if (!account) throw new Error('找不到帳號學生資料，請重新登入。');
  var row = suppliedSlot || monthlyUniqueRow_(ss.getSheetByName(SHEET_SLOTS), 0, payload.slotId, '課程').row;
  var students = accountStudents_(account);
  students.forEach(function(student) { safeSheetName_(student.name); });
  var kind = payload.action === 'coachRegisterMonthly' ? 'monthly' : payload.action === 'coachRegisterSingle' ? 'single' : payload.kind;
  if (kind != null) {
    if (!actor.isAdmin || ['monthly', 'single'].indexOf(kind) < 0) throw new Error('僅教練可替指定學生報價或代登記。');
    if (!Array.isArray(payload.studentIds) || !payload.studentIds.length || new Set(payload.studentIds).size !== payload.studentIds.length || payload.studentIds.some(function(id) { return !students.some(function(student) { return student.id === id; }); })) throw new Error('請選擇有效且不重複的學生。');
    students = students.filter(function(student) { return payload.studentIds.indexOf(student.id) >= 0; });
    if (kind === 'monthly' && !/^\[月繳/.test(String(row[1]).trim())) throw new Error('教練代登記僅限月繳團課。');
    if (kind === 'single' && /^\[(月繳|專屬教練課)/.test(String(row[1]).trim())) throw new Error('單堂代登記僅限單堂團課。');
  } else if (payload.studentIds != null) throw new Error('一般預約依帳號全部學員登記。');
  var level = Math.min(5, Math.max(1, Number(account[5]) || 1));
  if (!Number.isInteger(level)) throw new Error('會員等級資料異常。');
  var isCoach = /^\[專屬教練課\]/.test(String(row[1]));
  var seats = isCoach ? 1 : students.length, unitPrice, regular, plans = null, studentPrices = [], monthlyScheduleKey = null;
  var eligible = Number.isInteger(Number(row[5])) && Number.isInteger(Number(row[6])) && Number(row[5]) >= Number(row[6]) && Number(row[6]) >= seats && (!isCoach || students.length <= 2);
  if (isCoach) {
    var match = String(row[1]).match(/1v1:(\d+)\|1v2:(\d+)/);
    if (!match) throw new Error('專屬教練課價格設定不正確。');
    // 沿用後端原本實際收費的私人課折扣，避免移轉時變動既有收費。
    var discount = [1, 1, 0.98, 0.95, 0.90, 0.88][level];
    plans = { '1對1': Math.round(money_(match[1]) * discount), '1對2': Math.round(money_(match[2]) * discount) };
    var type = payload.coachType || (!account[6] ? '1對1' : null);
    if (!forDisplay && !Object.prototype.hasOwnProperty.call(plans, type)) throw new Error('請選擇教練課類型。');
    unitPrice = plans[type] == null ? plans['1對1'] : plans[type];
    regular = Number(match[type === '1對2' ? 2 : 1]);
    var locations = privateLocations_(row);
    if (!forDisplay && locations.indexOf(String(payload.location || '')) < 0) throw new Error('請選擇此課程允許的上課場地。');
  } else {
    var time = String(row[3] || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    var duration = time ? Number(time[3]) * 60 + Number(time[4]) - Number(time[1]) * 60 - Number(time[2]) : null;
    var personalRate = !/^\[月繳/.test(String(row[1]).trim()) && [60, 120].indexOf(duration) >= 0;
    var monthly = null;
    if (/^\[月繳/.test(String(row[1]).trim())) {
      var slotHeaders = suppliedSlotHeaders || ss.getSheetByName(SHEET_SLOTS).getDataRange().getValues()[0];
      monthlyScheduleKey = JSON.stringify({ sessions: monthlySessions_(row, slotHeaders), time: String(row[3]), location: String(row[4]) });
      monthly = monthlySlotTariff_(slotHeaders[13] === SLOT_MONTHLY_SESSIONS_HEADER ? row : row.slice(0, 13));
    }
    if (monthly) {
      regular = monthly.regular;
      unitPrice = monthly.price;
    } else if (personalRate) {
      regular = duration === 60 ? GROUP_PRICE_DEFAULTS.hour1 : GROUP_PRICE_DEFAULTS.hour2;
      unitPrice = regular;
    } else {
      unitPrice = money_(row[6 + level]);
      regular = money_(row[7]);
      var offer = slotGroupTariff_({ title: row[1], time: row[3], prices: { 1: row[7] } });
      if (offer) regular = offer.regular;
    }
    var monthlyRate = monthly && [60, 120].indexOf(duration) >= 0 && Number.isInteger(monthly.count) && monthly.count > 0;
    var groupPrices = personalRate || monthlyRate ? (suppliedGroupPrices || studentGroupPriceData_(ss)) : null;
    var fallback = personalRate ? regular : unitPrice;
    studentPrices = students.map(function(student, i) {
      var custom = groupPrices ? studentGroupPrices_(groupPrices, payload.lineId, student.id, monthlyRate)[duration === 60 ? 'hour1' : 'hour2'] : null;
      if (custom !== null && monthlyRate) custom = money_(Math.round(custom * 100) * monthly.count / 100);
      return { studentId: student.id, label: student.nickname && String(student.nickname).trim() || '學員 ' + (i + 1), regularPrice: regular, price: custom === null ? fallback : custom, isCustom: custom !== null };
    });
    unitPrice = studentPrices.every(function(item) { return item.price === studentPrices[0].price; }) ? studentPrices[0].price : null;
  }
  if (!forDisplay && !eligible) throw new Error(isCoach && students.length > 2 ? '專屬教練課限同帳號 1～2 位學生預約。' : '剩餘名額不足或課程名額資料異常。');
  var total = isCoach ? unitPrice : studentPrices.reduce(function(sum, item) { return sum + Math.round(item.price * 100); }, 0) / 100;
  return { monthlyScheduleKey: monthlyScheduleKey, students: students.map(function(student) { return { id: student.id, name: student.name }; }), isCoach: isCoach, unitPrice: unitPrice, studentPrices: studentPrices, totalPrice: total, regularTotalPrice: isCoach ? regular : Math.round(regular * 100) * students.length / 100, participantCount: students.length, seatsRequired: seats, eligible: eligible, coachPlans: plans };
}

function validateNewSlot_(payload) {
  if (typeof payload.title !== 'string' || !payload.title.trim() || /^[=+@-]/.test(payload.title) || typeof payload.location !== 'string' || !payload.location.trim() || /^[=+@-]/.test(payload.location)) throw new Error('請填寫有效課程名稱及場地。');
  var dates = emptyCourseDates_(payload.date);
  if (!dates.length) throw new Error('請填寫有效的完整上課日期。');
  var times = String(payload.time || '').match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!times || monthlyStart_(dates[0], times[2]).getTime() <= monthlyStart_(dates[0], times[1]).getTime()) throw new Error('上課時間格式不正確。');
  if (!Number.isInteger(Number(payload.capacity)) || Number(payload.capacity) < 1) throw new Error('總名額至少為 1。');
  if (/^\[專屬教練課\]/.test(payload.title) && (Number(payload.capacity) !== 1 || monthlyStart_(dates[0], times[2]).getTime() - monthlyStart_(dates[0], times[1]).getTime() !== 3600000)) throw new Error('專屬教練時段限一小時、一個名額。');
  [1, 2, 3, 4, 5].forEach(function(level) { money_(payload.prices && payload.prices[level]); });
}

// Monthly orders are bundles: completion belongs to a student, booking and session date.
function monthlyLogCompletionData_(ss, suppliedBookings) {
  var read = function(name) { var sheet = ss.getSheetByName(name); return sheet ? sheet.getDataRange().getValues() : []; };
  var bookings = suppliedBookings || read(SHEET_BOOKINGS), slots = read(SHEET_SLOTS), logs = read(SHEET_LOGS);
  var bySlot = new Map(), byBooking = new Map(), byDay = new Map(), completed = new Map(), ambiguous = new Map(), progress = new Map(), legacyAssignments = [];
  slots.slice(1).forEach(function(row) { if (row[0]) { var key = String(row[0]); bySlot.set(key, bySlot.has(key) ? null : row); } });
  bookings.slice(1).forEach(function(row) { if (row[7]) { var key = String(row[7]); byBooking.set(key, byBooking.has(key) ? null : row); } });
  var belongs = function(log, booking) {
    return String(log[1]) === String(booking[2]) && studentMatches_(String(log[14] || ''), log[2], { id: String(booking[9] || ''), name: String(booking[3] || '').split(' [')[0] });
  };
  bookings.slice(1).forEach(function(row) {
    var slot = bySlot.get(String(row[1]));
    if (!slot) return;
    var dates = emptyCourseDates_(slot[2]), id = String(row[7] || '');
    if (id && byBooking.get(id) === row && /^\[月繳/.test(String(slot[1]).trim())) {
      var count = String(slot[1]).match(/^\s*\[月繳(\d+)堂\]/);
      progress.set(id, { dates: Array.from(new Set(dates)), total: count ? Number(count[1]) : dates.length, completedDates: [], ambiguousDates: [], leaveDates: new Set() });
    }
    if (['預約成功', '成功', '已完成', '已完課'].indexOf(row[5] || '預約成功') < 0) return;
    dates.forEach(function(date) {
      var key = JSON.stringify([String(row[2]), date]);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(row);
    });
  });
  var mark = function(map, id, date) { if (!map.has(id)) map.set(id, new Set()); map.get(id).add(date); };
  logs.slice(1).forEach(function(log, logIndex) {
    var dates = emptyCourseDates_(log[3]);
    if (dates.length !== 1) return;
    var date = dates[0], linked = logs[0] && logs[0][15] === LOG_BOOKING_HEADER ? String(log[15] || '') : '';
    if (linked) {
      var target = byBooking.get(linked), slot = target && bySlot.get(String(target[1]));
      if (target && slot && belongs(log, target) && emptyCourseDates_(slot[2]).indexOf(date) >= 0) mark(completed, linked, date);
      return;
    }
    // New manually-added logs deliberately have no booking; only old unlinked rows may be inferred.
    if (logs[0] && logs[0][16] === LOG_ID_HEADER && log[16]) return;
    var matches = (byDay.get(JSON.stringify([String(log[1]), date])) || []).filter(function(row) { return belongs(log, row); });
    if (matches.length === 1 && matches[0][7] && matches[0][5] === '已完課') {
      mark(completed, String(matches[0][7]), date);
      legacyAssignments.push({ index: logIndex + 2, bookingId: String(matches[0][7]), previous: [log[15] == null ? '' : log[15], log[16] == null ? '' : log[16]] });
    }
    else if (matches.length > 1) matches.forEach(function(row) { if (row[7]) mark(ambiguous, String(row[7]), date); });
  });
  read('請假補課').slice(1).forEach(function(leave) {
    var id = String(leave[2] || ''), info = progress.get(id), day = emptyCourseDates_(leave[6]);
    if (!info || day.length !== 1 || info.dates.indexOf(day[0]) < 0) return;
    info.leaveDates.add(day[0]);
    var makeup = byBooking.get(String(leave[12] || '')), original = byBooking.get(id);
    if (makeup && original && makeup[2] === original[2] && String(makeup[9] || '') === String(original[9] || '') && makeup[5] === '已完課') mark(completed, id, day[0]);
  });
  progress.forEach(function(info, id) {
    info.completedDates = info.dates.filter(function(date) { return completed.has(id) && completed.get(id).has(date); });
    info.ambiguousDates = info.dates.filter(function(date) { return info.completedDates.indexOf(date) < 0 && ambiguous.has(id) && ambiguous.get(id).has(date); });
    info.scheduleComplete = info.total > 0 && info.dates.length === info.total && new Set(info.dates).size === info.total;
    info.allCompleted = info.scheduleComplete && info.completedDates.length === info.total;
    info.remainingDates = info.dates.filter(function(date) { return info.completedDates.indexOf(date) < 0; });
    info.sessions = info.dates.map(function(date) { return { date: date, status: info.completedDates.indexOf(date) >= 0 ? '已完課' : info.ambiguousDates.indexOf(date) >= 0 ? '待核對舊日誌' : info.leaveDates.has(date) ? '待補課' : '未結課' }; });
    info.availableDates = info.sessions.filter(function(item) { return item.status === '未結課'; }).map(function(item) { return item.date; });
    delete info.leaveDates;
  });
  progress.legacyAssignments = legacyAssignments;
  return progress;
}

function monthlyCompletionStatus_(status, completion) {
  status = status || '預約成功';
  if (status === '成功' || status === '已完成') status = '預約成功';
  if (completion && ['預約成功', '已完課'].indexOf(status) >= 0) return completion.allCompleted ? '已完課' : '預約成功';
  return status;
}

function monthlyCompletionForBooking_(ss, row) { return monthlyLogCompletionData_(ss).get(String(row[7] || '')) || null; }

function validateLogPayload_(payload) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) throw new Error('請選擇有效日誌日期。');
  monthlyStart_(payload.date, '00:00');
  var keys = ['clears', 'drives', 'lifts', 'drops', 'net', 'pushes', 'smashes', 'defense', 'combo'];
  if (!payload.stats || typeof payload.stats !== 'object') throw new Error('請填寫有效訓練時數。');
  var stats = {};
  keys.forEach(function(key) { var value = payload.stats[key] == null ? 0 : payload.stats[key]; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2 || Math.abs(value * 12 - Math.round(value * 12)) > 0.00001) throw new Error('訓練時數需為 5 分鐘倍數，每項最多 2 小時。'); stats[key] = value; });
  payload.stats = stats;
  if (typeof payload.note !== 'string' || payload.note.length > 8000 || /^=/.test(payload.note)) throw new Error('請填寫有效日誌內容。');
}

function paymentSummaryJSON_(summary) {
  return { ...summary, studentTotals: Array.from(summary.studentTotals.entries()) };
}

function paymentSummary_(ss, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) throw new Error('請選擇有效的統計月份。');
  var data = coachPaymentData_(ss);
  return paymentSummaryJSON_(monthlyAccounting_(ss, calculateCoachPayments_(data.bookings.concat(historicalBookings_(ss)), month, data.members), month));
}

function attachCourseSchedule_(ss, bookings) {
  var sheet = ss.getSheetByName(SHEET_SLOTS), slots = new Map();
  if (sheet) sheet.getDataRange().getValues().slice(1).forEach(function(row) {
    if (!row[0]) return;
    var id = String(row[0]);
    slots.set(id, slots.has(id) ? null : row);
  });
  bookings.forEach(function(booking) {
    var slot = slots.get(String(booking.slotId));
    booking.slotTitle = slot ? String(slot[1] || '') : '未知或已下架課程';
    booking.courseDates = slot ? emptyCourseDates_(slot[2]) : [];
  });
}

function coachPaymentData_(ss) {
  var bookings = ss.getSheetByName(SHEET_BOOKINGS).getDataRange().getValues().slice(1).map(function(row) { return { timestamp: row[0], slotId: row[1], lineId: row[2], name: row[3], paidPrice: row[4], status: row[5] || '預約成功', paymentCode: row[6], bookingId: row[7], studentId: row[9] || '' }; });
  attachCourseSchedule_(ss, bookings);
  var members = [];
  ss.getSheetByName(SHEET_USERS).getDataRange().getValues().slice(1).forEach(function(row) { accountStudents_(row).forEach(function(student) { members.push({ lineId: row[0], studentId: student.id }); }); });
  return { bookings: bookings, members: members };
}

function studentPaymentKey_(lineId, studentId) { return JSON.stringify([String(lineId), String(studentId ?? '')]); }
function taipeiMonth_(value) {
    let text = value;
    if (typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00+08:00';
    if (!(text instanceof Date) && (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text))) return null;
    const date = text instanceof Date ? text : new Date(text);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).formatToParts(date);
    return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
};
function calculateCoachPayments_(bookings, month, roster) {
    const students = new Map();
    const rosterByAccount = Array.isArray(roster) ? new Map() : null;
    if (rosterByAccount) roster.forEach(member => {
        if (!member.lineId) return;
        const accountId = String(member.lineId);
        if (!rosterByAccount.has(accountId)) rosterByAccount.set(accountId, []);
        rosterByAccount.get(accountId).push(member);
    });
    let monthlyCents = 0, invalidAmounts = 0, missingDates = 0, duplicateOrders = 0, unmatchedStudents = 0;
    const tuitionDetails = [];
    const seen = new Set();
    for (const booking of bookings) {
        if (!['預約成功', '已完課', '成功', '已完成'].includes(booking.status) || booking.paymentCode === '現場現金' || (booking.isHistorical && booking.paymentStatus !== 'paid')) continue;
        if (booking.bookingId && seen.has(booking.bookingId)) { duplicateOrders++; continue; }
        if (booking.bookingId) seen.add(booking.bookingId);
        const amount = Number(booking.paidPrice);
        if (booking.paidPrice === '' || booking.paidPrice == null || !Number.isFinite(amount) || amount < 0) { invalidAmounts++; continue; }
        const cents = Math.round(amount * 100);
        let studentKey = null;
        if (booking.lineId) {
            const studentId = String(booking.studentId ?? '');
            if (rosterByAccount) {
                const accountMembers = rosterByAccount.get(String(booking.lineId)) || [];
                const matching = accountMembers.filter(member => String(member.studentId ?? '') === studentId);
                if (matching.length === 1) studentKey = studentPaymentKey_(booking.lineId, matching[0].studentId);
                // Missing IDs are safe only for an explicit legacy student or a single-student account.
                else if (!studentId && accountMembers.length === 1) studentKey = studentPaymentKey_(booking.lineId, accountMembers[0].studentId);
            } else studentKey = studentPaymentKey_(booking.lineId, studentId);
        }
        if (studentKey !== null) students.set(studentKey, (students.get(studentKey) || 0) + cents);
        else if (cents) unmatchedStudents++;
        const dates = coursePaymentDates_(booking);
        if (!dates.length && cents) missingDates++;
        const selectedDates = [];
        let share = 0;
        dates.forEach((date, index) => {
            if (date.slice(0, 7) !== month) return;
            // Distribute indivisible cents in chronological order; all months sum to the original order.
            share += Math.floor(cents / dates.length) + (index < cents % dates.length ? 1 : 0);
            selectedDates.push(date);
        });
        monthlyCents += share;
        if (selectedDates.length) tuitionDetails.push({ bookingId: booking.bookingId || '', lineId: booking.lineId || '', studentId: booking.studentId || '', name: booking.name || '', title: booking.slotTitle || '', dates: selectedDates, sessionCount: selectedDates.length, totalSessions: dates.length, amount: share / 100, isHistorical: !!booking.isHistorical });
    }
    return { studentTotals: new Map([...students].map(([id, cents]) => [id, cents / 100])), monthlyTotal: monthlyCents / 100, tuitionDetails: tuitionDetails, invalidAmounts, missingDates, duplicateOrders, unmatchedStudents };
};

function coursePaymentDates_(booking) {
  var dates = booking.courseDates != null ? booking.courseDates : emptyCourseDates_(booking.slotDate);
  if (!Array.isArray(dates) || !dates.length || new Set(dates).size !== dates.length || dates.some(function(date) { return typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || emptyCourseDateKey_(date.slice(0, 4), date.slice(5, 7), date.slice(8, 10)) !== date; })) return [];
  return dates.slice().sort();
}

function venueExpenseRows_(ss) {
  var sheet = ss.getSheetByName(SHEET_VENUE_EXPENSES), rows = sheet ? sheet.getDataRange().getValues() : [];
  if (sheet && (!rows.length || VENUE_EXPENSE_HEADERS.some(function(title, i) { return rows[0][i] !== title; }))) throw new Error('場地費紀錄欄位不符，請聯絡管理員。');
  var seen = new Set(), requests = new Set();
  rows.slice(1).forEach(function(row) {
    if (!row[0]) return;
    if (seen.has(String(row[0]))) throw new Error('場地費編號重複，請聯絡管理員。');
    seen.add(String(row[0]));
    if (!row[10] || requests.has(String(row[10]))) throw new Error('場地費請求編號重複或缺漏，請聯絡管理員。');
    requests.add(String(row[10]));
    if (['有效', '已作廢'].indexOf(row[9]) < 0 || !row[11]) throw new Error('場地費狀態或版本異常，請聯絡管理員。');
  });
  return { sheet: sheet, rows: rows };
}

function venueExpenseJSON_(row) {
  var date = monthlyDate_(row[1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('場地費日期異常，請聯絡管理員。');
  monthlyStart_(date, '00:00');
  return { id: String(row[0]), date: date, location: String(row[2] || ''), amount: money_(row[3]), note: String(row[4] || ''), status: row[9], revision: String(row[11]) };
}

function monthlyAccounting_(ss, summary, month) {
  var expenses = venueExpenseRows_(ss).rows.slice(1).filter(function(row) { return row[0] && row[9] === '有效'; }).map(venueExpenseJSON_).filter(function(item) { return item.date.slice(0, 7) === month; });
  var costs = expenses.reduce(function(sum, expense) { return sum + Math.round(expense.amount * 100); }, 0);
  var tuition = Math.round(summary.monthlyTotal * 100);
  return { ...summary, month: month, monthlyAccountingVersion: 1, monthlyTuitionTotal: tuition / 100, monthlyVenueCostTotal: costs / 100, monthlyTotal: (tuition - costs) / 100, venueExpenses: expenses.sort(function(a, b) { return b.date.localeCompare(a.date) || a.id.localeCompare(b.id); }) };
}

function saveVenueExpense_(ss, payload, actor) {
  var data = venueExpenseRows_(ss), rows = data.rows, sheet = data.sheet;
  var adding = payload.action === 'addVenueExpense', cancelling = payload.action === 'cancelVenueExpense';
  var existing = null, rowIndex = -1;
  if (!adding) {
    if (typeof payload.expenseId !== 'string' || !payload.expenseId) throw new Error('請選擇場地費紀錄。');
    rowIndex = rows.findIndex(function(row, i) { return i > 0 && String(row[0]) === payload.expenseId; });
    if (rowIndex < 1) throw new Error('找不到場地費紀錄。');
    existing = rows[rowIndex];
    if (payload.expectedRevision !== String(existing[11])) throw new Error('場地費已被更新，請重新讀取後再修改。');
    if (existing[9] !== '有效') throw new Error('此場地費已作廢，不能再修改。');
  }
  var date, location, amount, note;
  if (!cancelling) {
    date = payload.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('請填寫有效的場地使用日期。');
    monthlyStart_(date, '00:00');
    var text = function(value, required, max) {
      if (typeof value !== 'string') throw new Error('請填寫有效的場地及備註。');
      var result = value.trim();
      if ((required && !result) || result.length > max || /^[=+@-]/.test(result) || /[\u0000-\u001f\u007f]/.test(result)) throw new Error('請填寫有效的場地及備註。');
      return result;
    };
    location = text(payload.location, true, 120); note = text(payload.note == null ? '' : payload.note, false, 1000); amount = money_(payload.amount);
  }
  if (adding) {
    if (typeof payload.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(payload.requestId)) throw new Error('請重新開啟場地費表單後再送出。');
    var matches = rows.slice(1).filter(function(row) { return row[10] === payload.requestId; });
    if (matches.length > 1) throw new Error('場地費請求編號重複，請聯絡管理員。');
    if (matches.length) {
      var previous = venueExpenseJSON_(matches[0]);
      if (previous.date !== date || previous.location !== location || previous.amount !== amount || previous.note !== note) throw new Error('場地費請求內容已變更，請重新開啟表單。');
      return { status: 'success', monthlyAccountingVersion: 1, expense: previous };
    }
    if (!sheet) { sheet = ss.insertSheet(SHEET_VENUE_EXPENSES); sheet.appendRow(VENUE_EXPENSE_HEADERS); }
  }
  var row = adding ? [Utilities.getUuid(), date, location, amount, note, new Date(), actor.lineId, new Date(), actor.lineId, '有效', payload.requestId, Utilities.getUuid()] : existing.slice(0, 12);
  if (!adding) {
    if (cancelling) row[9] = '已作廢';
    else { row[1] = date; row[2] = location; row[3] = amount; row[4] = note; }
    row[7] = new Date(); row[8] = actor.lineId; row[11] = Utilities.getUuid();
  }
  var firstRow = sheet.getDataRange().getValues().length + 1;
  try {
    if (adding) sheet.appendRow(row);
    else sheet.getRange(rowIndex + 1, 1, 1, 12).setValues([row]);
    SpreadsheetApp.flush();
  } catch (error) {
    if (adding) for (var i = sheet.getDataRange().getValues().length; i >= firstRow; i--) sheet.deleteRow(i);
    else sheet.getRange(rowIndex + 1, 1, 1, 12).setValues([existing.slice(0, 12)]);
    SpreadsheetApp.flush();
    throw new Error('場地費儲存失敗，請重新讀取後再試。');
  }
  return { status: 'success', monthlyAccountingVersion: 1, expense: venueExpenseJSON_(row) };
}


// ===== 教練補登歷史預約：獨立紀錄，不建立可預約時段、不改名額或訓練日誌 =====
function historicalBookingRows_(sheet) {
  var rows = sheet.getDataRange().getValues();
  if (!rows.length || HISTORICAL_BOOKING_HEADERS.some(function(title, i) { return rows[0][i] !== title; })) {
    throw new Error('歷史預約紀錄工作表欄位不符，請保留原資料並核對欄位。');
  }
  return rows;
}

function historicalBookings_(ss) {
  var sheet = ss.getSheetByName(SHEET_HISTORICAL_BOOKINGS);
  if (!sheet) return [];
  return historicalBookingRows_(sheet).slice(1).filter(function(row) { return row[0]; }).map(function(row) {
    return { bookingId: String(row[0]), recordedAt: row[1], lineId: String(row[2]), studentId: String(row[3] || ''), name: row[4],
      slotTitle: row[5], slotDate: monthlyDate_(row[6]), slotTime: row[7] + ' - ' + row[8], location: row[9], teachingCoachName: row[10],
      paidPrice: row[11], paymentStatus: row[12], timestamp: monthlyDate_(row[13]), status: row[14], isHistorical: true };
  });
}

function addHistoricalBooking_(ss, payload) {
  if (typeof payload.lineId !== 'string' || typeof payload.studentId !== 'string') throw new Error('請指定要補登的學員。');
  var users = ss.getSheetByName(SHEET_USERS);
  if (!users) throw new Error('找不到學員資料工作表。');
  var accounts = users.getDataRange().getValues().slice(1).filter(function(row) { return row[0] === payload.lineId; });
  if (accounts.length !== 1) throw new Error('找不到唯一的學員帳號。');
  var students = accountStudents_(accounts[0]).filter(function(item) { return item.id === payload.studentId; });
  if (students.length !== 1) throw new Error('找不到唯一的指定學員，請核對帳號及學員編號。');
  var student = students[0];
  safeSheetName_(student.name);
  var text = function(value, label, max, required) {
    if (typeof value !== 'string') throw new Error('請填寫' + label + '。');
    var result = value.trim();
    if ((required && !result) || result.length > max || /^[=+@-]/.test(result) || /[\u0000-\u001f\u007f]/.test(result)) throw new Error(label + '格式不正確。');
    return result;
  };
  var title = text(payload.title, '課程名稱', 100, true), location = text(payload.location, '上課地點', 120, true);
  var coachName = text(payload.teachingCoachName || '', '授課教練', 60, false);
  var date = String(payload.date || ''), bookingDate = String(payload.bookingDate || date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 1900 || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || Number(bookingDate.slice(0, 4)) < 1900) throw new Error('請填寫完整且有效的歷史日期。');
  var start = monthlyStart_(date, payload.startTime), end = monthlyStart_(date, payload.endTime);
  monthlyStart_(bookingDate, '00:00');
  if (!/^\d{2}:\d{2}$/.test(String(payload.startTime)) || !/^\d{2}:\d{2}$/.test(String(payload.endTime)) || end.getTime() <= start.getTime()) throw new Error('結束時間必須晚於開始時間。');
  if (end.getTime() > Date.now() || bookingDate > date) throw new Error('只能補登已結束的課程，原預約日期不可晚於上課日期。');
  var amount = String(payload.amount == null ? '' : payload.amount);
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) > 10000000) throw new Error('課程金額需為非負數，最多小數點後兩位。');
  if (['paid', 'unpaid'].indexOf(payload.paymentStatus) < 0) throw new Error('請選擇已收款或尚未收款。');
  if (['預約成功', '已完課', '已取消'].indexOf(payload.status) < 0) throw new Error('請選擇有效的歷史課程狀態。');
  if (typeof payload.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(payload.requestId)) throw new Error('補登識別碼無效，請重新開啟補登視窗。');
  var sheet = ss.getSheetByName(SHEET_HISTORICAL_BOOKINGS);
  var rows = sheet ? historicalBookingRows_(sheet) : [HISTORICAL_BOOKING_HEADERS];
  var values = [payload.lineId, student.id, student.name, title, date, payload.startTime, payload.endTime, location, coachName, Number(amount), payload.paymentStatus, bookingDate, payload.status, payload.requestId];
  var repeated = rows.slice(1).find(function(row) { return row[15] === payload.requestId; });
  if (repeated) {
    var previous = repeated.slice(2, 16);
    previous[4] = monthlyDate_(previous[4]); previous[11] = monthlyDate_(previous[11]);
    if (JSON.stringify(previous) !== JSON.stringify(values)) throw new Error('此補登識別碼已用於其他資料，請重新開啟視窗。');
    return { status: 'success', bookingId: repeated[0], created: false };
  }
  var duplicate = rows.slice(1).some(function(row) {
    return row[2] === payload.lineId && String(row[3] || '') === student.id && row[5] === title && monthlyDate_(row[6]) === date && row[7] === payload.startTime && row[8] === payload.endTime && row[14] !== '已取消';
  });
  var slots = ss.getSheetByName(SHEET_SLOTS);
  var matchingSlotIds = new Set((slots ? slots.getDataRange().getValues().slice(1) : []).filter(function(row) {
    return String(row[1]).trim() === title && emptyCourseDates_(row[2]).indexOf(date) >= 0 && String(row[3]).replace(/\s/g, '') === payload.startTime + '-' + payload.endTime;
  }).map(function(row) { return String(row[0]); }));
  var bookings = ss.getSheetByName(SHEET_BOOKINGS);
  if (bookings && bookings.getDataRange().getValues().slice(1).some(function(row) {
    return row[2] === payload.lineId && matchingSlotIds.has(String(row[1])) && row[5] !== '已取消' && studentMatches_(row[9], row[3], student);
  })) duplicate = true;
  if (duplicate) throw new Error('此學員已有相同日期、時間與課程的預約紀錄，請勿重複補登。');
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_HISTORICAL_BOOKINGS);
    sheet.appendRow(HISTORICAL_BOOKING_HEADERS);
  }
  var id = Utilities.getUuid();
  sheet.appendRow([id, new Date()].concat(values));
  SpreadsheetApp.flush();
  return { status: 'success', bookingId: id, created: true };
}

// ===== 授課教練名單：僅管理顯示姓名，不變更 ADMIN_LINE_IDS 登入權限 =====
function teachingCoachRows_(sheet) {
  var rows = sheet.getDataRange().getValues();
  if (!rows.length || rows[0][0] !== '教練編號' || rows[0][1] !== '教練姓名') {
    throw new Error('授課教練工作表欄位不符，請保留原資料並核對欄位。');
  }
  var ids = new Set();
  rows.slice(1).forEach(function(row) {
    if (!row[0] && !row[1]) return;
    if (typeof row[0] !== 'string' || !row[0] || typeof row[1] !== 'string' || !row[1].trim() || ids.has(row[0])) {
      throw new Error('授課教練資料缺漏或編號重複，請先核對名單。');
    }
    ids.add(row[0]);
  });
  return rows;
}

function teachingCoaches_(ss) {
  var sheet = ss.getSheetByName(SHEET_TEACHING_COACHES);
  if (!sheet) return [];
  return teachingCoachRows_(sheet).slice(1).filter(function(row) { return row[0]; }).map(function(row) {
    return { id: row[0], name: row[1].trim() };
  });
}

function requireTeachingCoach_(ss, id) {
  if (typeof id !== 'string' || !id) throw new Error('請選擇授課教練。');
  var coach = teachingCoaches_(ss).find(function(item) { return item.id === id; });
  if (!coach) throw new Error('所選授課教練不存在，請重新讀取教練名單。');
  return coach;
}

function saveTeachingCoach_(ss, payload) {
  if (typeof payload.name !== 'string') throw new Error('請填寫教練姓名。');
  var name = payload.name.trim();
  if (!name || name.length > 60 || /^[=+@-]/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('教練姓名請填寫 1～60 個字，且不可使用公式或控制字元。');
  }
  var sheet = ss.getSheetByName(SHEET_TEACHING_COACHES);
  var rows = sheet ? teachingCoachRows_(sheet) : [['教練編號', '教練姓名']];
  var editing = payload.action === 'updateTeachingCoach';
  var index = editing ? rows.findIndex(function(row, i) { return i > 0 && row[0] === payload.teachingCoachId; }) : -1;
  if (editing && index < 1) throw new Error('找不到要修改的授課教練，請重新讀取名單。');
  if (rows.some(function(row, i) { return i > 0 && i !== index && String(row[1] || '').trim().toLowerCase() === name.toLowerCase(); })) {
    throw new Error('已有相同姓名的授課教練，請確認名單。');
  }
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TEACHING_COACHES);
    sheet.appendRow(rows[0]);
  }
  var id = editing ? rows[index][0] : Utilities.getUuid();
  if (editing) sheet.getRange(index + 1, 2).setValue(name);
  else sheet.appendRow([id, name]);
  SpreadsheetApp.flush();
  return { status: 'success', coach: { id: id, name: name } };
}

// ===== 無人預約課程：台灣開課時間前六小時起自動下架 =====
// 在原本綁定試算表的專案手動執行一次，授權並建立每五分鐘的排程。
function installEmptyCourseCleanup() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('系統忙碌中，請稍後再試。');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss || !ss.getSheetByName(SHEET_SLOTS) || !ss.getSheetByName(SHEET_BOOKINGS)) {
      throw new Error('請在原本綁定課程試算表的 Apps Script 專案執行。');
    }
    PropertiesService.getScriptProperties().setProperty('EMPTY_COURSE_SPREADSHEET_ID', ss.getId());
    var triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
      return trigger.getHandlerFunction() === 'cleanupEmptyCourses';
    });
    if (!triggers.length) ScriptApp.newTrigger('cleanupEmptyCourses').timeBased().everyMinutes(5).create();
    // 重複安裝不增加排程，也不影響其他功能的觸發條件。
    triggers.slice(1).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
    return { status: 'success', intervalMinutes: 5 };
  } finally {
    lock.releaseLock();
  }
}

function cleanupEmptyCourses() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('系統忙碌中，請稍後再試。');
  try {
    var id = PropertiesService.getScriptProperties().getProperty('EMPTY_COURSE_SPREADSHEET_ID');
    if (!id) throw new Error('請先手動執行 installEmptyCourseCleanup 安裝課程清理排程。');
    var result = cleanupEmptyCourses_(SpreadsheetApp.openById(id), Date.now());
    if (result.deletedSlotIds.length) console.info('自動刪除無人預約課程：' + JSON.stringify(result.deletedSlotIds));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function emptyCourseDateKey_(year, month, day) {
  var date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
  return String(year) + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
}

function emptyCourseDates_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (!isFinite(value.getTime())) return [];
    value = Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  var text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    if (!emptyCourseDateKey_(text.slice(0, 4), text.slice(5, 7), text.slice(8, 10))) return [];
    var timestamp = new Date(text);
    if (!isFinite(timestamp.getTime())) return [];
    text = Utilities.formatDate(timestamp, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  if (/^\d{4}-\d{2}-\d{2}\s*[,，]/.test(text)) {
    var explicit = text.split(/[,，]/).map(function(part) {
      var match = part.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? emptyCourseDateKey_(match[1], match[2], match[3]) : null;
    });
    return explicit.every(Boolean) ? explicit : [];
  }
  var single = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s*[（(][^）)]*[）)])?$/);
  if (single) {
    var key = emptyCourseDateKey_(single[1], single[2], single[3]);
    return key ? [key] : [];
  }
  var monthly = text.match(/^(\d{4})年\s*([\d/\s,，]+?)(?:\s*[（(][^）)]*[）)])?$/);
  if (!monthly) return [];
  var dates = monthly[2].split(/[,，]/).map(function(part) {
    var match = part.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    return match ? emptyCourseDateKey_(monthly[1], match[1], match[2]) : null;
  });
  // 任一日期無法判讀就保留整門課，不猜年份、不略過有誤的堂次。
  return dates.length && dates.every(Boolean) ? dates : [];
}

function emptyCourseStart_(row) {
  var dates = emptyCourseDates_(row[2]);
  var time = String(row[3] || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*[-~～–—]\s*(\d{1,2}):(\d{2}))?$/);
  if (!dates.length || !time || Number(time[1]) > 23 || Number(time[2]) > 59 || (time[3] && (Number(time[3]) > 23 || Number(time[4]) > 59))) return null;
  var firstDate = dates.sort()[0];
  var start = new Date(firstDate + 'T' + ('0' + time[1]).slice(-2) + ':' + time[2] + ':00+08:00');
  return isFinite(start.getTime()) ? start.getTime() : null;
}

// 呼叫者必須持有與預約共用的 ScriptLock，避免讀到空位後誤刪剛成立的預約。
function cleanupEmptyCourses_(ss, now) {
  var slots = ss && ss.getSheetByName(SHEET_SLOTS);
  var bookings = ss && ss.getSheetByName(SHEET_BOOKINGS);
  if (!slots || !bookings) throw new Error('找不到可用時段或預約名單工作表，未執行課程清理。');
  if (!Number.isFinite(now)) throw new Error('無法確認現在時間，未執行課程清理。');
  var rows = slots.getDataRange().getValues();
  var reserved = new Set();
  bookings.getDataRange().getValues().slice(1).forEach(function(row) {
    // 審核中、成功、已完課、舊版空白與未知狀態皆保留；只有明確取消才不算預約。
    if (row[1] && row[5] !== '已取消') reserved.add(String(row[1]));
  });
  var leaves = ss.getSheetByName('請假補課');
  if (leaves) leaves.getDataRange().getValues().slice(1).forEach(function(row) {
    if (row[5]) reserved.add(String(row[5]));
    if (row[10]) reserved.add(String(row[10]));
  });
  var ids = new Map();
  rows.slice(1).forEach(function(row) {
    var id = String(row[0] || '');
    ids.set(id, (ids.get(id) || 0) + 1);
  });
  var deleted = [];
  // 由下往上刪除，保持其餘課程列及所有預約、日誌、請假資料原樣。
  for (var i = rows.length - 1; i >= 1; i--) {
    var row = rows[i], id = String(row[0] || '');
    if (!id || !row[1] || ids.get(id) !== 1 || reserved.has(id)) continue;
    // 月繳團課保留供教練補開及代登記，不受六小時或已過期清理規則影響。
    if (/^\[月繳/.test(String(row[1]).trim())) continue;
    if (row[5] === '' || row[5] == null || row[6] === '' || row[6] == null) continue;
    var capacity = Number(row[5]), remaining = Number(row[6]);
    // 佔用名額或資料異常時保留，即使舊預約列已不在也不誤刪。
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(remaining) || remaining !== capacity) continue;
    var start = emptyCourseStart_(row);
    if (start !== null && now >= start - 6 * 60 * 60 * 1000) {
      slots.deleteRow(i + 1);
      deleted.push(id);
    }
  }
  if (deleted.length) SpreadsheetApp.flush();
  return { status: 'success', deletedSlotIds: deleted };
}

function cleanupEmptyCoursesBeforeBooking_(ss, slotId) {
  var result = cleanupEmptyCourses_(ss, Date.now());
  if (result.deletedSlotIds.indexOf(String(slotId)) !== -1) {
    throw new Error('此課程於開課前 6 小時仍無人預約，已自動刪除，請重新選擇課程。');
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
  var channelId = lineLoginChannelId_();
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('請重新登入 LINE 後再操作。');
  var verification = fetchLineForBookingDeletion_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken), { muteHttpExceptions: true });
  if (verification.getResponseCode() !== 200) throw new Error('LINE 登入已失效，請重新登入。');
  var token = JSON.parse(verification.getContentText());
  assertLineLoginToken_(token, channelId);
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
  var completion = monthlyCompletionForBooking_(ss, booking);
  if (completion && (completion.completedDates.length || completion.ambiguousDates.length)) throw new Error('此月繳訂單已有日誌，請保留訂單與逐堂紀錄。');
  var status = monthlyCompletionStatus_(booking[5], completion);
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
      counter.setValue(Math.min(capacity, Number(previous) + bookingSeatsToRestore_(rows, index)));
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
  if (payload.registrationProfileVersion === 2) return validateRegistrationProfile_(payload);
  if (payload.registrationProfileVersion != null) throw new Error('不支援的註冊資料版本。');
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

function validateRegistrationProfile_(payload) {
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cleanPhone = value => String(value || '').replace(/[\s()-]/g, '');
  const text = (value, max, required, label) => {
    if (value != null && typeof value !== 'string') throw new Error('請填寫有效的' + label + '。');
    const result = String(value || '').trim();
    if ((required && !result) || result.length > max) throw new Error('請完整填寫' + label + '，並確認字數限制。');
    return result;
  };
  return payload.students.map((student, index) => {
    if (!student || typeof student !== 'object' || Array.isArray(student)) throw new Error('請完整填寫每位學生的資料。');
    const name = text(student.name, 60, true, '姓名');
    if (!/^[\p{Script=Han}·・‧ ]+$/u.test(name)) throw new Error('請填寫真實中文姓名。');
    const nickname = text(student.nickname, 60, true, '暱稱');
    const birthDate = text(student.birthDate, 10, true, '出生年月日');
    const date = new Date(birthDate + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate || birthDate > today || Number(birthDate.slice(0, 4)) < Number(today.slice(0, 4)) - 120) throw new Error('請選擇有效的出生年月日。');
    const age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
    const phone = cleanPhone(student.phone);
    if ((index === 0 || phone) && !/^09\d{8}$/.test(phone)) throw new Error('請填寫有效手機號碼。');
    const emergencyPhone = cleanPhone(student.emergencyPhone);
    if ((index === 0 || emergencyPhone) && !/^0\d{8,9}$/.test(emergencyPhone)) throw new Error('請填寫有效緊急連絡人電話。');
    const injuryHistory = text(student.injuryHistory, 2000, false, '傷病史');
    const learningGoals = text(student.learningGoals, 2000, true, '學習目標');
    const style = student.lessonStyle;
    const keys = ['theory', 'multiball', 'correction'];
    if (!style || typeof style !== 'object' || keys.some(key => !Number.isInteger(style[key]) || style[key] < 0 || style[key] > 100) || keys.reduce((sum, key) => sum + style[key], 0) !== 100) throw new Error('偏好上課風格 A、B、C 合計必須為 100%。');
    return { id: Utilities.getUuid(), name, nickname, birthDate, age, phone, injuryHistory, emergencyPhone, learningGoals, lessonStyle: { theory: style.theory, multiball: style.multiball, correction: style.correction }, registrationProfileVersion: 2 };
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

function monthlyLeaveAction_(ss, payload, actor) {
  if (!actor) monthlyVerifyCoach_(payload.accessToken);
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
  var completion = monthlyCompletionForBooking_(ss, booking.row);
  if (['預約成功', '成功', '已完成'].indexOf(monthlyCompletionStatus_(booking.row[5], completion)) === -1) throw new Error('只能登記已預約成功且尚未完課的月繳學生。');
  var slot = monthlyUniqueRow_(ss.getSheetByName(SHEET_SLOTS), 0, String(booking.row[1]), '月繳課程');
  if (!/^\[月繳/.test(String(slot.row[1]))) throw new Error('此訂單不是月繳課程。');
  var day = String(payload.originalDate || '');
  if (completion && completion.completedDates.concat(completion.ambiguousDates).indexOf(day) >= 0) throw new Error('此日期已有日誌或需核對舊日誌，不能登記請假。');
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
  cleanupEmptyCoursesBeforeBooking_(ss, payload.slotId);
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
  var channelId = lineLoginChannelId_();
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('請重新登入 LINE 後再操作。');
  var verification = monthlyFetchLine_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken), { muteHttpExceptions: true });
  if (verification.getResponseCode() !== 200) throw new Error('LINE 登入已失效，請重新登入。');
  var token = JSON.parse(verification.getContentText());
  assertLineLoginToken_(token, channelId);
  var response = monthlyFetchLine_('https://api.line.me/v2/profile', {
    headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('無法驗證教練身分，請重新登入。');
  var profile = JSON.parse(response.getContentText());
  if (ADMIN_LINE_IDS.indexOf(profile.userId) === -1) throw new Error('僅教練可登記請假及安排補課。');
}



// ===== 教練管理（已內建，不需另外新增分檔） =====
// Requires MonthlyLeave.gs and the original worksheet constants.
function coachManagementAction_(ss, payload, actor) {
  if (!actor) monthlyVerifyCoach_(payload.accessToken);
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
    var completionData = monthlyLogCompletionData_(ss);
    if (['審核中', '預約成功', '成功', '已完成'].indexOf(monthlyCompletionStatus_(booking.row[5], completionData.get(String(booking.row[7] || '')))) < 0) throw new Error('只能取消審核中或預約成功的訂單。');
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
    var legacyLinks = completionData.legacyAssignments.filter(function(item) { return item.bookingId === payload.bookingId; });
    var logSheet = legacyLinks.length ? ss.getSheetByName(SHEET_LOGS) : null;
    if (logSheet) { accountReserveColumn_(logSheet, 16, LOG_BOOKING_HEADER); accountReserveColumn_(logSheet, 17, LOG_ID_HEADER); }
    try {
      legacyLinks.forEach(function(item) { logSheet.getRange(item.index, 16, 1, 2).setValues([[item.bookingId, Utilities.getUuid()]]); });
      bookings.getRange(booking.index, 6).setValue('已取消');
      if (counter) counter.setValue(Math.min(capacity, remaining + bookingSeatsToRestore_(bookings.getDataRange().getValues(), booking.index - 1)));
      SpreadsheetApp.flush();
    } catch(error) {
      legacyLinks.forEach(function(item) { logSheet.getRange(item.index, 16, 1, 2).setValues([item.previous]); });
      bookings.getRange(booking.index, 6).setValue(booking.row[5]);
      if (counter) counter.setValue(remaining);
      throw new Error('取消失敗，請重新讀取確認。');
    }
    return { status: 'success' };
  }
  if (payload.action !== 'updateSlot') throw new Error('不支援的管理操作。');
  var sheet = ss.getSheetByName(SHEET_SLOTS);
  var slot = monthlyUniqueRow_(sheet, 0, payload.slotId, '課程');
  var headers = sheet.getDataRange().getValues()[0];
  var hasSessions = Object.prototype.hasOwnProperty.call(payload, 'monthlySessions');
  var monthlyCourse = /^\[月繳/.test(String(slot.row[1]).trim());
  if (hasSessions && !monthlyCourse) throw new Error('只有月繳團課可編輯逐堂排程。');
  var previousSessions = monthlyCourse ? monthlySessions_(slot.row, headers) : [];
  if (hasSessions) {
    if (payload.expectedMonthlySessions && JSON.stringify(payload.expectedMonthlySessions.map(function(item) { return { date: item.date, teachingCoachId: item.teachingCoachId }; })) !== JSON.stringify(previousSessions)) throw new Error('逐堂排程已有變更，請重新讀取後再修改。');
    payload.monthlySessions = validateMonthlySessions_(ss, payload.monthlySessions, !slot.row[12]);
    var revisedDates = payload.monthlySessions.map(function(item) { return item.date; }), completionData = monthlyLogCompletionData_(ss);
    ss.getSheetByName(SHEET_BOOKINGS).getDataRange().getValues().slice(1).filter(function(row) { return String(row[1]) === payload.slotId; }).forEach(function(row) {
      var completion = completionData.get(String(row[7] || ''));
      if (completion && completion.completedDates.concat(completion.ambiguousDates).some(function(date) { return revisedDates.indexOf(date) < 0; })) throw new Error('已有訓練日誌的日期不可移除或改期，請保留逐堂紀錄。');
    });
    payload.date = payload.monthlySessions.map(function(item) { return item.date; }).join(', ');
    payload.title = String(payload.title || '').replace(/^\s*\[月繳[^\]]*\]/, '[月繳' + payload.monthlySessions.length + '堂]');
  }
  var assignCoach = Object.prototype.hasOwnProperty.call(payload, 'teachingCoachId');
  var coachId = null;
  if (assignCoach) {
    var oldCoachId = sheet.getDataRange().getValues()[0][12] === SLOT_TEACHING_COACH_HEADER ? String(slot.row[12] || '') : '';
    if (payload.teachingCoachId === '' && !oldCoachId) coachId = ''; // 舊課程可保留未指定。
    else coachId = requireTeachingCoach_(ss, payload.teachingCoachId).id;
  }
  var width = hasSessions ? 13 : assignCoach ? 12 : 11;
  var old = slot.row.slice(1, 1 + width);
  while (old.length < width) old.push('');
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
  if (!hasSessions && headers[13] === SLOT_MONTHLY_SESSIONS_HEADER && slot.row[13] && JSON.stringify(emptyCourseDates_(date)) !== JSON.stringify(previousSessions.map(function(item) { return item.date; }))) throw new Error('此課程已有逐堂排程，請使用新版逐堂日期與教練編輯功能。');
  if (linked && hasSessions) {
    var newDates = emptyCourseDates_(date);
    var linkedDates = leaveSheet.getDataRange().getValues().slice(1).filter(function(row) { return String(row[5]) === payload.slotId; }).map(function(row) { return monthlyDate_(row[6]); });
    if (linkedDates.some(function(day) { return newDates.indexOf(day) < 0; })) throw new Error('已有請假補課紀錄的日期不可移除或改期，請保留該堂日期。');
    if (time !== String(slot.row[3]) || location !== String(slot.row[4])) throw new Error('此課程已有請假補課紀錄，請保留原時間及場地。');
  } else if (linked && [title,date,time,location].some(function(value,i) { return value !== (slot.row[i+1] instanceof Date ? slot.row[i+1].toISOString() : String(slot.row[i+1])); })) throw new Error('此課程已有請假補課紀錄，只能修改名額及收費，以保留原排程。');
  if (!hasSessions && headers[13] === SLOT_MONTHLY_SESSIONS_HEADER && slot.row[13]) payload.monthlySessions = previousSessions;
  normalizeMonthlySlotPrices_(payload, false);
  var prices = [1,2,3,4,5].map(function(level) {
    var value = payload.prices && payload.prices[level];
    if (value === '' || value === null || value === undefined || !isFinite(Number(value)) || Number(value) < 0) throw new Error('各等級收費需為非負數。');
    return Number(value);
  });
  if (assignCoach) accountReserveColumn_(sheet, 13, SLOT_TEACHING_COACH_HEADER);
  var updated = [title,date,time,location,capacity,capacity-booked].concat(prices);
  if (assignCoach || hasSessions) updated.push(assignCoach ? coachId : slot.row[12] || '');
  if (hasSessions) {
    accountReserveColumn_(sheet, 14, SLOT_MONTHLY_SESSIONS_HEADER);
    updated.push(JSON.stringify(payload.monthlySessions));
  }
  try {
    sheet.getRange(slot.index, 2, 1, width).setValues([updated]);
    SpreadsheetApp.flush();
  } catch(error) {
    sheet.getRange(slot.index, 2, 1, width).setValues([old]);
    throw new Error('修改失敗，請重新讀取確認。');
  }
  return { status: 'success', monthlySessionsVersion: 1 };
}

function rejectCancelledBookingWrite_(ss, payload) {
  if (payload.bookingId && ['approveBooking','updatePayment','addLog'].indexOf(payload.action) !== -1) {
    var booking = monthlyUniqueRow_(ss.getSheetByName(SHEET_BOOKINGS), 7, payload.bookingId, '訂單');
    if (payload.action === 'updatePayment' && (['現場現金', '現金已收'].indexOf(booking.row[6]) !== -1 || ['現場現金', '現金已收'].indexOf(payload.paymentCode) !== -1)) throw new Error('現金付款須由教練確認收款，不適用匯款後五碼修改。');
    if (booking.row[5] === '已取消') throw new Error('已取消訂單不可核准、更新付款或結課。');
  }
}

// Sensitive registration fields are available only through the authenticated coach action.
function coachStudentProfile_(ss, payload) {
  if (typeof payload.lineId !== 'string' || !payload.lineId.trim() || typeof payload.studentId !== 'string') throw new Error('請選擇要檢視的學員。');
  const sheet = ss.getSheetByName(SHEET_USERS);
  const accounts = sheet ? sheet.getDataRange().getValues().slice(1).filter(row => row[0] === payload.lineId) : [];
  if (accounts.length !== 1) throw new Error('找不到唯一的學員帳號資料。');
  const row = accounts[0], students = accountStudents_(row);
  const matches = students.filter(student => student.id === payload.studentId);
  if (matches.length !== 1) throw new Error('找不到此帳號的指定學員。');
  const student = matches[0], isRepresentative = students[0] === student;
  const style = student.lessonStyle, keys = ['theory', 'multiball', 'correction'];
  const validStyle = style && keys.every(key => Number.isInteger(style[key]) && style[key] >= 0 && style[key] <= 100) && keys.reduce((sum, key) => sum + style[key], 0) === 100;
  return {
    lineId: payload.lineId, studentId: student.id, name: student.name || '', nickname: student.nickname || '',
    birthDate: student.birthDate || '', age: student.age == null ? null : student.age,
    phone: student.phone || (isRepresentative ? row[3] || '' : ''),
    emergencyPhone: student.emergencyPhone || '', injuryHistory: student.injuryHistory || '', learningGoals: student.learningGoals || '',
    lessonStyle: validStyle ? { theory: style.theory, multiball: style.multiball, correction: style.correction } : null,
    isRepresentative, representativeName: row[1] || '', representativePhone: row[3] || ''
  };
}

function publicAccountStudents_(students) {
  return students.map(student => ({ id: student.id, name: student.name, nickname: student.nickname || '', gender: student.gender || '', age: student.age }));
}

function accountUser_(row) {
  const students = accountStudents_(row);
  // Registration notes and emergency contacts stay in the sheet, not general account responses.
  const publicStudents = publicAccountStudents_(students);
  const registrationProfileVersion = students.every(student => student.registrationProfileVersion === 2) ? 2 : 1;
  return { name: row[1], age: row[2], phone: row[3], level: row[5] || 1, students: publicStudents, studentCount: students.length, registrationComplete: !!row[6], registrationProfileVersion };
}
function verifyAccountOwner_(accessToken, lineId) {
  const channelId = lineLoginChannelId_();
  if (!accessToken) throw new Error('請確認 LINE 登入設定並重新登入後補登資料。');
  const verification = monthlyFetchLine_('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken), { muteHttpExceptions: true });
  if (verification.getResponseCode() !== 200) throw new Error('LINE 登入已失效，請重新登入。');
  const token = JSON.parse(verification.getContentText());
  assertLineLoginToken_(token, channelId);
  const response = monthlyFetchLine_('https://api.line.me/v2/profile', { headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200 || JSON.parse(response.getContentText()).userId !== lineId) throw new Error('只能補登自己帳號的學生資料。');
}

// New private lessons share one slot across all student rows. Old bookings still use one seat per row.
function bookingSeatsToRestore_(rows, index) {
  const groupId = rows[index][10];
  if (!groupId || rows[0][10] !== '專屬教練課預約組別') return 1;
  return rows.some((row, i) => i > 0 && i !== index && row[10] === groupId && row[5] !== '已取消') ? 0 : 1;
}
