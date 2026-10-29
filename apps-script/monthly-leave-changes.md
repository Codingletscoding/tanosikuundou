# 月繳請假與補課：既有 Apps Script 修改位置

前端已加入「請假登記／安排補課」。以下是原程式的增量修改，不需要整份替換。儲存後仍須更新**原有 Web App 部署**為新版本；GitHub 推送不會更新 Apps Script。

## 1. 新增一個檔案

在原 Apps Script 專案新增 `MonthlyLeave.gs`，貼入本資料夾同名檔案內容。只新增一次；它不含 `doPost`，不會與原入口衝突。

保留原本的 `SHEET_USERS`、`SHEET_SLOTS`、`SHEET_BOOKINGS`、`SHEET_LOGS`、`ADMIN_LINE_IDS`。在指令碼屬性設定 `LINE_LOGIN_CHANNEL_ID` 為 LIFF 所屬 LINE Login channel 的 Channel ID。新增檔案內已包含獨立的 LINE 身分驗證函式，不依賴之前的刪除包裝檔。

## 2. 將兩個新操作加入原本的寫入鎖

找到先前新增的 `writes` 或 `writeActions` 陣列，保留所有原項目，加入：

```javascript
"registerMonthlyLeave", "arrangeMonthlyMakeup"
```

若原程式尚無共用鎖，在 `function doPost(e) {` 下一行加入：

```javascript
let requestLock = null;
```

在 `const action = payload.action;` 後加入下方片段。若已經有共用鎖，**不要重複加入**：

```javascript
const writes = ["registerUser", "bookClass", "addSlot", "deleteSlot",
  "approveBooking", "updatePayment", "addLog", "deleteBooking",
  "registerMonthlyLeave", "arrangeMonthlyMakeup"];
if (writes.includes(action)) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("系統忙碌中，請稍後再試。");
  requestLock = lock;
}
```

在原本最後的 `catch` 區塊後加上 `finally`，保留最後關閉 `doPost` 的大括號：

```javascript
} finally {
  if (requestLock) requestLock.releaseLock();
}
```

## 3. 新增請假補課分支

找到 `else if (action === "approveBooking")`，在它前面插入：

```javascript
else if (["getMonthlyLeaves", "registerMonthlyLeave", "arrangeMonthlyMakeup"].includes(action)) {
  result = monthlyLeaveAction_(ss, payload);
}
```

## 4. 一般預約也檢查剩餘名額

找到 `else if (action === "bookClass") {`，在這個分支**第一行**、新增預約列之前加入：

```javascript
validateBookingSlot_(ss, payload);
```

這讓一般預約與補課使用相同鎖及名額檢查，避免補課占用最後名額後仍新增一般預約。

## 5. 學生畫面顯示請假及補課紀錄

在 `getStudentStats` 分支最後，原本 `result = { ... }` **之後**加入：

```javascript
const leaveSheet = ss.getSheetByName("請假補課");
result.monthlyLeaves = leaveSheet
  ? monthlyLeaveRows_(leaveSheet).filter(row => row.lineId === payload.lineId)
  : [];
```

在 `getCoachData` 的 `bookings.push({ ... })` 內，於 `bookingId` 後加逗號及欄位：

```javascript
bookingId: bData[i][7] || "",
makeupLeaveId: bData[i][8] || ""
```

原本 `bookingId` 欄位只保留一份。前端會用 `makeupLeaveId` 顯示「月繳補課（不重複收費）」。

## 6. 保護已關聯的請假與補課訂單

在 `deleteBooking` 分支內、修改任何名額或刪除訂單列**之前**加入：

```javascript
const leaveSheet = ss.getSheetByName("請假補課");
if (leaveSheet && leaveSheet.getDataRange().getValues().slice(1).some(row =>
  String(row[2]) === payload.bookingId || String(row[12]) === payload.bookingId
)) {
  throw new Error("此訂單已有請假或補課紀錄，請保留訂單以維持補課追蹤。");
}
```

若使用倉庫的 `deleteApprovedBooking_` 函式，此保護已整合，不需再加入。

## 7. 儲存與部署

儲存程式，從「部署 → 管理部署 → 編輯 → 新版本」更新原有 Web App，保持原 API 網址。如果 Google 要求 UrlFetch 授權，請完成授權。

舊月繳課程的日期可能只有 `11/15, 11/22...`，沒有年份。請在「可用時段」C 欄補上正確年份，例如 `2026年 11/15, 11/22...`。新建立的月繳課程已自動包含年份；不要憑今天的年份批次改動歷史課程。沒有年份的舊資料只可核對月／日，登記時必須由教練確認完整年份。

## 行為

- 月繳訂單須為已確認且尚未完課；每次登記一個上課日期及原因。
- 以伺服器收到登記請求的時間判定，需距原課程開始至少 14 × 24 小時（台北時間）；剛好 14 天允許。這版不接受補填較早的申請日期。
- 每個「月繳訂單＋請假日期」只能登記一次。
- 首次有效登記自動建立「請假補課」工作表，不改動原月繳訂單，不釋出整月名額。
- 補課可選未開始、有名額、非請假當天的單堂團課。若需其他時間，先在後台新增單堂團課；私人教練及月繳套裝不作為補課目標。
- 安排後建立同一學生的「預約成功」訂單，金額為 0、不重複收費、扣一名額。預約名單的第 I 欄儲存來源請假編號，請保留此欄作為補課關聯；既有 A–H 欄不變。
- 已安排紀錄保留補課日期、時間、課程及場地；學生可於訓練紀錄查看。
- 不提供請假撤回、補課改期或刪除關聯訂單；這些操作需另外設計回補規則，避免重複補課。
- 寫入失敗會嘗試回復名額與補課紀錄；試算表不是資料庫交易，請保留備份，避免其他舊部署或人工同時修改同一批資料。

本機測試：`node apps-script/tests/monthly-leave.test.cjs`。所有測試使用模擬資料；未替使用者更新線上 Apps Script 或建立真實請假及預約。
