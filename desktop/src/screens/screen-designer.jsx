// ============================================================
// AOI Console — Recipe 設計 screen
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Panel, FormGrid, FRow, TextField, NumField, Toggle, Segmented, ParamControl, Badge } from "../components/components.jsx";
import { call, saveFile, isTauri } from "../api/index.js";
import { fileUrl, allowDir } from "../api/index.js";
import { IcFolder, IcLock, IcEye, IcSave, IcAlert, IcCheck } from "../components/icons.jsx";

const TILE_MODES = [
  { value: "pattern_match", label: "Pattern Match" },
  { value: "grid", label: "Grid" },
  { value: "contour", label: "Contour" },
];

function TilePreviewCanvas({ previewSrc }) {
  const ref = useRef(null);
  useEffect(() => {
    if (previewSrc && ref.current) {
      const img = new Image();
      img.onload = () => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#39d98a";
        ctx.lineWidth = 1.5;
        const cols = 8, rows = 6;
        const cw = canvas.width / cols, ch = canvas.height / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.strokeRect(c * cw + cw * 0.16, r * ch + ch * 0.18, cw * 0.68, ch * 0.64);
          }
        }
      };
      img.src = previewSrc;
    }
  }, [previewSrc]);
  if (!previewSrc) {
    return (
      <div style={{ width: "100%", aspectRatio: "4/3", borderRadius: "var(--r-md)", display: "grid", placeItems: "center", border: "1px dashed var(--border)", color: "var(--text-3)", fontSize: "var(--fs-small)" }}>
        尚未預覽
      </div>
    );
  }
  return <canvas ref={ref} width={416} height={312} style={{ width: "100%", borderRadius: "var(--r-md)", display: "block", border: "1px solid var(--border)", background: "var(--viewer-bg)" }} />;
}

export default function DesignerScreen({ app }) {
  const recipe = app.recipe;
  const catalog = app.catalog || {};
  const isAdmin = app.mode === "admin";

  // working copy of the native recipe
  const [work, setWork] = useState(() => JSON.parse(JSON.stringify(recipe ? recipe.recipe : null)));
  const baseSigRef = useRef(JSON.stringify(work));
  const [status, setStatus] = useState({ kind: "idle", text: "尚未預覽" });
  const [previewSrc, setPreviewSrc] = useState(null);

  // re-initialize when the loaded recipe changes
  useEffect(() => {
    if (recipe) {
      const w = JSON.parse(JSON.stringify(recipe.recipe));
      setWork(w);
      baseSigRef.current = JSON.stringify(w);
      setPreviewSrc(null);
    }
  }, [recipe && recipe.path]);

  if (!recipe || !work) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
        <div className="empty-state">
          <IcFolder size={40} strokeWidth={1.2} style={{ opacity: 0.55 }} />
          <div style={{ fontWeight: 600, color: "var(--text-2)", fontSize: 13 }}>尚未載入 Recipe</div>
          <Btn variant="primary" size="sm" onClick={app.openRecipePicker}>載入 Recipe</Btn>
        </div>
      </div>
    );
  }

  const stateSig = JSON.stringify(work);
  const dirty = baseSigRef.current !== stateSig;

  // Sync dirty flag to the app shell for the leave-screen confirm guard.
  useEffect(() => {
    if (app.designerDirtyRef) app.designerDirtyRef.current = dirty;
  }, [dirty, app.designerDirtyRef]);
  useEffect(() => () => { if (app.designerDirtyRef) app.designerDirtyRef.current = false; }, [app.designerDirtyRef]);

  const gpu = work.gpu || {};
  const tile = work.tile || { mode: "grid" };
  const decision = work.decision || { mode: "all_detectors_must_pass" };
  const hasCamera = !!work.camera;
  const camEditable = isAdmin && recipe.camera_editable && hasCamera;

  const setGpu = (patch) => setWork({ ...work, gpu: { ...gpu, ...patch } });
  const setGpuMode = (mode) => setGpu({ mode, fallback_to_cpu: mode === "auto" ? gpu.fallback_to_cpu : false });
  const setTile = (patch) => setWork({ ...work, tile: { ...tile, ...patch } });
  const setMeta = (k, v) => setWork({ ...work, [k]: v });
  const setDetector = (id, patch) => setWork({ ...work, detectors: { ...work.detectors, [id]: { ...work.detectors[id], ...patch } } });
  const setParam = (id, k, v) => setDetector(id, { params: { ...(work.detectors[id].params || {}), [k]: v } });

  const detectorIds = Object.keys(work.detectors || {});
  const enabledCount = detectorIds.filter((id) => work.detectors[id].enabled).length;
  const hiddenInnerCount = recipe.hidden_inner_count || 0;

  const runPreview = async () => {
    if (!app.imageLoaded) {
      setStatus({ kind: "error", text: "請先在「檢測執行」載入影像再預覽切圖" });
      return;
    }
    setStatus({ kind: "busy", text: "sidecar 預覽切圖中…" });
    setPreviewSrc(null);
    try {
      const res = await call("preview_tiles", { image_path: app.image.path, recipe_path: recipe.path || recipe.recipe.recipe_name, tile: work.tile });
      const count = res.count || 0;
      const p = res.preview_path;
      if (p) {
        if (isTauri) await allowDir(p.split(/[\\/]/).slice(0, -1).join("/") || ".").catch(() => {});
        setPreviewSrc(fileUrl(p));
      }
      setStatus({ kind: "ok", text: `產生 ${count} 張 tile · 縮圖由 Rust 快取回傳` });
    } catch (e) {
      setStatus({ kind: "error", text: `${e.code || "INTERNAL"} ${e.message || String(e)}` });
    }
  };

  const doSave = async (targetPath, basePath) => {
    const precisionStr = work.output && work.output.pixel_size_um_per_px;
    const normalized = {
      ...work,
      gpu: { ...gpu, fallback_to_cpu: gpu.mode === "auto" ? !!gpu.fallback_to_cpu : false },
      output: { ...(work.output || {}), pixel_size_um_per_px: (precisionStr == null || precisionStr === "") ? null : parseFloat(precisionStr) },
      camera: hasCamera ? work.camera : undefined,
    };
    const res = await call("save_recipe", { path: targetPath, recipe: normalized, base_path: basePath || undefined });
    const savedPath = res.path || targetPath;
    await app.loadRecipe(savedPath);
    const clean = JSON.parse(JSON.stringify(normalized));
    setWork(clean);
    baseSigRef.current = JSON.stringify(clean);
    setStatus({ kind: "ok", text: `Recipe 已儲存並載入：${savedPath}` });
  };

  const saveRecipe = async () => {
    if (!enabledCount) { setStatus({ kind: "error", text: "請至少啟用一個 detector" }); return; }
    setStatus({ kind: "busy", text: "儲存中…" });
    try {
      if (recipe.path) {
        await doSave(recipe.path, recipe.path);
      } else {
        const p = await saveFile({ defaultPath: `${work.recipe_name}.yaml`, filters: [{ name: "YAML", extensions: ["yaml", "yml"] }] });
        if (!p) { setStatus({ kind: "idle", text: "尚未預覽" }); return; }
        await doSave(p, recipe.path);
      }
    } catch (e) {
      setStatus({ kind: "error", text: `${e.code || "INTERNAL"} ${e.message || String(e)}` });
    }
  };

  const saveAs = async () => {
    if (!enabledCount) { setStatus({ kind: "error", text: "請至少啟用一個 detector" }); return; }
    const p = await saveFile({ defaultPath: `${work.recipe_name}.yaml`, filters: [{ name: "YAML", extensions: ["yaml", "yml"] }] });
    if (!p) return;
    setStatus({ kind: "busy", text: "儲存中…" });
    try {
      await doSave(p, recipe.path);
    } catch (e) {
      setStatus({ kind: "error", text: `${e.code || "INTERNAL"} ${e.message || String(e)}` });
    }
  };

  const renderParamRows = (id, list) => list.map(([k, spec]) => (
    <FRow key={k} label={<span className="mono">{k}</span>}>
      <ParamControl value={work.detectors[id].params[k]} onChange={(nv) => setParam(id, k, nv)} />
    </FRow>
  ));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 12 }}>
      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* 左：recipe + tiling + 後端 + 相機 + 預覽 */}
        <div className="designer-left" style={{ width: "clamp(300px, 36%, 400px)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <Panel title="Recipe 資訊">
            <FormGrid>
              <FRow label="Recipe 名稱"><TextField mono value={work.recipe_name || ""} onChange={(e) => setMeta("recipe_name", e.target.value)} /></FRow>
              <FRow label="產品 Product"><TextField mono value={work.product_id || ""} onChange={(e) => setMeta("product_id", e.target.value)} /></FRow>
              <FRow label="機台 Machine"><TextField mono value={work.machine_id || ""} onChange={(e) => setMeta("machine_id", e.target.value)} /></FRow>
              <FRow label="版本 Version"><TextField mono value={work.version || ""} onChange={(e) => setMeta("version", e.target.value)} /></FRow>
              <FRow label="精度 (µm/px)"><TextField mono value={work.output && work.output.pixel_size_um_per_px != null ? String(work.output.pixel_size_um_per_px) : ""} onChange={(e) => setWork({ ...work, output: { ...(work.output || {}), pixel_size_um_per_px: e.target.value } })} placeholder="未填則 CSV 保持 px²" /></FRow>
            </FormGrid>
          </Panel>

          <Panel title="切圖 Tiling" actions={<Segmented options={TILE_MODES} value={tile.mode} onChange={(m) => setTile({ mode: m })} />}>
            {tile.mode === "pattern_match" && (
              <FormGrid>
                <FRow label="Template"><TextField mono value={tile.template_path || ""} onChange={(e) => setTile({ template_path: e.target.value })} /></FRow>
                <FRow label="匹配門檻"><NumField value={tile.match_threshold ?? 0.8} onChange={(v) => setTile({ match_threshold: v })} step={0.01} min={0} max={1} decimals={3} /></FRow>
                <FRow label="最大匹配數"><NumField value={tile.max_count ?? 999} onChange={(v) => setTile({ max_count: v })} min={1} max={100000} /></FRow>
                <FRow label="NMS 門檻"><NumField value={tile.nms_threshold ?? 0.3} onChange={(v) => setTile({ nms_threshold: v })} step={0.01} min={0} max={1} decimals={3} /></FRow>
                <FRow label="裁切外擴 px"><NumField value={tile.crop_padding ?? 8} onChange={(v) => setTile({ crop_padding: v })} min={0} /></FRow>
                <FRow label="排序列容差"><NumField value={tile.sort_row_tolerance ?? 20} onChange={(v) => setTile({ sort_row_tolerance: v })} min={1} /></FRow>
              </FormGrid>
            )}
            {tile.mode === "grid" && (
              <FormGrid>
                <FRow label="Tile 寬"><NumField value={tile.width ?? 128} onChange={(v) => setTile({ width: v })} min={32} /></FRow>
                <FRow label="Tile 高"><NumField value={tile.height ?? 128} onChange={(v) => setTile({ height: v })} min={32} /></FRow>
                <FRow label="重疊 X"><NumField value={tile.overlap_x ?? 0} onChange={(v) => setTile({ overlap_x: v })} min={0} /></FRow>
                <FRow label="重疊 Y"><NumField value={tile.overlap_y ?? 0} onChange={(v) => setTile({ overlap_y: v })} min={0} /></FRow>
              </FormGrid>
            )}
            {tile.mode === "contour" && (
              <FormGrid>
                <FRow label="最小面積"><NumField value={tile.min_area ?? 4000} onChange={(v) => setTile({ min_area: v })} min={0} /></FRow>
                <FRow label="近似 ε"><NumField value={tile.approx_epsilon ?? 0.01} onChange={(v) => setTile({ approx_epsilon: v })} step={0.005} decimals={3} min={0} /></FRow>
                <FRow label="閾值方法">
                  <select className="field" value={tile.threshold_method || "otsu_binary"} onChange={(e) => setTile({ threshold_method: e.target.value })}>
                    <option value="global_binary">Global binary</option>
                    <option value="otsu_binary">Otsu binary</option>
                    <option value="adaptive_mean">Adaptive mean</option>
                    <option value="adaptive_gaussian">Adaptive gaussian</option>
                  </select>
                </FRow>
              </FormGrid>
            )}
          </Panel>

          <Panel title="運算後端">
            <FormGrid>
              <FRow label="模式">
                <select className="field" value={gpu.mode || "auto"} onChange={(e) => setGpuMode(e.target.value)}>
                  <option value="cpu">僅 CPU</option>
                  <option value="auto">GPU 優先，失敗改用 CPU</option>
                  <option value="cuda">僅 GPU（嚴格）</option>
                </select>
              </FRow>
              {gpu.mode === "auto" && <FRow label="缺 DLL 改用 CPU"><Toggle value={!!gpu.fallback_to_cpu} onChange={(v) => setGpu({ fallback_to_cpu: v })} /></FRow>}
              <FRow label="判定方式">
                <select className="field" value={decision.mode || "all_detectors_must_pass"} onChange={(e) => setWork({ ...work, decision: { ...decision, mode: e.target.value } })}>
                  <option value="all_detectors_must_pass">all_detectors_must_pass</option>
                  <option value="important_detectors_only">important_detectors_only</option>
                </select>
              </FRow>
            </FormGrid>
            {gpu.mode === "cuda" && <div className="banner warn" style={{ marginTop: 10 }}><IcAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>僅 GPU（嚴格）：缺 DLL 或初始化失敗時工作直接失敗，不會改用 CPU。</span></div>}
            {gpu.mode === "auto" && !gpu.fallback_to_cpu && <div className="banner warn" style={{ marginTop: 10 }}><IcAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>已關閉 fallback，等同嚴格模式：缺 DLL 時工作直接失敗。</span></div>}
            <div className="panel-title" style={{ margin: "14px 0 8px" }}>GPU 進階設定</div>
            <FormGrid>
              <FRow label="切小圖使用 GPU"><Toggle value={!!gpu.tiling} onChange={(v) => setGpu({ tiling: v })} disabled={gpu.mode === "cpu"} /></FRow>
              <FRow label="CUDA DLL 路徑"><TextField mono value={gpu.dll_path || ""} onChange={(e) => setGpu({ dll_path: e.target.value })} disabled={gpu.mode === "cpu"} /></FRow>
            </FormGrid>
          </Panel>

          <Panel title="相機 CCD" actions={!camEditable && <Badge kind="neutral"><IcLock size={10} />唯讀</Badge>}>
            {!hasCamera ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-small)", color: "var(--text-3)" }}>
                <IcLock size={12} /> 此 Recipe 未含 camera 區段，不會變更相機設定。
              </div>
            ) : (
              <React.Fragment>
                {!camEditable && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 10 }}><IcLock size={12} /> 相機 CCD 區段僅管理模式可編輯。</div>}
                <FormGrid>
                  {Object.entries(work.camera || {}).map(([k, v]) => {
                    if (typeof v === "boolean") return <FRow key={k} label={<span className="mono">{k}</span>}><ParamControl value={v} onChange={(nv) => setWork({ ...work, camera: { ...work.camera, [k]: nv } })} readOnly={!camEditable} /></FRow>;
                    if (typeof v === "number") return <FRow key={k} label={<span className="mono">{k}</span>}><ParamControl value={v} onChange={(nv) => setWork({ ...work, camera: { ...work.camera, [k]: nv } })} readOnly={!camEditable} /></FRow>;
                    return <FRow key={k} label={<span className="mono">{k}</span>}><TextField mono value={String(v)} readOnly={!camEditable} onChange={(e) => setWork({ ...work, camera: { ...work.camera, [k]: e.target.value } })} /></FRow>;
                  })}
                </FormGrid>
              </React.Fragment>
            )}
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>僅含 camera 區段的 Recipe 才會寫入相機設定；不含 camera 區段時，設備頁的套用會成為此處的未儲存修改。</div>
          </Panel>

          <Panel title="切圖預覽">
            <TilePreviewCanvas previewSrc={previewSrc} />
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-small)", color: status.kind === "error" ? "var(--ng)" : status.kind === "ok" ? "var(--accent-text)" : "var(--text-3)" }}>
              {status.kind === "busy" && <span className="spinner"></span>}
              <span>{status.text}</span>
            </div>
          </Panel>
        </div>

        {/* 右：detector 選用與參數 */}
        <Panel title="Detector 選用與參數" flush style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
            <div style={{ width: "clamp(180px, 32%, 250px)", borderRight: "1px solid var(--border)", overflowY: "auto", flexShrink: 0 }}>
              {detectorIds.map((id) => {
                const def = catalog[id];
                const cfg = work.detectors[id];
                return (
                  <div key={id} className={"row-item"}>
                    <Toggle value={!!cfg.enabled} onChange={(v) => setDetector(id, { enabled: v })} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                        <span className="mono" style={{ fontWeight: 600 }}>{id}</span>
                        {def && def.gpu && <span className="mono" style={{ fontSize: 10, color: "var(--accent-text)" }}>CUDA</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{def ? def.tag : (cfg.display_name || "")}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--pad-panel)", minWidth: 0 }}>
              {detectorIds.map((id) => {
                const def = catalog[id];
                const cfg = work.detectors[id];
                if (!cfg.enabled) return null;
                const specs = (def && def.param_spec) || {};
                const params = cfg.params || {};
                const entries = Object.keys(params).map((k) => [k, specs[k] || { parameter_group: "inner" }]);
                const outerE = entries.filter(([, s]) => s.parameter_group === "outer");
                const innerE = entries.filter(([, s]) => s.parameter_group === "inner");
                // The sidecar strips inner values for non-admin modes, so count them from the catalog spec.
                const hiddenForDetector = Object.values(specs).filter((sp) => sp.parameter_group !== "outer").length;
                const head = (t) => <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 8px" }}>{t}</div>;
                return (
                  <div key={id} style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{id}</span>
                      <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{def ? def.tag : (cfg.display_name || "")}</span>
                      <div style={{ flex: 1 }}></div>
                      {def && def.gpu ? (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-small)", color: "var(--text-2)" }}>use_gpu <Toggle value={!!cfg.use_gpu} onChange={(v) => setDetector(id, { use_gpu: v })} disabled={gpu.mode === "cpu"} /></label>
                      ) : <Badge kind="neutral">僅 CPU</Badge>}
                    </div>
                    <div style={{ maxWidth: 440 }}>
                      {isAdmin && head("外層參數")}
                      <FormGrid>{renderParamRows(id, outerE)}</FormGrid>
                      {isAdmin && innerE.length > 0 && (
                        <div style={{ marginTop: 16 }}>{head("內層參數 · 管理")}<FormGrid>{renderParamRows(id, innerE)}</FormGrid></div>
                      )}
                      {!isAdmin && (innerE.length > 0 || hiddenForDetector > 0) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: "var(--fs-small)", color: "var(--text-3)" }}>
                          <IcLock size={12} /> 另有 {hiddenForDetector || innerE.length} 個內層參數，僅管理模式可見。
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-3)" }}>
                參數範圍與權限由 sidecar 依 parameter_schema 驗證，非管理模式不回傳內層參數值。
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* action bar */}
      <div className="panel" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: "10px var(--pad-panel)", flexShrink: 0 }}>
        {dirty && <Badge kind="warn"><IcAlert size={11} />未儲存修改</Badge>}
        <span style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>已啟用 {enabledCount} 個 detector</span>
        <div style={{ flex: 1 }}></div>
        <Btn variant="secondary" icon={<IcEye size={15} />} onClick={runPreview} disabled={status.kind === "busy"}>預覽切圖</Btn>
        <Btn variant="ghost" icon={<IcSave size={15} />} onClick={saveAs} disabled={status.kind === "busy"}>另存新檔</Btn>
        <Btn variant="primary" icon={<IcSave size={15} />} onClick={saveRecipe} disabled={status.kind === "busy"}>儲存 Recipe</Btn>
      </div>
    </div>
  );
}
