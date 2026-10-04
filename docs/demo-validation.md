# 示範整理驗證 — 2026-10-04

所有輸入為人工生成圖形或測試自行建立的陣列；本次未以公司影像校準示範參數。

| 檢查 | 結果 |
| --- | --- |
| `python -m unittest discover -s tests -v` | 1219 項通過，44.971 秒 |
| `python -m compileall -q main.py gui_launcher.py tools contour_preprocess_tool core detectors devices gui gpu` | 通過 |
| `python gpu/preflight_cuda_build.py` | 通過；僅來源／ABI 靜態契約 |
| `python tools/demo_dataset.py --output outputs_validation/demo_dataset` | 產生 5 張人工圖 |
| `python main.py --image outputs_validation/demo_dataset/shapes.png --recipe recipes/DEMO3.yaml --output outputs_validation/demo_cli` | 預期 NG，exit 2，1 tile／4 defects；產出報表 |
| `python gui_launcher.py --smoke-test` | exit 0；MainWindow、Recipe、CPU、缺 DLL 同結果且零 GPU calls、嚴格 CUDA 報錯、ONNX fixture |
| 兩套 PowerShell 發布腳本的 `-PreflightOnly` | 待審政策於網路存取前拒絕執行 |
| `python tools/collect_dependency_licenses.py --output build/dependency_licenses` | 收集 10 個 runtime distribution 的版本與 license evidence |
| 當前 Recipe ID／名稱掃描 | 無舊產品 detector ID；native ABI 相容符號保留 |
| GitHub visibility／Release | PRIVATE；18 個 Release 全為 draft |
| 私有快照匯出 | 1 個根提交／0 個 remote；快照來源 launcher smoke exit 0 |

本機測試執行器是 Windows x64 / CPython 3.13.0。測試使用 `PYTHONUTF8=1`、
`QT_QPA_PLATFORM=offscreen`，並將 `TEMP`／`TMP` 指向獨立 ASCII 路徑，
避免測試 fixture 直接呼叫 OpenCV `imwrite` 時受非 ASCII 暫存路徑影響。
應用程式的 Unicode 路徑處理測試仍包含在完整 suite 中。

## 尚未驗證

`packaging/scripts/build_exe.ps1` 已執行，但環境檢查在 PyInstaller 前停止：
鎖定環境要求 CPython 3.12，本機是 3.13；hypothesis、narwhals、numpy、onnxruntime、
opencv-python、Pillow 與 setuptools 的已安裝版本也不符。
因此沒有產出或驗證新 EXE，不能把原始碼 launcher smoke 當成 packaged smoke。
舊 EXE／ZIP 已移至私有封存，不能用它們代表新示範版。

本機 PATH 沒有 `nvidia-smi`、`nvcc` 或 MSVC `cl`。CUDA 修改限於註解名稱，
native ABI 保留；DLL 沒有重新編譯，GPU runtime／等價／stress 與設備實機驗收待完成。

合成圖與改名不構成來源授權或職務成果歸屬的確認。公開散布仍由
`distribution-policy.json` 禁止，參見 [來源與公開範圍](source-provenance.md)。

## 同日取像參考名稱整理

名稱及診斷文字調整後重新執行完整 unittest：1219 項通過（56.900 秒）。
compileall、CUDA 靜態 preflight、原始碼 launcher smoke（exit 0）與差異檢查通過。
此修改不代表重新實作取像層、來源權利確認或設備實機驗收。

## 同日私有遠端歷史重建

獨立根提交候選目錄完整 unittest：1219 項通過（45.470 秒）；compileall、CUDA 靜態 preflight、
原始碼 launcher smoke（exit 0）通過。候選來源檔案先完成驗證，再以原子推送替換遠端 main 並移除 53 個舊標籤。
推送對每個 ref 指定原 SHA 的 lease，避免覆蓋途中新增的版本。main 可達歷史為 1 個提交，訊息為
`Initialize AOI demo baseline`。原歷史與 refs 清單保存在外部私有封存，18 個 Release 草稿保留。
