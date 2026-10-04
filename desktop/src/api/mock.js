// Simulated backend for plain-browser review (`npm run dev` without Tauri).
// Implements the full sidecar protocol surface with the neutral demo data so
// every screen renders identically to the real app.
import { MOCK_RECIPES, MOCK_IMAGES, buildCatalog, buildMockResult, BATCH_FILES, COMPARE_CPU_GPU } from "../data/catalog.js";

const MOCK_CATALOG = buildCatalog();

// ---------- synthetic board data URL (canvas → png) ----------
let _boardUrl = null;
function boardUrl() {
  if (_boardUrl) return _boardUrl;
  const W = 1024, H = 768;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#27343b";
  ctx.fillRect(0, 0, W, H);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.035})`;
    ctx.fillRect(rand() * W, rand() * H, 1.5, 1.5);
  }
  const cols = 8, rows = 6;
  const cellW = W / cols, cellH = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const cx = cIdx * cellW + cellW / 2;
      const cy = r * cellH + cellH / 2;
      const pw = cellW * 0.62, ph = cellH * 0.58;
      ctx.fillStyle = "#a8966a";
      ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph);
      ctx.fillStyle = "#3d4a51";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(pw, ph) * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  _boardUrl = c.toDataURL("image/png");
  return _boardUrl;
}

// ---------- internal state ----------
const listeners = new Map();
let jobSeq = 1000;
let settings = {
  output_dir: "outputs",
  output_options: { overlay: true, ng_tiles: true, ng_tiles_by_defect: false, csv: true, matrix_csv: false, json: true },
  save_originals: true,
  machine: { machine_id: "DEMO_MACHINE", pipeline_version: "1.1.1" },
};
let runtime = {
  sidecar: "ready",
  pid: 18244,
  core_version: "1.1.1",
  mode: "op",
  busy: false,
  cuda: { dll_path: "gpu/visionflow_cuda.dll", dll: "missing", note: "找不到 CUDA DLL，依 Recipe fallback_to_cpu 改用 CPU。" },
  devices: {
    camera: { available: false, reason: "未偵測到 Sapera LT／相機 SDK。" },
    meter_wheel: { available: false, reason: "找不到 LSI8181_64.dll。" },
    sensor_relay: { available: false, reason: "未偵測到 DAQNavi（Automation.BDaq4.dll）。" },
    light: { available: false, reason: "未設定光源序列埠。" },
  },
};
let currentMode = "op";

const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const fail = (code, message, data) => {
  const err = new Error(message || code);
  err.code = code;
  err.data = data;
  return Promise.reject(err);
};

function emit(topic, payload) {
  const set = listeners.get(topic);
  if (set) set.forEach((h) => { try { h(payload); } catch (e) { /* ignore handler errors */ } });
}
function setBusy(busy) {
  if (runtime.busy !== busy) {
    runtime = { ...runtime, busy };
    emit("runtime://status", { ...runtime });
  }
}

function resolveRecipePath(path) {
  return MOCK_RECIPES.find((r) => r.path === path || r.path.endsWith(path)) || MOCK_RECIPES[0];
}

// ---------- public API (mirrors src/api/native.js surface) ----------
export async function call(method, params = {}) {
  params = params || {};
  switch (method) {
    case "hello":
      return { ok: true, core_version: runtime.core_version };
    case "runtime_status":
      return { ...runtime };
    case "switch_mode": {
      const mode = params.mode;
      const password = params.password || "";
      if (mode === "op") {
        currentMode = "op"; runtime = { ...runtime, mode: "op" }; emit("runtime://status", { ...runtime });
        return { mode: "op" };
      }
      if (mode === "eng" && password === "1234") {
        currentMode = "eng"; runtime = { ...runtime, mode: "eng" }; emit("runtime://status", { ...runtime });
        return { mode: "eng" };
      }
      if (mode === "admin" && password === "5678") {
        currentMode = "admin"; runtime = { ...runtime, mode: "admin" }; emit("runtime://status", { ...runtime });
        return { mode: "admin" };
      }
      return fail("PERMISSION_DENIED", "密碼錯誤，權限未變更。", { code: "PERMISSION_DENIED" });
    }
    case "list_recipes":
      return MOCK_RECIPES.map((r) => ({ path: r.path, recipe_name: r.recipe.recipe_name }));
    case "detector_catalog":
      return MOCK_CATALOG;
    case "load_recipe": {
      const found = resolveRecipePath(params.path);
      const recipe = JSON.parse(JSON.stringify(found.recipe));
      let hiddenInnerCount = 0;
      for (const [id, cfg] of Object.entries(recipe.detectors || {})) {
        const cat = MOCK_CATALOG[id];
        if (!cat) continue;
        for (const spec of Object.values(cat.param_spec || {})) {
          if (spec.parameter_group === "inner") hiddenInnerCount++;
        }
      }
      return { path: found.path, recipe, hidden_inner_count: hiddenInnerCount, camera_editable: !!recipe.camera };
    }
    case "save_recipe": {
      const recipe = params.recipe;
      return { path: params.path || `recipes/${recipe.recipe_name}.yaml` };
    }
    case "start_job": {
      if (runtime.busy) return fail("BUSY", "已有工作執行中。", { code: "BUSY" });
      setBusy(true);
      const jobId = `J-0${jobSeq++}`;
      runJobSim(jobId, "single", params);
      return { job_id: jobId };
    }
    case "start_batch": {
      if (runtime.busy) return fail("BUSY", "已有工作執行中。", { code: "BUSY" });
      setBusy(true);
      const jobId = `B-0${jobSeq++}`;
      runBatchSim(jobId, params);
      return { job_id: jobId };
    }
    case "monitor_start": {
      if (params.source === "camera") {
        return fail("CAMERA_NOT_AVAILABLE", "未偵測到相機：Sapera LT 或相機 SDK 未安裝。", { code: "CAMERA_NOT_AVAILABLE" });
      }
      if (runtime.busy) return fail("BUSY", "已有工作執行中。", { code: "BUSY" });
      setBusy(true);
      const jobId = `M-0${jobSeq++}`;
      runMonitorSim(jobId, params);
      return { job_id: jobId };
    }
    case "monitor_stop":
    case "cancel_job": {
      setBusy(false);
      return { ok: true };
    }
    case "gpu_warmup": {
      const jobId = `W-0${jobSeq++}`;
      setTimeout(() => {
        emit("job://completed", {
          job_id: jobId, kind: "warmup",
          result: runtime.cuda.dll === "loaded" ? { session_ms: 412, pipeline_ms: 58, vram_mb: 1382 } : { session_ms: 0, pipeline_ms: 0, vram_mb: 0 },
        });
      }, 1200);
      return { job_id: jobId };
    }
    case "backend_compare": {
      const jobId = `C-0${jobSeq++}`;
      setTimeout(() => {
        emit("job://completed", { job_id: jobId, kind: "compare", result: JSON.parse(JSON.stringify(COMPARE_CPU_GPU)) });
      }, 1600);
      return { job_id: jobId };
    }
    case "image_preview": {
      const name = basename(params.image_path || "");
      return { path: params.image_path, width: 1024, height: 768, scale: 0.5 };
    }
    case "preview_tiles": {
      return { count: 48, preview_path: "cache/preview/tiles_grid.png", tiles: [] };
    }
    case "get_settings":
      return JSON.parse(JSON.stringify(settings));
    case "set_settings":
      settings = { ...settings, ...params.patch };
      return JSON.parse(JSON.stringify(settings));
    case "import_legacy_settings":
      settings = { ...settings, output_dir: "outputs", save_originals: true };
      return JSON.parse(JSON.stringify(settings));
    case "shutdown":
      setBusy(false);
      runtime = { ...runtime, sidecar: "offline" };
      emit("runtime://status", { sidecar: "offline", reason: "shutdown" });
      return { ok: true };
    default:
      return fail("METHOD_NOT_FOUND", `未知方法：${method}`, { code: "METHOD_NOT_FOUND" });
  }
}

function runJobSim(jobId, kind, params) {
  const imageName = basename(params.image_path || "synthetic_grid_ng_003.png");
  const recipe = resolveRecipePath(params.recipe_path);
  const recipeGpuMode = recipe.recipe.gpu && recipe.recipe.gpu.mode;
  const stages = [
    { pct: 6, stage: "load_image", msg: "載入影像" },
    { pct: 14, stage: "init_backend", msg: "初始化 backend" },
    { pct: 28, stage: "tiling", msg: "切圖（tiling）" },
    { pct: 58, stage: "detect", msg: "Detector 執行中" },
    { pct: 82, stage: "aggregate", msg: "彙整結果" },
    { pct: 96, stage: "write_outputs", msg: "輸出 overlay / CSV / JSON" },
    { pct: 100, stage: "done", msg: "完成" },
  ];
  const backend = runtime.cuda.dll === "loaded" && recipeGpuMode !== "cpu" ? "cuda" : "cpu";
  let acc = 0;
  stages.forEach((s) => {
    acc += 180;
    setTimeout(() => {
      emit("job://progress", { job_id: jobId, pct: s.pct, message: s.msg, stage: s.stage });
    }, acc);
  });
  setTimeout(() => {
    const final = imageName.includes("ng") ? "NG" : "PASS";
    const result = buildMockResult({ imageName, recipeName: recipe.recipe.recipe_name, finalResult: final, backend });
    // Mirror the sidecar's single-result shape: backend/backend_reason/dur_ms/
    // outputs/performance all live on `result`, never inferred from the recipe.
    result.performance = result.execution.performance;
    if (backend === "cpu" && recipeGpuMode && recipeGpuMode !== "cpu") {
      result.backend_reason = "gpu/visionflow_cuda.dll 未找到";
    }
    setBusy(false);
    emit("job://completed", { job_id: jobId, kind, result });
  }, acc + 240);
}

function runBatchSim(jobId, params) {
  const recipe = resolveRecipePath(params.recipe_path);
  const backend = runtime.cuda.dll === "loaded" && recipe.recipe.gpu.mode !== "cpu" ? "cuda" : "cpu";
  const total = BATCH_FILES.length;
  emit("job://progress", { job_id: jobId, pct: 0, message: "開始批次", stage: "batch" });
  BATCH_FILES.forEach((f, i) => {
    setTimeout(() => {
      const item = {
        index: i,
        total,
        image_name: f.file,
        final_result: f.result,
        summary: { tile_count: f.tiles, ng_count: f.ngTiles, defect_count: f.defects, detector_ng_counts: {} },
        outputs: {},
        duration_sec: f.ms ? f.ms / 1000 : 0,
        backend,
        error: f.error || null,
      };
      emit("batch://item", { job_id: jobId, index: i, total, item });
      emit("job://progress", { job_id: jobId, pct: Math.round(((i + 1) / total) * 100), message: `處理中 ${i + 1}/${total}`, stage: "batch" });
      if (i === total - 1) {
        setTimeout(() => {
          setBusy(false);
          emit("job://completed", {
            job_id: jobId, kind: "batch",
            result: { total, processed: total, pass: BATCH_FILES.filter((x) => x.result === "PASS").length, ng: BATCH_FILES.filter((x) => x.result === "NG").length, error: BATCH_FILES.filter((x) => x.result === "ERROR").length, cancelled: 0 },
          });
        }, 200);
      }
    }, 180 * (i + 1));
  });
}

let _monitorTimer = null;
function runMonitorSim(jobId, params) {
  let n = 0;
  _monitorTimer = setInterval(() => {
    n += 1;
    const isError = n % 13 === 0;
    const isNg = !isError && n % 6 === 0;
    const rawErr = n % 11 === 0;
    const item = {
      job_id: jobId,
      image_name: `frame_${String(n).padStart(5, "0")}.png`,
      final_result: isError ? "ERROR" : isNg ? "NG" : "PASS",
      summary: { tile_count: 192, ng_count: isNg ? 2 : 0, defect_count: isError ? 0 : isNg ? 2 : 0, detector_ng_counts: {} },
      duration_sec: isError ? 0 : 1.2,
      raw_image_path: rawErr ? null : `origin/frame_${String(n).padStart(5, "0")}.png`,
      raw_image_error: rawErr ? "[E-1204] 原圖保存失敗：磁碟空間不足" : null,
      error: isError ? { code: "[E-1104]", message: "detector 執行錯誤：CUDA kernel failed" } : null,
    };
    emit("monitor://item", { job_id: jobId, item });
    if (n >= 8) {
      clearInterval(_monitorTimer);
      _monitorTimer = null;
      setBusy(false);
      emit("monitor://stopped", { job_id: jobId, processed: n, dropped: 1 });
    }
  }, 1200);
}

export async function on(topic, handler) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(handler);
  return () => {
    const set = listeners.get(topic);
    if (set) set.delete(handler);
  };
}

export function fileUrl(path) {
  return boardUrl();
}

export async function pickFile(options = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (options.filters && options.filters.length) {
      input.accept = options.filters.flatMap((f) => f.extensions.map((e) => "." + e)).join(",");
    }
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files && input.files[0];
      resolve(file ? "samples/" + file.name : null);
      input.remove();
    };
    input.oncancel = () => { resolve(null); input.remove(); };
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickFolder() {
  return "samples/batch_demo";
}

export async function saveFile() {
  return null;
}

export async function info() {
  return { state: runtime.sidecar === "offline" ? "offline" : "ready", pid: runtime.pid, launch: "python", command: "python -m aoi_sidecar", log_dir: "C:/Users/…/AppData/Local/TileScopeAOI/logs" };
}

export async function restart() {
  runtime = { ...runtime, sidecar: "offline" };
  emit("runtime://status", { sidecar: "offline", reason: "restarting" });
  await delay(700);
  runtime = { ...runtime, sidecar: "ready", pid: 18000 + Math.floor(Math.random() * 4000) };
  emit("runtime://status", { ...runtime });
  return info();
}

export async function openLogDir() {
  return { ok: true };
}

export async function allowDir(path) {
  return { ok: true, path };
}

export async function openFileOrDir(path) {
  return { ok: true, path };
}

export const winMinimize = () => {};
export const winToggleMaximize = () => {};
export const winClose = () => { window.close(); };
export const forceClose = () => { window.close(); };
export const onCloseRequested = () => () => {};

function basename(p) {
  const parts = String(p || "").split(/[\\/]/);
  return parts[parts.length - 1];
}
