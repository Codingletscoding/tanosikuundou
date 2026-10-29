# 完整替換版本（建議）

[complete/Code.gs](complete/Code.gs) 直接依原程式整合，保留單一 `doPost(e)` 及既有 action，加入 `deleteBooking` 分支。整份替換原 Code.gs 即可，不必改名為 handleRequest。**若先前新增過 BookingDeletion.gs，請移除該額外檔案，避免函式重複。兩種安裝方式只能選一種。**

仍須依下方步驟設定 `LINE_LOGIN_CHANNEL_ID` 並更新原有 Web App 部署為新版本，保留原 API_URL。

完整版本測試：`node apps-script/tests/booking-deletion.test.cjs --complete`。

以下為保留舊程式、分檔整合的替代方式；使用完整版本者略過改名及新增檔案步驟。

# 啟用教練刪除成功預約

前端已呼叫 `deleteBooking`，但必須更新現有 Google Apps Script 部署才會生效。這些檔案不會由 GitHub Pages 執行。不要建立另一個不相干的試算表專案或更換前端 API_URL。

1. 開啟目前綁定會員／時段／預約試算表、對應網站 API_URL 的 Apps Script 專案。先保存現行程式備份。
2. 在原始程式將 `function doPost(e)` 改名為 `function handleRequest(e)`。其餘內容保留，包括工作表常數、`ADMIN_LINE_IDS` 與原本 action 分支。專案只能保留一個 `doPost`。
3. 新增 `BookingDeletion.gs` 檔案，貼上本資料夾同名檔案的完整內容。新的 `doPost` 會把原有請求轉交 `handleRequest`，並讓寫入操作共用鎖。
4. 在「專案設定 → 指令碼屬性」新增 `LINE_LOGIN_CHANNEL_ID`，值填入目前 LIFF 所屬 **LINE Login channel 的 Channel ID**。這不是 LIFF ID，也不是 Channel secret；不需把 secret 放進前端或 Git。
5. 確認 LIFF 已啟用 `profile` scope，且教練 LINE user ID 列在原有 `ADMIN_LINE_IDS`。
6. 儲存，從「部署 → 管理部署 → 編輯」選擇「新版本」，更新**原有 Web App 部署**，維持原有 API 網址與存取設定。新增的 LINE 驗證使用 `UrlFetchApp`；如 Google 要求新的授權，請完成授權。
7. 以教練登入網站，用可刪除的測試訂單驗證：取消確認時資料不變；確認刪除後該列移除，對應時段的剩餘名額加一但不超過容量，學生紀錄亦不再列出該單。完課日誌不變，不會自動退款。請勿使用需要保留的真實訂單驗證。

## 行為與限制

- 參數：`{ action: 'deleteBooking', bookingId, accessToken }`；成功回應：`{ status: 'success', bookingId }`。token 由 LIFF 在操作時提供，不保存到程式庫或試算表。
- 後端向 LINE 驗證 token、有效期限、Channel ID 與登入者 user ID，依 `ADMIN_LINE_IDS` 授權；不能僅以呼叫者傳來的 LINE ID 判定教練。
- 只接受「預約成功」及原程式相容的舊狀態（空白、「成功」、「已完成」）。「審核中」、「已完課」不可刪除；沒有 ID、找不到或重複 ID 都會回報失敗。
- 課程已下架時仍可刪除訂單，沒有時段可恢復名額。名額異常時拒絕刪除；訂單列刪除失敗時嘗試恢復名額。試算表的跨工作表更新不是資料庫交易，故仍應保留備份，避免部署切換期間或人工直接編輯同一批資料。
- 新的共用鎖僅保護透過這個新部署的寫入；請避免繼續使用舊部署或其他未採相同鎖的腳本寫入。
- 此更新為新的刪除介面加入身分驗證；原本 `handleRequest` 的其他介面保留既有行為，並非整套 API 的權限改造。

目前只完成本機模擬測試；尚未代替專案擁有者執行 Google 授權、更新 Apps Script 線上部署或刪除真實訂單。

## 本機測試

在倉庫根目錄執行 `node apps-script/tests/booking-deletion.test.cjs`。測試使用模擬的試算表及 LINE 回應，不連線、不刪除真實資料。
