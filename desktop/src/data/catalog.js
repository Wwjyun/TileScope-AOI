// ============================================================
// AOI Console — neutral mock catalog / recipes / result builders
// (demo1–demo12, synthetic images only; no product / machine identity)
//
// This mirrors the sidecar's `detector_catalog` / `load_recipe` shapes so the
// frontend renders real data exactly like simulated data. parameter_group is
// authoritative for outer/inner visibility — never inferred from names.
// ============================================================

export const MODE_LABELS = { op: "OP 模式", eng: "工程模式", admin: "管理模式" };
export const DEFECT_TYPE_LABEL = { blob: "Blob", scratch: "Line", uniformity: "Region" };

const OUTER = "outer";
const INNER = "inner";

// id → { tag, gpu, params } (simplified demo defaults)
export const DETECTOR_DEFS = {
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

// parameter_group: inner — everything algorithmic; outer is only physical
// acceptance geometry (area / insets / target dimensions / crop padding).
export const INNER_PARAMS = {
  demo1: ["background_kernel_size", "residual_sigma_multiplier", "residual_threshold_floor", "connectivity"],
  demo2: ["blur_size", "adaptive_block_size", "adaptive_c", "binary_inv", "morph_operation"],
  demo3: ["blur_size", "adaptive_block_size", "adaptive_c", "binary_inv"],
  demo4: ["threshold_method", "blur_size", "adaptive_block_size", "adaptive_c", "process_scale", "min_circularity"],
  demo5: ["blur_size", "adaptive_block_size", "adaptive_c", "white_pixel_ratio_threshold"],
  demo6: ["adaptive_block_size", "adaptive_c", "binary_inv"],
  demo7: ["threshold_value", "binary_inv", "approx_epsilon_ratio", "min_vertices"],
  demo8: ["threshold_value", "binary_inv", "approx_epsilon_ratio", "min_vertices"],
  demo9: ["threshold_value", "binary_inv", "approx_epsilon_ratio", "min_vertices"],
  demo10: ["outer_threshold", "inner_adaptive_block_size", "max_edge_gap"],
  demo11: ["mode", "defect_x", "defect_y", "defect_width", "defect_height"],
  demo12: ["model_id", "confidence_threshold", "nms_iou_threshold", "max_detections", "inference_backend", "precision"],
};

const NUM = "float";

function paramSpec(value, group) {
  const isBool = typeof value === "boolean";
  return {
    value_type: isBool ? "bool" : typeof value === "number" ? NUM : "str",
    default: value,
    minimum: null,
    maximum: null,
    choices: [],
    odd: false,
    step: null,
    decimals: null,
    parameter_group: group,
    engineer_visible: group === OUTER,
    label: "",
    tooltip: "",
  };
}

// Build the `detector_catalog` response shape: id → definition.
export function buildCatalog() {
  const catalog = {};
  for (const [id, def] of Object.entries(DETECTOR_DEFS)) {
    const inner = new Set(INNER_PARAMS[id] || []);
    const param_spec = {};
    for (const [key, value] of Object.entries(def.params)) {
      param_spec[key] = paramSpec(value, inner.has(key) ? INNER : OUTER);
    }
    catalog[id] = {
      display_name: id,
      detector_name: id,
      test_only: false,
      gpu: def.gpu,
      tag: def.tag,
      default_params: { ...def.params },
      param_spec,
    };
  }
  return catalog;
}

const mkGpu = (mode) => ({ mode, tiling: false, display: false, dll_path: "gpu/visionflow_cuda.dll", fallback_to_cpu: mode !== "cuda" });

function mkRecipe(name, detectors, tile, gpuMode = "cpu") {
  return {
    recipe_name: name,
    product_id: "DEMO_PRODUCT",
    machine_id: "DEMO_MACHINE",
    version: "1.0.0",
    gpu: mkGpu(gpuMode),
    tile: tile || { mode: "grid", width: 128, height: 128, overlap_x: 0, overlap_y: 0 },
    decision: { mode: "all_detectors_must_pass", important_detectors: [], max_ng_count: 0 },
    detectors: Object.fromEntries(detectors.map((id) => [
      id,
      { enabled: true, use_gpu: DETECTOR_DEFS[id].gpu, display_name: id, params: { ...DETECTOR_DEFS[id].params } },
    ])),
    output: { pixel_size_um_per_px: null, save_overlay: true, save_ng_tiles: true, save_csv: true, save_matrix_csv: true, save_json: true, group_ng_tiles_by_defect: false },
  };
}

export const MOCK_RECIPES = [
  { path: "recipes/DEMO.yaml", recipe: mkRecipe("DEMO", ["demo4"], null, "cpu") },
  { path: "recipes/DEMO1.yaml", recipe: mkRecipe("DEMO1", ["demo1"], null, "auto") },
  { path: "recipes/DEMO2.yaml", recipe: mkRecipe("DEMO2", ["demo2"], null, "cpu") },
  { path: "recipes/DEMO3.yaml", recipe: mkRecipe("DEMO3", ["demo3"], null, "auto") },
  { path: "recipes/DEMO4.yaml", recipe: mkRecipe("DEMO4", ["demo4"], null, "cpu") },
  { path: "recipes/DEMO8.yaml", recipe: mkRecipe("DEMO8", ["demo8"], null, "cpu") },
  { path: "recipes/DEMO10.yaml", recipe: mkRecipe("DEMO10", ["demo10"], { mode: "contour", min_area: 4000, approx_epsilon: 0.01, threshold_method: "otsu_binary" }, "cpu") },
  { path: "recipes/examples/DEMO12.yaml", recipe: mkRecipe("DEMO12", ["demo12"], null, "auto") },
];

export const MOCK_IMAGES = [
  { path: "samples/synthetic_grid_001.png", name: "synthetic_grid_001.png", w: 2048, h: 1536, size: "3.1 MB" },
  { path: "samples/synthetic_grid_002.png", name: "synthetic_grid_002.png", w: 2048, h: 1536, size: "3.1 MB" },
  { path: "samples/synthetic_grid_ng_003.png", name: "synthetic_grid_ng_003.png", w: 2048, h: 1536, size: "3.2 MB" },
];

export const RUN_STAGES = [
  { pct: 6, stage: "load_image", msg: "載入影像", ms: 300 },
  { pct: 14, stage: "init_backend", msg: "初始化 backend", ms: 350 },
  { pct: 28, stage: "tiling", msg: "切圖（tiling）", ms: 450 },
  { pct: 58, stage: "detect", msg: "Detector 執行中", ms: 800 },
  { pct: 82, stage: "aggregate", msg: "彙整結果", ms: 400 },
  { pct: 96, stage: "write_outputs", msg: "輸出 overlay / CSV / JSON", ms: 350 },
  { pct: 100, stage: "done", msg: "完成", ms: 200 },
];

// --- simulated defect / result builders (native compact schema) ---

// SIM_DEFECTS in original-image px, bbox_global = [x, y, w, h]
const SIM_DEFECTS = [
  { tile: "T012", detector: "demo3", type: "blob", bbox: [635, 338, 61, 53], area: 412, confidence: 0.93 },
  { tile: "T012", detector: "demo3", type: "blob", bbox: [737, 415, 37, 33], area: 105, confidence: 0.81 },
  { tile: "T031", detector: "demo2", type: "scratch", bbox: [1188, 845, 225, 25], area: 887, confidence: 0.88 },
  { tile: "T044", detector: "demo3", type: "blob", bbox: [1556, 1121, 49, 49], area: 298, confidence: 0.95 },
  { tile: "T044", detector: "demo1", type: "uniformity", bbox: [1454, 1014, 160, 147], area: 5210, confidence: 0.71 },
];

export const SIM_SUMMARY = { tile_count: 192, ng_count: 3, defect_count: SIM_DEFECTS.length };

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

// Build a full compact inspection result (single job) from the synthetic board.
export function buildMockResult({ imageName, recipeName, finalResult, backend }) {
  const pass = finalResult === "PASS";
  const defects = pass ? [] : SIM_DEFECTS;
  const tiles = [];
  const byTile = {};
  for (const d of defects) {
    if (!byTile[d.tile]) byTile[d.tile] = [];
    byTile[d.tile].push(d);
  }
  const totalTiles = 192;
  for (let i = 0; i < totalTiles; i++) {
    const tileId = `T${String(i + 1).padStart(3, "0")}`;
    const col = i % 16;
    const row = Math.floor(i / 16);
    const defs = byTile[tileId] || [];
    const detectors = [];
    if (defs.length) {
      // group defects by detector
      const byDet = {};
      for (const d of defs) (byDet[d.detector] = byDet[d.detector] || []).push(d);
      for (const [detId, list] of Object.entries(byDet)) {
        detectors.push({
          detector_id: detId,
          pass: false,
          score: Math.max(...list.map((d) => d.confidence)),
          defects: list.map((d) => ({
            type: d.type,
            bbox_global: d.bbox,
            bbox_local: [d.bbox[0] - col * 128, d.bbox[1] - row * 128, d.bbox[2], d.bbox[3]],
            area: d.area,
            confidence: d.confidence,
          })),
        });
      }
    } else {
      detectors.push({ detector_id: "demo3", pass: true, score: 0.99, defects: [] });
    }
    tiles.push({
      tile: { tile_id: tileId, x: col * 128, y: row * 128, width: 128, height: 128, row, col },
      result: defs.length ? "NG" : "PASS",
      detectors,
    });
  }
  const stem = (imageName || "synthetic_grid").replace(/\.[^.]+$/, "");
  const durSec = backend === "cpu" ? 3.8 : 1.5;
  return {
    image_name: imageName,
    recipe_name: recipeName,
    machine_id: "DEMO_MACHINE",
    product_id: "DEMO_PRODUCT",
    recipe_version: "1.0.0",
    final_result: finalResult,
    summary: pass ? { tile_count: totalTiles, ng_count: 0, defect_count: 0, detector_ng_counts: {} }
      : { ...SIM_SUMMARY, detector_ng_counts: { demo3: 2, demo2: 1, demo1: 1 } },
    tiles,
    outputs: {
      overlay: `outputs/overlay/${stem}_overlay.png`,
      csv: `outputs/csv/${stem}.csv`,
      json: `outputs/json/${stem}.json`,
      matrix_csv: `outputs/matrix_csv/${stem}_matrix.csv`,
      ng_tiles_dir: `outputs/ng_tiles/`,
      ng_tile_sidecars: [],
    },
    duration_sec: durSec,
    execution: {
      gpu: {
        mode: backend === "cuda" ? "cuda" : "cpu",
        resident_image: { active: false, generation: 0, shape: [] },
        tiling: {},
        display_requested: false,
        detectors: {},
        metrics: {},
      },
      performance: {
        stages: PERF_STAGES,
        detector_stages: PERF_DETECTOR_STAGES,
        device_split: PERF_DEVICE_SPLIT,
        transfer_memory: PERF_TRANSFER,
        notices: PERF_NOTICES,
      },
    },
    // completed payload extras carried by the sidecar event
    backend,
    backend_reason: null,
    dur_ms: Math.round(durSec * 1000),
  };
}

export const BATCH_FILES = Array.from({ length: 24 }, (_, i) => {
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

// CPU/GPU comparison mock
export const COMPARE_CPU_GPU = {
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
