// ============================================================
// AOI Console — 結果 screen（摘要 + 缺陷表 + NG tile 圖庫 + 效能分析）
// ============================================================

let _boardCache = null;
function getSimBoardCanvas() {
  if (!_boardCache) {
    _boardCache = document.createElement("canvas");
    _boardCache.width = IMG_W;
    _boardCache.height = IMG_H;
    drawSimBoard(_boardCache);
  }
  return _boardCache;
}

function TileThumb({ defect, size = 104, selected, onClick }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const board = getSimBoardCanvas();
    const ctx = ref.current.getContext("2d");
    const cx = (defect.x + defect.w / 2) * IMG_W;
    const cy = (defect.y + defect.h / 2) * IMG_H;
    const crop = Math.max(defect.w * IMG_W, defect.h * IMG_H) * 3 + 56;
    const sx = Math.min(Math.max(cx - crop / 2, 0), IMG_W - crop);
    const sy = Math.min(Math.max(cy - crop / 2, 0), IMG_H - crop);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(board, sx, sy, crop, crop, 0, 0, size, size);
    // defect box
    const k = size / crop;
    ctx.strokeStyle = DEFECT_COLOR[defect.type] || "#ff5d52";
    ctx.lineWidth = 2;
    ctx.strokeRect((defect.x * IMG_W - sx) * k, (defect.y * IMG_H - sy) * k, defect.w * IMG_W * k, defect.h * IMG_H * k);
  }, [defect, size]);

  return (
    <button
      onClick={onClick}
      style={{
        border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: 0, cursor: "pointer", background: "var(--viewer-bg)",
        overflow: "hidden", position: "relative",
        boxShadow: selected ? "0 0 0 3px var(--accent-soft)" : "var(--shadow-sm)",
        display: "flex", flexDirection: "column",
      }}
    >
      <canvas ref={ref} width={size} height={size} style={{ display: "block" }} />
      <span className="mono" style={{
        position: "absolute", left: 4, top: 4,
        background: "rgba(13,20,24,0.75)", color: "#fff",
        fontSize: 10, padding: "1px 5px", borderRadius: 3,
      }}>#{defect.id}</span>
      <span style={{
        display: "block", width: "100%",
        background: "var(--surface)", borderTop: "1px solid var(--border)",
        fontSize: 10, color: "var(--text-2)", padding: "3px 6px",
        textAlign: "left", fontFamily: "var(--font-mono)",
      }}>{defect.tile} · {defect.detector}</span>
    </button>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <div className="panel" style={{ padding: "12px 16px", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: tone || "var(--text)" }}>{value}</span>
    </div>
  );
}

function PerfPanel({ result }) {
  const [open, setOpen] = React.useState(false);
  const cpuFallback = result.backend === "cpu";
  const maxMs = Math.max(...PERF_STAGES.map((s) => s.ms), 1);
  return (
    <div className="panel" style={{ flexShrink: 0 }}>
      <header className="panel-header" style={{ cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <span className="panel-title">效能分析</span>
        <span style={{ marginLeft: 8, fontSize: 11, color: cpuFallback ? "var(--warn)" : "var(--pass)" }}>{cpuFallback ? "CPU fallback" : "CUDA"}</span>
        <div style={{ flex: 1 }}></div>
        <Btn variant="ghost" size="sm" icon={<IcChevronD size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? "收合" : "展開"}</Btn>
      </header>
      {open ? (
        <div className="panel-body" style={{ maxHeight: 320, overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {cpuFallback && (
              <div className="banner warn"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>找不到 gpu/visionflow_cuda.dll，依 Recipe <span className="mono">fallback_to_cpu: true</span> 整個 detector 重跑 CPU，結果與 CPU 參考一致但耗時較長。</span></div>
            )}
            <div className="kv" style={{ maxWidth: 520 }}>
              <span>實際後端</span><span>{result.backend === "cuda" ? "CUDA" : "CPU"}</span>
              <span>fallback 原因</span><span>{cpuFallback ? "gpu/visionflow_cuda.dll 未找到" : "—（未發生 fallback）"}</span>
              <span>總耗時</span><span>{result.dur}</span>
            </div>

            <div>
              <div className="panel-title" style={{ marginBottom: 8 }}>各階段</div>
              <table className="data-table">
                <thead><tr><th>階段</th><th style={{ width: "34%" }}></th><th style={{ textAlign: "right" }}>耗時</th></tr></thead>
                <tbody>
                  {PERF_STAGES.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td><div className="perf-bar"><i style={{ width: `${(s.ms / maxMs) * 100}%` }}></i></div></td>
                      <td className="mono" style={{ textAlign: "right" }}>{s.ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="panel-title" style={{ marginBottom: 8 }}>Detector 子階段</div>
              <table className="data-table">
                <thead><tr><th>Detector</th><th>Backend</th><th style={{ textAlign: "right" }}>Tiles</th><th style={{ textAlign: "right" }}>耗時</th></tr></thead>
                <tbody>
                  {PERF_DETECTOR_STAGES.map((d) => (
                    <tr key={d.detector}>
                      <td className="mono">{d.detector}</td>
                      <td>{d.gpu === "CUDA" ? <Badge kind="accent">CUDA</Badge> : <Badge kind="neutral">CPU</Badge>}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{d.tiles}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{d.ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="panel-title" style={{ marginBottom: 8 }}>GPU／CPU 分工</div>
              <table className="data-table">
                <thead><tr><th>階段</th><th style={{ textAlign: "right" }}>GPU</th><th style={{ textAlign: "right" }}>CPU</th></tr></thead>
                <tbody>
                  {PERF_DEVICE_SPLIT.map((d) => (
                    <tr key={d.stage}>
                      <td>{d.stage}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{d.gpu}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{d.cpu}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="panel-title" style={{ marginBottom: 8 }}>傳輸與記憶體</div>
              <div className="kv" style={{ maxWidth: 520 }}>
                {PERF_TRANSFER.map((t) => <React.Fragment key={t.item}><span>{t.item}</span><span>{t.value}</span></React.Fragment>)}
              </div>
            </div>

            <div>
              <div className="panel-title" style={{ marginBottom: 8 }}>注意事項</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-small)", color: "var(--text-2)" }}>
                {PERF_NOTICES.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel-body" style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>收合中，點擊標題列展開各階段耗時。</div>
      )}
    </div>
  );
}

function ResultsScreen({ app }) {
  const { result, selectedDefect, setSelectedDefect } = app;
  const [filter, setFilter] = React.useState("all");
  const [ngCursor, setNgCursor] = React.useState(-1);

  if (!result) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
        <EmptyState
          icon={<IcTable size={40} strokeWidth={1.2} />}
          title="尚無檢測結果"
          hint="到「檢測執行」載入影像與 Recipe 後執行檢測，結果會顯示在這裡。"
          action={<Btn variant="primary" size="sm" icon={<IcPlay size={14} />} onClick={() => app.setScreen("run")}>前往檢測執行</Btn>}
        />
      </div>
    );
  }

  const detectorIds = [...new Set(result.defects.map((d) => d.detector))];
  const defects = filter === "all" ? result.defects : result.defects.filter((d) => d.detector === filter);
  const ngDefects = result.final === "NG" ? result.defects : [];

  const stepNG = React.useCallback((dir) => {
    setNgCursor((c) => {
      const len = ngDefects.length;
      if (!len) return -1;
      if (c < 0) return dir > 0 ? 0 : len - 1;
      return (c + dir + len) % len;
    });
  }, [ngDefects.length]);

  React.useEffect(() => {
    if (ngCursor >= 0 && ngDefects[ngCursor]) setSelectedDefect(ngDefects[ngCursor].id);
  }, [ngCursor, ngDefects]);

  React.useEffect(() => {
    const onKey = (e) => {
      const t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (e.key === "j" || e.key === "J") { e.preventDefault(); stepNG(1); }
      else if (e.key === "k" || e.key === "K") { e.preventDefault(); stepNG(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepNG]);

  const viewInImage = (id) => {
    setSelectedDefect(id);
    app.setShowOverlay(true);
    app.setScreen("run");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      {/* summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1fr 1fr", gap: 12, flexShrink: 0 }}>
        <div className="panel" style={{
          padding: "12px 22px", justifyContent: "center",
          background: result.final === "NG" ? "var(--ng-soft)" : "var(--pass-soft)",
          borderColor: result.final === "NG" ? "#f3c6c3" : "#bfe5cc",
        }}>
          <span style={{
            fontSize: 30, fontWeight: 800, letterSpacing: "0.04em",
            fontFamily: "var(--font-mono)",
            color: result.final === "NG" ? "var(--ng)" : "var(--pass)",
          }}>{result.final}</span>
        </div>
        <StatCard label="Tiles" value={result.summary.tile_count} />
        <StatCard label="NG Tiles" value={result.summary.ng_count} tone="var(--ng)" />
        <StatCard label="缺陷數" value={result.summary.defect_count} tone="var(--ng)" />
        <StatCard label="耗時" value={result.dur} />
        <div className="panel" style={{ padding: "12px 16px", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Job · Backend</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="mono" style={{ fontWeight: 600 }}>{result.job}</span><BackendBadge backend={result.backend} /></span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* defect table */}
        <Panel
          title={`缺陷清單（${defects.length}）`}
          flush
          style={{ flex: 3, minWidth: 0 }}
          actions={
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {ngDefects.length > 0 && (
                <React.Fragment>
                  <Btn variant="ghost" size="sm" title="上一個 NG（K）" onClick={() => stepNG(-1)} icon={<IcChevronR size={13} style={{ transform: "rotate(180deg)" }} />}>上一個 NG</Btn>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{ngCursor >= 0 ? `${ngCursor + 1}/${ngDefects.length}` : "—"}</span>
                  <Btn variant="ghost" size="sm" title="下一個 NG（J）" onClick={() => stepNG(1)} icon={<IcChevronR size={13} />}>下一個 NG</Btn>
                  <span className="kbd">K</span><span className="kbd">J</span>
                </React.Fragment>
              )}
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[{ value: "all", label: "全部" }, ...detectorIds.map((id) => ({ value: id, label: id }))]}
              />
            </div>
          }
        >
          <div style={{ overflowY: "auto", height: "100%" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th><th>Tile</th><th>Detector</th><th>類型</th>
                  <th>Global bbox</th><th style={{ textAlign: "right" }}>面積</th><th style={{ textAlign: "right" }}>分數</th><th></th>
                </tr>
              </thead>
              <tbody>
                {defects.map((d) => (
                  <tr
                    key={d.id}
                    className={"clickable" + (selectedDefect === d.id ? " selected" : "")}
                    onClick={() => setSelectedDefect(selectedDefect === d.id ? null : d.id)}
                  >
                    <td className="mono">{d.id}</td>
                    <td className="mono">{d.tile}</td>
                    <td className="mono">{d.detector}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: DEFECT_COLOR[d.type], flexShrink: 0 }}></span>
                        {DEFECT_TYPE_LABEL[d.type] || d.type}
                      </span>
                    </td>
                    <td className="mono">[{Math.round(d.x * 2048)}, {Math.round(d.y * 1536)}, {Math.round(d.w * 2048)}, {Math.round(d.h * 1536)}]</td>
                    <td className="mono" style={{ textAlign: "right" }}>{d.area}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{d.score.toFixed(4)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Btn variant="ghost" size="sm" icon={<IcCrosshair size={13} />} onClick={(e) => { e.stopPropagation(); viewInImage(d.id); }}>
                        檢視
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* NG tiles + outputs */}
        <div style={{ flex: 1.2, minWidth: 240, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <Panel title="NG Tiles" style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {result.defects.map((d) => (
                <TileThumb
                  key={d.id} defect={d}
                  selected={selectedDefect === d.id}
                  onClick={() => viewInImage(d.id)}
                />
              ))}
            </div>
          </Panel>
          <Panel title="輸出檔案" flush>
            {[
              ["overlay", "_overlay.png", "Overlay"],
              ["csv", ".csv", "CSV"],
              ["json", ".json", "JSON"],
            ].map(([dir, ext, kind]) => [`${dir}/${result.image.replace(/\.png$/, "")}${ext}`, kind]).map(([path, kind]) => (
              <div key={path} className="row-item" title={`outputs/${path}`}>
                <IcFolder size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                <span className="mono" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-2)" }}>{path}</span>
                <Badge kind="neutral">{kind}</Badge>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      <PerfPanel result={result} />
    </div>
  );
}

Object.assign(window, { ResultsScreen });
