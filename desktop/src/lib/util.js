// Shared helpers: runtime derivation, result flattening, path helpers.

export function basename(p) {
  const parts = String(p || "").split(/[\\/]/);
  return parts[parts.length - 1];
}

export function dirname(p) {
  const parts = String(p || "").split(/[\\/]/);
  parts.pop();
  return parts.join("/") || ".";
}

export function stem(p) {
  return basename(p).replace(/\.[^.]+$/, "");
}

// Normalize bbox_global / bbox_local: accept [x,y,w,h] or {x,y,width,height}.
export function normalizeBbox(b) {
  if (Array.isArray(b)) {
    return [Number(b[0]) || 0, Number(b[1]) || 0, Number(b[2]) || 0, Number(b[3]) || 0];
  }
  if (b && typeof b === "object") {
    const w = b.width !== undefined ? b.width : b.w;
    const h = b.height !== undefined ? b.height : b.h;
    return [Number(b.x) || 0, Number(b.y) || 0, Number(w) || 0, Number(h) || 0];
  }
  return [0, 0, 0, 0];
}

// Flatten a compact inspection result into defect rows for tables + overlay.
export function flattenDefects(result) {
  const out = [];
  if (!result || !result.tiles) return out;
  let n = 0;
  for (const t of result.tiles) {
    const tile = t.tile || {};
    const tileLabel = tile.tile_id != null ? tile.tile_id : `${tile.row ?? "?"}-${tile.col ?? "?"}`;
    for (const det of t.detectors || []) {
      const detector = det.detector_id;
      const pass = det.pass;
      for (const def of det.defects || []) {
        n++;
        out.push({
          id: n,
          tile: tileLabel,
          detector,
          type: def.type || "defect",
          bbox: normalizeBbox(def.bbox_global),
          bboxLocal: normalizeBbox(def.bbox_local),
          area: def.area,
          confidence: def.confidence,
          score: typeof det.score === "number" ? det.score : def.confidence,
          pass,
        });
      }
    }
  }
  return out;
}

// Derive the Backend pill / runtime chain state from the sidecar runtime status.
//
// Backend labels come only from runtime/result data, never inferred from a
// recipe request or `runtime_status.mode` (which is the *permission* mode
// `op|eng|admin`, not a GPU policy). `ctx` carries the last observed job result
// and the currently loaded recipe's GPU mode:
//   { lastBackend, backendReason, failureCode, recipeGpuMode }
export function deriveRuntime(runtimeStatus, sidecarInfo, ctx = {}) {
  const rs = runtimeStatus || {};
  const {
    lastBackend = null,
    backendReason = "",
    failureCode = null,
    recipeGpuMode = null,
  } = ctx || {};

  const sidecarOffline =
    rs.sidecar === "offline" || (sidecarInfo && sidecarInfo.state === "offline");
  const sidecar = sidecarOffline ? "offline" : "ready";
  const dll = (rs.cuda && rs.cuda.dll) || "unknown";
  const dllNote =
    dll === "present" ? "CUDA DLL：已找到" : dll === "missing" ? "CUDA DLL：未找到" : "";

  let backend = "none";
  let label = "Sidecar 離線";
  let tone = "ng";
  let reason = "";

  if (sidecar === "ready") {
    if (failureCode === "CUDA_UNAVAILABLE") {
      backend = "none";
      label = "CUDA 不可用";
      tone = "ng";
    } else if (lastBackend === "cuda") {
      backend = "cuda";
      label = "CUDA";
      tone = "pass";
    } else if (lastBackend === "cpu") {
      backend = "cpu";
      const requestedGpu = recipeGpuMode != null && recipeGpuMode !== "cpu";
      if (backendReason || requestedGpu) {
        label = "CPU fallback";
        tone = "warn";
        reason = backendReason || "Recipe 要求 GPU，實際以 CPU 執行";
      } else {
        label = "CPU";
        tone = "neutral";
      }
    } else {
      backend = "none";
      label = "尚未執行";
      tone = "neutral";
    }
  }

  return {
    sidecar,
    sidecar_state: (sidecarInfo && sidecarInfo.state) || sidecar,
    backend,
    dll,
    dllNote,
    label,
    tone,
    reason,
    pid: sidecarInfo && sidecarInfo.pid != null ? sidecarInfo.pid : rs.pid,
    core_version: rs.core_version,
    busy: !!rs.busy,
    cuda: rs.cuda || { dll_path: "", dll: dll, note: "" },
    devices: rs.devices || {},
    recipe_gpu_mode: recipeGpuMode,
  };
}

// Compact backend label for tables (derived from the last result backend/tone).
export function backendLabel(rt) {
  if (!rt) return "—";
  if (rt.backend === "cuda") return "CUDA";
  if (rt.backend === "cpu") return rt.tone === "warn" ? "CPU fallback" : "CPU";
  return "—";
}

// Per-image counts from a batch/monitor item (sidecar sends them top-level; older shapes nest them in `summary`).
export function itemCount(item, key) {
  if (!item) return 0;
  const v = item[key] ?? (item.summary && item.summary[key]);
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

// Real tile grid from an item's compact `detail.tiles` (row/col/result); empty when the sidecar sent none.
export function itemTiles(item) {
  const tiles = (item && item.detail && item.detail.tiles) || [];
  const cells = tiles
    .map((t) => ({ c: Number(t.tile && t.tile.col), r: Number(t.tile && t.tile.row), ng: t.result === "NG", id: t.tile && t.tile.tile_id }))
    .filter((t) => Number.isFinite(t.c) && Number.isFinite(t.r));
  const cols = cells.reduce((m, t) => Math.max(m, t.c + 1), 0);
  const rows = cells.reduce((m, t) => Math.max(m, t.r + 1), 0);
  return { cells, cols, rows };
}

// `detector_catalog` arrives from the sidecar as [{id, label, supports_cuda, params:[{name, type, group, ...}]}];
// screens use id → {tag, gpu, param_spec{name → spec}}. Objects already in that shape (the mock) pass through.
// Parameters without an explicit `outer` group stay `inner` (fail-closed).
export function normalizeCatalog(raw) {
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw;
  const out = {};
  for (const d of raw) {
    const param_spec = {};
    const default_params = {};
    for (const p of d.params || []) {
      const group = p.group === "outer" ? "outer" : "inner";
      param_spec[p.name] = {
        value_type: p.type, default: p.default, minimum: p.min ?? null, maximum: p.max ?? null,
        choices: p.choices || [], parameter_group: group, engineer_visible: group === "outer",
        label: p.label || "", hidden: !!p.hidden,
      };
      if (!p.hidden) default_params[p.name] = p.default;
    }
    out[d.id] = { display_name: d.label || d.id, detector_name: d.id, gpu: !!d.supports_cuda, tag: d.label || d.id, default_params, param_spec };
  }
  return out;
}
