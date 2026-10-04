# 來源與公開範圍

本專案目前維持私有。示範名稱與參數的整理不代表已取得公司或第三方的授權。

## 示範設定

`detectors/demo_defaults.py` 定義目前所有預設值。幾何例子以 128 × 128 人工畫布、96 × 80 外框、64 × 48 內框及小型幾何圖形建立；不使用公司影像進行調參。中心與邊緣屏蔽預設關閉，ROI 不設產線裁切值。

二值化最大值 255、連通性 8，以及 Gaussian 雜訊的 MAD 換算係數 1.4826 屬演算法表示或統計常數。這些值不因匿名化而任意變更。所有示範設定均不是產品驗收標準。

`recipes/` 僅包含示範產品與機台身分。舊 detector 編號、別名和校準設定不作為目前 Recipe 的相容入口。

## 來源與確認狀態

| 範圍 | 已知來源背景 | 狀態 |
| --- | --- | --- |
| `devices/sapera_api.py`、`devices/sapera_camera.py`、`devices/lsi8181.py`、`devices/trigger_automation.py`、`devices/ccd_models.py`、`devices/ccd_settings_import.py` | 開發過程參考他人撰寫的既有取像程式；原始來源對照保存在私有封存 | 已取得權利人同意，使用者可將該程式用於本專案（使用者於 2026-10-04 確認） |
| `devices/legacy_*.py`、設備匯入測試與操作文件 | 既有程式的設定與控制流程整理 | 同上，已取得原程式權利人同意；涉及公司機台設定的部分仍依職務成果歸屬處理 |
| AOI engine、detectors、GUI 與 CUDA | 使用者職務涉及 AOI；尚未提供勞動契約或成果歸屬確認 | 職務成果歸屬待確認；不能宣稱全部為獨立個人所有 |
| 原廠 SDK／driver | 使用者機台安裝的廠商元件 | 不隨程式打包；使用與散布依各廠商契約 |

保留來源紀錄，不以改名、移植語言或刪除註解取代授權確認。既有來源註解中的路徑不是授權證明。

### 外部取像參考的中性代稱

程式註解與測試以 `external acquisition reference` 指稱他人撰寫的既有 C# 取像程式。
本 checkout 未附該 C# 專案；原始名稱、路徑與來源對照保存在私有封存的原始 Git bundle。
此次只整理名稱與介面說明，沒有重新實作取像層，也沒有將他人程式標為使用者獨立創作。
原程式權利人已同意使用者將該程式用於本專案（2026-10-04 由使用者確認）；程式註解保留來源標示，原始 C# 專案仍不放入本 checkout。

## 發布狀態

`distribution-policy.json` 將公開散布設定為禁止，並列出尚待確認的事項。發布腳本和快照匯出工具必須檢查此政策。私有測試與本機打包仍可執行。

舊 Git 歷史、文件及發布資訊已另作私有封存。依使用者授權，現有私有遠端 main 已重建為單一根提交，53 個舊標籤已移除；舊 Release 保留為私有草稿。
無父提交只隔離舊歷史，不會使目前程式的權利問題消失。重新公開前必須確認 Release、Actions artifacts 和目前程式的可公開範圍。
改寫分支與標籤不保證清除 GitHub 舊 SHA 快取或他人的複本；完整伺服器清除另依 [GitHub 文件](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) 處理。
