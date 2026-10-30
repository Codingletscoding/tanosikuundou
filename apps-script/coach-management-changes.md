# 取消預約與編輯課程：原 Apps Script 修改位置

前端按鈕已加入；必須更新原 Apps Script 部署才能儲存，不需整份替換程式。

1. 在原 Apps Script 專案新增本資料夾的 `CoachManagement.gs`。保留已加入的 `MonthlyLeave.gs`，它提供 LINE 教練驗證及查找資料函式。`LINE_LOGIN_CHANNEL_ID` 沿用原設定。
2. 在 `doPost` 的 `writes` 或 `writeActions` 陣列中增加 `"cancelBooking", "updateSlot"`。使用先前的共用鎖，不另建立第二把鎖。
3. 在取得 `ss` 後、執行各個 action 分支前，新增：

```javascript
rejectCancelledBookingWrite_(ss, payload);
```

4. 在 `else if (action === "approveBooking")` 前插入：

```javascript
else if (["cancelBooking", "updateSlot"].includes(action)) {
  result = coachManagementAction_(ss, payload);
}
```

5. 儲存，從「部署 → 管理部署 → 編輯 → 新版本」更新原 Web App，保留原網址。GitHub 推送不會部署 Apps Script。

## 行為

- 審核中及成功預約可取消，訂單保留並標示「已取消」，名額加一且不超過容量；重複取消不再次回補，不自動退款。
- 已取消訂單不可再對帳核准、更新付款或結課；已完課及已關聯請假補課的訂單不可取消。
- 已開課程可編輯名稱、日期、時間、場地、總名額及五種會員收費。保留課程 ID、既有學生、既有訂單金額，剩餘名額依實際已預約人數計算。
- 新容量不得低於已預約人數；日期／時間及收費需有效。月繳／私人教練／單堂類型不可互相變更；月繳日期及私人課程名稱中的價格格式請保留。私人教練的 1 對 1／1 對 2 基準價仍位於課程名稱，五種會員收費適用團課。
- 已關聯請假或補課的課程只允許調整容量及收費，避免原排程與補課紀錄失去對應。
- 課程日期／時間等變更不會自動發 LINE 通知，請另行通知原有學生。

僅完成模擬資料與本機瀏覽器測試，未取消真實預約或更動線上課程。
