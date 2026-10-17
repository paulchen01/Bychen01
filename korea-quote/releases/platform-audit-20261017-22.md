# 韓國廢廢豬：跨平台自動報價抽測

日期：2026-10-17（臺灣時間）。正式站：https://korea-quote-0908.vercel.app

狀態：v21 初輪正式抽測完成；v22 修正已通過本機 193 項測試，待正式發布後複測。

## 實際抽測結果

初輪共 12 次正式 `/api/quote` 請求，涵蓋全部 8 個支援平台。以下金額使用當時共享匯率 38 與既有代購費規則；所有金額都是初步估價，國際運費另計，未知的平台費與運費會明列未計入。

| 平台 | 實際樣本 | 初輪結果 | 修正或限制 |
| --- | --- | --- | --- |
| Bunjang | [386933481](https://m.bunjang.co.kr/products/386933481) | ₩64,000、韓國免運，NT$1,819 | 原使用者商品作為控制樣本，正常 |
| FruitsFamily | [6x0ik](https://fruitsfamily.com/product/6x0ik/beams-military-m65-jacket) | ₩145,000，NT$4,007 | 韓國運費未公開，明確排除 |
| Zigzag | [125508991](https://zigzag.kr/catalog/products/125508991) | ₩25,600、韓國免運，NT$728 | 未使用 ₩24,600 券後價；修正已驗證的 `/p/` 分享網址 |
| Musinsa | [4838210](https://www.musinsa.com/products/4838210) | ₩23,700，NT$674 | 韓國運費未知；另一首購活動商品回 `UNAVAILABLE_PRODUCT`、沒有報價 |
| Olive Young | [A000000165177](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000165177) | ₩23,500、韓國免運，NT$669 | 一般商品正常 |
| Olive Young | [A000000260412](https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000260412) | 舊版誤用原價，NT$768 | 已修正一般折扣；預期為 ₩17,500＋境內運費 ₩2,500 → NT$577，正式待複測 |
| Naver Smart Store／Brand Store | [Smart Store](https://smartstore.naver.com/deco-deco/products/13749878148)、[LEGO Brand Store](https://brand.naver.com/legokorea/products/10348072356) | 兩筆皆沒有報價 | 正式站取得上游 HTTP 429；不能列為自動查價成功 |
| Pocamarket | [247060](https://pocamarket.com/zh-tw/search/detail/247060) | 兩種網址皆沒有報價 | 國際版公開價 USD 2.50，沒有可驗證的韓國原價；修正 `zh-tw` 路徑辨識後仍須確認 |
| X／Twitter | [hellolive 公開售票公告](https://x.com/hellolivetv/status/1910256553699262759) | 官方 oEmbed 301 造成讀取失敗 | 已修正官方轉址；此貼文本身沒有單一明確韓幣售價，應維持需確認 |

這是具體樣本抽測，不能推論同平台所有商品皆可報價。X 的單一售價成功案例屬明確標記的合成測試，不是已取得的公開商品實價。

## 本次確認並修正的問題

Olive Young 的實際價格明細為原价 ₩27,000、一般折扣 ₩9,500、優惠券 ₩600。公開一般售價為 ₩17,500；₩16,900 是需要領券的最優惠價。一般配送費為 ₩2,500，滿 ₩20,000 免運，因此這筆要加運費。新的 parser 僅採用可核對的一般折扣；會員、首購、指定付款或格式無法核對的折扣不會被當成通用售價。真實 reader 摘要另以官方主商品 state 的 `promotionSalePrice` 核對。

Zigzag 的 `/p/125508991` 已直接觀測到 HTTP 308、`Location: /catalog/products/125508991`。Pocamarket 舊商品網址已觀測到轉至 `/zh-tw/search/detail/247060`；新路徑保留語系與 global 商品識別，避免正常化造成循環或把全球站誤認為韓國站。

X 的舊 `publish.twitter.com/oembed` 會轉至官方 `publish.x.com/oembed`。新 loader 逐跳核對 HTTPS、官方主機、oEmbed 路徑與同一貼文 ID，最多三次轉址。最終貼文內容仍由既有 parser 檢查；無售價、多款、圖片價格或無法確認的內容不產生報價。

## 尚未解決的限制

Naver 的正式兩筆查詢遭平台限流。另一次獨立取得的官方 Brand Store 公開 HTML 有 `window.__PRELOADED_STATE__.simpleProductForDetailPage`，沒有現有 parser 所讀取的 JSON-LD，這是另一個已確認的格式缺口。離線讀到售價不等於正式報價成功，本版未新增該 parser，也未繞過平台限制。

Pocamarket 國際商品的美元金額與網站顯示的台幣近似值都不能作為韓國採購價；本輪沒有取得可核對的同款韓國商品。修正網址辨識不會解除韓國原價驗證要求。

## 驗證與可追溯性

- 本機 `npm test`：193 項通過、0 項失敗，其中 35 項為實際 app.js／HTML 的 DOM 互動測試。
- 既有匯率來源、代購費級距、平台費、運費揭露與 Bunjang 解析程式均核對為與 v21 相同。
- v22 發布快照以既有 v21 的 SHA-256 為基準，只允許本輪必要檔案變動。
- 正式 API 抽測與 DOM 測試分開記錄。Browser plugin 缺少原始瀏覽器連線環境，因此未宣稱完成正式瀏覽器互動驗收。
- 完整正式回應、時間戳、預期修正與後續發布驗證欄位見 [platform-audit-20261017-22.json](platform-audit-20261017-22.json)。
