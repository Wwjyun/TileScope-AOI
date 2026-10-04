# Handoff: AOI Demo Console v2（網頁 GUI → Tauri 2／Rust → Python sidecar → CUDA）

## 概要
v2 是**新 GUI 的設計原型**，取代 v1 的 PySide6 交接。GUI 改為網頁前端，由 Tauri 2（Rust 宿主）封裝，檢測核心沿用 Python（`core/`、`detectors/`、`devices/`），以 sidecar 程序執行；CUDA 走既有 `gpu/visionflow_cuda.dll` ABI。所有示範資料皆中性：detector `demo1–demo12`、Recipe `DEMO*.yaml`、合成影像，不含產品、機台或現場校準。

- `AOI Console.html` 是高擬真互動原型，定義**視覺語言、資訊架構與互動方式**。React 元件可作為 Tauri 前端的起點，但模擬計時器要換成真正的 `invoke` / event 呼叫。
- **功能以現行 PySide6 GUI（`gui/`）為基準**。原型沒畫到、但現行 GUI 已有的功能，移植時仍要保留，並依本文件放進對應的 v2 畫面；完整對照見「功能對等清單」。
- 本文件與 `AGENT.md` 的 CPU/GPU、設備、權限契約衝突時，以 `AGENT.md` 為準。
- 本資料夾只是設計參考；正式行為仍在 `gui/`。開始 Rust／Tauri 實作前需使用者明確指示。

## 分層
```
WebView2 GUI (React)  ──invoke/listen──▶  Rust host (Tauri 2)  ──stdio JSON-RPC──▶  Python sidecar  ──ctypes──▶  CUDA DLL / 設備 SDK
  只送指令、收事件              佇列、取消、檔案/影像快取            aoi-core（無 Qt 相依）
```
- GUI 不處理像素。影像、overlay、縮圖、相機預覽由 sidecar 寫入暫存檔（或共享記憶體），Rust 回傳路徑，前端用 `convertFileSrc()`（asset protocol）載入。**不可用 JSON 傳完整像素。** 大型影像沿用現行 `gui/image_pyramid.py` 的金字塔縮放策略，overlay 座標一律是原圖像素座標。
- Rust 負責：sidecar 生命週期（啟動、健康檢查、重新啟動）、工作佇列（上限 4）、取消、監控資料夾 watcher、縮圖快取（LRU，預設 1024 MB）。
- Sidecar 負責：檢測 pipeline、`GpuExecutionSession`（批次與監控共用一個，不可每張影像或每個 worker 各建一個）、`CcdController` 等設備生命週期、Recipe 驗證、權限與內層參數過濾。GPU 工作維持單一序列化路徑。
- 由 Rust 啟動 sidecar：`tauri-plugin-shell` sidecar（`bin/aoi-sidecar.exe`，以 PyInstaller 打包，需配合 Python 3.12 鎖定版本）。
- 缺 CUDA DLL、Sapera LT、pythonnet、`LSI8181_64.dll`、DAQNavi 或硬體時，sidecar 與 GUI 仍要正常啟動；相關畫面顯示原因。

## IPC 契約（建議）
Commands（GUI → Rust）：
| command | 參數 | 回傳 |
|---|---|---|
| `runtime_status` | — | `{sidecar: ready\|offline, pid, core_version, backend: cuda\|cpu\|none, dll: loaded\|missing\|old, devices{camera, meter_wheel, sensor_relay, light}}` |
| `restart_sidecar` | — | `runtime_status`；工作或取像進行中時拒絕 |
| `load_recipe` | `path` | `Recipe`（含 gpu、decision、tile、detectors、選用的 `camera`）；**不寫入設備、不重新連線** |
| `save_recipe` | `Recipe` | `path`（由 sidecar 依 `parameter_schema` 驗證；工程模式儲存時保留隱藏的內層參數與 `camera` 區段原值） |
| `start_job` | `{image_path, recipe_path, output_opts}` | `{job_id}` |
| `start_batch` | `{folder, recipe_path, recursive}` | `{batch_id}` |
| `cancel_job` | `job_id` / `batch_id` | `ok`（批次會在目前影像完成後停止後續項目） |
| `gpu_warmup` | `{recipe_path, image_path?}` | `{job_id}`；完成事件帶 session_ms / pipeline_ms / 已配置 VRAM |
| `backend_compare` | `{image_path, recipe_path}` | `{job_id}`；完成事件帶 CPU／GPU 兩份結果與差異 |
| `monitor_start` / `monitor_stop` | `{source: folder\|camera, folder?, move_to?, save_originals}` | `ok`；`camera` 來源時依「相機直連監控」規則連線 |
| `preview_tiles` | `{image_path, tile}` | `{count, thumb_paths[]}` |
| `switch_mode` | `{mode, password}` | `{mode}` |
| `device_*` | 見「設備」畫面 | 各自狀態；失敗必帶 `[E-xxxx]` 錯誤碼 |

Events（Rust → GUI）：
- `job://progress` `{job_id, stage, pct}`：stage = `load_image | init_backend | tiling | detect | aggregate | write_outputs | done`
- `job://completed` `{job_id, final, summary{tile_count, ng_count, defect_count}, defects[], dur_ms, backend, backend_reason?, performance{stages, detector_stages, device_split, transfer_memory, notices[]}, outputs{overlay, csv, json, matrix_csv?, ng_tiles_dir?}}`
- `job://failed` `{job_id, code, stage, message}`，例如 `CUDA_DLL_NOT_FOUND`
- `job://cancelled` `{job_id}`：要在資源釋放後才送出
- `batch://item` / `monitor://item`：每張影像各送一次；監控項目另帶 `raw_image_path`、`raw_image_error`、`source`（folder／camera）
- `monitor://stopped` `{processed, dropped}`：相機直連時回報因佇列已滿未檢測的張數
- `device://status`、`device://frame`（預覽影像路徑，可丟棄較舊畫格）、`device://notice`（含錯誤碼）
- `runtime://status`：sidecar、backend 或設備可用性變化時送出

### Backend 規則（沿用現行 `gpu.mode` 語意，要和現行 CPU 結果比對）
| Recipe | 缺 DLL／CUDA 初始化失敗／kernel 錯誤／OOM | UI |
|---|---|---|
| `gpu.mode: cpu`（僅 CPU） | 不請求、不載入 CUDA | 灰色「CPU」 |
| `gpu.mode: auto` + `fallback_to_cpu: true`（GPU 優先，失敗改用 CPU） | **整個 detector** 重跑 CPU，結果帶 `backend: "cpu"` 與 `backend_reason` | 琥珀色「CPU fallback」，原因放 tooltip 與效能分析 |
| `gpu.mode: cuda`（僅 GPU，嚴格） | 送 `job://failed`，不產生結果；`fallback_to_cpu` 一律視為 false | 紅色「CUDA 不可用」 |

- `auto` + `fallback_to_cpu: false` 等同嚴格模式；Designer 顯示提示，未變更時原樣保存（同現行 `designer_panels.py`）。
- 實際是否用 GPU 還取決於各 detector 的 `use_gpu`。不可把 GPU 中間結果與 CPU 接續混用。
- 每筆結果都要回報實際使用的 backend；Backend pill 只能依結果或 `runtime_status`，不可依 Recipe 推論。

## 畫面
左側 rail：單張檢測、批次、監控、結果、批量數據圖表；分隔線下方是 Recipe 設計、設備（CCD 控制）。左下角是設定。頂部是自訂標題列（`decorations: false`，加 `data-tauri-drag-region`）。視窗大小、最後畫面、各分割比例與工作路徑要記憶（對應現行 `GuiPreferences`／QSettings），過期路徑安全忽略。

1. **單張檢測**：沿用 v1 版面。控制面板有工作 ID、執行中的「取消」鈕（danger）、結果卡上的 backend badge、失敗卡（code / message / stage），以及 sidecar 事件紀錄（mono 11px）。
   - 現行功能要保留：「GPU 預熱」（背景建立 CUDA context，可直接開始檢測）、「CPU／GPU 對照」（同圖兩種 backend 比對結果）、VRAM 不足效能提醒、本批紀錄。
   - Viewer：滾輪以游標為中心縮放、拖曳平移、符合視窗、overlay 切換、游標影像座標；大量 overlay 以一次批次更新，切換或縮放視窗不得殘影。
2. **批次**：來源 chip（含「包含子資料夾」）、Recipe chip、進度 n/total、開始／取消；6 張統計卡（已完成、PASS 率、NG 張數、Tile PASS 率、平均缺陷、吞吐）；影像表（等待／執行中／PASS／NG／ERROR／取消），右側為詳情，縮圖由 Rust 快取。完成時顯示總數、PASS、NG、ERR、取消。
3. **批量數據圖表**（現行 `batch_dashboard_screen.py`）：結果分布、缺陷數最高影像、批量影像資料表、所選影像明細、所選影像切圖散佈圖。散佈資料過大時以決定性方式抽樣。可和批次合併為同一畫面的分頁，但功能不可少。
4. **監控**：來源切換「監控資料夾｜相機直連」。
   - 資料夾：選擇資料夾、處理後搬移至（可不搬）、啟動／停止。
   - 相機直連：顯示相機狀態與觸發模式；只檢測觸發模式連線的畫格。按「啟動」時若相機未連線或 Recipe 相機設定與已寫入的不同，先依 Recipe 連線／重連（軟體觸發時一併連線米輪），有啟用光源則先開燈；停止時關燈。停止不會中斷正在取像的畫格。
   - 畫格經有上限的佇列（`CameraFrameQueue`）交給檢測；無法排入的畫格以 ERROR 列出，停止時回報「另有 n 張因檢測佇列已滿未檢測」。
   - 4 張計數卡（已處理、PASS、NG、ERROR）、最新影像（LIVE 標記）、處理紀錄表（全部／PASS／NG／ERROR 篩選、端到端耗時、右鍵開啟原圖）、監控序列散佈圖、所選影像切圖散佈圖。
   - 沒保存到原圖時，該列顯示 `raw_image_error` 並計入存圖失敗。
5. **結果**：沿用 v1，摘要列有「Job · Backend」卡；輸出路徑依影像檔名產生。保留上一個／下一個 NG（K／J 鍵）、detector 篩選、NG 切圖縮圖牆（分批建立，不卡住完成畫面）、輸出檔案清單，以及可展開的「效能分析」：實際後端、fallback 原因、總耗時、各階段、Detector 子階段、GPU／CPU 分工、傳輸與記憶體、注意事項。結果頁未開啟時延後填表。
6. **Recipe 設計**：
   - Recipe 資訊：名稱、產品、機台、版本、精度（µm/px，未填則 CSV 面積保持 px²）。
   - 切圖：Pattern Match／Grid／Contour 三種模式及其參數（Contour 含 Global／Otsu／Adaptive mean／Adaptive gaussian 閾值方法），附切圖預覽。
   - 「運算後端」面板：僅 CPU／GPU 優先失敗改用 CPU／僅 GPU（嚴格）三選一，嚴格時顯示警告；GPU 進階設定（切小圖使用 GPU、CUDA DLL 路徑）。Detector 清單標示是否支援 CUDA，詳情頁提供 `use_gpu` 開關。
   - 「相機 CCD」面板（Recipe 選用的 `camera` 區段，僅管理模式可編輯）：包含相機設定、曝光時間、增益、影像長度（線）、線速率、觸發模式、外部觸發單張、觸發時寫入 Compare、同時寫入 Encoder、外部單張／軟體觸發自動存圖。沒有 `camera` 區段的 Recipe 不得改變相機設定；設備頁的套用會變成 Designer 的未儲存修改。
   - 未儲存修改要納入 dirty 追蹤；程式載入不得產生假 dirty；離開或關閉時確認是否捨棄。底部附註說明參數由 sidecar 驗證，OP 帳號不會收到隱藏參數值。
7. **設備（CCD 控制，僅工程／管理模式）**：上方橫幅說明「載入 Recipe 不會寫入設備；忙碌中的取像會先取消再中斷連線；實機驗收另列待辦」。依現行 `ccd_screen.py`，至少包含：
   - **設備自檢**：依序檢查相機、光源、觸發與 I/O，不變更設備設定。
   - **相機連線**與**相機設定**：連線／中斷、觸發模式（連續取像 Free Run／外部觸發／軟體觸發）、曝光、增益、長度、線速率等。**相機設定只在連線時寫入**；連線中按套用會自動重連並恢復預覽，取像中或相機監控中只標記「待重連」。
   - **即時影像**預覽與**相機狀態**；預覽可丟棄較舊畫格。
   - **存圖**：快照與依觸發自動存圖規則。
   - **米輪（LSI-8181）**：卡片 ID、DLL 路徑、CMP_OUT 寬度與極性（機台層級，由授權設備人員填寫；寬度為 0 時軟體觸發拒絕開始）、計數與 compare 狀態。取像中若重新設定 compare 或切換反轉方向，要回報變更內容。
   - **Sensor 中繼（PCIe-1730）**：DI／DO 的 port、bit、低態有效；預設關閉，不可與機台原 I/O 程式同時執行；只在執行期間佔用板卡。
   - **光源（RS-232）**：品牌中立；各通道亮度滑桿，變更後標示「未套用」，需按「套用到設備」才寫入；開／關燈與測試指令。
   - **外部觸發診斷**、**引導式觸發檢查**、**Sapera 診斷**（含 Sapera LT 路徑設定）。
   - 管理模式另有：**從原機台程式匯入**（逐項核對後才套用，不自動寫入設備）、**Extension Compare（CMP0–CMP7）**。
   - 所有操作員看得到的設備錯誤都帶 `devices/error_codes.py` 的 `[E-xxxx]`（見 `docs/device-error-codes.md`），診斷結尾附一行可回報的短訊息。

全域元件：
- **Backend pill**（topbar 右側）：狀態點（綠 CUDA／琥珀 CPU fallback／紅 錯誤或離線／灰 CPU）+ 標籤。點擊開啟「執行環境」抽屜，抽屜內以四段鏈（GUI → Rust → sidecar → Backend）顯示各段狀態，並提供重新啟動 sidecar 與開啟 log。
- **通知**：可恢復的回饋用頁內通知（info／success／warning／error）；只有被擋下的操作、破壞性選擇、未儲存確認與背景工作中的關閉防護才用對話框。狀態不能只靠顏色表達，鍵盤操作路徑要可用。
- **狀態列**：只放短事件；右側顯示 sidecar 狀態點、機台名與目前模式（如 `DEMO_MACHINE · 工程模式`）。
- **設定抽屜**：輸出目錄與輸出選項（儲存 overlay、儲存 NG tiles、NG tiles 依 defect 分資料夾、輸出 CSV、輸出矩陣 CSV、輸出 JSON）、相機直連保存原圖（預設開啟，監控中不可改，存到本次分析目錄的 `origin/`）；機台區（Machine ID、Pipeline 版本，唯讀）。工程師另有 Backend 政策、DLL 與 sidecar 路徑、快取上限；並附 QSettings 匯入提示。

## 權限（對應 `gui/permission_manager.py`）
三種模式：`op`（OP 模式）、`eng`（工程模式）、`admin`（管理模式）。切到 eng 或 admin 時需輸入密碼，切回 op 不需要；密碼錯誤時權限不變並顯示通知。
- **op**：只顯示「監控」，隱藏設定，監控來源不可修改，不能開啟設備頁，也沒有 detector 編輯權限。目前不在監控頁時自動跳到監控頁。
- **eng**：可進入所有畫面。Recipe 設計只顯示外層（`outer`）參數，並提示另有幾個內層參數；設備頁只開放明確登記給工程師的控制項（fail-closed，對應 `AccessGate`）。
- **admin**：Recipe 設計再顯示內層（`inner`）參數與相機 CCD 區段，demo12 另顯示模型資訊；設備頁多出從原機台程式匯入與 Extension Compare；設定抽屜多一區執行環境管理。
- 參數分組以 `ParameterSpec.parameter_group` 為準，前端不可依參數名稱推論；未分類一律視為 `inner`。
- 側邊欄的模式切換為 OP / 工程 / 管理三段。eng 與 admin 鈕帶鎖頭圖示，點擊後跳出密碼對話框。
- `switch_mode {mode, password}` → `{mode}`。密碼以 hmac 比對，必須在 sidecar 或 Rust 端執行；非 admin 時，sidecar 不回傳內層參數值。前端隱藏只算是 UX。模式切換不得產生假 dirty。

## 功能對等清單
| 現行 PySide6 功能（`gui/`） | v2 位置 | 原型狀態 |
|---|---|---|
| 單張檢測、本批紀錄、結果卡 | 單張檢測 | 已有 |
| GPU 預熱、CPU／GPU 對照 | 單張檢測控制面板 | 已補 |
| 批量檢測（含子資料夾、取消） | 批次 | 已有 |
| 批量數據圖表（分布、Top 缺陷、散佈圖） | 批量數據圖表 | 已補 |
| 資料夾監控、搬移 | 監控 | 已有 |
| 相機直連監控、佇列丟棄回報、原圖保存 | 監控 | 已補 |
| 監控散佈圖、狀態篩選、開啟原圖 | 監控 | 已補 |
| 結果：缺陷表、NG 切圖、輸出檔案、Job · Backend | 結果 | 已有 |
| 結果：上一個／下一個 NG、效能分析 | 結果 | 已補 |
| Recipe 資訊、切圖三模式、切圖預覽、Detector 參數 | Recipe 設計 | 已有 |
| 精度 µm/px、GPU 進階設定、相機 CCD 區段 | Recipe 設計 | 已補 |
| 相機連線／設定／預覽、光源 | 設備 | 已有 |
| 設備自檢、從原機台程式匯入 | 設備 | 已有 |
| 存圖、米輪 CMP_OUT、Sensor 中繼、Extension Compare | 設備 | 已補 |
| 外部觸發診斷、引導式觸發檢查、Sapera 診斷 | 設備 | 已補 |
| `[E-xxxx]` 設備錯誤碼 | 全域通知／設備 | 已補 |
| 輸出選項、相機直連保存原圖 | 設定抽屜 | 已補 |
| 三段權限、密碼對話框 | 側邊欄 | 已有 |

## Design Tokens
與 v1 相同（`app/tokens.css`）：accent `#0d9488`、pass `#1a9e54`、ng `#d6453d`、warn `#c98a16` / `#faf2df`；IBM Plex Sans + Noto Sans TC + IBM Plex Mono；圓角 4/6/10；控件高 32/40/26；面板 padding 16。新增樣式在 `app/ui.css`：`.titlebar`、`.rt-pill`、`.dot`、`.chain-*`、`.banner`、`.btn-danger`、`.badge-warn`、`.kv`、`.event-log`、`.stat-grid`。

## 部署注意（摘自 Todo）
- 安裝包選 NSIS `setup.exe` 或 `.msi`，並內含 WebView2 離線安裝方案。
- 需驗證：沒有 Python、沒有 GPU 或 SDK、中文路徑等環境。
- 遷移期間保留舊 GUI，以驗收基準比對（啟動時間、影像顯示、批次吞吐、記憶體）。
- 設備參數指南與錯誤碼文件（`DEVICE_PARAMETER_GUIDE.md`、`ERROR_CODES.md`）要隨安裝包附上，欄位名稱與設備頁一致。

## 檔案
- `AOI Console.html`：入口
- `app/runtime.jsx`：標題列、Backend pill、執行環境抽屜
- `app/screen-run.jsx`、`screen-batch.jsx`（批次 + 監控）、`screen-results.jsx`、`screen-designer.jsx`、`screen-devices.jsx`
- `app/main.jsx`：shell、工作狀態機（start / progress / completed / failed / cancelled）
- `app/data.js`：中性模擬資料與執行環境模擬（其中 `gpu: {mode: "cuda", fallback_to_cpu: true}` 的示範組合依上表屬嚴格模式，移植時改用 `auto`）
- `app/tweaks-panel.jsx`：原型專用（可切換 CUDA／fallback／嚴格報錯／離線），**不需移植**
