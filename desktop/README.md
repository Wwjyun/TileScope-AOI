# TileScope AOI Desktop

Tauri 2 桌面外殼：Rust 宿主 + React 前端，透過 stdio JSON-RPC 呼叫 Python sidecar
（`python -m aoi_sidecar`，與本資料夾平行開發）。檢測核心沿用 `core/`、`detectors/`、
`devices/`；CUDA 走既有 `gpu/visionflow_cuda.dll` ABI。

- 前端：React 18 + Vite（ES modules），視覺與互動沿用 `design_handoff_aoi_gui/` 原型。
- 宿主：Tauri 2，管理 sidecar 生命週期、事件匯流排、asset protocol 範圍。
- 在沒有 GPU、沒有相機 SDK 的機器上仍可正常啟動，相關畫面顯示原因。

## 前置需求

- Node 23 + npm 10
- Rust 1.99（`$HOME/.cargo/bin` 加入 PATH）
- MSVC 14.42 / Windows SDK / WebView2 runtime
- 無 NVIDIA GPU 亦可（sidecar 會回報 CUDA DLL 缺失並回退 CPU）

## 開發（純瀏覽器檢視前端）

前端內建模擬後端（`src/api/mock.js`，資料源自 `src/data/catalog.js`），在未執行於
Tauri 環境時自動啟用，可用 `npm run dev` 在一般瀏覽器檢視所有畫面，無需 sidecar。

```powershell
cd desktop
npm install
npm run dev      # http://localhost:5173
```

## 開發（完整桌面應用）

```powershell
cd desktop
npm install
npm run tauri dev
```

sidecar 啟動解析順序：

1. 環境變數 `AOI_SIDECAR_EXE`（exe 路徑，不帶參數）
2. 打包後：`<resource_dir>/sidecar/aoi-sidecar.exe`
3. 開發：`<repo>/env/Scripts/python.exe -m aoi_sidecar`（cwd = repo 根，可用
   `AOI_REPO_ROOT` 覆寫；repo 預設為 `src-tauri/../..`，編譯期寫入）

sidecar 的 stdout 為 UTF-8 NDJSON（JSON-RPC 2.0），stderr 寫入
`%LOCALAPPDATA%\TileScopeAOI\logs\sidecar.log`，宿主 log 為同目錄 `desktop.log`。

## 建置

```powershell
cd desktop
npm ci
npm run build                      # 前端產出 dist/
cd src-tauri
cargo build                        # debug
cargo test
cargo clippy
cd ..
npx tauri build --debug --no-bundle   # 產出 TileScope AOI.exe（跳過打包）
```

安裝包（NSIS）會在 `sidecar/` 資料夾有 PyInstaller onedir 時打包；目前為空
（僅 `.gitkeep`），因此 bundle 步驟可略過。WebView2 離線安裝檔不會在此環境下載。

## 權限

- `op`：僅監控畫面（自動導航），隱藏設定。
- `eng`：所有畫面；Recipe 設計僅外層（`outer`）參數，內層參數值由 sidecar 保留。
- `admin`：Recipe 設計再顯示內層（`inner`）參數與相機 CCD 區段。

密碼以 hmac 於 sidecar 端比對（示範：工程 `1234`、管理 `5678`）。參數分組以
`parameter_group` 為準，前端不依參數名稱推論。

## 畫面

單張檢測（GPU 預熱、CPU／GPU 對照、事件紀錄）、批次檢測、批量數據圖表、資料夾監控、
檢測結果（缺陷表、NG tiles、效能分析）、Recipe 設計、設備（僅顯示可用性，控制項停用）、
設定抽屜。
