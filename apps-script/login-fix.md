# 教練登入修正位置

前端已移除假測試帳號，並保留 LINE／後端錯誤訊息。這不等於已驗證你的 LINE 帳號或線上部署；後端需做以下修改。

## 1. 管理檢查只用於訂單寫入

找到先前加入的這一行：

```javascript
rejectCancelledBookingWrite_(ss, payload);
```

替換成：

```javascript
if (payload.bookingId && ["approveBooking", "updatePayment", "addLog"].includes(action)) {
  rejectCancelledBookingWrite_(ss, payload);
}
```

保留這段在 `const ss = SpreadsheetApp.getActiveSpreadsheet();` 之後。登入查詢及一般資料讀取不需呼叫取消訂單檢查，避免新管理檔案未貼齊時連登入都受影響。

## 2. 教練判斷提前

在 `const ss = SpreadsheetApp.getActiveSpreadsheet();` 之後、讀取會員或日誌工作表之前加入：

```javascript
if (action === "checkUser" && ADMIN_LINE_IDS.includes(payload.lineId)) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    isAdmin: true,
    isRegistered: false,
    user: null
  })).setMimeType(ContentService.MimeType.JSON);
}
```

原本 `checkUser` 分支保留，繼續處理一般學生。這沿用原本由後端 `ADMIN_LINE_IDS` 判斷身分的規則；沒有新增前端教練捷徑，也沒有改動新增管理介面的 LINE token 驗證。

## 3. 儲存並更新原部署

從「部署 → 管理部署 → 編輯 → 新版本」更新原 Web App，保留 API 網址。請保留 `CoachManagement.gs` 與 `MonthlyLeave.gs`，取消／編輯等操作仍需要這些檔案。

若登入成功卻進入註冊頁，展開「我是教練，但未進入後台」，比對當前 LINE user ID 是否列入 `ADMIN_LINE_IDS`。同一人在不同 LINE Provider 的 user ID 可能不同，請不要以暱稱判斷。若有明確錯誤訊息，依訊息檢查 LIFF 的 profile 權限、Endpoint URL、Web App 存取設定或缺少的函式。

測試：`node apps-script/tests/login.test.cjs`。本機測試不代表已更新你的 Google 部署或確認真實 LINE 帳號。
