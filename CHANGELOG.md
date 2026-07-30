# Changelog

## 1.0.0-poc - 2026-07-30

- 建立第七章 Word 表單盤點與 Schema 草稿生產線。
- 辨識 81 份表單，產出 JSON、CSV 與 81 份待覆核草稿。
- 完成 5 份代表 Schema。
- 完成離線 PWA、IndexedDB、本機歷史、照片、簽名雜湊與版本流程。
- 完成 JSON／同步包匯出、瀏覽器列印及 Python PDF 樣張。
- 新增 Schema、Python 與 JavaScript 自動檢查。

## v1.0.1 — 2026-07-30

- 修正手機／平板簽名板無法留下筆跡：先顯示 dialog，再於完成版面配置後初始化 canvas。
- 加入 pointer capture、pointercancel 與舊版 Safari touch/mouse fallback。
- 修正高 DPI canvas 清除方式。
- Service Worker cache 升版至 `form-writer-poc-v1.0.1`，避免持續載入舊版 JavaScript。
- 將介面「待同步」改稱「待上傳」，並明示 PoC 尚無後端 API；匯出 JSON 不等於同步完成。
