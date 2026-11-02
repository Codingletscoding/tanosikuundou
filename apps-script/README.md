# 同帳號 1～3 位學生

下載或開啟 [完整 Code.gs](complete/Code.gs)，全部複製即可，已內建多人帳號、教練管理、現金收款、取消／刪除預約、月繳請假補課及訓練日誌。

1. 先備份現行 Apps Script 程式與試算表。
2. 在**原有** Apps Script 專案，將 `Code.gs` 內容全部取代為上述檔案。
3. 如果專案另有 `BookingDeletion.gs`、`MonthlyLeave.gs`、`CoachManagement.gs`，請移除，避免與完整檔重複定義；本版本只需一份 `Code.gs`。不要刪除 `appsscript.json`，也不要刪除試算表資料。
4. 確認 `ADMIN_LINE_IDS` 是原本教練的 LINE user ID，並保留專案指令碼屬性 `LINE_LOGIN_CHANNEL_ID`（LINE Login Channel ID，不是 LIFF ID 或 Channel secret）。
5. 「部署 → 管理部署 → 編輯 → 新版本 → 部署」，更新**原有** Web App，維持原 API_URL 及存取設定；如 Google 要求授權，請完成授權。

GitHub 推送不會更新 Apps Script。網站前端也須使用本次更新的 `index.html`，才會出現多人註冊與紀錄切換介面。

- 註冊可選 1～3 人，每人填真實姓名、暱稱、性別、年齡；第一位代表另填手機及身分證字號（後端檢查格式與檢查碼）。其他學生不需電話或身分證。學生識別碼由後端產生，姓名相同也能分開紀錄。
- 每次預約包含帳號全部學生，每位一筆訂單、佔一個名額，總額為每人費用乘以人數。後端依帳號會員等級及課程價格計價，不採信前端金額。教練課沿用所選 1 對 1／1 對 2 費率作每人費用，確認畫面顯示總額。剩餘名額不足時整筆拒絕；寫入失敗會嘗試回復整筆。
- 教練分別為每位學生核准、收款、結課及填寫日誌；各學生可獨立請假與補課。學生端「我的訓練紀錄」可切換人員，分別顯示堂數、能力時數、預約、請假及日誌。教練名單的付款金額仍是同 LINE 帳號合計。
- 舊單人帳號與舊日誌不需搬移。此功能針對首次註冊；不會自動將既有單人帳號改成多人帳號。

新增欄位（原有欄位順序保留）：會員資料 G「帳號學生資料」（JSON）、H「代表身分證字號」；預約名單 J「學生編號」；訓練日誌 O「學生編號」；請假補課 S「學生編號」。請先確認這些欄位沒有其他用途。身分證不會回傳到學生紀錄或教練列表，請限制試算表存取權限。

本機驗證：`node apps-script/tests/account-students.test.cjs`。另外需在可拋棄的測試試算表及測試 LINE 帳號確認新部署的註冊、多人扣額、總額及逐人結課；本機測試使用模擬資料，不代表已部署或已驗證線上試算表。

# 驗證完整單檔

在倉庫根目錄執行：

```sh
node apps-script/tests/account-students.test.cjs
node apps-script/tests/monthly-leave.test.cjs
node apps-script/tests/login.test.cjs
node apps-script/tests/booking-deletion.test.cjs --complete
```

這些測試直接載入完整 `Code.gs`，不載入額外 `.gs` 檔案。使用模擬試算表及 LINE 回應，不會變動真實資料。

# 舊分檔參考

`BookingDeletion.gs`、`MonthlyLeave.gs`、`CoachManagement.gs` 與各 `*-changes.md` 保留作舊版整合參考；不要再將這些分檔貼入使用上述完整單檔的專案。舊分檔入口不支援本次多人帳號功能。
