# 廢廢豬韓國代購報價系統

本目錄是可直接維護與測試的網站來源，從既有 `site-20260915-20.json` 核對 SHA-256 後還原。2026-10-17 更新版本為 **2026-10-17.22**。原始歷次發布檔與驗收紀錄保留於 `../releases/`。

## v22 平台抽測與相容性修正

- Olive Young 保留主商品可核對的一般折扣，再排除需要領券、會員或指定付款條件的價格。重新依一般售價判斷滿額免運；折扣明細衝突或條件無法判斷時停止報價。
- Zigzag 接受已觀測到官方 HTTP 308 的 `/p/<商品ID>` 分享網址，集中轉為原有商品路徑。
- Pocamarket 支援已觀測的 `/zh-tw/search/detail/<商品ID>` 語系路徑，保留 global 市場與商品 ID；美元商品仍需可驗證的韓國原價。
- X 的 oEmbed 讀取可跟隨 `publish.twitter.com` 到 `publish.x.com` 的官方同貼文轉址。逐跳驗證、最多三次轉址；登入、限流、不同貼文或未支援的目的地會停止。
- Naver 兩個正式商品樣本均受平台 HTTP 429 限制。另確認新版主商品 state 與既有 JSON-LD parser 的格式差異，本輪未修改此部分，不能標示為自動報價已通過。

完整抽測來源、正式 API 回應與限制保存在 [平台查核紀錄](../releases/platform-audit-20261017-22.md) 與同名 JSON。目前 v22 尚待正式發布驗證。

## v21 Bunjang 與自動查價修正

- Bunjang 優先讀取官方公開商品詳情，核對主商品編號、韓元售價、販售狀態與韓國一般宅配費。
- 目前官方路徑為 `https://api.bunjang.co.kr/api/pms/v1/products/{id}/detail/web`。僅讀取 `data.product`，不從推薦商品或賣家敘述猜售價。
- 根網域、www、m、單複數 product 路徑、明確的商品編號參數與 hash 路徑集中正規化。未知的官方路徑可核對逐跳轉址與真正 HTML head 的 canonical；不能確認商品編號時停止報價。
- 若 API 路徑回 404/410（且不是商品下架錯誤）或欄位格式變動，讀取官方商品頁引用的 `index.*.js`，只抽取同一類商品詳情端點模板，不執行遠端程式。固定官方 API 網域；驗證同商品資料後才採用新端點。暖啟動程序保留已驗證端點，發現流程失敗至少間隔五分鐘。
- 保留公開文字 reader 備援並改善新舊頁面布局辨識。免運、一般宅配、便利商店配送、到付、寄送限制與未知費用分開處理。登入、權限限制、停售、商品編號或價格衝突不會被降級備援覆蓋。
- 客人輸入或貼上可辨識的完整連結，600ms 後自動查價；`?product=<完整商品網址>` 也會自動查詢。換商品時取消上一筆請求，防止舊回應覆蓋新商品。

自動相容範圍限於已核實的官方來源與可驗證的商品結構。全新網域、完全不同的 API 結構、登入限制及無法判斷的價格／運費，仍需維護者確認；不會自動產生並執行任意修補程式。

## 報價規則

既有報價規則、Google Sheets B2 匯率同步、LINE 聯絡方式與費用揭露維持原設定。`lib/pricing.mjs`、`lib/estimate.mjs`、`lib/platform-fee.mjs`、`lib/sheet-rate.mjs` 與原正式 v20 的 SHA-256 相同。

以商品款加韓國境內運費作為級距基礎：₩25,000 以下固定 NT$50；₩25,001–79,999 加 8%；₩80,000–149,999 加 5%；₩150,000–199,999 加 3%；₩200,000 以上免代購費。只在最終台幣金額無條件進位。未知的平台費不當成零；國際運費另計。

2026-10-17 使用商品 `386933481` 驗證：₩64,000、韓國配送免費，當時共享匯率 38，估價 **NT$1,819**，未含未公開的平台費及國際運費。此數字是驗證時快照，程式每次查價仍讀取當時資料。

## 測試與建置

建議 Node 22.22.2 以上的 22.x，或 Node 24.15 以上。正式函式保留 Node 22 執行環境。開發依賴 jsdom 僅用於 DOM 互動測試，正式函式没有第三方依賴。

```bash
cd korea-quote/site
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

`npm test` 共執行 193 項測試：28 項 Bunjang API／網址／費用、63 項 reader、16 項 Olive Young 折扣與運費、12 項平台網址與幣別、39 項 X 官方轉址與貼文解析，以及 35 項 DOM 互動測試。DOM 測試載入實際 app.js 與 HTML，以受控 API 回應驗證自動提交、重複提交、取消與亂序回應；不是正式站瀏覽器驗收。正常 reader 文字 fixtures 為依已觀察布局建立的合成樣本；官方 API fixtures 為公開實測回應的必要欄位，附來源日期。

`npm run build` 產生 `.vercel/output`，包含靜態網站及 `/api/health`、`/api/rate`、`/api/quote` 三個函式。使用者仍可按原按鈕重試與手動試算。

## 發布與驗證

原站：`https://korea-quote-0908.vercel.app`。發布目標必須是既有 Vercel 專案 `korea-quote-0908`，不可建立替代專案或改變網站權限。

從專案根目錄執行 `node korea-quote/scripts/release.mjs --check`，可核對已保存的 v22 發布檔是否與目前來源完全一致。產生新發布快照則執行相同指令但省略 `--check`。發布前需確認正確團隊、專案與已測試 commit；發布後應實測 `/api/health` 的版本與使用者商品 `/api/quote` 的內容。

**2026-10-17 正式發布完成：**使用者完成 Vercel 官方登入授權後，已透過 CLI 發布至原 `bychen999 / korea-quote-0908` 專案，正式網址維持 `https://korea-quote-0908.vercel.app`。部署 ID 為 `dpl_CU3veVpyxbxybm6Am8SPirkrEsHW`，發布來源 commit 為 `584478b5ff1546d43fd3d278414a8624bcd703c9`，發布檔 SHA-256 維持 `b3c5747728f113abafbdbd59902b3710eab30d2ef76717920ce1bd05785f7ba1`。

臺灣時間 20:37 的正式站驗證：`/api/health`、`/api/rate`、`/api/quote` 均回 200 與 v21；指定商品實際回 ₩64,000、韓國免運、共享匯率 38、估價 NT$1,819。完整回應與先前部署權限拒絕紀錄保留在 `../releases/acceptance-20261017-21.json`。Browser plugin 缺少原始瀏覽器連線環境，因此本次未執行正式瀏覽器互動驗收；已完成的 35 項 DOM 互動測試、126 項總回歸及正式 API 驗證分別記錄，避免混稱。
