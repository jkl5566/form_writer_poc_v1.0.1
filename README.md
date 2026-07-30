# form_writer 現場查驗表單 PoC

本專案以CF710監造計畫第七章的表單(檢驗卡)建置為「Schema 驅動、可離線填寫、可作業性簽認」之網頁 PoC。

## 本版完成範圍

- 已對CF710監造計畫0版 `07_第七章_施工抽查程序及標準_應用表單.docx` 進行盤點，確認：83 個 表格、共 81 份表單起點。
- 產出 `generated/form_inventory.json`、`generated/form_inventory.csv`。
- 產出 81 份保守的 Schema 草稿，均標記 `needs_review: true`，不自動臆測工程允收標準。
- 測試完成 5 份人工校對的代表表單：
  1. `T7-01` 鋼板樁施工抽查紀錄表：標準 checklist。
  2. `T7-04-01` 連續壁施工品質抽查紀錄表：多階段主表、施工單元與計價面積原型。
  3. `T7-04-04` 連續壁穩定液抽查表：可重複量測矩陣。
  4. `T7-07` 營建剩餘資源處理抽查表：是／否／不適用矩陣。
  5. `T7-10` 混凝土施工品質抽查表：長型 checklist 與定量判定。
- PWA：Service Worker 快取程式與 5 份 Schema，可重新開啟後離線使用。
- Gating 原型：T7-04-04 簽認前，檢查同一施工單元是否已有 T7-04-01 已簽認紀錄。
- IndexedDB：所有資料先存裝置本機，並標記為待上傳。
- 表單歷史清單、版本建立、舊版本保留。
- 三態抽查：`○ 合格 / ╳ 缺失 / ／ 不適用`。
- 確定性定量規則：如溫度、氯離子、澆置間隔等，可依 min/max 自動建議判定，仍保留人工覆寫軌跡。
- 缺失區塊與本機照片壓縮保存。
- 觸控簽名板、簽署人、時間、GPS、裝置資訊、SHA-256 內容雜湊。
- 第一位人員簽認後即鎖定表單內容；其他必要簽署人仍可繼續簽認。
- 完成必要簽認後，紀錄轉為唯讀；修改須建立新版本。
- 匯出單筆 JSON、匯出待上傳資料包。
- 瀏覽器列印／另存 PDF，以及 Python 結構化 PDF 樣張產製工具。

## 現階段不在本 PoC 範圍

- 正式 AD／SSO。
- FIDO／行動自然人憑證正式核可。
- 正式 PM API、PCCES 匯入與計價。
- 多使用者後端同步、伺服器衝突合併。
- 正式可信時戳與法律層級電子簽章。
- 將全部 81 份草稿直接視為可上線表單。

目前的觸控簽名是「作業性簽認 PoC」，不得宣稱等同正式核可簽章。仍需續後續採FIDO進行雜湊。

---


## 「待上傳」與離線作業的實際含義

- 表單每次修改都先寫入裝置的 IndexedDB，成功後才顯示「已存本機」。
- `sync_state: pending` 代表「本機已有資料、伺服器尚未確認接收」，不是正在背景傳輸。
- 本 PoC 沒有後端同步 API，因此不會自動把 `pending` 改成 `synced`。
- 「匯出待上傳包」只會把所有 `pending` 紀錄包成 JSON 檔，供人工搬移或後續 API 測試；匯出成功仍不代表伺服器已接收，所以狀態不會被清除。
- 正式版應由後端回傳每筆紀錄的接收確認、伺服器版本與時間，前端收到確認後才可標記 `synced`。
- Service Worker 只快取應用程式與 Schema；IndexedDB 保存填寫內容、簽名與照片。兩者用途不同。
- 手機以區網 `http://Mac-IP:8000` 開啟時，通常可在已開啟頁面中斷網繼續填寫，但因非 HTTPS，Service Worker 不會啟用，關閉頁面後不保證能離線重開。

---

## MacBook Air M4 快速啟動

### 1. 啟動網頁 PoC

不需要安裝任何 Python 套件：

```bash
cd form_writer_poc
python3 serve.py
```

或在 Finder 雙擊：

```text
start.command
```

Mac 瀏覽器：

```text
http://localhost:8000/web/
```

手機與 Mac 連同一個 Wi-Fi，再使用終端機顯示的區網網址。

> 不可直接雙擊 `web/index.html`，因瀏覽器會阻擋 `fetch()` 讀取 Schema，Service Worker 也無法正確啟用。

### 手機真正離線重開需要 HTTPS

瀏覽器的 Service Worker 僅允許 `https://` 或本機 `localhost`。因此：

- Mac 上用 `http://localhost:8000` 可完整測試 PWA。
- 手機用 `http://Mac區網IP:8000` 可測試填表與 IndexedDB，但不能保證關閉頁面後離線重新開啟。
- 手機完整 PWA 驗證，建議使用本專案內建的 GitHub Pages workflow，取得正式 HTTPS 網址。

GitHub 儲存庫 Settings → Pages → Source 選擇 **GitHub Actions**，推送到 `main` 後，`.github/workflows/pages.yml` 會自動部署。網站入口為部署網址下的 `/web/`。

也可使用本機可信憑證啟動 HTTPS：

```bash
python3 serve.py --port 8443 --certfile cert.pem --keyfile key.pem
```

憑證須包含 Mac 的區網 IP，且手機必須信任該憑證簽發者；否則 Service Worker 仍不會啟用。

### 2. 安裝成 PWA

- iPhone／iPad Safari：分享 → 加入主畫面。
- Chrome：網址列的安裝圖示，或系統顯示的「安裝」按鈕。
- 首次必須在線載入一次；之後關閉網路仍可開啟已快取的 PoC。

### 3. Word 盤點與 PDF 工具

建立虛擬環境：

```bash
cd form_writer_poc
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

重新盤點 Word：

```bash
python tools/inventory_docx.py \
  "/你的路徑/07_第七章_施工抽查程序及標準_應用表單.docx" \
  --out generated/form_inventory.json
```

產生 Schema 草稿：

```bash
python tools/generate_schema_drafts.py \
  generated/form_inventory.json \
  --out-dir generated/schema_drafts
```

驗證 5 份正式 PoC Schema：

```bash
python tools/validate_schemas.py --schema-dir schema
```

將瀏覽器匯出的 record JSON 產製為 PDF：

```bash
python tools/render_record_pdf.py \
  samples/T7-01_sample_record.json \
  schema/T7-01.json \
  output.pdf
```

PDF 工具會依序尋找 macOS 的 PingFang／STHeiti／Arial Unicode 等字型；不會將字型檔包入本專案。

---

## 目錄

```text
form_writer_poc/
├── web/
│   ├── index.html              單頁 PWA 介面
│   ├── app.js                  Schema 渲染、驗證、簽認、版本流程
│   ├── storage.js              IndexedDB 與 SHA-256
│   ├── sw.js                   離線快取
│   ├── manifest.webmanifest
│   └── icons/
├── schema/
│   ├── catalog.json
│   ├── form.schema.json
│   ├── T7-01.json
│   ├── T7-04-01.json
│   ├── T7-04-04.json
│   ├── T7-07.json
│   └── T7-10.json
├── tools/
│   ├── inventory_docx.py
│   ├── generate_schema_drafts.py
│   ├── validate_schemas.py
│   └── render_record_pdf.py
├── generated/
│   ├── form_inventory.json
│   ├── form_inventory.csv
│   └── schema_drafts/          81 份待人工覆核草稿
├── samples/
│   ├── T7-01_sample_record.json
│   └── T7-01_sample_output.pdf
├── tests/
├── serve.py
├── start.command
├── run_checks.sh
└── requirements.txt
```

---

## 資料與簽認狀態

```text
draft
  ↓ 必填完成
completed
  ↓ 第一位必要人員簽認，內容立即鎖定
partially_signed
  ↓ 其餘必要人員簽認
signed
  ↓ 有修改需求
建立新版本 → 原版 superseded，新版 draft
```

簽名本身不納入被簽內容雜湊；每位簽署人均對同一份表單內容快照簽認。簽名、簽署時間及 GPS 等 metadata 另行保存。

---

## Schema 原則

正式 Schema 與自動草稿嚴格分開：

- `schema/*.json`：人工校對、可在 PoC 中使用。
- `generated/schema_drafts/*.json`：只供批次轉製與人工覆核，不可直接上線。

工程允收標準不由 LLM 或啟發式規則自行發明。自動工具只抽出結構候選；定量值、必檢停留點、公母單元差異及 Gating 必須由工程專業人員確認。

---

## 建議驗收情境

1. 首次開啟後關閉 Wi-Fi，重新開啟 PWA。
2. 建立 T7-01，填寫至一半後關閉瀏覽器，再重新進入確認資料存在。
3. 在 T7-10 輸入混凝土溫度 33℃，確認系統建議為不合格。
4. 選擇缺失，確認出現缺失複查區及照片功能。
5. 完成必填後，進行第一位簽認，確認表單欄位鎖定。
6. 完成第二位簽認，確認紀錄顯示「已簽認鎖定」。
7. 建立新版本，確認原紀錄仍保留。
8. 匯出 JSON 及待上傳包。
9. 使用瀏覽器「列印／存 PDF」，或執行 Python PDF 工具。

---

## 執行自動檢查

```bash
./run_checks.sh
```

檢查內容：

- 5 份正式 Schema 及 catalog 一致性。
- Python 語法。
- JavaScript 語法。
- 若本機有 pytest，執行 inventory 與 schema 測試。
