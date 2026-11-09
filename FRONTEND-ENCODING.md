# 前端文字編碼

`script.js`、`ja.js`、`i18n.js` 的非 ASCII 文字使用 JavaScript Unicode 跳脫；JSX 文字及屬性使用字元參照。`index.html` 的標題及 CSS 中文也轉為對應跳脫表示。瀏覽器解碼後仍顯示原本的中文字，程式邏輯及 Apps Script 後端不變。

修改文字後，執行 `npm ci`、`npm run encode:frontend`、`npm run check:frontend`。轉換工具會比較轉換前後的 JavaScript 語法樹，確認字串、JSX 與一般模板字串的值相同；遇到會改變 raw 值的帶標籤模板會停止。編碼檔案直接提交，GitHub Pages 不需要額外建置。

這是可還原的文字編碼，只增加直接閱讀原始碼的門檻。瀏覽器、開發工具及 GitHub 歷史仍能取得或還原文字，不能用來保護金鑰或取代後端權限驗證。
