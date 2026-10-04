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
