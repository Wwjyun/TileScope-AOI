// AOI Console — 批次檢測 / 資料夾監控 / 相機直連監控 screens

function SmallStat({ label, value, tone }) {
  return (
    <div className="panel" style={{ padding: "10px 14px", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: tone || "var(--text)" }}>{value}</span>
    </div>
  );
}

function BoardThumb({ size = 240, seed = 0 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const ctx = ref.current.getContext("2d");
    const b = getSimBoardCanvas();
    const ox = (seed * 97) % (IMG_W / 3), oy = (seed * 53) % (IMG_H / 3);
    ctx.drawImage(b, ox, oy, IMG_W * 0.66, IMG_H * 0.66, 0, 0, size, size * 0.75);
  }, [seed, size]);
  return <canvas ref={ref} width={size} height={size * 0.75} style={{ width: "100%", display: "block", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--viewer-bg)" }} />;
}

// 依序號決定性產生 tile 散佈資料（切圖 x/y 以格點表示）
function tileScatterTiles(seedIdx, ngTiles, cols = 16, rows = 12) {
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

function TileScatterSVG({ tiles, cols = 16, rows = 12, height = 220 }) {
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

function MonitorSeriesScatter({ rows, height = 160 }) {
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

function BatchScreen({ app }) {
  const total = BATCH_FILES.length;
  const [done, setDone] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [recursive, setRecursive] = React.useState(true);
  const [cancelledFrom, setCancelledFrom] = React.useState(null);
  const [sel, setSel] = React.useState(null);
  const tm = React.useRef(null);
  React.useEffect(() => () => clearInterval(tm.current), []);

  const reason = !app.sidecarUp ? "sidecar 離線" : !app.recipe ? "請先載入 Recipe" : null;

  const publishBatch = (from, cancelled) => {
    BATCH_RESULT_STORE.latest = {
      total,
      recursive,
      files: BATCH_FILES.map((f, i) => ({ ...f, i, state: i < from ? "done" : cancelled ? "cancelled" : "queued" })),
    };
    window.dispatchEvent(new CustomEvent("batch:updated"));
  };

  const summaryOf = (files) => ({
    pass: files.filter((f) => f.result === "PASS").length,
    ng: files.filter((f) => f.result === "NG").length,
    err: files.filter((f) => f.result === "ERROR").length,
  });

  const start = () => {
    if (reason) return;
    setDone(0); setSel(null); setCancelledFrom(null); setRunning(true);
    app.setStatusMsg(`批次 B-0032 開始 · ${total} 張${recursive ? "（含子資料夾）" : ""} · ${app.recipe.recipe_name}`);
    let n = 0;
    tm.current = setInterval(() => {
      n += 1; setDone(n);
      if (n >= total) {
        clearInterval(tm.current); setRunning(false);
        publishBatch(total, false);
        const s = summaryOf(BATCH_FILES);
        app.setStatusMsg(`批次 B-0032 完成 · 總數 ${total} · PASS ${s.pass} · NG ${s.ng} · ERR ${s.err} · 取消 0`);
      }
    }, 220);
  };
  const cancel = () => {
    const from = done;
    clearInterval(tm.current); setRunning(false); setCancelledFrom(from);
    publishBatch(from, true);
    const s = summaryOf(BATCH_FILES.slice(0, from));
    app.setStatusMsg(`批次 B-0032 已取消 · 完成 ${from}/${total} · PASS ${s.pass} · NG ${s.ng} · ERR ${s.err} · 取消 ${total - from}`);
  };

  const rows = BATCH_FILES.map((f, i) => {
    let state;
    if (i < done) state = "done";
    else if (running && i < done + 2) state = "running";
    else if (cancelledFrom !== null && i >= cancelledFrom) state = "cancelled";
    else state = "queued";
    return { ...f, i, state };
  });
  const fin = rows.filter((r) => r.state === "done");
  const s = summaryOf(fin);
  const cancelled = cancelledFrom !== null ? total - cancelledFrom : 0;
  const tilesAll = fin.reduce((a, r) => a + r.tiles, 0), tilesNg = fin.reduce((a, r) => a + r.ngTiles, 0);
  const verdicts = s.pass + s.ng;
  const avgDef = fin.length ? (fin.reduce((a, r) => a + r.defects, 0) / fin.length).toFixed(2) : "—";
  const selRow = sel !== null ? rows[sel] : null;
  const finished = !running && (done === total || cancelledFrom !== null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <div className="panel" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: "10px var(--pad-panel)", flexWrap: "wrap" }}>
        <Chip icon={<IcFolder size={14} />} label="來源" value={`samples/batch_demo/ · ${total} 張${recursive ? "（含子資料夾）" : ""}`} />
        <Chip icon={<IcRecipe size={14} />} label="Recipe" empty={!app.recipe} value={app.recipe ? app.recipe.recipe_name : "點擊載入"} onClick={() => !running && app.openRecipePicker()} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-small)", color: "var(--text-2)" }}>
          包含子資料夾 <Toggle value={recursive} onChange={setRecursive} disabled={running || done > 0} />
        </label>
        {(running || done > 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 160px", minWidth: 140 }}>
            <ProgressBar pct={(done / total) * 100} />
            <span className="mono" style={{ color: "var(--text-2)", flexShrink: 0 }}>{done}/{total}</span>
          </div>
        )}
        <div style={{ flex: running || done > 0 ? "0" : "1" }}></div>
        {reason && !running && <span style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>{reason}</span>}
        {running
          ? <Btn variant="danger" icon={<IcStop size={14} />} onClick={cancel}>取消批次</Btn>
          : <Btn variant="primary" icon={<IcPlay size={15} />} disabled={!!reason} onClick={start}>開始批次</Btn>}
      </div>

      {finished && (
        <div className="banner info" style={{ flexShrink: 0 }}>
          <IcCheck size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>批次完成統計：總數 {total} · PASS {s.pass} · NG {s.ng} · ERROR {s.err} · 取消 {cancelled}</span>
        </div>
      )}

      <div className="stat-grid" style={{ flexShrink: 0 }}>
        <SmallStat label="已完成" value={`${fin.length}/${total}`} />
        <SmallStat label="PASS 率" value={verdicts ? `${((s.pass / verdicts) * 100).toFixed(1)}%` : "—"} tone="var(--pass)" />
        <SmallStat label="NG 張數" value={s.ng} tone={s.ng ? "var(--ng)" : undefined} />
        <SmallStat label="Tile PASS 率" value={tilesAll ? `${(((tilesAll - tilesNg) / tilesAll) * 100).toFixed(2)}%` : "—"} />
        <SmallStat label="平均缺陷" value={avgDef} />
        <SmallStat label="吞吐" value={fin.length ? `${app.rt.backend === "cpu" ? 18 : 41} 張/分` : "—"} />
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        <Panel title="影像清單" flush style={{ flex: 2, minWidth: 0 }} actions={running && <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>佇列 2 / 上限 4</span>}>
          <div style={{ overflowY: "auto", height: "100%" }}>
            <table className="data-table">
              <thead><tr><th>#</th><th>檔案</th><th>狀態</th><th style={{ textAlign: "right" }}>缺陷</th><th style={{ textAlign: "right" }}>NG Tiles</th><th style={{ textAlign: "right" }}>耗時</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.file} className={"clickable" + (sel === r.i ? " selected" : "")} onClick={() => r.state === "done" && setSel(r.i)} title={r.error ? r.error.code : undefined}>
                    <td className="mono">{r.i + 1}</td>
                    <td className="mono">{r.file}</td>
                    <td>{r.state === "done" ? <ResultBadge result={r.result} /> : r.state === "running" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent-text)", fontSize: "var(--fs-small)" }}><span className="spinner"></span>執行中</span> : r.state === "cancelled" ? <ResultBadge result="取消" /> : <span style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>等待</span>}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{r.state === "done" && r.result !== "ERROR" ? r.defects : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{r.state === "done" && r.result !== "ERROR" ? r.ngTiles : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{r.state === "done" && r.ms ? `${(r.ms / 1000).toFixed(2)}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="影像詳情" style={{ flex: 1, minWidth: 240 }}>
          {selRow ? (
            <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <BoardThumb seed={selRow.i} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="mono" style={{ fontWeight: 600 }}>{selRow.file}</span><ResultBadge result={selRow.result} /></div>
              <div className="kv">
                <span>Tiles</span><span>{selRow.tiles}</span>
                <span>NG Tiles</span><span>{selRow.ngTiles}</span>
                <span>缺陷</span><span>{selRow.defects}</span>
                <span>Backend</span><span>{app.rt.backend === "cpu" ? "CPU fallback" : "CUDA"}</span>
                <span>輸出</span><span>outputs/csv/{selRow.file.replace(".png", ".csv")}</span>
              </div>
              {selRow.error && (
                <div className="dev-err"><span className="mono">{selRow.error.code}</span><span style={{ flex: 1 }}>{selRow.error.msg}</span></div>
              )}
            </div>
          ) : <EmptyState icon={<IcImage size={30} strokeWidth={1.3} />} title="選擇已完成的影像" hint="縮圖由 Rust 宿主產生並快取，不經 JSON 傳送像素。" />}
        </Panel>
      </div>
    </div>
  );
}

function MonitorScreen({ app }) {
  const [source, setSource] = React.useState("folder");
  const [running, setRunning] = React.useState(false);
  const [moveAfter, setMoveAfter] = React.useState(false);
  const [trigger, setTrigger] = React.useState("free_run");
  const [camState, setCamState] = React.useState("offline"); // offline | connecting | online
  const [lightOn, setLightOn] = React.useState(false);
  const [feed, setFeed] = React.useState([]);
  const [dropped, setDropped] = React.useState([]);
  const [filter, setFilter] = React.useState("all");
  const [sel, setSel] = React.useState(null);
  const tm = React.useRef(null);
  const conn = React.useRef(null);
  const seq = React.useRef(101);
  React.useEffect(() => () => { clearInterval(tm.current); clearTimeout(conn.current); app.setMonitoring(false); }, []);

  const isOp = app.mode === "op";
  const reason = !app.sidecarUp ? "sidecar 離線" : !app.recipe ? (isOp ? "尚未設定 Recipe，請通知工程師" : "請先載入 Recipe") : null;

  const tick = () => {
    const n = seq.current++;
    const time = new Date().toTimeString().slice(0, 8);
    const file = `frame_${String(n).padStart(5, "0")}.png`;
    if (n % 15 === 0) {
      setDropped((d) => [{ n, file, time, source }, ...d].slice(0, 20));
      return;
    }
    const isError = n % 13 === 0;
    const isNg = !isError && n % 6 === 0;
    const rawErr = n % 11 === 0;
    setFeed((f) => [{
      n, file, time, source,
      result: isError ? "ERROR" : isNg ? "NG" : "PASS",
      defects: isError ? 0 : isNg ? 2 : 0,
      ngTiles: isNg ? 2 : 0,
      e2eMs: isError ? 0 : (source === "camera" ? 900 + (n % 5) * 130 : 1200 + (n % 7) * 160),
      raw_image_path: rawErr ? null : `origin/${file}`,
      raw_image_error: rawErr ? "[E-1204] 原圖保存失敗：磁碟空間不足" : null,
      error: isError ? { code: "[E-1104]", msg: "detector 執行錯誤：CUDA kernel failed" } : null,
    }, ...f].slice(0, 60));
  };

  const startTimer = () => {
    const interval = source === "camera" ? (trigger === "free_run" ? 900 : 1600) : 1600;
    tm.current = setInterval(tick, interval);
  };

  const toggle = () => {
    if (running) {
      clearInterval(tm.current); clearTimeout(conn.current);
      const processed = feed.length;
      const droppedCount = dropped.length;
      setRunning(false); setCamState("offline"); setLightOn(false);
      app.setMonitoring(false);
      const dropMsg = droppedCount > 0 ? `，另有 ${droppedCount} 張因檢測佇列已滿未檢測` : "";
      app.setStatusMsg(`監控已停止，共處理 ${processed} 張${dropMsg}`);
      return;
    }
    if (reason) return;
    setFeed([]); setDropped([]); setSel(null); seq.current = 101;
    setRunning(true); app.setMonitoring(true);
    if (source === "camera") {
      setCamState("connecting");
      app.setStatusMsg("相機直連監控：依 Recipe 連線並開啟光源…");
      conn.current = setTimeout(() => {
        setCamState("online"); setLightOn(true);
        startTimer();
        app.setStatusMsg("監控中：相機直連 · 光源已開啟");
      }, 1000);
    } else {
      app.setStatusMsg("監控中：watch/incoming/");
      startTimer();
    }
  };

  const tableRows = [
    ...feed.map((f) => ({ ...f, kind: "processed" })),
    ...dropped.map((d) => ({ ...d, kind: "dropped", result: "ERROR", defects: 0, e2eMs: 0, raw_image_path: null, raw_image_error: null, dropped: true })),
  ];
  const visible = tableRows.filter((r) => filter === "all" || r.result === filter);
  const pass = feed.filter((f) => f.result === "PASS").length;
  const ng = feed.filter((f) => f.result === "NG").length;
  const err = feed.filter((f) => f.result === "ERROR").length + dropped.length;
  const latest = feed[0];
  const selRow = sel !== null ? tableRows[sel] : null;

  const openRaw = (r) => {
    if (r.dropped) { app.setStatusMsg(`${r.file}：畫格因佇列已滿未檢測，無原圖。`); return; }
    if (!r.raw_image_path) { app.setStatusMsg(`${r.file}：${r.raw_image_error || "原圖未保存"}`); return; }
    app.setStatusMsg(`開啟原始影像：${r.raw_image_path}`);
  };

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
                <FRow label="監控資料夾"><TextField mono value="watch/incoming/" readOnly /></FRow>
                <FRow label="Recipe"><TextField mono value={app.recipe ? app.recipe.recipe_name : "—"} readOnly /></FRow>
                <FRow label="處理後搬移"><Toggle value={moveAfter} onChange={setMoveAfter} disabled={running || isOp} /></FRow>
                {moveAfter && <FRow label="搬移至"><TextField mono value="watch/processed/" readOnly /></FRow>}
              </FormGrid>
            ) : (
              <React.Fragment>
                <div className="kv">
                  <span>相機狀態</span><span>{camState === "online" ? "已連線" : camState === "connecting" ? "連線中" : "離線"}</span>
                  <span>觸發模式</span><span>{{ free_run: "連續取像 Free Run", external: "外部觸發", software: "軟體觸發" }[trigger]}</span>
                  <span>光源</span><span>{lightOn ? "已開啟" : "關閉"}</span>
                </div>
                <div>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 6 }}>觸發模式</div>
                  <Segmented value={trigger} onChange={setTrigger} disabled={running || isOp} options={[{ value: "free_run", label: "Free Run" }, { value: "external", label: "外部觸發" }, { value: "software", label: "軟體觸發" }]} />
                </div>
                <div className="monitor-note">按「啟動」時若相機未連線或 Recipe 相機設定與已寫入不同，會先依 Recipe 連線／重連；軟體觸發一併連線米輪，啟用光源則先開燈。停止時關燈。</div>
              </React.Fragment>
            )}
            <Btn variant={running ? "danger" : "primary"} size="lg" icon={running ? <IcStop size={16} /> : <IcRadar size={16} />} disabled={!running && !!reason} onClick={toggle} style={{ width: "100%" }}>
              {running ? "停止監控" : "啟動監控"}
            </Btn>
            {reason && !running && <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", textAlign: "center" }}>{reason}</div>}
          </div>
        </Panel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SmallStat label="已處理" value={feed.length} />
          <SmallStat label="佇列" value={running ? 1 : 0} />
          <SmallStat label="PASS" value={pass} tone="var(--pass)" />
          <SmallStat label="NG" value={ng} tone={ng ? "var(--ng)" : undefined} />
          <SmallStat label="ERROR" value={err} tone={err ? "var(--ng)" : undefined} />
          <SmallStat label="佇列滿丟棄" value={dropped.length} tone={dropped.length ? "var(--warn)" : undefined} />
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <Panel title="最新影像" actions={running && <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--accent-text)" }}><span className="dot busy" style={{ width: 6, height: 6 }}></span>LIVE</span>}>
          {latest ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
              <BoardThumb seed={latest.n} size={380} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 40, fontWeight: 800, fontFamily: "var(--font-mono)", color: latest.result === "NG" ? "var(--ng)" : latest.result === "ERROR" ? "var(--warn)" : "var(--pass)" }}>{latest.result}</span>
                <div className="kv">
                  <span>檔案</span><span>{latest.file}</span>
                  <span>時間</span><span>{latest.time}</span>
                  <span>缺陷</span><span>{latest.defects}</span>
                  <span>端到端耗時</span><span>{latest.e2eMs} ms</span>
                  <span>Backend</span><span>{app.rt.backend === "cpu" ? "CPU fallback" : "CUDA"}</span>
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
                <thead><tr><th>時間</th><th>檔案</th><th>結果</th><th style={{ textAlign: "right" }}>缺陷</th><th style={{ textAlign: "right" }}>端到端耗時</th><th>存圖</th><th></th></tr></thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={r.kind + r.n} className={"clickable" + (sel === tableRows.indexOf(r) ? " selected" : "")} onClick={() => !r.dropped && setSel(tableRows.indexOf(r))} title={r.error ? r.error.code : r.dropped ? "佇列已滿，畫格未檢測" : undefined}>
                      <td className="mono">{r.time}</td>
                      <td className="mono">{r.file}</td>
                      <td>{r.dropped ? <ResultBadge result="ERROR" /> : <ResultBadge result={r.result} />}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.dropped ? "—" : r.defects}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.dropped ? "—" : `${r.e2eMs} ms`}</td>
                      <td>{r.dropped ? <span style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>未檢測</span> : r.raw_image_error ? <span style={{ color: "var(--ng)", fontSize: "var(--fs-small)" }}>raw_image_error</span> : <span style={{ color: "var(--pass)", fontSize: "var(--fs-small)" }}>OK</span>}</td>
                      <td style={{ textAlign: "right" }}><Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openRaw(r); }}>開啟原始影像</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
            <Panel title="監控序列散佈圖">
              <MonitorSeriesScatter rows={feed} />
            </Panel>
            <Panel title="所選影像切圖散佈圖">
              {selRow && !selRow.dropped && selRow.result !== "ERROR" ? (
                <TileScatterSVG tiles={tileScatterTiles(selRow.n, selRow.ngTiles)} />
              ) : (
                <div style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>
                  {selRow ? (selRow.dropped ? "該畫格因佇列已滿未檢測。" : "該影像為 ERROR，無切圖結果。") : "請在左側選擇一筆已完成的影像。"}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BatchScreen, MonitorScreen, SmallStat, tileScatterTiles, TileScatterSVG, MonitorSeriesScatter });
