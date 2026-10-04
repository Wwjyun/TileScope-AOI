# 選用 CUDA backend

CPU/OpenCV 是正確性參考。所有示範 Recipe 預設 `gpu.mode=cpu`。
`auto` 可整個 detector 重跑 CPU；`cuda` 嚴格模式失敗必須回報。

## 建置與靜態檢查

```powershell
.\env\Scripts\python.exe gpu/preflight_cuda_build.py
.\gpu\build_cuda_dll.ps1
.\env\Scripts\python.exe gpu/validate_cuda_dll.py --help
```

Native ABI 保留相容 export 名稱；這些名稱不是示範 Recipe ID。
`GpuExecutionSession` 重用 context 與 image lifetime，操作透過 backend-neutral plan 宣告。
缺 DLL、舊 DLL、unsupported operator 或 CUDA failure 的回退由共享 runtime 負責。
CPU、fake DLL 和靜態驗證不能取代 nvcc 編譯、GPU runtime、等價與 stress 驗收。

舊量測、現場配置和詳盡歷史報告已另行私有封存。
職務成果歸屬仍待確認，請參閱 `docs/source-provenance.md`。
