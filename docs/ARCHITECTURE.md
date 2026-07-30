# PoC 架構與後續演進

## 現階段

```text
Word
  └─ inventory_docx.py
       ├─ inventory.json / csv
       └─ generate_schema_drafts.py
             └─ 81 份 needs_review 草稿

人工校對的 5 份 Schema
  └─ PWA 共用渲染引擎
       ├─ IndexedDB
       ├─ 照片 Data URL（PoC）
       ├─ SHA-256 作業性簽認
       ├─ JSON／同步包
       └─ 瀏覽器列印 PDF
```

## 正式系統應替換的邊界

| PoC | 正式版本 |
|---|---|
| IndexedDB 單機 | IndexedDB + 後端同步 API |
| Data URL 照片 | Blob／物件儲存 + 分段上傳 |
| 輸入姓名 | AD／SSO 或廠商作業帳號 |
| 前端 SHA-256 | 後端 canonical payload + 可信時戳 |
| 觸控筆跡 | 過程簽認；最終核可另接 FIDO |
| 匯出待同步包 | idempotent batch sync API |
| 5 份 Schema | Schema Registry + 版本核定流程 |
| browser print | 後端 PDF 樣板套印及封存 |

## 施工單元原則

每一筆表單紀錄必須包含 `construction_unit`。未來後端資料模型應將表單、照片、材料查驗、停留點與核可結果共同掛載至施工單元，而不是只以表單檔名或日期管理。

## Gating 原則

本 PoC 顯示 `hold_point`，但尚未實作跨表單流程阻斷。正式版應由後端狀態機判斷：

```text
前置必檢通過 + 必要過程簽認完成
  → 下一停留點可開啟

任一必檢不合格
  → 自動開缺失單
  → 阻斷下一階段及最終核可

複查合格
  → 解除 Gating
```

## 安全界線

PoC 資料存於瀏覽器裝置；清除網站資料即會刪除。不可將此版作為正式機關紀錄保存系統。
