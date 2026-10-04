// AOI Console — app shell（titlebar / rail / topbar / screens / drawers / tweaks）

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#4f5bd5",
  "density": "regular",
  "simResult": "NG",
  "backend": "cuda",
  "shell": "sidebar",
  "font": "Geist"
}/*EDITMODE-END*/;

const ACCENT_MAP = {
  "#4f5bd5": { strong: "#3f49b8", soft: "#ebedfb", softer: "#f5f6fd", text: "#3a43a8" },
  "#e0662f": { strong: "#c4531f", soft: "#fcede5", softer: "#fdf6f2", text: "#a8461a" },
  "#0d9488": { strong: "#0b7d73", soft: "#e3f3f1", softer: "#f0f9f8", text: "#0a6b62" },
  "#2563eb": { strong: "#1e50c4", soft: "#e5edfc", softer: "#f2f6fd", text: "#1c4fbe" },
  "#475569": { strong: "#374357", soft: "#e8ecf1", softer: "#f3f5f8", text: "#3c4a5e" },
};

const NAV = [
  { id: "run", label: "單張檢測", icon: IcPlay },
  { id: "batch", label: "批次檢測", icon: IcStack },
  { id: "batch_dashboard", label: "批量數據圖表", icon: IcChart },
  { id: "monitor", label: "資料夾監控", icon: IcRadar, op: true },
  { id: "results", label: "檢測結果", icon: IcTable },
  { id: "designer", label: "Recipe 設計", icon: IcDesigner, engOnly: true, sep: true },
  { id: "devices", label: "設備 CCD / 光源", icon: IcCamera, engOnly: true },
];
const SCREEN_TITLE = Object.fromEntries(NAV.map((n) => [n.id, n.label]));
const nowT = () => new Date().toTimeString().slice(0, 8);

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState("run");
  const [mode, setMode] = React.useState("eng");
  const [pwPrompt, setPwPrompt] = React.useState(null); // "eng" | "admin" | null
  const requestMode = (m) => { if (m === mode) return; if (m === "op") { setMode("op"); setStatusMsg("已切換至 OP 模式"); } else setPwPrompt(m); };

  const [image, setImage] = React.useState(null);
  const [imageLoading, setImageLoading] = React.useState(false);
  const [recipe, setRecipe] = React.useState(null);
  const [recipes, setRecipes] = React.useState(RECIPES);

  const [running, setRunning] = React.useState(false);
  const [runPct, setRunPct] = React.useState(0);
  const [runMsg, setRunMsg] = React.useState("Ready");
  const [job, setJob] = React.useState(null); // { id, events[] }
  const [jobError, setJobError] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [selectedDefect, setSelectedDefect] = React.useState(null);
  const [showOverlay, setShowOverlay] = React.useState(true);
  const [history, setHistory] = React.useState(HISTORY_ROWS);

  const [picker, setPicker] = React.useState(null); // image | recipe | settings | runtime
  const [statusMsg, setStatusMsg] = React.useState("就緒 · sidecar 已連線");
  const [outputDir, setOutputDir] = React.useState("outputs");
  const [outputOpts, setOutputOpts] = React.useState({ overlay: true, ng_tiles: true, ng_tiles_by_defect: false, csv: true, matrix_csv: false, json: true });
  const [saveOriginals, setSaveOriginals] = React.useState(true);
  const [monitoring, setMonitoring] = React.useState(false);
  const [backendPolicy, setBackendPolicy] = React.useState("auto");

  const [restarted, setRestarted] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);
  React.useEffect(() => { setRestarted(false); }, [t.backend]);
  const rt = restarted && t.backend === "offline" ? RUNTIME_SIMS.cuda : RUNTIME_SIMS[t.backend] || RUNTIME_SIMS.cuda;
  const sidecarUp = rt.sidecar !== "offline";

  const timersRef = React.useRef([]);
  const runTimersRef = React.useRef([]);
  const jobSeq = React.useRef(418);
  React.useEffect(() => () => { timersRef.current.forEach(clearTimeout); runTimersRef.current.forEach(clearTimeout); }, []);

  React.useEffect(() => {
    const a = ACCENT_MAP[t.accent] || ACCENT_MAP["#0d9488"];
    const root = document.documentElement;
    root.style.setProperty("--accent", t.accent);
    root.style.setProperty("--accent-strong", a.strong);
    root.style.setProperty("--accent-soft", a.soft);
    root.style.setProperty("--accent-softer", a.softer);
    root.style.setProperty("--accent-text", a.text);
  }, [t.accent]);
  React.useEffect(() => { document.documentElement.setAttribute("data-density", t.density); }, [t.density]);
  React.useEffect(() => {
    const root = document.documentElement;
    const plex = t.font === "IBM Plex";
    root.style.setProperty("--font-ui", `"${plex ? "IBM Plex Sans" : "Geist"}", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`);
    root.style.setProperty("--font-mono", `"${plex ? "IBM Plex Mono" : "Geist Mono"}", ui-monospace, "Cascadia Mono", monospace`);
  }, [t.font]);
  const [sbCollapsed, setSbCollapsed] = React.useState(false);
  const sidebarMode = t.shell === "sidebar";
  React.useEffect(() => {
    if (mode === "op" && screen !== "monitor") setScreen("monitor");
    if (mode === "op" && picker === "settings") setPicker(null);
  }, [mode, screen]);

  const loadImage = (img) => {
    setPicker(null);
    setImageLoading(true);
    setStatusMsg(`影像載入中：${img.file}`);
    timersRef.current.push(setTimeout(() => {
      setImage(img); setImageLoading(false); setResult(null); setJobError(null); setSelectedDefect(null);
      setStatusMsg(`影像已載入：${img.file}（${img.w} × ${img.h}, ${img.size}）`);
    }, 600));
  };
  const loadRecipe = (r) => { setPicker(null); setRecipe(r); setStatusMsg(`Recipe 已載入：recipes/${r.file}（未寫入設備）`); };
  const saveDesignedRecipe = (r) => {
    setRecipes((prev) => [r, ...prev.filter((x) => x.file !== r.file)]);
    setRecipe(r);
    setStatusMsg(`Recipe 已儲存並載入：recipes/${r.file}`);
  };

  const restartSidecar = () => {
    setRestarting(true);
    setStatusMsg("重新啟動 Python sidecar…");
    timersRef.current.push(setTimeout(() => { setRestarting(false); setRestarted(true); setStatusMsg("sidecar 已連線 · pid 18244"); }, 1400));
  };

  const pushEvent = (id, text) => setJob((j) => (j && j.id === id ? { ...j, events: [...j.events, { t: nowT(), text }] } : j));

  const startRun = () => {
    if (running || !image || !recipe || !sidecarUp) return;
    const id = `J-0${jobSeq.current++}`;
    setRunning(true); setResult(null); setJobError(null); setSelectedDefect(null); setRunPct(0);
    setJob({ id, events: [{ t: nowT(), text: `job.started ${id} · ${recipe.recipe_name}` }] });
    const strictFail = rt.policy === "strict";
    const stages = strictFail ? RUN_STAGES.slice(0, 2) : RUN_STAGES;
    let acc = 0;
    stages.forEach((s) => {
      acc += s.ms;
      runTimersRef.current.push(setTimeout(() => {
        setRunPct(s.pct); setRunMsg(s.msg); setStatusMsg(`${id} · ${s.msg}（${s.pct}%）`);
        pushEvent(id, `job.progress ${s.stage} ${s.pct}%`);
      }, acc));
    });
    if (strictFail) {
      runTimersRef.current.push(setTimeout(() => {
        setRunning(false);
        setJobError({ code: "CUDA_DLL_NOT_FOUND", stage: "init_backend", msg: "嚴格 CUDA 模式下找不到 gpu/visionflow_cuda.dll，工作已中止。" });
        pushEvent(id, "job.failed CUDA_DLL_NOT_FOUND");
        setStatusMsg(`${id} 失敗：CUDA_DLL_NOT_FOUND`);
      }, acc + 300));
      return;
    }
    runTimersRef.current.push(setTimeout(() => {
      const pass = t.simResult === "PASS";
      const defects = pass ? [] : SIM_DEFECTS;
      const dur = rt.backend === "cuda" ? "1.5s" : "3.8s";
      const res = { job: id, final: pass ? "PASS" : "NG", summary: pass ? { tile_count: 192, ng_count: 0, defect_count: 0 } : SIM_SUMMARY, defects, dur, backend: rt.backend, image: image.file, recipe: recipe.recipe_name };
      setResult(res); setRunning(false);
      pushEvent(id, `job.completed ${res.final} · backend=${rt.backend}`);
      setStatusMsg(`${id} 完成：${res.final} · backend ${rt.backend.toUpperCase()}`);
      setHistory((h) => [{ time: nowT(), job: id, image: image.file, recipe: recipe.recipe_name, result: res.final, defects: defects.length, dur, backend: rt.backend }, ...h].slice(0, 8));
    }, acc + 200));
  };

  const cancelRun = () => {
    if (!running) return;
    runTimersRef.current.forEach(clearTimeout); runTimersRef.current = [];
    setRunning(false); setRunPct(0); setRunMsg("已取消");
    if (job) pushEvent(job.id, "job.cancelled · 資源已釋放");
    setStatusMsg(`${job ? job.id : ""} 已取消`);
  };

  const app = {
    screen, setScreen, mode, rt, sidecarUp,
    image, imageLoaded: !!image, recipe, recipes,
    running, runPct, runMsg, result, job, jobError,
    selectedDefect, setSelectedDefect, showOverlay, setShowOverlay,
    history, startRun, cancelRun, setStatusMsg,
    monitoring, setMonitoring,
    goResults: () => setScreen("results"),
    openRecipePicker: () => setPicker("recipe"),
    openImagePicker: () => setPicker("image"),
    openRuntime: () => setPicker("runtime"),
    saveDesignedRecipe,
  };

  const visibleNav = mode === "op" ? NAV.filter((n) => n.op) : NAV;
  const showChips = screen === "run" || screen === "results";

  return (
    <div className="app-frame">
      <TitleBar />
      <div className="shell">
        {sidebarMode ? (
          <Sidebar nav={visibleNav} screen={screen} setScreen={setScreen} mode={mode} setMode={requestMode} rt={rt} sidecarUp={sidecarUp}
            onRuntime={() => setPicker("runtime")} onSettings={() => setPicker("settings")} settingsOpen={picker === "settings"}
            collapsed={sbCollapsed} onToggleCollapse={() => setSbCollapsed(!sbCollapsed)} ngCount={result && result.final === "NG" ? result.summary.defect_count : 0} />
        ) : (
        <nav className="rail">
          {visibleNav.map((n) => {
            const Ic = n.icon;
            return (
              <React.Fragment key={n.id}>
                {n.sep && <div style={{ width: 24, height: 1, background: "var(--border)", margin: "6px 0" }}></div>}
                <button className={"rail-btn" + (screen === n.id ? " active" : "")} onClick={() => setScreen(n.id)}>
                  <Ic size={19} />
                  <span className="rail-tip">{n.label}</span>
                </button>
              </React.Fragment>
            );
          })}
          <div className="rail-spacer"></div>
          {mode !== "op" && (
          <button className={"rail-btn" + (picker === "settings" ? " active" : "")} onClick={() => setPicker("settings")}>
            <IcGear size={19} />
            <span className="rail-tip">設定</span>
          </button>
          )}
        </nav>
        )}

        <div className="main-col">
          <header className="topbar">
            <span className="topbar-title">{SCREEN_TITLE[screen]}</span>
            <div className="topbar-divider"></div>
            {showChips && (
              <React.Fragment>
                <Chip icon={imageLoading ? <span className="spinner"></span> : <IcImage size={14} />} label="影像" empty={!image}
                  value={imageLoading ? "載入中…" : image ? image.file : "點擊載入"} onClick={() => !running && setPicker("image")} />
                <Chip icon={<IcRecipe size={14} />} label="Recipe" empty={!recipe}
                  value={recipe ? recipe.recipe_name : "點擊載入"} onClick={() => !running && setPicker("recipe")} />
              </React.Fragment>
            )}
            {running && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: 180 }}>
                <ProgressBar pct={runPct} />
                <span className="mono" style={{ color: "var(--text-2)", flexShrink: 0 }}>{runPct}%</span>
              </div>
            )}
            <div style={{ flex: 1 }}></div>
            {!sidebarMode && <RuntimePill rt={rt} onClick={() => setPicker("runtime")} />}
            {!sidebarMode && <Segmented value={mode} onChange={requestMode} options={[{ value: "op", label: "OP" }, { value: "eng", label: "工程" }, { value: "admin", label: "管理" }]} />}
          </header>

          <main style={{ flex: 1, minHeight: 0, padding: 12 }} data-screen-label={SCREEN_TITLE[screen]}>
            {screen === "run" && <RunScreen app={app} />}
            {screen === "batch" && <BatchScreen app={app} />}
            {screen === "batch_dashboard" && <BatchDashboardScreen app={app} />}
            {screen === "monitor" && <MonitorScreen app={app} />}
            {screen === "results" && <ResultsScreen app={app} />}
            {screen === "designer" && <DesignerScreen app={app} />}
            {screen === "devices" && <DevicesScreen app={app} />}
          </main>

          <footer style={{ height: 26, flexShrink: 0, background: "var(--surface)", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, padding: "0 14px", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{statusMsg}</span>
            <span style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <span className={"dot " + (sidecarUp ? "pass" : "ng")} style={{ width: 6, height: 6 }}></span>
              sidecar {sidecarUp ? "ready" : "offline"} · DEMO_MACHINE · {MODE_LABELS[mode]}
            </span>
          </footer>
        </div>
      </div>

      {picker === "image" && (
        <Drawer title="載入檢測影像" onClose={() => setPicker(null)}>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 10 }}>samples/（合成影像）</div>
          <div className="panel" style={{ borderRadius: "var(--r-md)" }}>
            {IMAGES.map((img) => (
              <div key={img.file} className="row-item" onClick={() => loadImage(img)}>
                <IcImage size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.file}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{img.w} × {img.h} · {img.size}</div>
                </div>
                <IcChevronR size={14} style={{ color: "var(--text-3)" }} />
              </div>
            ))}
          </div>
        </Drawer>
      )}

      {picker === "recipe" && (
        <Drawer title="載入 Recipe" onClose={() => setPicker(null)}>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 10 }}>recipes/*.yaml · 載入不會寫入設備</div>
          <div className="panel" style={{ borderRadius: "var(--r-md)" }}>
            {recipes.map((r) => (
              <div key={r.file} className="row-item" onClick={() => loadRecipe(r)}>
                <IcRecipe size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.file}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{r.tile.mode} · {r.detectors.join(", ")} · gpu {r.gpu.mode}</div>
                </div>
                {recipe && recipe.file === r.file ? <Badge kind="accent"><IcCheck size={11} strokeWidth={2.5} />使用中</Badge> : <IcChevronR size={14} style={{ color: "var(--text-3)" }} />}
              </div>
            ))}
          </div>
        </Drawer>
      )}

      {pwPrompt && (
        <PasswordDialog mode={pwPrompt} onCancel={() => setPwPrompt(null)}
          onSubmit={(pw) => {
            const ok = pw === (pwPrompt === "admin" ? "5678" : "1234");
            if (ok) { setMode(pwPrompt); setStatusMsg(`已切換至${MODE_LABELS[pwPrompt]}`); setPwPrompt(null); }
            return ok;
          }} />
      )}

      {picker === "runtime" && <RuntimeDrawer rt={rt} mode={mode} restarting={restarting} onRestart={restartSidecar} onClose={() => setPicker(null)} />}

      {picker === "settings" && (
        <Drawer title="設定" onClose={() => setPicker(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div className="panel-title" style={{ marginBottom: 10 }}>輸出</div>
              <FormGrid>
                <FRow label="輸出目錄">
                  <div style={{ display: "flex", gap: 6 }}>
                    <TextField mono value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
                    <Btn variant="secondary" size="sm" style={{ height: "var(--row-h)" }} icon={<IcFolder size={13} />}>瀏覽</Btn>
                  </div>
                </FRow>
                {[["overlay", "儲存 overlay 影像"], ["ng_tiles", "儲存 NG tiles"], ["ng_tiles_by_defect", "NG tiles 依 defect 分資料夾"], ["csv", "輸出 CSV 報表"], ["matrix_csv", "輸出矩陣 CSV"], ["json", "輸出 JSON 報表"]].map(([k, label]) => (
                  <FRow key={k} label={label}><Toggle value={outputOpts[k]} onChange={(v) => setOutputOpts({ ...outputOpts, [k]: v })} /></FRow>
                ))}
                <FRow label="相機直連保存原圖">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Toggle value={saveOriginals} onChange={(v) => setSaveOriginals(v)} disabled={monitoring} />
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>存到本次分析目錄的 origin/。監控中不可修改。</span>
                  </div>
                </FRow>
              </FormGrid>
            </div>
            {mode === "admin" && (
              <div>
                <div className="panel-title" style={{ marginBottom: 10 }}>執行環境 · 管理</div>
                <FormGrid>
                  <FRow label="Backend 政策">
                    <Segmented value={backendPolicy} onChange={setBackendPolicy} options={[{ value: "cpu", label: "僅 CPU" }, { value: "auto", label: "GPU 優先" }, { value: "cuda", label: "僅 GPU" }]} />
                  </FRow>
                  <FRow label="CUDA DLL"><TextField mono value="gpu/visionflow_cuda.dll" readOnly /></FRow>
                  <FRow label="Sidecar"><TextField mono value="bin/aoi-sidecar.exe" readOnly /></FRow>
                  <FRow label="影像快取上限"><TextField mono value="1024 MB" readOnly /></FRow>
                </FormGrid>
              </div>
            )}
            <div className="banner info"><IcCheck size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>已從舊版 GUI（QSettings）匯入輸出目錄與視窗設定。</span></div>
          </div>
        </Drawer>
      )}

      <TweaksPanel>
        <TweakSection label="視覺" />
        <TweakRadio label="導覽" value={t.shell} options={[{ value: "sidebar", label: "寬側邊欄" }, { value: "rail", label: "窄 rail" }]} onChange={(v) => setTweak("shell", v)} />
        <TweakRadio label="字體" value={t.font} options={["Geist", "IBM Plex"]} onChange={(v) => setTweak("font", v)} />
        <TweakColor label="主色 Accent" value={t.accent} options={["#4f5bd5", "#e0662f", "#0d9488", "#475569"]} onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="密度" value={t.density} options={["regular", "compact"]} onChange={(v) => setTweak("density", v)} />
        <TweakSection label="模擬" />
        <TweakRadio label="檢測結果" value={t.simResult} options={["NG", "PASS"]} onChange={(v) => setTweak("simResult", v)} />
        <TweakSelect label="執行環境" value={t.backend} options={[{ value: "cuda", label: "CUDA 正常" }, { value: "fallback", label: "缺 DLL → CPU fallback" }, { value: "strict_error", label: "嚴格 CUDA 報錯" }, { value: "offline", label: "Sidecar 離線" }]} onChange={(v) => setTweak("backend", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
