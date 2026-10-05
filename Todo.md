# 示範版工作清單

本檔是唯一工作清單。舊詳細清單已保存在私有封存與原始 Git bundle；不將產線校準與現場紀錄複製進示範來源樹。

## 示範整理

- [x] 重建中性示範參數，統一 Recipe、detector ID／名稱／檔名與測試。
- [x] 以人工生成影像驗證 CPU、缺 DLL fallback、嚴格 CUDA 報錯與 GUI 原始碼啟動。
- [x] 封存舊歷史、移出歷史報告及舊 EXE／ZIP，將 18 個舊 GitHub Release 設為草稿。
- [x] 準備單一根提交的私有示範快照及可重複的匯出工具；已驗證匯出為 1 commit／無 remote，來源啟動 smoke 通過。
- [x] 依使用者授權，把現有私有遠端換成中性訊息的根提交並移除 53 個舊標籤；完整備份已驗證。
- [ ] 以 Python 3.12 和完整鎖定套件重新打包並執行 EXE smoke；本機 3.13 與部分依賴版本不符，建置檢查已拒絕執行。

## 公開前仍待確認

- [ ] 取得職務成果歸屬與可公開範圍的書面確認。
- [x] 確認既有取像程式權利人及參考、改寫、散布授權：權利人已同意使用者將該程式用於本專案（2026-10-04 由使用者確認）。
- [ ] 完成 Qt、原廠 SDK 與打包相依元件的散布條件審查。
- [ ] 決定未來 repo 名稱。本次歷史重建已獲使用者授權，目的地為現有私有 repo；未來重寫仍須明確授權。

## Rust 前端重構評估與遷移

已選定 Tauri 2（React 前端 + Rust 宿主）驅動不依賴 Qt 的 Python sidecar（`aoi_sidecar/`，stdio JSON-RPC 協定 v1），沿用 Python 檢測核心與 CUDA ABI v1。桌面版 v0.1.0 已可封裝為 NSIS 安裝檔；PySide6 GUI 以 TileScope AOI Classic 保留至設備整合與驗收完成。

新 GUI 設計原型：[`design_handoff_aoi_gui/`](design_handoff_aoi_gui/README.md)（v2，網頁 GUI → Tauri 2／Rust → Python sidecar）。原型的 Tauri 2、stdio JSON-RPC sidecar 與影像以檔案路徑傳遞的方案已實作；功能以現行 PySide6 GUI 為基準，README 的「功能對等清單」對照現行功能與原型位置。

- [x] 依 `design_handoff_aoi_gui/README.md` 的功能對等清單補齊原型：GPU 預熱、CPU／GPU 對照、批量數據圖表、相機直連監控與原圖保存、結果效能分析與 NG 切換、Recipe 精度與相機 CCD 區段、米輪／Sensor 中繼／存圖／觸發與 Sapera 診斷、`[E-xxxx]` 錯誤碼及其餘輸出選項。
- [x] 盤點現有檢測、結果、Recipe Designer、批次、監控與 CCD 頁面的操作流程，確認第一階段範圍及 OP／工程師權限：見原型 README 功能對等清單；第一階段不含設備控制與相機直連監控。
- [x] 評估 Tauri 2 作為桌面容器與封裝方案（已採用；繁體中文、離線 WebView2 已驗證，高 DPI 待實機確認）：網頁 GUI 加 Rust 宿主；若需求是畫面也由 Rust 實作，再比較 egui／eframe、Slint 等原生 GUI 方案。確認 Windows、繁體中文、高 DPI、離線部署與相依授權條件。
- [x] 評估「網頁 GUI → Tauri／Rust → Python sidecar → CUDA／設備」的串接方式（採子程序 stdio JSON-RPC，協定 v1 定義於 `aoi_sidecar/protocol.py` 與 AGENT.md）；比較子程序 IPC 與直接呼叫方案，定義 Recipe、工作 ID、進度、結果、取消、錯誤及實際 backend 的介面。
- [x] 梳理 GUI workers 與 workflow controllers 的 Qt 相依：檢測、批次、監控、預熱、對照、權限與設定已由 sidecar 以不依賴 Qt 的方式提供（`core/access_control.py`、`aoi_sidecar/`）。
- [ ] 梳理 `CcdController` 的 Qt 相依，把設備流程整理成不依賴 Qt 的介面，保留連線、關閉、取消與資源釋放順序。
- [ ] 驗證大型影像縮放、平移、座標對齊、輪廓疊圖與批次縮圖；評估影像傳輸及快取，避免以 JSON 傳送完整像素，限制佇列與記憶體使用。
- [x] 建立最小原型：合成影像、demo Recipe、單張檢測、PASS／NG、結果顯示及取消；比對現有 CPU 結果，確認缺 CUDA DLL fallback 和嚴格 CUDA 報錯行為（sidecar `--smoke-test` 與真實桌面版 CDP 實測）。
- [x] 分階段移植 Recipe Designer、批次／資料夾監控及結果頁（相機直連監控隨設備整合）；保留參數分組、隱藏參數值與後端權限驗證，規劃現有 QSettings／使用者設定的相容遷移。
- [ ] 最後串接 CCD／光源／取像流程，驗證執行緒、重連、關閉和忙碌時取消；載入 Recipe 不得自行寫入設備，實機驗收另列待辦。
- [x] 評估 Tauri Windows `.msi`／NSIS `setup.exe`、Python sidecar、CUDA DLL／SDK 的佈署與版本對應；確認 WebView2 離線安裝策略，以及無 Python 開發環境、無 GPU／SDK 和中文路徑的執行結果：採 NSIS（每使用者安裝）＋ WebView2 離線安裝；安裝於含中文的使用者路徑後，程式只使用隨附的 `aoi-sidecar.exe`，無 GPU／SDK 下完成單張檢測，正常關閉無殘留程序，靜默解除安裝無殘留。CUDA DLL 隨附與版本對應待 RTX 3090 機台。
- [ ] 訂定新舊 GUI 的行為與效能驗收基準，量測啟動、影像顯示、批次吞吐及記憶體；遷移期間保留現有 GUI，原型結果與使用者確認後再決定正式切換。

參考：[Tauri Windows 封裝](https://v2.tauri.app/distribute/windows-installer/)、[Python 等外部程式的 sidecar 封裝](https://v2.tauri.app/develop/sidecar/)。

## 後續工程

- [ ] 【實物】GPU／設備硬體驗收與長時間穩定性。合成圖、fake backend 和靜態檢查不能勾選此項。
- [ ] 依完整 GPU pipeline 需求繼續候選抽取、輪廓、幾何與統計在 device 的等價驗證。
- [ ] 維持 CPU 正確性參考、完整 detector fallback 與舊 native ABI 相容。

## 完成紀錄

### 2026-10-05 — TileScope AOI 桌面版 v0.1.0、改名與協作設定

- 新增不依賴 Qt 的 Python sidecar（stdio JSON-RPC 協定 v1）：單一工作排程、取消後才回報、權限過濾（未分類參數預設隱藏、工程模式保留內層值與 camera 區段）、預覽、設定與設備可用性探測，以及 `--smoke-test`（CPU 等價、缺 DLL 零 GPU 呼叫回退、嚴格 CUDA 報錯、不載入 Qt）。
- 新增 Tauri 2 桌面版（Rust 宿主 + React 前端）：sidecar 生命週期、非同步命令、重啟世代保護、權限跟隨 sidecar、backend 標示只依結果；以 WebView2 DevTools 實測真實程式的單張檢測、OP 預設模式與關閉後無殘留程序。
- 新增 `packaging/scripts/build_desktop.ps1` 與 `aoi-sidecar.spec`：凍結 sidecar、smoke test、非 ASCII 路徑自動改在 ASCII 目錄建置前端、NSIS 安裝檔含 WebView2 離線安裝。
- 產品改名為 TileScope AOI（PySide6 版為 TileScope AOI Classic）；CUDA DLL 檔名與 ABI、資料格式 ID 不變，`VISIONFLOW_*` 環境變數與舊 QSettings／設定檔保留相容讀取。
- AI 協作設定（skills、subagent、MCP、CLAUDE.md、HERMES.md）納入版控並依新架構重寫，新增 `aoi-desktop-development` 與週報修內文模式；模式密碼可由 `TILESCOPE_MODE_PASSWORDS_FILE` 覆寫。
- 授權改為 PolyForm Noncommercial 1.0.0；README、AGENT.md、第三方授權說明依新架構重寫。
- sidecar 容忍 stdin 行首 UTF-8 BOM（Windows PowerShell 5.1 主控台預設會加），建置腳本的協定自檢改以無 BOM 寫入並讀到兩個回應為止。
- 安裝檔 `TileScope-AOI-0.1.0-setup.exe`（263 MB）：建置時凍結 sidecar smoke 5/5、stdio 協定自檢通過；實際靜默安裝、以 DevTools 驗證 OP 預設模式與單張檢測、正常關閉無殘留、靜默解除安裝無殘留。
- 驗證：`unittest discover -s tests` 共 1306 項通過；compileall、CUDA 靜態 preflight、sidecar smoke、Classic GUI offscreen、`cargo test`／`cargo clippy` 與 `git diff --check` 通過。無 GPU，未做 CUDA 編譯或實機驗收；設備控制尚未移入桌面版。

### 2026-10-04 — 取像程式來源同意紀錄

- 使用者確認既有 C# 取像程式的權利人已同意其將該程式用於本專案；更新來源紀錄、散布政策、README、AGENT 契約、設備參數說明與 `devices/ccd_models.py` 註解。
- `distribution-policy.json` 移除 `legacy-acquisition-source-permission`；職務成果歸屬與 SDK／相依元件散布審查仍待確認，公開散布維持禁止。
- 驗證：`unittest discover -s tests` 共 1270 項通過；`git diff --check` 通過。

### 2026-10-04 — v2 GUI 原型補齊

- 依功能對等清單補齊原型：GPU 預熱、CPU／GPU 對照、批量數據圖表畫面、相機直連監控（佇列丟棄、原圖錯誤、散佈圖）、結果 NG 切換與效能分析、Recipe 精度／三段後端政策／相機 CCD 區段、設備頁米輪／Sensor 中繼／RS-232 光源／觸發與 Sapera 診斷／Extension Compare 與錯誤碼、設定抽屜輸出選項。
- 示範 Recipe 的後端設定改為 `auto`，原型的後端政策與 `gpu.mode` 語意一致。
- 驗證：以本機靜態伺服器載入 `AOI Console.html`，逐一開啟七個畫面與相機直連分支，瀏覽器 console 無錯誤。只修改設計原型，未修改應用程式碼。

### 2026-10-04 — 新 GUI 設計原型納入

- 將 v2 設計原型（`AOI Console.html`、`app/` React 原型與交接 README）放入 `design_handoff_aoi_gui/`，取代先前留下的空資料夾；示範資料僅含 demo1–demo12、DEMO Recipe 與合成影像。
- 修正交接 README 與現行契約的衝突：backend 規則改回 `gpu.mode` 的 cpu／auto／cuda 語意（`cuda` 不得回退 CPU）、相機設定只在連線時寫入、OP 不得開啟設備頁、參數分組以 `parameter_group` 為準。
- 依現行 `gui/` 補入原型沒畫到的功能需求：GPU 預熱、CPU／GPU 對照、批量數據圖表、相機直連監控、效能分析、Recipe 相機 CCD 區段、米輪／Sensor 中繼／光源／診斷、設備錯誤碼與輸出選項，並新增功能對等清單與對應待辦。
- 只更新設計文件與 Todo，未修改應用程式碼，也未開始 Rust／Tauri 實作。

### 2026-10-04 — 私有示範整理

- 改為 demo1–demo12；demo13 為未註冊基底。隨附 Recipe 使用合成圖的中性設定，不含 camera 校準或舊別名。
- 完整 unittest：1219 項通過（44.971 秒）；compileall、CUDA preflight、人工圖 CLI 和原始碼 launcher smoke 通過。
- 兩套發布腳本在來源待審查時會於網路存取前拒絕執行；收集 10 個 runtime 套件的 license evidence。
- 原始歷史 bundle、歷史文件與舊本機包保存在外部私有封存。現有遠端歷史及標籤仍保留且維持私有，未重寫遠端。
- 匯出工具只取已提交來源樹，排除歷史文件、個人 agent 設定及未追蹤文件；私有快照不帶 Git 父歷史或遠端設定。
- 沒有宣稱 EXE、原生 CUDA 或設備實機驗收完成。公開前來源權利待確認；repo 改名與 Rust GUI 尚未開始。

### 2026-10-04 — 取像參考名稱整理

- 註解、測試命名與診斷介面改用中性代稱；保留他人 C# 取像程式來源及授權待確認的紀錄。
- 本次未重新實作取像層，未改成使用者獨立創作；原始來源對照仍由私有封存保存。
- 完整 unittest 1219 項通過（56.900 秒）；compileall、CUDA 靜態 preflight、原始碼 GUI launcher smoke 與差異檢查通過。設備控制流程與授權待審政策未變更。

### 2026-10-04 — 私有遠端歷史重建

- 使用者明確授權修改提交訊息及移除遠端舊歷史，並說明 repo 只有本人使用。
- 完整 Git bundle、遠端 ref 清單和 Release 資訊先另行私有封存；備份驗證通過。
- 以 `Initialize AOI demo baseline` 作為唯一根提交；原子推送替換 main 並移除 53 個舊標籤，保留私有 Release 草稿。
- 目前來源不追蹤個人 agent 設定／產物地圖；原檔仍留在本機，加入 ignore 避免帶回遠端。
- 獨立候選目錄完整 unittest 1219 項通過（45.470 秒）；compileall、CUDA preflight 與來源 launcher smoke 通過。修正光源測試等待 Qt 狀態更新的競態，設備實作未變更。
- 已驗證分支／標籤可達歷史的替換；GitHub 舊 SHA 快取、Actions 或舊複本的清除不由 Git force-push 保證。來源權利與公開政策維持待確認。

### 2026-10-04 — Rust 前端規劃

- 已新增 Rust 前端重構的評估與分階段遷移待辦，納入 Tauri 桌面封裝、Python sidecar、影像顯示、設備生命週期及驗收方式。
- 框架選型、原型、實作與 Windows 安裝包驗收仍待完成；本次只修改工作清單。
- 驗證：`unittest discover -s tests -v` 共 1219 項通過（45.143 秒）；`compileall main.py gui_launcher.py tools contour_preprocess_tool core detectors devices gui gpu`、`gpu/preflight_cuda_build.py` 與 `git diff --check` 通過。未進行 CUDA 編譯或設備實機驗收。
