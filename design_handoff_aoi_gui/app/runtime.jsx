// AOI Console — runtime 狀態（GUI → Tauri/Rust → Python sidecar → CUDA）與視窗外框

function TitleBar() {
  return (
    <div className="titlebar" data-tauri-drag-region="">
      <span className="titlebar-logo">A</span>
      <span className="titlebar-name">AOI Demo Console</span>
      <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>v2.0.0-alpha</span>
      <div style={{ flex: 1 }} data-tauri-drag-region=""></div>
      <div style={{ display: "flex" }}>
        <button className="win-btn" title="最小化"><IcMinus size={14} /></button>
        <button className="win-btn" title="最大化"><IcSquare size={12} /></button>
        <button className="win-btn close" title="關閉"><IcX size={14} /></button>
      </div>
    </div>
  );
}

function RuntimePill({ rt, onClick }) {
  return (
    <button className="rt-pill" onClick={onClick} title="執行環境">
      <span className={"dot " + rt.tone}></span>
      <span>Backend</span>
      <b>{rt.label}</b>
    </button>
  );
}

function ChainNode({ icon, title, meta, state, right }) {
  return (
    <div className={"chain-node" + (state === "bad" ? " bad" : state === "warn" ? " warn" : "")}>
      <span style={{ color: state === "bad" ? "var(--ng)" : state === "warn" ? "var(--warn)" : "var(--text-2)", paddingTop: 1 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div className="chain-title">{title}</div>
        <div className="chain-meta">{meta}</div>
      </div>
      {right}
    </div>
  );
}

function RuntimeDrawer({ rt, restarting, onRestart, onClose, mode }) {
  const off = rt.sidecar === "offline";
  const sideState = off ? "bad" : "ok";
  const beState = rt.backend === "cuda" ? "ok" : rt.backend === "cpu" ? "warn" : "bad";
  return (
    <Drawer title="執行環境" onClose={onClose} width="min(420px, 100vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {rt.tone === "warn" && (
          <div className="banner warn"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>找不到 CUDA DLL，依 Recipe 設定 <span className="mono">fallback_to_cpu: true</span> 改用 CPU。結果與 CPU 參考一致，耗時較長。</span></div>
        )}
        {rt.policy === "strict" && !off && (
          <div className="banner ng"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>嚴格 CUDA 模式：DLL 缺失時工作會直接失敗，不會改用 CPU。</span></div>
        )}
        {off && (
          <div className="banner ng"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>Python sidecar 未回應，無法檢測。重新啟動後會重新載入 Recipe。</span></div>
        )}
        <div className="chain">
          <ChainNode icon={<IcTable size={16} />} title="GUI（WebView2）" meta="React UI · 只送指令與接收事件，不處理像素" state="ok" right={<span className="dot pass" style={{ marginTop: 5 }}></span>} />
          <div className="chain-link"></div>
          <ChainNode icon={<IcChip size={16} />} title="Rust 宿主（Tauri 2）" meta="commands · event bus · 工作佇列 · 檔案 / 影像快取" state="ok" right={<span className="dot pass" style={{ marginTop: 5 }}></span>} />
          <div className="chain-link"></div>
          <ChainNode icon={<IcStack size={16} />} title="Python sidecar" state={sideState}
            meta={off ? "process 已結束 · exit code 1" : "aoi-core 1.1.1 · pid 18244 · stdio JSON-RPC · uptime 00:42:10"}
            right={<span className={"dot " + (restarting ? "busy" : off ? "ng" : "pass")} style={{ marginTop: 5 }}></span>} />
          <div className="chain-link"></div>
          <ChainNode icon={<IcChip size={16} />} title="運算 Backend" state={off ? "bad" : beState}
            meta={off ? "—" : rt.backend === "cuda" ? "CUDA · gpu/visionflow_cuda.dll · ABI v3 · device 0" : rt.backend === "cpu" ? "CPU（OpenCV）· CUDA DLL 未找到" : "CUDA_DLL_NOT_FOUND · gpu/visionflow_cuda.dll"}
            right={<span className={"dot " + (off ? "ng" : rt.tone)} style={{ marginTop: 5 }}></span>} />
        </div>
        {mode !== "op" && (
          <div>
            <div className="panel-title" style={{ marginBottom: 10 }}>Backend 政策</div>
            <div className="kv">
              <span>模式</span><span>{rt.policy === "strict" ? "cuda（嚴格）" : rt.policy === "cpu" ? "cpu（僅 CPU）" : "auto（GPU 優先，失敗改用 CPU）"}</span>
              <span>CUDA DLL</span><span>{rt.dll}</span>
              <span>影像傳輸</span><span>共享暫存檔 + asset://</span>
              <span>工作佇列上限</span><span>4</span>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" icon={restarting ? <span className="spinner"></span> : <IcRefresh size={14} />} disabled={restarting} onClick={onRestart}>
            {restarting ? "重新啟動中…" : "重新啟動 sidecar"}
          </Btn>
          {mode !== "op" && <Btn variant="ghost" icon={<IcFolder size={14} />}>開啟 log</Btn>}
        </div>
      </div>
    </Drawer>
  );
}

Object.assign(window, { TitleBar, RuntimePill, RuntimeDrawer });
