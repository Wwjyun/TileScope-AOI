// ============================================================
// AOI Console — Recipe 設計 screen
// ============================================================

const TILE_MODES = [
  { value: "pattern_match", label: "Pattern Match" },
  { value: "grid", label: "Grid" },
  { value: "contour", label: "Contour" },
];

function TilePreviewCanvas({ previewed }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const board = getSimBoardCanvas();
    ctx.drawImage(board, 0, 0, canvas.width, canvas.height);
    if (previewed) {
      // pattern match 框（對齊 8x6 pad 陣列，取中間 24 個示意）
      const cols = 8, rows = 6;
      const cw = canvas.width / cols, ch = canvas.height / rows;
      ctx.strokeStyle = "#39d98a";
      ctx.lineWidth = 1.5;
      ctx.font = "8px monospace";
      ctx.fillStyle = "#39d98a";
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw + cw * 0.16, y = r * ch + ch * 0.18;
          ctx.strokeRect(x, y, cw * 0.68, ch * 0.64);
        }
      }
    }
  }, [previewed]);
  return (
    <canvas
      ref={ref} width={416} height={312}
      style={{ width: "100%", borderRadius: "var(--r-md)", display: "block", border: "1px solid var(--border)" }}
    />
  );
}

function DesignerScreen({ app }) {
  const [meta, setMeta] = React.useState({
    recipe_name: "DEMO_CUSTOM",
    product_id: "DEMO_PRODUCT",
    machine_id: "DEMO_MACHINE",
    version: "1.0.0",
    precision_um_per_px: "",
  });
  const [tileMode, setTileMode] = React.useState("grid");
  const [gpu, setGpu] = React.useState({ mode: "auto", fallback_to_cpu: true });
  const [gpuAdv, setGpuAdv] = React.useState({ tile_use_gpu: true, cuda_dll: "gpu/visionflow_cuda.dll" });
  const [decision, setDecision] = React.useState("all_detectors_must_pass");
  const [pm, setPm] = React.useState({
    template_path: "samples/template_cell.png",
    match_threshold: 0.8, max_count: 999, nms_threshold: 0.3,
    crop_padding: 8, sort_row_tolerance: 20,
  });
  const [grid, setGrid] = React.useState({ width: 128, height: 128, overlap_x: 0, overlap_y: 0 });
  const [contour, setContour] = React.useState({ min_area: 4000, approx_epsilon: 0.01, threshold_method: "otsu_binary" });
  const [camera, setCamera] = React.useState({
    camera_settings: "Line-scan · 4096×1",
    exposure_us: 500, gain: 1.0, line_length: 4096, line_rate_hz: 1000,
    trigger_mode: "free_run", ext_trigger_single: false,
    write_compare_on_trigger: false, write_encoder_on_trigger: false,
    ext_auto_save: true, sw_trigger_auto_save: true,
  });

  const [enabled, setEnabled] = React.useState({ demo3: true });
  const [activeDet, setActiveDet] = React.useState("demo3");
  const [useGpu, setUseGpu] = React.useState({ demo3: true });
  const [params, setParams] = React.useState(() => {
    const out = {};
    Object.entries(DETECTOR_DEFS).forEach(([id, def]) => { out[id] = { ...def.params }; });
    return out;
  });

  const [status, setStatus] = React.useState({ kind: "idle", text: "尚未預覽" });
  const [previewed, setPreviewed] = React.useState(false);

  const isAdmin = app.mode === "admin";
  const camEditable = isAdmin;

  const stateSig = React.useMemo(
    () => JSON.stringify({ meta, tileMode, gpu, gpuAdv, decision, pm, grid, contour, camera, enabled, useGpu, params }),
    [meta, tileMode, gpu, gpuAdv, decision, pm, grid, contour, camera, enabled, useGpu, params]
  );
  const baseSigRef = React.useRef(stateSig);
  const dirty = baseSigRef.current !== stateSig;

  const setMetaField = (k) => (e) => setMeta({ ...meta, [k]: e.target.value });
  const setGpuMode = (mode) => setGpu((g) => ({ mode, fallback_to_cpu: mode === "auto" ? g.fallback_to_cpu : false }));

  const runPreview = () => {
    if (!app.imageLoaded) {
      setStatus({ kind: "error", text: "請先在「檢測執行」載入影像再預覽切圖" });
      return;
    }
    setStatus({ kind: "busy", text: "sidecar 預覽切圖中…" });
    setPreviewed(false);
    setTimeout(() => {
      setStatus({ kind: "ok", text: "產生 48 張 tile · 縮圖由 Rust 快取回傳" });
      setPreviewed(true);
    }, 900);
  };

  const saveRecipe = () => {
    const detectorIds = Object.keys(enabled).filter((id) => enabled[id]);
    if (!detectorIds.length) {
      setStatus({ kind: "error", text: "請至少啟用一個 detector" });
      return;
    }
    const normalizedGpu = { mode: gpu.mode, fallback_to_cpu: gpu.mode === "auto" && gpu.fallback_to_cpu };
    app.saveDesignedRecipe({
      file: `${meta.recipe_name}.yaml`,
      recipe_name: meta.recipe_name,
      product_id: meta.product_id,
      machine_id: meta.machine_id,
      version: meta.version,
      precision_um_per_px: meta.precision_um_per_px,
      gpu: normalizedGpu, decision,
      tile: { mode: tileMode, ...(tileMode === "pattern_match" ? pm : tileMode === "grid" ? grid : contour) },
      detectors: detectorIds,
      ...(isAdmin ? { camera } : {}),
    });
    baseSigRef.current = stateSig;
    setStatus({ kind: "ok", text: `Recipe 已儲存並載入：recipes/${meta.recipe_name}.yaml` });
  };

  const detectorIds = Object.keys(DETECTOR_DEFS);
  const activeDef = DETECTOR_DEFS[activeDet];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 12 }}>
      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>

        {/* 左：recipe + tiling + 後端 + 相機 + 預覽 */}
        <div className="designer-left" style={{ width: "clamp(300px, 36%, 400px)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <Panel title="Recipe 資訊">
            <FormGrid>
              <FRow label="Recipe 名稱"><TextField mono value={meta.recipe_name} onChange={setMetaField("recipe_name")} /></FRow>
              <FRow label="產品 Product"><TextField mono value={meta.product_id} onChange={setMetaField("product_id")} /></FRow>
              <FRow label="機台 Machine"><TextField mono value={meta.machine_id} onChange={setMetaField("machine_id")} /></FRow>
              <FRow label="版本 Version"><TextField mono value={meta.version} onChange={setMetaField("version")} /></FRow>
              <FRow label="精度 (µm/px)"><TextField mono value={meta.precision_um_per_px} onChange={setMetaField("precision_um_per_px")} placeholder="未填則 CSV 保持 px²" /></FRow>
            </FormGrid>
          </Panel>

          <Panel title="切圖 Tiling" actions={
            <Segmented options={TILE_MODES} value={tileMode} onChange={setTileMode} />
          }>
            {tileMode === "pattern_match" && (
              <FormGrid>
                <FRow label="Template">
                  <div style={{ display: "flex", gap: 6 }}>
                    <TextField mono value={pm.template_path} onChange={(e) => setPm({ ...pm, template_path: e.target.value })} />
                    <Btn variant="secondary" size="sm" style={{ height: "var(--row-h)" }} icon={<IcFolder size={13} />}
                      onClick={() => setPm({ ...pm, template_path: "templates/pad_template.png" })}>選擇</Btn>
                  </div>
                </FRow>
                <FRow label="匹配門檻"><NumField value={pm.match_threshold} onChange={(v) => setPm({ ...pm, match_threshold: v })} step={0.01} min={0} max={1} decimals={3} /></FRow>
                <FRow label="最大匹配數"><NumField value={pm.max_count} onChange={(v) => setPm({ ...pm, max_count: v })} min={1} max={100000} /></FRow>
                <FRow label="NMS 門檻"><NumField value={pm.nms_threshold} onChange={(v) => setPm({ ...pm, nms_threshold: v })} step={0.01} min={0} max={1} decimals={3} /></FRow>
                <FRow label="裁切外擴 px"><NumField value={pm.crop_padding} onChange={(v) => setPm({ ...pm, crop_padding: v })} min={0} /></FRow>
                <FRow label="排序列容差"><NumField value={pm.sort_row_tolerance} onChange={(v) => setPm({ ...pm, sort_row_tolerance: v })} min={1} /></FRow>
              </FormGrid>
            )}
            {tileMode === "grid" && (
              <FormGrid>
                <FRow label="Tile 寬"><NumField value={grid.width} onChange={(v) => setGrid({ ...grid, width: v })} min={32} /></FRow>
                <FRow label="Tile 高"><NumField value={grid.height} onChange={(v) => setGrid({ ...grid, height: v })} min={32} /></FRow>
                <FRow label="重疊 X"><NumField value={grid.overlap_x} onChange={(v) => setGrid({ ...grid, overlap_x: v })} min={0} /></FRow>
                <FRow label="重疊 Y"><NumField value={grid.overlap_y} onChange={(v) => setGrid({ ...grid, overlap_y: v })} min={0} /></FRow>
              </FormGrid>
            )}
            {tileMode === "contour" && (
              <FormGrid>
                <FRow label="最小面積"><NumField value={contour.min_area} onChange={(v) => setContour({ ...contour, min_area: v })} min={0} /></FRow>
                <FRow label="近似 ε"><NumField value={contour.approx_epsilon} onChange={(v) => setContour({ ...contour, approx_epsilon: v })} step={0.005} decimals={3} min={0} /></FRow>
                <FRow label="閾值方法">
                  <select className="field" value={contour.threshold_method} onChange={(e) => setContour({ ...contour, threshold_method: e.target.value })}>
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
                <select className="field" value={gpu.mode} onChange={(e) => setGpuMode(e.target.value)}>
                  <option value="cpu">僅 CPU</option>
                  <option value="auto">GPU 優先，失敗改用 CPU</option>
                  <option value="cuda">僅 GPU（嚴格）</option>
                </select>
              </FRow>
              {gpu.mode === "auto" && (
                <FRow label="缺 DLL 改用 CPU"><Toggle value={gpu.fallback_to_cpu} onChange={(v) => setGpu({ ...gpu, fallback_to_cpu: v })} /></FRow>
              )}
              <FRow label="判定方式">
                <select className="field" value={decision} onChange={(e) => setDecision(e.target.value)}>
                  <option value="all_detectors_must_pass">all_detectors_must_pass</option>
                  <option value="important_detectors_only">important_detectors_only</option>
                </select>
              </FRow>
            </FormGrid>
            {gpu.mode === "cuda" && (
              <div className="banner warn" style={{ marginTop: 10 }}><IcAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>僅 GPU（嚴格）：缺 DLL 或初始化失敗時工作直接失敗，不會改用 CPU。</span></div>
            )}
            {gpu.mode === "auto" && !gpu.fallback_to_cpu && (
              <div className="banner warn" style={{ marginTop: 10 }}><IcAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>已關閉 fallback，等同嚴格模式：缺 DLL 時工作直接失敗。</span></div>
            )}
            <div className="panel-title" style={{ margin: "14px 0 8px" }}>GPU 進階設定</div>
            <FormGrid>
              <FRow label="切小圖使用 GPU"><Toggle value={gpuAdv.tile_use_gpu} onChange={(v) => setGpuAdv({ ...gpuAdv, tile_use_gpu: v })} disabled={gpu.mode === "cpu"} /></FRow>
              <FRow label="CUDA DLL 路徑"><TextField mono value={gpuAdv.cuda_dll} onChange={(e) => setGpuAdv({ ...gpuAdv, cuda_dll: e.target.value })} disabled={gpu.mode === "cpu"} /></FRow>
            </FormGrid>
          </Panel>

          <Panel title="相機 CCD" actions={!camEditable && <Badge kind="neutral"><IcLock size={10} />唯讀</Badge>}>
            {!camEditable && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 10 }}>
                <IcLock size={12} /> 相機 CCD 區段僅管理模式可編輯，非管理模式顯示唯讀。
              </div>
            )}
            <FormGrid>
              <FRow label="相機設定"><TextField mono value={camera.camera_settings} readOnly={!camEditable} onChange={(e) => setCamera({ ...camera, camera_settings: e.target.value })} /></FRow>
              <FRow label="曝光時間 (µs)"><ParamControl value={camera.exposure_us} onChange={(v) => setCamera({ ...camera, exposure_us: v })} readOnly={!camEditable} /></FRow>
              <FRow label="增益"><ParamControl value={camera.gain} onChange={(v) => setCamera({ ...camera, gain: v })} readOnly={!camEditable} /></FRow>
              <FRow label="影像長度（線）"><ParamControl value={camera.line_length} onChange={(v) => setCamera({ ...camera, line_length: v })} readOnly={!camEditable} /></FRow>
              <FRow label="線速率（Hz）"><ParamControl value={camera.line_rate_hz} onChange={(v) => setCamera({ ...camera, line_rate_hz: v })} readOnly={!camEditable} /></FRow>
              <FRow label="觸發模式">
                <select className="field" value={camera.trigger_mode} disabled={!camEditable} onChange={(e) => setCamera({ ...camera, trigger_mode: e.target.value })}>
                  <option value="free_run">連續取像 Free Run</option>
                  <option value="external">外部觸發</option>
                  <option value="software">軟體觸發</option>
                </select>
              </FRow>
              <FRow label="外部觸發單張"><ParamControl value={camera.ext_trigger_single} onChange={(v) => setCamera({ ...camera, ext_trigger_single: v })} readOnly={!camEditable} /></FRow>
              <FRow label="觸發時寫入 Compare"><ParamControl value={camera.write_compare_on_trigger} onChange={(v) => setCamera({ ...camera, write_compare_on_trigger: v })} readOnly={!camEditable} /></FRow>
              <FRow label="同時寫入 Encoder"><ParamControl value={camera.write_encoder_on_trigger} onChange={(v) => setCamera({ ...camera, write_encoder_on_trigger: v })} readOnly={!camEditable} /></FRow>
              <FRow label="外部單張自動存圖"><ParamControl value={camera.ext_auto_save} onChange={(v) => setCamera({ ...camera, ext_auto_save: v })} readOnly={!camEditable} /></FRow>
              <FRow label="軟體觸發自動存圖"><ParamControl value={camera.sw_trigger_auto_save} onChange={(v) => setCamera({ ...camera, sw_trigger_auto_save: v })} readOnly={!camEditable} /></FRow>
            </FormGrid>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
              僅含 camera 區段的 Recipe 才會寫入相機設定；不含 camera 區段時，設備頁的套用會成為此處的未儲存修改。
            </div>
          </Panel>

          <Panel title="切圖預覽">
            <TilePreviewCanvas previewed={previewed} />
            <div style={{
              marginTop: 10, display: "flex", alignItems: "center", gap: 8,
              fontSize: "var(--fs-small)",
              color: status.kind === "error" ? "var(--ng)" : status.kind === "ok" ? "var(--accent-text)" : "var(--text-3)",
            }}>
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
                const def = DETECTOR_DEFS[id];
                const on = !!enabled[id];
                return (
                  <div
                    key={id}
                    className={"row-item" + (activeDet === id ? " selected" : "")}
                    onClick={() => setActiveDet(id)}
                  >
                    <Toggle value={on} onChange={(v) => setEnabled({ ...enabled, [id]: v })} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                        <span className="mono" style={{ fontWeight: 600 }}>{id}</span>
                        {def.gpu && <span className="mono" style={{ fontSize: 10, color: "var(--accent-text)" }}>CUDA</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{def.tag}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--pad-panel)", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{activeDet}</span>
                <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{activeDef.tag}</span>
                <Badge kind={enabled[activeDet] ? "accent" : "neutral"}>{enabled[activeDet] ? "啟用" : "停用"}</Badge>
                <div style={{ flex: 1 }}></div>
                {activeDef.gpu ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-small)", color: "var(--text-2)" }}>
                    use_gpu <Toggle value={!!useGpu[activeDet]} onChange={(v) => setUseGpu({ ...useGpu, [activeDet]: v })} disabled={gpu.mode === "cpu"} />
                  </label>
                ) : <Badge kind="neutral">僅 CPU</Badge>}
              </div>
              <div style={{ maxWidth: 440 }}>
                {(() => {
                  const inner = INNER_PARAMS[activeDet] || [];
                  const entries = Object.entries(params[activeDet]);
                  const outerE = entries.filter(([k]) => !inner.includes(k));
                  const innerE = entries.filter(([k]) => inner.includes(k));
                  const rows = (list) => list.map(([k, v]) => (
                    <FRow key={k} label={<span className="mono">{k}</span>}>
                      <ParamControl value={v} onChange={(nv) => setParams({ ...params, [activeDet]: { ...params[activeDet], [k]: nv } })} />
                    </FRow>
                  ));
                  const head = (t) => <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 8px" }}>{t}</div>;
                  return (
                    <React.Fragment>
                      {isAdmin && head("外層參數")}
                      <FormGrid>{rows(outerE)}</FormGrid>
                      {isAdmin && innerE.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          {head("內層參數 · 管理")}
                          <FormGrid>{rows(innerE)}</FormGrid>
                        </div>
                      )}
                      {isAdmin && activeDet === "demo12" && (
                        <div style={{ marginTop: 16 }}><FormGrid><FRow label="模型資訊"><TextField mono value="yolox_tiny_fixture · 416×416 · fp32" readOnly /></FRow></FormGrid></div>
                      )}
                      {!isAdmin && innerE.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: "var(--fs-small)", color: "var(--text-3)" }}>
                          <IcLock size={12} /> 另有 {innerE.length} 個內層參數，僅管理模式可見。
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>
                        參數範圍與權限由 sidecar 依 parameter_schema 驗證，非管理模式不回傳內層參數值。
                      </div>
                    </React.Fragment>
                  );
                })()}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* action bar */}
      <div className="panel" style={{
        flexDirection: "row", alignItems: "center", gap: 10,
        padding: "10px var(--pad-panel)", flexShrink: 0,
      }}>
        {dirty && <Badge kind="warn"><IcAlert size={11} />未儲存修改</Badge>}
        <span style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>
          已啟用 {Object.values(enabled).filter(Boolean).length} 個 detector
        </span>
        <div style={{ flex: 1 }}></div>
        <Btn variant="secondary" icon={<IcEye size={15} />} onClick={runPreview} disabled={status.kind === "busy"}>
          預覽切圖
        </Btn>
        <Btn variant="primary" icon={<IcSave size={15} />} onClick={saveRecipe} disabled={status.kind === "busy"}>
          儲存 Recipe
        </Btn>
      </div>
    </div>
  );
}

Object.assign(window, { DesignerScreen });
