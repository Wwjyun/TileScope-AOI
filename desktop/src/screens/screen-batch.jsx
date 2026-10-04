// AOI Console — 批次檢測 / 資料夾監控 screens
import React, { useEffect, useRef, useState } from "react";
import { Btn, Panel, EmptyState, FormGrid, FRow, TextField, Toggle, Segmented, ResultBadge, Badge, ProgressBar, Chip } from "../components/components.jsx";
import {
  IcFolder, IcRecipe, IcPlay, IcStop, IcRadar, IcImage, IcCheck, IcLock, IcAlert,
} from "../components/icons.jsx";
import { backendLabel } from "../lib/util.js";

export function SmallStat({ label, value, tone }) {
  return (
    <div className="panel" style={{ padding: "10px 14px", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: tone || "var(--text)" }}>{value}</span>
    </div>
  );
}

function Thumb({ app, name, size = 220 }) {
  const src = app.imageSrcFor && app.imageSrcFor(name);
  if (!src) {
    return <div style={{ width: "100%", aspectRatio: "4/3", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--viewer-bg)", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>無縮圖</div>;
  }
  return <img src={src} alt={name} style={{ width: "100%", display: "block", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--viewer-bg)" }} />;
}

// 依序號決定性產生 tile 散佈資料（切圖 x/y 以格點表示）
export function tileScatterTiles(seedIdx, ngTiles, cols = 16, rows = 12) {
  const total = cols * rows;
  let seed = seedIdx * 7919 + 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const target = Math.min(Math.max(ngTiles || 0, 0), total);
  const ngSet = new Set();
  while (ngSet.size < target) ngSet.add(Math.floor(rnd() * total));
  const tiles = [];
  for (let t = 0; t < total; t++) tiles.push({ c: t % cols, r: Math.floor(t / cols), ng: ngSet.has(t) });
  return tiles;
}

export function TileScatterSVG({ tiles, cols = 16, rows = 12, height = 220 }) {
  const cw = 100 / cols, ch = 100 / rows;
  const ng = tiles.filter((t) => t.ng).length;
  const pass = tiles.length - ng;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <svg viewBox="0 0 100 100" style={{ width: "100%", height, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }} preserveAspectRatio="xMidYMid meet">
        {tiles.map((t, i) => (
          <rect key={i} x={t.c * cw + cw * 0.08} y={t.r * ch + ch * 0.08} width={cw * 0.84} height={ch * 0.84} rx={1}
            fill={t.ng ? "var(--ng)" : "var(--pass)"} opacity={t.ng ? 0.85 : 0.5}>
            <title>{`tile (${t.c},${t.r}) ${t.ng ? "NG" : "PASS"}`}</title>
          </rect>
        ))}
      </svg>
      <div className="scatter-legend">
        <span><i className="sw" style={{ background: "var(--pass)" }}></i>PASS {pass}</span>
        <span><i className="sw" style={{ background: "var(--ng)" }}></i>NG {ng}</span>
        <span style={{ color: "var(--text-3)" }}>共 {tiles.length} tiles</span>
      </div>
    </div>
  );
}

export function MonitorSeriesScatter({ rows, height = 160 }) {
  if (!rows.length) return <div style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>尚無資料</div>;
  const maxMs = Math.max(...rows.map((r) => r.e2eMs || 0), 1);
  const maxN = Math.max(...rows.map((r) => r.n), 1);
  const color = (r) => (r.result === "NG" ? "var(--ng)" : r.result === "ERROR" ? "var(--warn)" : "var(--pass)");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <svg viewBox="0 0 100 100" style={{ width: "100%", height, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }} preserveAspectRatio="none">
        <line x1="0" y1="92" x2="100" y2="92" stroke="var(--border-strong)" strokeWidth="0.4" />
        {rows.map((r) => (
          <circle key={r.n} cx={(r.n / maxN) * 100} cy={92 - ((r.e2eMs || 0) / maxMs) * 82} r={2.1} fill={color(r)}>
            <title>{`#${r.n} ${r.result} ${r.e2eMs || "—"}ms`}</title>
          </circle>
        ))}
      </svg>
      <div className="scatter-legend">
        <span><i className="sw" style={{ background: "var(--pass)" }}></i>PASS</span>
        <span><i className="sw" style={{ background: "var(--ng)" }}></i>NG</span>
        <span><i className="sw" style={{ background: "var(--warn)" }}></i>ERROR</span>
        <span style={{ color: "var(--text-3)" }}>X=序號 · Y=端到端耗時</span>
      </div>
    </div>
  );
}

export function BatchScreen({ app }) {
  const b = app.batch;
  const total = b.total || b.items.length;
  const [sel, setSel] = useState(null);
  const reason = !app.sidecarUp ? "sidecar 離線" : !app.recipe ? "請先載入 Recipe" : !b.input_dir ? "請選擇來源資料夾" : null;

  const done = b.items;
  const s = {
    pass: done.filter((f) => f.result === "PASS").length,
    ng: done.filter((f) => f.result === "NG").length,
    err: done.filter((f) => f.result === "ERROR").length,
  };
  const cancelled = b.summary ? (b.summary.cancelled || 0) : 0;
  const tilesAll = done.reduce((a, r) => a + r.tiles, 0), tilesNg = done.reduce((a, r) => a + r.ngTiles, 0);
  const verdicts = s.pass + s.ng;
  const avgDef = done.length ? (done.reduce((a, r) => a + r.defects, 0) / done.length).toFixed(2) : "—";
  const selRow = sel !== null ? done[sel] : null;
  const finished = !b.running && b.summary != null;
  const pct = total ? Math.round((done.length / total) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <div className="panel" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: "10px var(--pad-panel)", flexWrap: "wrap" }}>
        <Chip icon={<IcFolder size={14} />} label="來源" empty={!b.input_dir} value={b.input_dir || "點擊選擇資料夾"} onClick={() => !b.running && app.pickBatchFolder()} />
        <Chip icon={<IcRecipe size={14} />} label="Recipe" empty={!app.recipe} value={app.recipe ? app.recipe.recipe_name : "點擊載入"} onClick={() => !b.running && app.openRecipePicker()} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-small)", color: "var(--text-2)" }}>
          包含子資料夾 <Toggle value={b.recursive} onChange={app.setBatchRecursive} disabled={b.running || done.length > 0} />
        </label>
        {(b.running || done.length > 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 160px", minWidth: 140 }}>
            <ProgressBar pct={b.running ? (total ? pct : 5) : 100} />
            <span className="mono" style={{ color: "var(--text-2)", flexShrink: 0 }}>{done.length}/{total || "—"}</span>
          </div>
        )}
        <div style={{ flex: b.running || done.length > 0 ? "0" : "1" }}></div>
        {reason && !b.running && <span style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>{reason}</span>}
        {b.running
          ? <Btn variant="danger" icon={<IcStop size={14} />} onClick={app.cancelBatch}>取消批次</Btn>
          : <Btn variant="primary" icon={<IcPlay size={15} />} disabled={!!reason} onClick={app.startBatch}>開始批次</Btn>}
      </div>

      {finished && (
        <div className="banner info" style={{ flexShrink: 0 }}>
          <IcCheck size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>批次完成統計：總數 {total} · PASS {s.pass} · NG {s.ng} · ERROR {s.err} · 取消 {cancelled}</span>
        </div>
      )}

      <div className="stat-grid" style={{ flexShrink: 0 }}>
        <SmallStat label="已完成" value={`${done.length}/${total || "—"}`} />
        <SmallStat label="PASS 率" value={verdicts ? `${((s.pass / verdicts) * 100).toFixed(1)}%` : "—"} tone="var(--pass)" />
        <SmallStat label="NG 張數" value={s.ng} tone={s.ng ? "var(--ng)" : undefined} />
        <SmallStat label="Tile PASS 率" value={tilesAll ? `${(((tilesAll - tilesNg) / tilesAll) * 100).toFixed(2)}%` : "—"} />
        <SmallStat label="平均缺陷" value={avgDef} />
        <SmallStat label="吞吐" value={done.length ? `${app.rt.backend === "cuda" ? 41 : 18} 張/分` : "—"} />
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        <Panel title="影像清單" flush style={{ flex: 2, minWidth: 0 }} actions={b.running && <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>佇列 2 / 上限 4</span>}>
          <div style={{ overflowY: "auto", height: "100%" }}>
            <table className="data-table">
              <thead><tr><th>#</th><th>檔案</th><th>狀態</th><th style={{ textAlign: "right" }}>缺陷</th><th style={{ textAlign: "right" }}>NG Tiles</th><th style={{ textAlign: "right" }}>耗時</th></tr></thead>
              <tbody>
                {done.map((r, i) => (
                  <tr key={r.name + i} className={"clickable" + (sel === i ? " selected" : "")} onClick={() => setSel(i)} title={r.error ? r.error.code : undefined}>
                    <td className="mono">{i + 1}</td>
                    <td className="mono">{r.name}</td>
                    <td><ResultBadge result={r.result} /></td>
                    <td className="mono" style={{ textAlign: "right" }}>{r.result !== "ERROR" ? r.defects : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{r.result !== "ERROR" ? r.ngTiles : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{r.ms ? `${(r.ms / 1000).toFixed(2)}s` : "—"}</td>
                  </tr>
                ))}
                {!done.length && (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-3)", padding: 24 }}>{b.running ? "等待影像…" : "尚未開始批次"}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="影像詳情" style={{ flex: 1, minWidth: 240 }}>
          {selRow ? (
            <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Thumb app={app} name={selRow.name} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="mono" style={{ fontWeight: 600 }}>{selRow.name}</span><ResultBadge result={selRow.result} /></div>
              <div className="kv">
                <span>Tiles</span><span>{selRow.tiles}</span>
                <span>NG Tiles</span><span>{selRow.ngTiles}</span>
                <span>缺陷</span><span>{selRow.defects}</span>
                <span>Backend</span><span>{backendLabel(app.rt)}</span>
              </div>
              {selRow.error && (
                <div className="dev-err"><span className="mono">{selRow.error.code}</span><span style={{ flex: 1 }}>{selRow.error.message || selRow.error.msg}</span></div>
              )}
            </div>
          ) : <EmptyState icon={<IcImage size={30} strokeWidth={1.3} />} title="選擇已完成的影像" hint="縮圖由 Rust 宿主產生並快取，不經 JSON 傳送像素。" />}
        </Panel>
      </div>
    </div>
  );
}

export function MonitorScreen({ app }) {
  const m = app.monitor;
  const [source, setSource] = useState("folder");
  const [moveAfter, setMoveAfter] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(null);
  const [camError, setCamError] = useState(null);

  const isOp = app.mode === "op";
  const running = m.running;
  const feed = m.items;
  const dropped = m.dropped;
  const reason = !app.sidecarUp ? "sidecar 離線" : !app.recipe ? (isOp ? "尚未設定 Recipe，請通知工程師" : "請先載入 Recipe") : null;

  const toggle = async () => {
    if (running) { await app.stopMonitor(); return; }
    if (reason) return;
    setCamError(null);
    const ok = await app.startMonitor(source, { move_to: moveAfter ? moveTo : null });
    if (source === "camera" && !ok) {
      setCamError(app.monitor.cameraError || "CAMERA_NOT_AVAILABLE");
    }
  };

  const tableRows = feed;
  const visible = tableRows.filter((r) => filter === "all" || r.result === filter);
  const pass = feed.filter((f) => f.result === "PASS").length;
  const ng = feed.filter((f) => f.result === "NG").length;
  const err = feed.filter((f) => f.result === "ERROR").length + dropped.length;
  const latest = feed[feed.length - 1];
  const selRow = sel !== null ? tableRows[sel] : null;

  return (
    <div style={{ display: "flex", gap: 12, height: "100%", minHeight: 0 }}>
      <div className="monitor-left" style={{ width: 318, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <Panel title="監控設定">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 6 }}>來源</div>
              <Segmented value={source} onChange={(v) => { if (!isOp && !running) setSource(v); }} disabled={isOp || running} options={[{ value: "folder", label: "監控資料夾" }, { value: "camera", label: "相機直連" }]} />
              {isOp && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-3)", marginTop: 6 }}><IcLock size={11} /> OP 模式不可修改來源</div>}
            </div>
            {source === "folder" ? (
              <FormGrid>
                <FRow label="監控資料夾">
                  <div style={{ display: "flex", gap: 6 }}>
                    <TextField mono value={m.input_dir} readOnly />
                    <Btn variant="secondary" size="sm" style={{ height: "var(--row-h)" }} icon={<IcFolder size={13} />} onClick={() => !running && app.pickMonitorFolder()}>選擇</Btn>
                  </div>
                </FRow>
                <FRow label="Recipe"><TextField mono value={app.recipe ? app.recipe.recipe_name : "—"} readOnly /></FRow>
                <FRow label="處理後搬移"><Toggle value={moveAfter} onChange={setMoveAfter} disabled={running || isOp} /></FRow>
                {moveAfter && <FRow label="搬移至"><TextField mono value={moveTo} onChange={(e) => setMoveTo(e.target.value)} placeholder="處理後搬移至…" /></FRow>}
              </FormGrid>
            ) : (
              <React.Fragment>
                <div className="monitor-note">按「啟動」時會依 Recipe 連線相機（軟體觸發一併連線米輪），啟用光源則先開燈。停止時關燈。此階段未接相機，啟動會回報 <span className="mono">CAMERA_NOT_AVAILABLE</span>。</div>
              </React.Fragment>
            )}
            <Btn variant={running ? "danger" : "primary"} size="lg" icon={running ? <IcStop size={16} /> : <IcRadar size={16} />} disabled={!running && (!!reason || source === "folder" && !m.input_dir)} onClick={toggle} style={{ width: "100%" }}>
              {running ? "停止監控" : "啟動監控"}
            </Btn>
            {reason && !running && <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", textAlign: "center" }}>{reason}</div>}
            {camError && !running && source === "camera" && (
              <div className="banner warn"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span><span className="mono">{camError}</span> 未偵測到相機，相機直連監控為後續階段功能。</span></div>
            )}
          </div>
        </Panel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SmallStat label="已處理" value={m.processed ?? feed.length} />
          <SmallStat label="PASS" value={pass} tone="var(--pass)" />
          <SmallStat label="NG" value={ng} tone={ng ? "var(--ng)" : undefined} />
          <SmallStat label="ERROR" value={err} tone={err ? "var(--ng)" : undefined} />
          <SmallStat label="佇列滿丟棄" value={m.dropped.length} tone={m.dropped.length ? "var(--warn)" : undefined} />
          <SmallStat label="佇列" value={running ? 1 : 0} />
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <Panel title="最新影像" actions={running && <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--accent-text)" }}><span className="dot busy" style={{ width: 6, height: 6 }}></span>LIVE</span>}>
          {latest ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
              <Thumb app={app} name={latest.name} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 40, fontWeight: 800, fontFamily: "var(--font-mono)", color: latest.result === "NG" ? "var(--ng)" : latest.result === "ERROR" ? "var(--warn)" : "var(--pass)" }}>{latest.result}</span>
                <div className="kv">
                  <span>檔案</span><span>{latest.name}</span>
                  <span>缺陷</span><span>{latest.defects}</span>
                  <span>端到端耗時</span><span>{latest.e2eMs} ms</span>
                  <span>Backend</span><span>{backendLabel(app.rt)}</span>
                </div>
                {latest.raw_image_error && <div className="dev-err"><span className="mono">{latest.raw_image_error.split(" ")[0]}</span><span style={{ flex: 1 }}>原圖保存失敗</span></div>}
              </div>
            </div>
          ) : <EmptyState icon={<IcRadar size={32} strokeWidth={1.3} />} title={running ? "等待新影像…" : "尚未啟動監控"} hint={source === "camera" ? "相機直連模式：畫格經有上限的佇列交給檢測，佇列已滿的畫格以 ERROR 列出。" : "新檔案寫入監控資料夾後，由 Rust 端排入佇列並交給 sidecar 檢測。"} />}
        </Panel>
        <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
          <Panel title={`處理紀錄（${visible.length}）`} flush style={{ flex: 1.6, minWidth: 0 }}
            actions={<Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "全部" }, { value: "PASS", label: "PASS" }, { value: "NG", label: "NG" }, { value: "ERROR", label: "ERROR" }]} />}>
            <div style={{ overflowY: "auto", height: "100%" }}>
              <table className="data-table">
                <thead><tr><th>時間</th><th>檔案</th><th>結果</th><th style={{ textAlign: "right" }}>缺陷</th><th style={{ textAlign: "right" }}>端到端耗時</th><th>存圖</th></tr></thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={r.n} className={"clickable" + (sel === i ? " selected" : "")} onClick={() => setSel(i)} title={r.error ? r.error.code : undefined}>
                      <td className="mono">{r.time}</td>
                      <td className="mono">{r.name}</td>
                      <td><ResultBadge result={r.result} /></td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.defects}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.e2eMs ? `${r.e2eMs} ms` : "—"}</td>
                      <td>{r.raw_image_error ? <span style={{ color: "var(--ng)", fontSize: "var(--fs-small)" }}>raw_image_error</span> : r.raw_image_path ? <span style={{ color: "var(--pass)", fontSize: "var(--fs-small)" }}>OK</span> : <span style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>—</span>}</td>
                    </tr>
                  ))}
                  {!visible.length && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-3)", padding: 24 }}>尚無處理紀錄</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
            <Panel title="監控序列散佈圖">
              <MonitorSeriesScatter rows={feed} />
            </Panel>
            <Panel title="所選影像切圖散佈圖">
              {selRow && selRow.result !== "ERROR" ? (
                <TileScatterSVG tiles={tileScatterTiles(selRow.n, selRow.ngTiles)} />
              ) : (
                <div style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>
                  {selRow ? "該影像為 ERROR，無切圖結果。" : "請在左側選擇一筆已完成的影像。"}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
