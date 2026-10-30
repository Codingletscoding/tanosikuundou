# 教練時段現場現金付款：修改位置

前端已改為現場付現，團課匯款流程保留。若要使用後台「確認現金收款」，請更新以下位置並部署原 Web App 新版本；不用整份替換。

## 1. 更新管理函式檔

將原專案的 `CoachManagement.gs` 內容更新為本資料夾同名檔案，保留原有 `MonthlyLeave.gs` 及 LINE_LOGIN_CHANNEL_ID 設定。不新增第二個同名函式檔。

## 2. 寫入鎖新增 action

在 `writes` 或 `writeActions` 陣列加入：

```javascript
"confirmCashPayment"
```

## 3. 管理分支新增 action

找到原本：

```javascript
else if (["cancelBooking", "updateSlot"].includes(action)) {
  result = coachManagementAction_(ss, payload);
}
```

只把陣列改成：

```javascript
["cancelBooking", "updateSlot", "confirmCashPayment"]
```

原本的函式呼叫保留。

## 4. bookClass 強制設定教練課為待付現

在 `bookClass` 分支，找到原本這行：

```javascript
const paymentCode = payload.paymentCode || "";
```

替換成：

```javascript
const bookedSlot = monthlyUniqueRow_(sheetSlots, 0, payload.slotId, "課程");
const paymentCode = /^\[專屬教練課\]/.test(String(bookedSlot.row[1]))
  ? "現場現金"
  : (["現場現金", "現金已收"].includes(payload.paymentCode) ? "" : (payload.paymentCode || ""));
```

放在原本 `const sheetSlots = ss.getSheetByName(SHEET_SLOTS);` 之後。保留原有 appendRow；它會將 paymentCode 存入 G 欄，不必新增欄位。這能避免學員自行傳送「現金已收」當作已收款。

## 5. 保留原訂單寫入檢查

確認在取得 ss 後有以下檢查（已加過則不重複）：

```javascript
if (payload.bookingId && ["approveBooking", "updatePayment", "addLog"].includes(action)) {
  rejectCancelledBookingWrite_(ss, payload);
}
```

更新後的函式也會阻擋用匯款後五碼介面改動現金付款狀態，收款只能由教練驗證後確認。

## 6. 儲存並更新原部署

「部署 → 管理部署 → 編輯 → 新版本」，保留原 API 網址。

- 新教練課訂單先顯示「現場現金」，狀態為審核中。核准是確認預約，不代表已收款。
- 預約核准或已完課後，教練確認真的收到現金，再按「確認現金收款」。G 欄改為「現金已收」，始計入付款及收入統計；重複確認不重複加款。
- 收費僅含教練費，不含場地費，學員自行預約並支付場地費。
- 本月收入仍依預約登記月份計算，不是實際收款月份；這次沒有新增收款日期欄位。
- 歷史訂單不自動改付款方式，也不批次標為已收款。保留原有金流紀錄。
- 既有團課維持原匯款及對帳方式。G 欄沿用原付款欄位，新增兩個明確狀態值。

所有驗證使用模擬資料；尚未更新使用者線上 Google 部署，亦未替任何真實訂單確認收款。
