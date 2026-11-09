# 前端文字編碼

`script.js`、`ja.js`、`i18n.js` 的非 ASCII 文字使用 JavaScript Unicode 跳脫；JSX 文字及屬性使用字元參照。`index.html` 的標題及 CSS 中文也轉為對應跳脫表示。瀏覽器解碼後仍顯示原本的中文字，程式邏輯及 Apps Script 後端不變。

修改文字後，執行 `npm ci`、`npm run encode:frontend`、`npm run check:frontend`。轉換工具會比較轉換前後的 JavaScript 語法樹，確認字串、JSX 與一般模板字串的值相同；遇到會改變 raw 值的帶標籤模板會停止。編碼檔案直接提交，GitHub Pages 不需要額外建置。

這是可還原的文字編碼，只增加直接閱讀原始碼的門檻。瀏覽器、開發工具及 GitHub 歷史仍能取得或還原文字，不能用來保護金鑰或取代後端權限驗證。

## 品牌橫幅資源

原 `jj.png` 改為 `assets/r-*.bin` 編碼資源，頁面載入時還原成 `image/png` Blob，供原本的 `BrandBanner` 共用。維持原始 PNG 位元組、尺寸、畫質、背景裁切及無障礙文字，不變更後端。原公開目錄不再放置 `jj.png`；GitHub 歷史及既有快取仍可能保留舊檔。

更換橫幅時，把新 PNG 放在網站目錄以外，執行 `npm run encode:banner -- /path/to/banner.png`，工具會產生依內容命名的 `.bin` 並更新 `script.js` 的路徑。提交新資源與前端引用，刪除不再引用的舊編碼資源，再更新 HTML 的程式版本參數。不要將原始 PNG 另外提交到公開網站目錄。

資源採可還原的 XOR 編碼，前端的遮罩是公開的編碼參數，不是私密金鑰。這只能增加直接開啟原檔的門檻；Blob、截圖及還原仍可取得圖片，並非圖片存取權限或防拷貝保護。
