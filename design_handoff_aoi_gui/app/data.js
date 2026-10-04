// AOI Console — 模擬資料（中性示範：demo1–demo12、合成影像、無產品／機台識別）

const DETECTOR_DEFS = {
  demo1: { tag: "背景殘差 · 連通元件", gpu: true, params: { background_kernel_size: 15, residual_sigma_multiplier: 2.0, residual_threshold_floor: 4.0, connectivity: 8, min_component_area_px: 4, max_component_area_px: 4096, edge_mask_enabled: false } },
  demo2: { tag: "自適應閾值 · 開運算輪廓", gpu: true, params: { blur_size: 3, adaptive_block_size: 15, adaptive_c: 2.0, binary_inv: true, morph_operation: "open", min_area: 16.0, max_area: 4096.0 } },
  demo3: { tag: "自適應閾值 · 輪廓", gpu: true, params: { roi_inset_px: 0, blur_size: 3, adaptive_block_size: 15, adaptive_c: 2.0, binary_inv: true, min_area: 16.0, max_area: 4096.0 } },
  demo4: { tag: "閾值 · 圓度篩選", gpu: true, params: { threshold_method: "adaptive_mean", blur_size: 3, adaptive_block_size: 15, adaptive_c: 2.0, process_scale: 1.0, min_area: 16.0, max_area: 4096.0, min_circularity: 0.5 } },
  demo5: { tag: "白像素比例", gpu: false, params: { blur_size: 3, adaptive_block_size: 15, adaptive_c: 2.0, min_area: 16.0, max_area: 4096.0, white_pixel_ratio_threshold: 0.5 } },
  demo6: { tag: "邊緣遮罩 · 自適應輪廓", gpu: true, params: { edge_mask_enabled: false, edge_inset_all: 0, adaptive_block_size: 15, adaptive_c: 2.0, binary_inv: false, min_area: 16.0, max_area: 4096.0 } },
  demo7: { tag: "中心遮罩 · 多邊形", gpu: false, params: { center_mask_enabled: false, edge_mask_enabled: false, threshold_value: 128, binary_inv: false, approx_epsilon_ratio: 0.01, min_vertices: 3, min_area: 16.0, max_area: 4096.0 } },
  demo8: { tag: "固定閾值 · 多邊形", gpu: false, params: { edge_mask_enabled: false, threshold_value: 128, binary_inv: true, approx_epsilon_ratio: 0.01, min_vertices: 3, min_area: 16.0, max_area: 4096.0 } },
  demo9: { tag: "雙遮罩 · 多邊形", gpu: false, params: { center_mask_enabled: false, edge_mask_enabled: false, threshold_value: 128, binary_inv: false, approx_epsilon_ratio: 0.01, min_vertices: 3, min_area: 16.0, max_area: 4096.0 } },
  demo10: { tag: "內外框尺寸", gpu: false, params: { outer_threshold: 128, outer_target_width: 96, outer_target_height: 80, inner_adaptive_block_size: 15, inner_target_width: 64, inner_target_height: 48, max_edge_gap: 20 } },
  demo11: { tag: "測試注入（驗證用）", gpu: false, params: { mode: "pass", defect_x: 0, defect_y: 0, defect_width: 16, defect_height: 16 } },
  demo12: { tag: "ONNX 物件偵測（範例）", gpu: true, params: { model_id: "yolox_tiny_fixture", confidence_threshold: 0.5, nms_iou_threshold: 0.5, max_detections: 32, inference_backend: "onnxruntime_cpu", precision: "fp32" } },
};

const mkRecipe = (n, detectors, tile, extra) => ({
  file: `DEMO${n}.yaml`, recipe_name: `DEMO${n}`, product_id: "DEMO_PRODUCT", machine_id: "DEMO_MACHINE", version: "1.0.0",
  gpu: { mode: "cpu", fallback_to_cpu: true }, decision: "all_detectors_must_pass",
  tile: tile || { mode: "grid", width: 128, height: 128, overlap_x: 0, overlap_y: 0 }, detectors, ...extra,
});

const RECIPES = [
  mkRecipe(3, ["demo3"], null, { gpu: { mode: "auto", fallback_to_cpu: true } }),
  mkRecipe(1, ["demo1"]),
  mkRecipe(2, ["demo2"]),
  mkRecipe(4, ["demo4"]),
  mkRecipe(8, ["demo8"]),
  mkRecipe(10, ["demo10"], { mode: "contour", min_area: 4000, approx_epsilon: 0.01 }),
  mkRecipe(12, ["demo12"], null, { file: "examples/DEMO12.yaml" }),
];

const IMAGES = [
  { file: "synthetic_grid_001.png", w: 2048, h: 1536, size: "3.1 MB" },
  { file: "synthetic_grid_002.png", w: 2048, h: 1536, size: "3.1 MB" },
  { file: "synthetic_grid_ng_003.png", w: 2048, h: 1536, size: "3.2 MB" },
];

const SIM_DEFECTS = [
  { id: 1, tile: "T012", detector: "demo3", type: "blob", x: 0.31, y: 0.22, w: 0.030, h: 0.026, area: 412, score: 0.93 },
  { id: 2, tile: "T012", detector: "demo3", type: "blob", x: 0.36, y: 0.27, w: 0.018, h: 0.016, area: 105, score: 0.81 },
  { id: 3, tile: "T031", detector: "demo2", type: "scratch", x: 0.58, y: 0.55, w: 0.110, h: 0.012, area: 887, score: 0.88 },
  { id: 4, tile: "T044", detector: "demo3", type: "blob", x: 0.76, y: 0.73, w: 0.024, h: 0.024, area: 298, score: 0.95 },
  { id: 5, tile: "T044", detector: "demo1", type: "uniformity", x: 0.71, y: 0.66, w: 0.078, h: 0.072, area: 5210, score: 0.71 },
];

// sidecar 事件：job.progress { stage, pct }
const RUN_STAGES = [
  { pct: 6, stage: "load_image", msg: "載入影像", ms: 300 },
  { pct: 14, stage: "init_backend", msg: "初始化 backend", ms: 350 },
  { pct: 28, stage: "tiling", msg: "切圖（tiling）", ms: 450 },
  { pct: 58, stage: "detect", msg: "Detector 執行中", ms: 800 },
  { pct: 82, stage: "aggregate", msg: "彙整結果", ms: 400 },
  { pct: 96, stage: "write_outputs", msg: "輸出 overlay / CSV / JSON", ms: 350 },
  { pct: 100, stage: "done", msg: "完成", ms: 200 },
];

const SIM_SUMMARY = { tile_count: 192, ng_count: 3, defect_count: SIM_DEFECTS.length };
const DEFECT_TYPE_LABEL = { blob: "Blob", scratch: "Line", uniformity: "Region" };

const HISTORY_ROWS = [
  { time: "14:32:08", job: "J-0417", image: "synthetic_grid_002.png", recipe: "DEMO3", result: "PASS", defects: 0, dur: "1.4s", backend: "cuda" },
  { time: "14:28:51", job: "J-0416", image: "synthetic_grid_ng_003.png", recipe: "DEMO3", result: "NG", defects: 5, dur: "1.6s", backend: "cuda" },
  { time: "14:25:13", job: "J-0415", image: "synthetic_grid_001.png", recipe: "DEMO3", result: "PASS", defects: 0, dur: "1.5s", backend: "cuda" },
];

// 執行環境模擬（Tweaks 切換）
const RUNTIME_SIMS = {
  cuda: { sidecar: "ready", backend: "cuda", dll: "loaded", policy: "auto", label: "CUDA", tone: "pass" },
  fallback: { sidecar: "ready", backend: "cpu", dll: "missing", policy: "auto", label: "CPU fallback", tone: "warn" },
  strict_error: { sidecar: "ready", backend: "none", dll: "missing", policy: "strict", label: "CUDA 不可用", tone: "ng" },
  offline: { sidecar: "offline", backend: "none", dll: "unknown", policy: "auto", label: "Sidecar 離線", tone: "ng" },
};

const BATCH_FILES = Array.from({ length: 24 }, (_, i) => {
  const n = String(i + 1).padStart(3, "0");
  const err = [7, 18].includes(i);
  const ng = !err && [4, 9, 10, 17, 21].includes(i);
  return {
    file: `synthetic_${n}.png`,
    result: err ? "ERROR" : ng ? "NG" : "PASS",
    defects: err ? 0 : ng ? 1 + (i % 4) : 0,
    tiles: 192,
    ngTiles: err ? 0 : ng ? 1 + (i % 3) : 0,
    ms: err ? 0 : 1200 + ((i * 137) % 600),
    error: err ? { code: "CUDA_DLL_NOT_FOUND", stage: "init_backend", msg: "找不到 gpu/visionflow_cuda.dll" } : null,
  };
});

// 批量數據圖表／監控共用：批次或監控完成時寫入（原型內存快取）
const BATCH_RESULT_STORE = { latest: null };

// CPU／GPU 對照模擬資料
const COMPARE_CPU_GPU = {
  cpu: { result: "NG", defects: 5, dur: "3.8s", backend: "cpu" },
  gpu: { result: "NG", defects: 5, dur: "1.5s", backend: "cuda" },
  rows: [
    { id: 1, tile: "T012", detector: "demo3", cpu_bbox: [635, 338, 61, 53], gpu_bbox: [635, 338, 61, 53], cpu_area: 412, gpu_area: 412 },
    { id: 2, tile: "T012", detector: "demo3", cpu_bbox: [737, 415, 37, 33], gpu_bbox: [737, 415, 37, 33], cpu_area: 105, gpu_area: 105 },
    { id: 3, tile: "T031", detector: "demo2", cpu_bbox: [1188, 845, 225, 25], gpu_bbox: [1188, 845, 225, 25], cpu_area: 887, gpu_area: 888 },
    { id: 4, tile: "T044", detector: "demo3", cpu_bbox: [1556, 1121, 49, 49], gpu_bbox: [1556, 1121, 49, 49], cpu_area: 298, gpu_area: 298 },
    { id: 5, tile: "T044", detector: "demo1", cpu_bbox: [1454, 1014, 160, 147], gpu_bbox: [1454, 1014, 160, 147], cpu_area: 5210, gpu_area: 5212 },
  ],
};

// 效能分析模擬資料
const PERF_STAGES = [
  { label: "讀圖", ms: 210 },
  { label: "初始化／整圖上傳", ms: 260 },
  { label: "切圖", ms: 180 },
  { label: "Detector", ms: 640 },
  { label: "彙總", ms: 120 },
  { label: "報表輸出", ms: 90 },
  { label: "釋放記憶體", ms: 40 },
];
const PERF_DETECTOR_STAGES = [
  { detector: "demo3", gpu: "CUDA", ms: 420, tiles: 128 },
  { detector: "demo2", gpu: "CUDA", ms: 150, tiles: 32 },
  { detector: "demo1", gpu: "CPU", ms: 70, tiles: 8 },
];
const PERF_DEVICE_SPLIT = [
  { stage: "切圖", gpu: "0%", cpu: "100%" },
  { stage: "demo3（卷積）", gpu: "100%", cpu: "0%" },
  { stage: "demo2（形態學）", gpu: "100%", cpu: "0%" },
  { stage: "demo1（遮罩）", gpu: "0%", cpu: "100%" },
  { stage: "彙總／報表", gpu: "0%", cpu: "100%" },
];
const PERF_TRANSFER = [
  { item: "整圖上傳（host→device）", value: "2048×1536 ×1 · 12.6 MB" },
  { item: "tile 傳輸（pinned）", value: "192 張 · 32.3 MB" },
  { item: "peak VRAM（reserved）", value: "1,382 MB" },
];
const PERF_NOTICES = [
  "GPU 工作維持單一序列化路徑，未與 CPU 中間結果混用。",
  "各 detector 的 use_gpu 開關決定實際運算位置。",
  "低 VRAM 時建議縮小 tile 尺寸或改用 CPU。",
];

// 內層參數（parameter_group: inner）— 僅管理模式可見
const INNER_PARAMS = {
  demo1: ["residual_sigma_multiplier", "residual_threshold_floor", "connectivity"],
  demo2: ["adaptive_c", "morph_operation"],
  demo3: ["roi_inset_px", "adaptive_c"],
  demo4: ["adaptive_c", "process_scale"],
  demo5: ["adaptive_c"],
  demo6: ["edge_inset_all", "adaptive_c"],
  demo7: ["approx_epsilon_ratio", "min_vertices"],
  demo8: ["approx_epsilon_ratio", "min_vertices"],
  demo9: ["approx_epsilon_ratio", "min_vertices"],
  demo10: ["inner_adaptive_block_size", "max_edge_gap"],
  demo11: ["defect_x", "defect_y"],
  demo12: ["nms_iou_threshold", "inference_backend", "precision"],
};
const MODE_LABELS = { op: "OP 模式", eng: "工程模式", admin: "管理模式" };

Object.assign(window, { INNER_PARAMS, MODE_LABELS, DETECTOR_DEFS, RECIPES, IMAGES, SIM_DEFECTS, RUN_STAGES, SIM_SUMMARY, DEFECT_TYPE_LABEL, HISTORY_ROWS, RUNTIME_SIMS, BATCH_FILES, BATCH_RESULT_STORE, COMPARE_CPU_GPU, PERF_STAGES, PERF_DETECTOR_STAGES, PERF_DEVICE_SPLIT, PERF_TRANSFER, PERF_NOTICES });
