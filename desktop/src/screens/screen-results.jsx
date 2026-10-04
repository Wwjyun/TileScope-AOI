// ============================================================
// AOI Console — 結果 screen（摘要 + 缺陷表 + NG tile 圖庫 + 效能分析）
// ============================================================
import React, { useEffect, useState, useCallback } from "react";
import { Btn, Panel, EmptyState, Segmented, Badge } from "../components/components.jsx";
import { BackendBadge } from "./screen-run.jsx";
import { fileUrl, allowDir, openFileOrDir } from "../api/index.js";
import { DEFECT_COLOR } from "../components/viewer.jsx";
import { basename } from "../lib/util.js";
import { DEFECT_TYPE_LABEL } from "../data/catalog.js";
import { IcTable, IcPlay, IcChevronR, IcChevronD, IcCrosshair, IcAlert, IcCheck, IcFolder } from "../components/icons.jsx";

function StatCard({ label, value, tone }) {
  return (
    <div className="panel" style={{ padding: "12px 16px", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: tone || "var(--text)" }}>{value}</span>
    </div>
  );
}

function NgTile({ path, tileId, onFail }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span style={{ display: "none" }} data-ng-tile-failed />;
  return (
    <div style={{ position: "relative", width: 96, height: 96 }}>
      <img
        src={fileUrl(path)} alt={tileId}
        onError={() => { setFailed(true); onFail && onFail(); }}
        style={{ width: "100%", height: "100%", objectFit: "cover", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--viewer-bg)", display: "block" }}
      />
      <span className="mono" style={{ position: "absolute", left: 4, top: 4, background: "rgba(13,20,24,0.75)", color: "#fff", fontSize: 10, padding: "1px 5px", borderRadius: 3 }}>{tileId}</span>
    </div>
  );
}

function PerfPanel({ result }) {
  const [open, setOpen] = useState(false);
  const perf = result.performance || {};
  const cpuFallback = result.backend === "cpu" && !!result.backend_reason;
  const stages = perf.stages || [];
  const detectorStages = perf.detector_stages || [];
  const deviceSplit = perf.device_split || [];
  const transfer = perf.transfer_memory || [];
  const notices = perf.notices || [];
  const maxMs = Math.max(...stages.map((s) => s.ms || 0), 1);
  return (
    <div className="panel" style={{ flexShrink: 0 }}>
      <header className="panel-header" style={{ cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <span className="panel-title">效能分析</span>
        <span style={{ marginLeft: 8, fontSize: 11, color: result.backend === "cuda" ? "var(--pass)" : cpuFallback ? "var(--warn)" : "var(--text-3)" }}>{result.backend === "cuda" ? "CUDA" : cpuFallback ? "CPU fallback" : result.backend === "cpu" ? "CPU" : "—"}</span>
        <div style={{ flex: 1 }}></div>
        <Btn variant="ghost" size="sm" icon={<IcChevronD size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? "收合" : "展開"}</Btn>
      </header>
      {open ? (
        <div className="panel-body" style={{ maxHeight: 320, overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {cpuFallback && (
              <div className="banner warn"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>CPU fallback：{result.backend_reason || "GPU 不可用，已改以 CPU 執行"}。</span></div>
            )}
            <div className="kv" style={{ maxWidth: 520 }}>
              <span>實際後端</span><span>{result.backend === "cuda" ? "CUDA" : result.backend === "cpu" ? "CPU" : "—"}</span>
              <span>fallback 原因</span><span>{result.backend_reason || "—（未發生 fallback）"}</span>
              <span>總耗時</span><span>{result.dur}</span>
            </div>

            {stages.length > 0 && (
              <div>
                <div className="panel-title" style={{ marginBottom: 8 }}>各階段</div>
                <table className="data-table">
                  <thead><tr><th>階段</th><th style={{ width: "34%" }}></th><th style={{ textAlign: "right" }}>耗時</th></tr></thead>
                  <tbody>
                    {stages.map((s) => (
                      <tr key={s.label}>
                        <td>{s.label}</td>
                        <td><div className="perf-bar"><i style={{ width: `${((s.ms || 0) / maxMs) * 100}%` }}></i></div></td>
                        <td className="mono" style={{ textAlign: "right" }}>{s.ms} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detectorStages.length > 0 && (
              <div>
                <div className="panel-title" style={{ marginBottom: 8 }}>Detector 子階段</div>
                <table className="data-table">
                  <thead><tr><th>Detector</th><th>Backend</th><th style={{ textAlign: "right" }}>Tiles</th><th style={{ textAlign: "right" }}>耗時</th></tr></thead>
                  <tbody>
                    {detectorStages.map((d) => (
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
            )}

            {deviceSplit.length > 0 && (
              <div>
                <div className="panel-title" style={{ marginBottom: 8 }}>GPU／CPU 分工</div>
                <table className="data-table">
                  <thead><tr><th>階段</th><th style={{ textAlign: "right" }}>GPU</th><th style={{ textAlign: "right" }}>CPU</th></tr></thead>
                  <tbody>
                    {deviceSplit.map((d) => (
                      <tr key={d.stage}>
                        <td>{d.stage}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{d.gpu}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{d.cpu}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {transfer.length > 0 && (
              <div>
                <div className="panel-title" style={{ marginBottom: 8 }}>傳輸與記憶體</div>
                <div className="kv" style={{ maxWidth: 520 }}>
                  {transfer.map((t) => <React.Fragment key={t.item}><span>{t.item}</span><span>{t.value}</span></React.Fragment>)}
                </div>
              </div>
            )}

            {notices.length > 0 && (
              <div>
                <div className="panel-title" style={{ marginBottom: 8 }}>注意事項</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-small)", color: "var(--text-2)" }}>
                  {notices.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="panel-body" style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>收合中，點擊標題列展開各階段耗時。</div>
      )}
    </div>
  );
}

// Derive NG tile image paths from outputs.ng_tiles_dir + NG tile ids.
function ngTilePaths(result) {
  const dir = result.outputs && result.outputs.ng_tiles_dir;
  if (!dir) return [];
  const s = basename(result.image_name || "image").replace(/\.[^.]+$/, "");
  const seen = new Set();
  const out = [];
  for (const t of result.tiles || []) {
    if (t.result !== "NG") continue;
    const id = (t.tile && t.tile.tile_id) != null ? t.tile.tile_id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ tileId: id, path: `${dir.replace(/[\\/]$/, "")}/${s}_${id}.png` });
  }
  return out;
}

export default function ResultsScreen({ app }) {
  const { result, selectedDefect, setSelectedDefect } = app;
  const [filter, setFilter] = useState("all");
  const [ngCursor, setNgCursor] = useState(-1);

  useEffect(() => {
    const dir = result && result.outputs && result.outputs.ng_tiles_dir;
    if (dir) allowDir(dir).catch(() => {});
  }, [result]);

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

  const defects = result.defects || [];
  const detectorIds = [...new Set(defects.map((d) => d.detector))];
  const filtered = filter === "all" ? defects : defects.filter((d) => d.detector === filter);
  const ngDefects = result.final === "NG" ? defects : [];
  const ngTiles = ngTilePaths(result);

  const stepNG = useCallback((dir) => {
    setNgCursor((c) => {
      const len = ngDefects.length;
      if (!len) return -1;
      if (c < 0) return dir > 0 ? 0 : len - 1;
      return (c + dir + len) % len;
    });
  }, [ngDefects.length]);

  useEffect(() => {
    if (ngCursor >= 0 && ngDefects[ngCursor]) setSelectedDefect(ngDefects[ngCursor].id);
  }, [ngCursor, ngDefects, setSelectedDefect]);

  useEffect(() => {
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

  const outputEntries = [];
  const outs = result.outputs || {};
  if (outs.overlay) outputEntries.push([outs.overlay, "Overlay"]);
  if (outs.csv) outputEntries.push([outs.csv, "CSV"]);
  if (outs.json) outputEntries.push([outs.json, "JSON"]);
  if (outs.matrix_csv) outputEntries.push([outs.matrix_csv, "Matrix CSV"]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      {/* summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1fr 1fr", gap: 12, flexShrink: 0 }}>
        <div className="panel" style={{
          padding: "12px 22px", justifyContent: "center",
          background: result.final === "NG" ? "var(--ng-soft)" : "var(--pass-soft)",
          borderColor: result.final === "NG" ? "#f3c6c3" : "#bfe5cc",
        }}>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.04em", fontFamily: "var(--font-mono)", color: result.final === "NG" ? "var(--ng)" : "var(--pass)" }}>{result.final}</span>
        </div>
        <StatCard label="Tiles" value={result.summary ? result.summary.tile_count : 0} />
        <StatCard label="NG Tiles" value={result.summary ? result.summary.ng_count : 0} tone="var(--ng)" />
        <StatCard label="缺陷數" value={result.summary ? result.summary.defect_count : 0} tone="var(--ng)" />
        <StatCard label="耗時" value={result.dur} />
        <div className="panel" style={{ padding: "12px 16px", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Job · Backend</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="mono" style={{ fontWeight: 600 }}>{result.job_id || "—"}</span><BackendBadge backend={result.backend} reason={result.backend_reason} /></span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        <Panel
          title={`缺陷清單（${filtered.length}）`}
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
              <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "全部" }, ...detectorIds.map((id) => ({ value: id, label: id }))]} />
            </div>
          }
        >
          <div style={{ overflowY: "auto", height: "100%" }}>
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Tile</th><th>Detector</th><th>類型</th><th>Global bbox</th><th style={{ textAlign: "right" }}>面積</th><th style={{ textAlign: "right" }}>分數</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className={"clickable" + (selectedDefect === d.id ? " selected" : "")} onClick={() => setSelectedDefect(selectedDefect === d.id ? null : d.id)}>
                    <td className="mono">{d.id}</td>
                    <td className="mono">{d.tile}</td>
                    <td className="mono">{d.detector}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: DEFECT_COLOR[d.type] || "#ff5d52", flexShrink: 0 }}></span>
                        {DEFECT_TYPE_LABEL[d.type] || d.type}
                      </span>
                    </td>
                    <td className="mono">[{d.bbox.map((v) => Math.round(v)).join(", ")}]</td>
                    <td className="mono" style={{ textAlign: "right" }}>{d.area}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{typeof d.score === "number" ? d.score.toFixed(4) : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <Btn variant="ghost" size="sm" icon={<IcCrosshair size={13} />} onClick={(e) => { e.stopPropagation(); viewInImage(d.id); }}>檢視</Btn>
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-3)", padding: 24 }}>無缺陷</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <div style={{ flex: 1.2, minWidth: 240, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          {ngTiles.length > 0 && (
            <Panel title="NG Tiles" style={{ flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {ngTiles.map((t) => <NgTile key={t.tileId} path={t.path} tileId={t.tileId} />)}
              </div>
            </Panel>
          )}
          <Panel title="輸出檔案" flush>
            {outputEntries.map(([path, kind]) => (
              <div key={path} className="row-item" title={path} onClick={() => openFileOrDir(path).catch(() => {})}>
                <IcFolder size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                <span className="mono" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-2)" }}>{path}</span>
                <Badge kind="neutral">{kind}</Badge>
              </div>
            ))}
            {!outputEntries.length && <div style={{ padding: 14, color: "var(--text-3)", fontSize: "var(--fs-small)" }}>無輸出檔案</div>}
          </Panel>
        </div>
      </div>

      <PerfPanel result={result} />
    </div>
  );
}
