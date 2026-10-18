# 原版完整備份（含 LINE）

使用者要求先備份，再製作純報價版。已在任何純報價程式修改前，將當時 main 建立為獨立備份分支，並從 GitHub 讀回確認 commit。舊版完整網站、圖片、LINE 聯絡流程、API、報價規則及可重建發布檔均保留在此 commit。

- 備份版本：**2026-10-17.22**。
- [查看備份分支](https://github.com/paulchen01/Bychen01/tree/backup/with-line-20261019-v22)。
- [下載完整備份 ZIP](https://github.com/paulchen01/Bychen01/archive/6263ba7b637b0f63a853efb5ca6c125a3755f484.zip)。
- 不變的備份 commit：`6263ba7b637b0f63a853efb5ca6c125a3755f484`。
- 網站來源：該 commit 的 `korea-quote/site`。
- 發布檔：`korea-quote/releases/site-20261017-22.json`，包含 41 個檔案及各檔案雜湊。
- 發布檔 SHA-256：`6501808764f05c25bee5821e9f572cad03e5ba4e7ab6fdf199b55a9e199051b6`。

備份查核時，正式 `/api/health` 回傳 v22；正式首頁仍含原聯絡連結。首頁 SHA-256 與備份發布檔完全相同：`cbf2a34664fc2d7d37af8a90d087c9291dc5a9f5b6a4eadcba6a54a076b43f7b`。此為查核時快照，不代表正式站未來一直維持該版本。

## 還原方式

使用獨立 checkout 或工作目錄取出上述不變 commit，先執行 `node korea-quote/scripts/release.mjs --check` 核對 v22 發布內容，再執行該版本測試及建置。正式發布時，使用具備原專案權限的 Vercel 登入，將 `korea-quote/site/.vercel/output` 發布回既有 `bychen999 / korea-quote-0908` 專案。不要以新版目錄混搭舊版圖片或聯絡程式。

備份分支不隨 main 的純報價版更新移動。原生 Vercel 環境設定及部署權限由原專案管理；此備份不包含密鑰或帳號登入資料。
