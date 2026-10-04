# VisionFlow AOI — 私有示範版

以 Recipe 驅動的 OpenCV 檢測程式，提供 PySide6 GUI 與選用 CUDA backend。
目前使用人工生成的幾何圖形與中性預設值；不提供產品驗收或產線校準設定。

**目前維持私有，公開散布尚未獲准。** 職務成果歸屬及第三方元件的使用範圍仍待確認；既有取像程式已取得權利人同意，詳見 [來源紀錄](docs/source-provenance.md)、[第三方授權](THIRD_PARTY_NOTICES.md) 與 `distribution-policy.json`。

## 執行

```powershell
.\env\Scripts\python.exe main.py --gui
.\env\Scripts\python.exe tools/demo_dataset.py --output outputs_validation/demo_dataset
.\env\Scripts\python.exe main.py --image outputs_validation/demo_dataset/shapes.png --recipe recipes/DEMO3.yaml --output outputs_validation/demo_cli
```

CLI 的 PASS exit code 為 0，NG 為 2；錯誤依 CLI 訊息判斷。
使用 CPython 3.12 與 `requirements.lock.txt` 建立環境；本機開發使用 `env/Scripts/python.exe`。

## 示範偵測器

| ID / 名稱 | 示範功能 |
| --- | --- |
| demo1 | 局部背景與 CNR 候選分析 |
| demo2 | 自適應反相輪廓 |
| demo3 | 反相矩形輪廓 |
| demo4 | 圓形輪廓 |
| demo5 | 白色像素比例 |
| demo6 | 自適應輪廓 |
| demo7 | 多邊形輪廓示範 |
| demo8 | 反相多邊形 |
| demo9 | 多邊形與選用屏蔽 |
| demo10 | 合成雙框尺寸與間距 |
| demo11 | 固定 PASS／NG／ERROR 的流程測試 |
| demo12 | YOLOX 測試圖與固定 ONNX fixture；不代表檢測準確度 |

`demo13` 是未註冊的共用基底，供 demo1 使用。
`detectors/demo_defaults.py` 是示範預設值的唯一來源。
`recipes/DEMO.yaml` 與 `recipes/DEMO1.yaml` 至 `DEMO11.yaml` 使用 128 × 128 tile；
`recipes/examples/DEMO12.yaml` 使用 32 × 32 ONNX fixture。
舊 detector 編號與別名不再接受。需要產品設定時由有權使用的人另外建立私有 Recipe。

## CPU 與 CUDA

CPU 是正確性參考；所有隨附 Recipe 預設使用 CPU。
`gpu.mode=auto` 可在 CUDA 不可用時完整重跑 CPU；`cuda` 為嚴格模式，不得隱藏回退。
GUI 的 backend 標示由實際執行結果提供。
本次示範整理不代表重新完成 GPU 或設備實機驗收。
Native DLL 相容 ABI 中的歷史函式名稱屬二進位介面，不再作為 Recipe ID。

## GUI 與設備

現有 GUI 保留單張、批量、監控、Recipe 設計及 CCD 畫面。
管理／工程／OP 權限與內參／外參分類維持原契約。
沒有 CUDA DLL、原廠 driver 或取像硬體仍可啟動 CPU 功能。
設備路徑與硬體設定必須由有權操作的人現場設定，不隨示範 Recipe 預填。
設備實作參考的既有取像程式已取得權利人同意；見 [來源紀錄](docs/source-provenance.md)。

## 驗證與打包

```powershell
.\env\Scripts\python.exe -m unittest discover -s tests -v
.\env\Scripts\python.exe -m compileall main.py gui_launcher.py tools contour_preprocess_tool core detectors devices gui gpu
.\env\Scripts\python.exe gpu/preflight_cuda_build.py
.\packaging\scripts\build_exe.ps1
```

私有打包會附來源紀錄、散布政策、MIT 與第三方 notices，以及已安裝依賴的 license evidence。
打包成功不代表獲准公開發布。公開發布腳本在權利確認完成前會拒絕執行。
本次原始碼驗證結果與尚未完成的 EXE／GPU 檢查見 [驗證紀錄](docs/demo-validation.md)。

歷史版文件和詳細校準紀錄已移出目前來源樹，保留於本機私有封存。
私有遠端 main 已重建為單一根提交，訊息為 `Initialize AOI demo baseline`；53 個舊標籤已移除。
原歷史與標籤有完整本機私有備份，舊 Release 保留為私有草稿。
重建歷史不代表完成來源權利確認，公開範圍仍須審查。
目前工作清單見 [Todo.md](Todo.md)。
