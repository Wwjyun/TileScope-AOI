// ============================================================
// AOI Console — 檢測執行 screen（單張檢測 + GPU 預熱 + CPU/GPU 對照）
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import ImageViewer from "../components/viewer.jsx";
import { Btn, Panel, EmptyState, FormGrid, FRow, ParamControl, Badge, ProgressBar, Drawer, ResultBadge } from "../components/components.jsx";
import { call, on } from "../api/index.js";
import { COMPARE_CPU_GPU } from "../data/catalog.js";
import {
  IcPlay, IcStop, IcChip, IcLayers, IcCheck, IcAlert, IcFolder, IcRecipe, IcChevronR, IcCrosshair,
} from "../components/icons.jsx";

function DetectorRow({ id, label, def, enabled, expanded, onToggleExpand }) {
  return (
    <div style={{ borderBottom: "1px solid var(--surface-3)" }}>
      <div className="row-item" onClick={onToggleExpand} style={{ borderBottom: "none" }}>
        <span style={{ color: "var(--text-3)", display: "flex", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          <IcChevronR size={13} />
        </span>
        <span className="mono" style={{ fontWeight: 600, color: "var(--text)" }}>{id}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-2)" }}>
          {def ? def.tag : label}
        </span>
        <Badge kind={enabled ? "accent" : "neutral"}>{enabled ? "啟用" : "停用"}</Badge>
      </div>
      {expanded && (
        <div className="fade-in" style={{ padding: "4px 12px 12px 34px" }}>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 8 }}>{def && def.gpu ? "支援 CUDA 加速" : "僅 CPU"}</div>
          <FormGrid>
            {Object.entries(def ? def.default_params : {}).map(([k, v]) => (
              <FRow key={k} label={<span className="mono">{k}</span>}>
                <ParamControl value={v} readOnly />
              </FRow>
            ))}
          </FormGrid>
        </div>
      )}
    </div>
  );
}

function RecipeInfoPanel({ app }) {
  const { recipe, catalog } = app;
  const [expandedId, setExpandedId] = useState(null);
  if (!recipe) {
    return (
      <Panel title="Recipe">
        <EmptyState
          icon={<IcRecipe size={32} strokeWidth={1.3} />}
          title="尚未載入 Recipe"
          action={<Btn variant="secondary" size="sm" icon={<IcFolder size={14} />} onClick={app.openRecipePicker}>載入 Recipe</Btn>}
        />
      </Panel>
    );
  }
  const detectors = Object.entries(recipe.detectors || {}).filter(([, c]) => c.enabled);
  return (
    <Panel title="Recipe" flush actions={<Btn variant="ghost" size="sm" onClick={app.openRecipePicker}>更換</Btn>}>
      <div style={{ padding: "12px var(--pad-panel)", borderBottom: "1px solid var(--surface-3)" }}>
        <div className="mono" style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, wordBreak: "break-all" }}>{recipe.recipe_name}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge kind="neutral">v{recipe.version}</Badge>
          <Badge kind="accent">{recipe.tile && recipe.tile.mode}</Badge>
          <Badge kind="neutral">gpu {recipe.gpu && recipe.gpu.mode}{recipe.gpu && recipe.gpu.mode === "auto" && recipe.gpu.fallback_to_cpu ? " · fallback" : ""}</Badge>
        </div>
      </div>
      <div style={{ padding: "8px var(--pad-panel) 4px", fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Detectors（{detectors.length}）
      </div>
      <div>
        {detectors.map(([id, cfg]) => (
          <DetectorRow
            key={id} id={id} label={cfg.display_name || id} def={catalog[id]}
            enabled expanded={expandedId === id}
            onToggleExpand={() => setExpandedId(expandedId === id ? null : id)}
          />
        ))}
      </div>
    </Panel>
  );
}

function ErrorCard({ err }) {
  return (
    <div className="fade-in" style={{ border: "1px solid #f3c6c3", borderRadius: "var(--r-md)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--ng-soft)", color: "var(--ng)", fontWeight: 700 }}>
        <IcAlert size={16} /> 檢測失敗
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--fs-small)", color: "var(--text-2)" }}>
        <span className="mono" style={{ color: "var(--text)", fontWeight: 600 }}>{err.code}</span>
        <span>{err.message}</span>
        {err.stage && <span className="mono" style={{ color: "var(--text-3)" }}>stage: {err.stage}</span>}
      </div>
    </div>
  );
}

export function BackendBadge({ backend, reason }) {
  if (backend === "cuda") return <Badge kind="pass">CUDA</Badge>;
  if (backend === "cpu") return reason ? <Badge kind="warn">CPU fallback</Badge> : <Badge kind="neutral">CPU</Badge>;
  return <Badge kind="neutral">—</Badge>;
}

function blockReason(app) {
  if (!app.sidecarUp) return "sidecar 離線，請到執行環境重新啟動";
  if (!app.imageLoaded || !app.recipe) return "請先載入影像與 Recipe";
  return null;
}

function RunControlPanel({ app }) {
  const { running, runPct, runMsg, result, job, jobError, startRun, cancelRun, goResults } = app;
  const reason = blockReason(app);
  const [warming, setWarming] = useState(false);
  const [warm, setWarm] = useState(null);
  const [showCompare, setShowCompare] = useState(false);

  const doWarmup = async () => {
    if (warming || !app.sidecarUp) return;
    setWarming(true); setWarm(null);
    const jobIdRef = { current: null };
    const un = await on("job://completed", (p) => {
      if (p.kind === "warmup" && p.job_id === jobIdRef.current) {
        setWarm(p.result || { session_ms: 0, pipeline_ms: 0, vram_mb: 0 });
        setWarming(false);
        un();
      }
    });
    try {
      const res = await call("gpu_warmup", { recipe_path: app.recipe.path || app.recipe.recipe_name, image_path: app.image ? app.image.path : undefined });
      jobIdRef.current = res.job_id;
    } catch (e) {
      setWarming(false); un();
      app.notify({ kind: "error", code: e.code || "INTERNAL", message: e.message || String(e) });
    }
  };

  return (
    <Panel title="檢測控制" actions={job && <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>{job.id}</span>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {running ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="primary" size="lg" disabled style={{ flex: 1 }} icon={<span className="spinner" style={{ borderColor: "rgba(255,255,255,0.35)", borderTopColor: "#fff" }}></span>}>執行中…</Btn>
            <Btn variant="danger" size="lg" icon={<IcStop size={15} />} onClick={cancelRun}>取消</Btn>
          </div>
        ) : (
          <Btn variant="primary" size="lg" icon={<IcPlay size={17} />} disabled={!!reason} onClick={startRun} style={{ width: "100%" }}>開始檢測</Btn>
        )}
        {reason && !running && <div style={{ fontSize: "var(--fs-small)", color: app.sidecarUp ? "var(--text-3)" : "var(--ng)", textAlign: "center" }}>{reason}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" size="sm" icon={warming ? <span className="spinner"></span> : <IcChip size={13} />} disabled={warming || !app.sidecarUp} onClick={doWarmup}>
            GPU 預熱
          </Btn>
          <Btn variant="secondary" size="sm" icon={<IcLayers size={13} />} disabled={!app.imageLoaded || !app.recipe} onClick={() => setShowCompare(true)}>
            CPU／GPU 對照
          </Btn>
        </div>
        {warming && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-small)", color: "var(--text-2)" }}>
            <span className="spinner"></span>背景預熱中…（可直接開始檢測）
          </div>
        )}
        {warm && !warming && (
          <div className="banner info"><IcCheck size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>GPU 預熱完成 · session {warm.session_ms || 0} ms · pipeline {warm.pipeline_ms || 0} ms · reserved {warm.vram_mb ? warm.vram_mb.toLocaleString() + " MB" : "0 MB（CPU backend）"} VRAM</span></div>
        )}

        {running && (
          <React.Fragment>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ProgressBar pct={runPct} />
              <span className="mono" style={{ color: "var(--text-2)", width: 38, textAlign: "right" }}>{runPct}%</span>
            </div>
            <div className="mono" style={{ color: "var(--text-2)", fontSize: 11 }}>{runMsg}</div>
          </React.Fragment>
        )}

        {jobError && !running && <ErrorCard err={jobError} />}

        {result && !running && (
          <div className="fade-in" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: result.final === "NG" ? "var(--ng-soft)" : "var(--pass-soft)" }}>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", color: result.final === "NG" ? "var(--ng)" : "var(--pass)" }}>{result.final}</span>
              <span style={{ fontSize: "var(--fs-small)", color: "var(--text-2)" }}>{result.dur}</span>
              <span style={{ marginLeft: "auto" }}><BackendBadge backend={result.backend} reason={result.backend_reason} /></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: "1px solid var(--border)" }}>
              {[["Tiles", result.summary.tile_count], ["NG Tiles", result.summary.ng_count], ["缺陷", result.summary.defect_count]].map(([k, v]) => (
                <div key={k} style={{ padding: "8px 12px", textAlign: "center" }}>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{v}</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                </div>
              ))}
            </div>
            <button onClick={goResults} style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--accent-text)", padding: "8px", fontSize: "var(--fs-small)", fontWeight: 600, cursor: "pointer" }}>查看完整結果 →</button>
          </div>
        )}

        {job && (
          <div className="event-log">
            {job.events.slice().reverse().map((e, i) => <div key={i}><span className="t">{e.t}</span>{e.text}</div>)}
          </div>
        )}
      </div>
      {showCompare && <CompareDrawer app={app} onClose={() => setShowCompare(false)} />}
    </Panel>
  );
}

function CompareDrawer({ app, onClose }) {
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [data, setData] = useState(COMPARE_CPU_GPU);
  const [err, setErr] = useState(null);

  const run = async () => {
    setState("running"); setErr(null);
    const jobIdRef = { current: null };
    const un = await on("job://completed", (p) => {
      if (p.kind === "compare" && p.job_id === jobIdRef.current) {
        setData(p.result || COMPARE_CPU_GPU);
        setState("done");
        un();
      }
    });
    try {
      const res = await call("backend_compare", { image_path: app.image.path, recipe_path: app.recipe.path || app.recipe.recipe_name, output_dir: app.outputDir });
      jobIdRef.current = res.job_id;
    } catch (e) {
      setState("error"); setErr({ code: e.code || "INTERNAL", message: e.message || String(e) }); un();
    }
  };

  const d = data;
  const agree = d.cpu && d.gpu && d.cpu.result === d.gpu.result && d.cpu.defects === d.gpu.defects;
  return (
    <Drawer title="CPU／GPU 對照" onClose={onClose} width="min(640px, 100vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="primary" icon={<IcLayers size={14} />} disabled={state === "running"} onClick={run}>{state === "running" ? "比對中…" : "開始對照"}</Btn>
        </div>
        {state === "error" && <div className="banner ng"><IcAlert size={15} /><span><span className="mono">{err.code}</span> {err.message}</span></div>}
        <div className="banner warn"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>低 VRAM 效能提醒（範例）：reserved 低於 512 MB 時，建議縮小 tile 或改用 CPU，吞吐可能下降。</span></div>
        <table className="data-table">
          <thead><tr><th></th><th>CPU</th><th>GPU</th></tr></thead>
          <tbody>
            <tr><td>結果</td><td className="mono">{d.cpu ? d.cpu.result : "—"}</td><td className="mono">{d.gpu ? d.gpu.result : "—"}</td></tr>
            <tr><td>缺陷數</td><td className="mono">{d.cpu ? d.cpu.defects : "—"}</td><td className="mono">{d.gpu ? d.gpu.defects : "—"}</td></tr>
            <tr><td>耗時</td><td className="mono">{d.cpu ? d.cpu.dur : "—"}</td><td className="mono">{d.gpu ? d.gpu.dur : "—"}</td></tr>
          </tbody>
        </table>
        <div>
          <div className="panel-title" style={{ marginBottom: 8 }}>逐缺陷 bbox / 面積差異</div>
          <div className="panel" style={{ borderRadius: "var(--r-md)", overflow: "hidden" }}>
            <table className="data-table">
              <thead><tr><th>#</th><th>Tile</th><th>Detector</th><th>CPU bbox</th><th>GPU bbox</th><th style={{ textAlign: "right" }}>CPU 面積</th><th style={{ textAlign: "right" }}>GPU 面積</th><th style={{ textAlign: "right" }}>差</th></tr></thead>
              <tbody>
                {(d.rows || []).map((r) => {
                  const diff = r.gpu_area - r.cpu_area;
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.id}</td>
                      <td className="mono">{r.tile}</td>
                      <td className="mono">{r.detector}</td>
                      <td className="mono">[{r.cpu_bbox.join(", ")}]</td>
                      <td className="mono">[{r.gpu_bbox.join(", ")}]</td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.cpu_area}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.gpu_area}</td>
                      <td className="mono" style={{ textAlign: "right", color: diff ? "var(--warn)" : "var(--text-3)" }}>{diff > 0 ? "+" + diff : diff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {state === "done" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-small)", color: agree ? "var(--pass)" : "var(--warn)" }}>
            {agree ? <IcCheck size={14} /> : <IcAlert size={14} />}
            <span>{agree ? "CPU 與 GPU 結果一致（PASS/NG、缺陷數與 bbox 相符）。" : "CPU 與 GPU 結果存在差異，請檢視上方明細。"}</span>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// OP 模式：大狀態 + 大按鈕
function OpModePanel({ app }) {
  const { running, runPct, runMsg, result, jobError, startRun, cancelRun } = app;
  const reason = blockReason(app);
  const big = running ? `${runPct}%` : jobError ? "錯誤" : result ? result.final : app.sidecarUp ? "待機" : "離線";
  const color = running ? "var(--accent)" : jobError || !app.sidecarUp ? "var(--ng)" : result ? (result.final === "NG" ? "var(--ng)" : "var(--pass)") : "var(--text-3)";
  const sub = running ? runMsg : jobError ? "請通知工程師：" + jobError.code : result ? `缺陷 ${result.summary.defect_count} · NG tiles ${result.summary.ng_count}` : reason || "按下開始檢測";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <Panel>
        <div style={{ textAlign: "center", padding: "18px 0 22px" }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "0.05em", color, fontFamily: "var(--font-mono)", animation: running ? "aoi-pulse 1.4s ease infinite" : "none" }}>{big}</div>
          <div style={{ color: "var(--text-3)", fontSize: "var(--fs-small)", marginTop: 6 }}>{sub}</div>
        </div>
        {running ? (
          <Btn variant="danger" size="lg" icon={<IcStop size={18} />} onClick={cancelRun} style={{ width: "100%", height: 52, fontSize: 16 }}>取消檢測</Btn>
        ) : (
          <Btn variant="primary" size="lg" icon={<IcPlay size={18} />} disabled={!!reason} onClick={startRun} style={{ width: "100%", height: 52, fontSize: 16 }}>開始檢測</Btn>
        )}
      </Panel>
      <Panel title="本班紀錄" flush>
        <table className="data-table">
          <tbody>
            {app.history.map((h, i) => (
              <tr key={i}>
                <td className="mono" style={{ color: "var(--text-3)" }}>{h.time}</td>
                <td><ResultBadge result={h.result} /></td>
                <td className="mono" style={{ textAlign: "right" }}>{h.defects} 缺陷</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export default function RunScreen({ app }) {
  return (
    <div style={{ display: "flex", gap: 12, height: "100%", minHeight: 0 }}>
      <div className="panel" style={{ flex: 1, overflow: "hidden", border: "1px solid var(--border)" }}>
        <ImageViewer
          image={app.image}
          defects={app.result ? app.result.defects : []}
          selectedDefect={app.selectedDefect}
          onSelectDefect={app.setSelectedDefect}
          showOverlay={app.showOverlay}
          onToggleOverlay={() => app.setShowOverlay(!app.showOverlay)}
          running={app.running}
          runPct={app.runPct}
        />
      </div>

      <div style={{ width: 318, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
        {app.mode === "op" ? (
          <OpModePanel app={app} />
        ) : (
          <React.Fragment>
            <RunControlPanel app={app} />
            <RecipeInfoPanel app={app} />
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
