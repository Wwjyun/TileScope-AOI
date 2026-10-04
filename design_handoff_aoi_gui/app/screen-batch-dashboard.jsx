// AOI Console — 批量數據圖表（結果分布 / Top 缺陷 / 影像資料 / 明細 / 切圖散佈圖）

function ResultDistribution({ pass, ng, err }) {
  const items = [
    { label: "PASS", value: pass, color: "var(--pass)" },
    { label: "NG", value: ng, color: "var(--ng)" },
    { label: "ERROR", value: err, color: "var(--warn)" },
  ];
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "grid", gridTemplateColumns: "56px 1fr 44px", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "var(--fs-small)", color: "var(--text-2)", fontWeight: 600 }}>{it.label}</span>
          <div style={{ height: 18, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: "100%", background: it.color, borderRadius: 4, transition: "width .3s" }}></div>
          </div>
          <span className="mono" style={{ textAlign: "right", color: "var(--text-2)" }}>{it.value}</span>
        </div>
      ))}
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>完成 {pass + ng + err} 張（等待／取消不計入分布）</div>
    </div>
  );
}

function TopDefectList({ top, onSelect }) {
  if (!top.length) return <div style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>無 NG 影像</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {top.map((f, i) => (
        <div key={f.file} className="row-item" onClick={() => onSelect(f.i)}>
          <span className="mono" style={{ color: "var(--text-3)", width: 16, flexShrink: 0 }}>{i + 1}</span>
          <span className="mono" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file}</span>
          <span className="mono" style={{ color: "var(--ng)", fontWeight: 600 }}>{f.defects} 缺陷</span>
        </div>
      ))}
    </div>
  );
}

function BatchDashboardScreen({ app }) {
  const [data, setData] = React.useState(BATCH_RESULT_STORE.latest);
  const [sel, setSel] = React.useState(null);
  React.useEffect(() => {
    const on = () => setData(BATCH_RESULT_STORE.latest);
    window.addEventListener("batch:updated", on);
    return () => window.removeEventListener("batch:updated", on);
  }, []);

  if (!data || !data.files || !data.files.length) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
        <EmptyState
          icon={<IcChart size={40} strokeWidth={1.2} />}
          title="尚無批量數據"
          hint="先到「批次檢測」執行一次批次，這裡會顯示結果分布、缺陷數最高影像與切圖散佈圖。"
          action={<Btn variant="primary" size="sm" icon={<IcStack size={14} />} onClick={() => app.setScreen("batch")}>前往批量檢測</Btn>}
        />
      </div>
    );
  }

  const doneFiles = data.files.filter((f) => f.state === "done");
  const pass = doneFiles.filter((f) => f.result === "PASS").length;
  const ng = doneFiles.filter((f) => f.result === "NG").length;
  const err = doneFiles.filter((f) => f.result === "ERROR").length;
  const top = doneFiles.filter((f) => f.defects > 0).sort((a, b) => b.defects - a.defects).slice(0, 6);
  const selRow = sel !== null ? data.files[sel] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
        <Panel title="結果分布" style={{ flex: 1 }}>
          <ResultDistribution pass={pass} ng={ng} err={err} />
        </Panel>
        <Panel title="缺陷數最高影像" flush style={{ flex: 1 }}>
          <TopDefectList top={top} onSelect={(i) => setSel(i)} />
        </Panel>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        <Panel title={`批量影像資料（${data.files.length}）`} flush style={{ flex: 2, minWidth: 0 }}>
          <div style={{ overflowY: "auto", height: "100%" }}>
            <table className="data-table">
              <thead><tr><th>#</th><th>檔案</th><th>結果</th><th>狀態</th><th style={{ textAlign: "right" }}>缺陷</th><th style={{ textAlign: "right" }}>NG Tiles</th><th style={{ textAlign: "right" }}>耗時</th></tr></thead>
              <tbody>
                {data.files.map((f) => (
                  <tr key={f.file} className={"clickable" + (sel === f.i ? " selected" : "")} onClick={() => f.state === "done" && setSel(f.i)} title={f.error ? f.error.code : undefined}>
                    <td className="mono">{f.i + 1}</td>
                    <td className="mono">{f.file}</td>
                    <td>{f.state === "done" ? <ResultBadge result={f.result} /> : <span style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>—</span>}</td>
                    <td>{f.state === "done" ? <span style={{ fontSize: "var(--fs-small)" }}>完成</span> : f.state === "cancelled" ? <ResultBadge result="取消" /> : <span style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>等待</span>}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{f.state === "done" && f.result !== "ERROR" ? f.defects : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{f.state === "done" && f.result !== "ERROR" ? f.ngTiles : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{f.state === "done" && f.ms ? `${(f.ms / 1000).toFixed(2)}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div style={{ flex: 1.2, minWidth: 240, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
          <Panel title="所選影像明細">
            {selRow ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="mono" style={{ fontWeight: 600 }}>{selRow.file}</span><ResultBadge result={selRow.result} /></div>
                <div className="kv">
                  <span>Tiles</span><span>{selRow.tiles}</span>
                  <span>NG Tiles</span><span>{selRow.ngTiles}</span>
                  <span>缺陷</span><span>{selRow.defects}</span>
                  <span>耗時</span><span>{selRow.ms ? `${(selRow.ms / 1000).toFixed(2)}s` : "—"}</span>
                  {selRow.error && <React.Fragment><span>錯誤</span><span style={{ color: "var(--ng)" }}>{selRow.error.code}</span></React.Fragment>}
                </div>
                {selRow.error && <div style={{ fontSize: "var(--fs-small)", color: "var(--ng)" }}>{selRow.error.msg}</div>}
              </div>
            ) : <EmptyState icon={<IcImage size={30} strokeWidth={1.3} />} title="選擇一筆影像" hint="點擊左側資料列查看明細與切圖散佈圖。" />}
          </Panel>
          <Panel title="所選影像切圖散佈圖">
            {selRow && selRow.state === "done" && selRow.result !== "ERROR" ? (
              <TileScatterSVG tiles={tileScatterTiles(selRow.i, selRow.ngTiles)} />
            ) : (
              <div style={{ color: "var(--text-3)", fontSize: "var(--fs-small)" }}>
                {selRow ? (selRow.result === "ERROR" ? "該影像為 ERROR，無切圖結果。" : "該影像尚未完成。") : "請選擇已完成且非 ERROR 的影像。"}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BatchDashboardScreen });
