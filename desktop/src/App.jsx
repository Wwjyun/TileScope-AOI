// AOI Console — app shell（titlebar / sidebar / topbar / screens / drawers）
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  call, on, fileUrl, pickFile, pickFolder, allowDir, info, restart, openLogDir,
  isTauri, onCloseRequested, forceClose, errInfo,
} from "./api/index.js";
import { MODE_LABELS, MOCK_IMAGES } from "./data/catalog.js";
import { deriveRuntime, basename, dirname } from "./lib/util.js";
import {
  Btn, Chip, Panel, FormGrid, FRow, TextField, Toggle, Segmented, Badge, Drawer, ProgressBar, NoticeToast, ConfirmDialog,
} from "./components/components.jsx";
import { TitleBar, RuntimePill, RuntimeDrawer } from "./components/runtime.jsx";
import { Sidebar, PasswordDialog } from "./components/sidebar.jsx";
import {
  IcPlay, IcStack, IcChart, IcRadar, IcTable, IcDesigner, IcCamera, IcGear, IcImage, IcRecipe, IcChevronR, IcFolder, IcCheck, IcLock, IcUpload, IcX,
} from "./components/icons.jsx";
import RunScreen from "./screens/screen-run.jsx";
import { BatchScreen, MonitorScreen } from "./screens/screen-batch.jsx";
import BatchDashboardScreen from "./screens/screen-batch-dashboard.jsx";
import ResultsScreen from "./screens/screen-results.jsx";
import DesignerScreen from "./screens/screen-designer.jsx";
import DevicesScreen from "./screens/screen-devices.jsx";

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

export default function App() {
  const [screen, setScreen] = useState("run");
  const [mode, setMode] = useState("op");
  const [pwPrompt, setPwPrompt] = useState(null);

  const [image, setImage] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [catalog, setCatalog] = useState({});
  const [recipeList, setRecipeList] = useState([]);

  const [running, setRunning] = useState(false);
  const [runPct, setRunPct] = useState(0);
  const [runMsg, setRunMsg] = useState("Ready");
  const [job, setJob] = useState(null);
  const [jobError, setJobError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedDefect, setSelectedDefect] = useState(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [history, setHistory] = useState([]);

  const [picker, setPicker] = useState(null);
  const [statusMsg, setStatusMsg] = useState("就緒 · sidecar 已連線");
  const [notice, setNotice] = useState(null);

  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [sidecarInfo, setSidecarInfo] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [lastBackend, setLastBackend] = useState(null);
  const [backendReason, setBackendReason] = useState("");
  const [failureCode, setFailureCode] = useState(null);

  const [settings, setSettings] = useState({ output_dir: "outputs", output_options: { overlay: true, ng_tiles: true, ng_tiles_by_defect: false, csv: true, matrix_csv: false, json: true }, save_originals: true, machine: { machine_id: "DEMO_MACHINE", pipeline_version: "1.1.1" } });

  const [batch, setBatch] = useState({ job_id: null, running: false, items: [], total: 0, recursive: true, input_dir: "", summary: null });
  const [monitor, setMonitor] = useState({ job_id: null, running: false, source: "folder", input_dir: "", items: [], dropped: [], processed: 0, summary: null, cameraError: null });

  const [sbCollapsed, setSbCollapsed] = useState(false);
  const [confirmNav, setConfirmNav] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState(false);

  const jobIdRef = useRef(null);
  const batchIdRef = useRef(null);
  const monitorIdRef = useRef(null);
  const runningRef = useRef(false);
  const anyRunningRef = useRef(false);
  const designerDirtyRef = useRef(false);
  const noticeTimer = useRef(null);

  const recipeGpuMode = recipe && recipe.recipe && recipe.recipe.gpu ? recipe.recipe.gpu.mode : null;
  const rt = useMemo(
    () => deriveRuntime(runtimeStatus, sidecarInfo, { lastBackend, backendReason, failureCode, recipeGpuMode }),
    [runtimeStatus, sidecarInfo, lastBackend, backendReason, failureCode, recipeGpuMode]
  );
  const sidecarUp = rt.sidecar !== "offline";
  const anyRunning = running || batch.running || monitor.running;
  useEffect(() => { anyRunningRef.current = anyRunning; }, [anyRunning]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const notify = useCallback((n) => {
    setNotice(n);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  // The UI mode always mirrors the sidecar's permission mode (`runtime_status.mode`).
  const syncModeFromStatus = useCallback((rs) => {
    if (rs && (rs.mode === "op" || rs.mode === "eng" || rs.mode === "admin")) {
      setMode(rs.mode);
    }
  }, []);

  // ---------- startup ----------
  useEffect(() => {
    (async () => {
      try { const c = await call("detector_catalog", {}); setCatalog(c || {}); } catch (e) { notify({ kind: "error", code: e.code || "INTERNAL", message: e.message || String(e) }); }
      try { const s = await call("get_settings", {}); if (s) setSettings((prev) => ({ ...prev, ...s })); } catch (e) { /* non-fatal */ }
      // `runtime_status` first: its response is a valid frame that flips the host
      // state to "ready", so the `sidecar_info` read below is not "starting".
      try { const rs = await call("runtime_status", {}); setRuntimeStatus(rs); syncModeFromStatus(rs); } catch (e) { /* non-fatal */ }
      try { const i = await info(); setSidecarInfo(i); } catch (e) { /* non-fatal */ }
    })();
  }, [notify, syncModeFromStatus]);

  // ---------- event subscriptions ----------
  useEffect(() => {
    let unsubs = [];
    (async () => {
      unsubs.push(await on("runtime://status", (p) => {
        setRuntimeStatus(p);
        syncModeFromStatus(p);
        // Keep `sidecar_info.state` fresh (starting → ready after the first frame).
        if (p && p.sidecar !== "offline") {
          info().then(setSidecarInfo).catch(() => {});
        }
      }));
      unsubs.push(await on("job://progress", (p) => {
        if (jobIdRef.current && p.job_id === jobIdRef.current) {
          setRunPct(p.pct || 0); setRunMsg(p.message || "");
          pushJobEvent(`job.progress ${p.stage || ""} ${p.pct || 0}%`);
        } else if (batchIdRef.current && p.job_id === batchIdRef.current) {
          setBatch((b) => ({ ...b, pct: p.pct || 0 }));
        }
      }));
      unsubs.push(await on("job://completed", (p) => {
        if (p.kind === "single" && jobIdRef.current && p.job_id === jobIdRef.current) {
          const r = p.result || {};
          const backend = r.backend || p.backend || "cpu";
          const backendReason = r.backend_reason ?? p.backend_reason ?? "";
          const durMs = r.dur_ms != null ? r.dur_ms : p.dur_ms != null ? p.dur_ms : Math.round((r.duration_sec || 0) * 1000);
          const res = {
            job_id: p.job_id,
            final: r.final_result || "PASS",
            summary: r.summary || {},
            defects: flattenDefects(r),
            tiles: r.tiles || [],
            outputs: r.outputs || {},
            performance: r.performance || p.performance || (r.execution && r.execution.performance) || {},
            backend,
            backend_reason: backendReason,
            dur_ms: durMs,
            dur: `${(durMs / 1000).toFixed(1)}s`,
            image: r.image_name || "",
            recipe: r.recipe_name || "",
          };
          setResult(res);
          setRunning(false);
          setLastBackend(backend);
          setBackendReason(backendReason);
          setFailureCode(null);
          pushJobEvent(`job.completed ${res.final} · backend=${backend}`);
          setStatusMsg(`${p.job_id} 完成：${res.final} · backend ${backend.toUpperCase()}`);
          setHistory((h) => [{ time: nowT(), job: p.job_id, image: res.image, recipe: res.recipe, result: res.final, defects: res.summary.defect_count, dur: res.dur, backend }, ...h].slice(0, 8));
        } else if (p.kind === "batch" && batchIdRef.current && p.job_id === batchIdRef.current) {
          setBatch((b) => ({ ...b, running: false, summary: p.result || {} }));
          setStatusMsg(`批次 ${p.job_id} 完成`);
        }
      }));
      unsubs.push(await on("job://failed", (p) => {
        if (jobIdRef.current && p.job_id === jobIdRef.current) {
          setRunning(false);
          setFailureCode(p.code || null);
          setJobError({ code: p.code || "INTERNAL", message: p.message || "", stage: p.stage });
          pushJobEvent(`job.failed ${p.code}`);
          setStatusMsg(`${p.job_id} 失敗：${p.code}`);
        } else if (batchIdRef.current && p.job_id === batchIdRef.current) {
          setBatch((b) => ({ ...b, running: false, error: p }));
        }
      }));
      unsubs.push(await on("job://cancelled", (p) => {
        if (jobIdRef.current && p.job_id === jobIdRef.current) {
          setRunning(false); setRunPct(0); setRunMsg("已取消");
          pushJobEvent("job.cancelled · 資源已釋放");
        }
      }));
      unsubs.push(await on("batch://item", (p) => {
        if (batchIdRef.current && p.job_id === batchIdRef.current) {
          const it = p.item || {};
          const row = {
            index: p.index, total: p.total,
            name: it.image_name || `item_${(p.index || 0) + 1}`,
            result: it.final_result || "PASS",
            defects: (it.summary && it.summary.defect_count) || 0,
            tiles: (it.summary && it.summary.tile_count) || 0,
            ngTiles: (it.summary && it.summary.ng_count) || 0,
            ms: Math.round((it.duration_sec || 0) * 1000),
            error: it.error || null,
          };
          setBatch((b) => ({ ...b, items: [...b.items, row], total: p.total || b.total }));
        }
      }));
      unsubs.push(await on("monitor://item", (p) => {
        if (monitorIdRef.current && p.job_id === monitorIdRef.current) {
          const it = p.item || {};
          setMonitor((m) => ({
            ...m,
            items: [...m.items, {
              n: m.items.length + m.dropped.length + 1,
              time: nowT(),
              name: it.image_name || `frame_${String(m.items.length + 1).padStart(5, "0")}.png`,
              result: it.final_result || "PASS",
              defects: (it.summary && it.summary.defect_count) || 0,
              ngTiles: (it.summary && it.summary.ng_count) || 0,
              e2eMs: Math.round((it.duration_sec || 0) * 1000),
              raw_image_path: it.raw_image_path,
              raw_image_error: it.raw_image_error,
              error: it.error || null,
            }],
            processed: m.processed + 1,
          }));
        }
      }));
      unsubs.push(await on("monitor://stopped", (p) => {
        if (monitorIdRef.current && p.job_id === monitorIdRef.current) {
          setMonitor((m) => ({ ...m, running: false, processed: p.processed != null ? p.processed : m.processed, dropped: p.dropped || 0, summary: p }));
          setStatusMsg(`監控已停止，共處理 ${p.processed} 張${p.dropped ? `，另有 ${p.dropped} 張因佇列已滿未檢測` : ""}`);
        }
      }));
    })();
    return () => { unsubs.forEach((u) => u && u()); };
  }, [syncModeFromStatus]);

  function pushJobEvent(text) {
    setJob((j) => (j ? { ...j, events: [...j.events, { t: nowT(), text }] } : j));
  }

  // ---------- navigation (with designer dirty guard) ----------
  const navigate = useCallback((next) => {
    if (screen === "designer" && next !== "designer" && designerDirtyRef.current) {
      setConfirmNav(next);
    } else {
      setScreen(next);
    }
  }, [screen]);

  // OP mode auto-navigation
  useEffect(() => {
    if (mode === "op" && screen !== "monitor") setScreen("monitor");
    if (mode === "op" && picker === "settings") setPicker(null);
  }, [mode, screen, picker]);

  // ---------- close-while-running ----------
  useEffect(() => {
    let unsub = null;
    let cancelled = false;
    (async () => {
      unsub = await onCloseRequested(async (event) => {
        if (anyRunningRef.current) {
          event.preventDefault();
          setCloseConfirm(true);
        }
      });
      if (cancelled && unsub) unsub();
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  // ---------- image / recipe loading ----------
  const loadImage = useCallback(async (path) => {
    setPicker(null);
    setImageLoading(true);
    setStatusMsg(`影像載入中：${basename(path)}`);
    try {
      const pv = await call("image_preview", { image_path: path, max_side: 1024 });
      if (isTauri) await allowDir(dirname(pv.path)).catch(() => {});
      let src = null;
      try { src = fileUrl(pv.path); } catch (e) { /* ignore */ }
      setImage({ name: basename(path), path, width: pv.width, height: pv.height, scale: pv.scale || 1, src });
      setImageLoading(false);
      setResult(null); setJobError(null); setSelectedDefect(null);
      setStatusMsg(`影像已載入：${basename(path)}（${Math.round((pv.width / (pv.scale || 1)))} × ${Math.round((pv.height / (pv.scale || 1)))}）`);
    } catch (e) {
      setImageLoading(false);
      notify({ kind: "error", code: e.code || "INTERNAL", message: e.message || String(e) });
    }
  }, [notify]);

  const pickImageFile = useCallback(async () => {
    const p = await pickFile({ filters: [{ name: "影像", extensions: ["png", "bmp", "jpg", "jpeg", "tiff", "tif"] }] });
    if (p) await loadImage(p);
  }, [loadImage]);

  const loadRecipe = useCallback(async (path) => {
    setPicker(null);
    try {
      const res = await call("load_recipe", { path });
      setRecipe({ path: res.path, recipe: res.recipe, hidden_inner_count: res.hidden_inner_count, camera_editable: res.camera_editable });
      setStatusMsg(`Recipe 已載入：${res.recipe && res.recipe.recipe_name}（未寫入設備）`);
    } catch (e) {
      notify({ kind: "error", code: e.code || "INTERNAL", message: e.message || String(e) });
    }
  }, [notify]);

  const openRecipePicker = useCallback(() => {
    setPicker("recipe");
    call("list_recipes", {}).then((list) => setRecipeList(list || [])).catch(() => {});
  }, []);

  const pickRecipeFile = useCallback(async () => {
    const p = await pickFile({ filters: [{ name: "Recipe", extensions: ["yaml", "yml"] }] });
    if (p) await loadRecipe(p);
  }, [loadRecipe]);

  // ---------- single run ----------
  const startRun = useCallback(async () => {
    if (running || !image || !recipe || !sidecarUp) return;
    setRunning(true); setResult(null); setJobError(null); setSelectedDefect(null); setRunPct(0); setRunMsg("準備中…");
    setFailureCode(null);
    try {
      const res = await call("start_job", {
        image_path: image.path,
        recipe_path: recipe.path || recipe.recipe.recipe_name,
        output_dir: settings.output_dir,
        output_overrides: settings.output_options,
      });
      jobIdRef.current = res.job_id;
      setJob({ id: res.job_id, events: [{ t: nowT(), text: `job.started ${res.job_id} · ${recipe.recipe.recipe_name}` }] });
      setStatusMsg(`${res.job_id} · 開始檢測`);
    } catch (e) {
      setRunning(false);
      const { code, message } = errInfo(e);
      setJobError({ code, message });
      notify({ kind: "error", code, message });
    }
  }, [running, image, recipe, sidecarUp, settings, notify]);

  const cancelRun = useCallback(async () => {
    if (!running) return;
    const jid = jobIdRef.current;
    if (jid) { try { await call("cancel_job", { job_id: jid }); } catch (e) { /* ignore */ } }
    setRunning(false); setRunPct(0); setRunMsg("已取消");
    pushJobEvent("job.cancelled · 資源已釋放");
    setStatusMsg(`${jid || ""} 已取消`);
  }, [running]);

  // ---------- batch ----------
  const pickBatchFolder = useCallback(async () => {
    const p = await pickFolder();
    if (p) setBatch((b) => ({ ...b, input_dir: p }));
  }, []);

  const startBatch = useCallback(async () => {
    if (batch.running || !recipe) return;
    setBatch((b) => ({ ...b, items: [], total: 0, summary: null }));
    try {
      const res = await call("start_batch", { input_dir: batch.input_dir, recipe_path: recipe.path || recipe.recipe.recipe_name, output_dir: settings.output_dir, recursive: batch.recursive, output_overrides: settings.output_options });
      batchIdRef.current = res.job_id;
      setBatch((b) => ({ ...b, job_id: res.job_id, running: true }));
      setStatusMsg(`批次 ${res.job_id} 開始 · ${batch.input_dir}${batch.recursive ? "（含子資料夾）" : ""} · ${recipe.recipe.recipe_name}`);
    } catch (e) {
      const { code, message } = errInfo(e);
      notify({ kind: "error", code, message });
    }
  }, [batch.running, batch.input_dir, batch.recursive, recipe, settings, notify]);

  const cancelBatch = useCallback(async () => {
    const jid = batchIdRef.current;
    if (jid) { try { await call("cancel_job", { job_id: jid }); } catch (e) { /* ignore */ } }
    setBatch((b) => ({ ...b, running: false, summary: { ...(b.summary || {}), cancelled: b.total - b.items.length } }));
  }, []);

  const setBatchRecursive = useCallback((v) => setBatch((b) => ({ ...b, recursive: v })), []);

  // ---------- monitor ----------
  const pickMonitorFolder = useCallback(async () => {
    const p = await pickFolder();
    if (p) setMonitor((m) => ({ ...m, input_dir: p }));
  }, []);

  const startMonitor = useCallback(async (source, extra = {}) => {
    if (monitor.running) return true;
    try {
      const res = await call("monitor_start", {
        source,
        input_dir: monitor.input_dir,
        recipe_path: recipe ? (recipe.path || recipe.recipe.recipe_name) : undefined,
        output_dir: settings.output_dir,
        move_to: extra.move_to || null,
        output_overrides: settings.output_options,
      });
      monitorIdRef.current = res.job_id;
      setMonitor((m) => ({ ...m, job_id: res.job_id, running: true, source, items: [], dropped: [], processed: 0, summary: null, cameraError: null }));
      setStatusMsg(`監控中：${source === "camera" ? "相機直連" : monitor.input_dir}`);
      return true;
    } catch (e) {
      const { code, message } = errInfo(e);
      setMonitor((m) => ({ ...m, cameraError: code }));
      notify({ kind: "error", code, message });
      return false;
    }
  }, [monitor.running, monitor.input_dir, recipe, settings, notify]);

  const stopMonitor = useCallback(async () => {
    const jid = monitorIdRef.current;
    if (jid) { try { await call("monitor_stop", { job_id: jid }); } catch (e) { /* ignore */ } }
    // The sidecar emits monitor://stopped; fall back locally if it doesn't arrive.
    setTimeout(() => setMonitor((m) => (m.running ? { ...m, running: false } : m)), 1500);
  }, []);

  // ---------- mode ----------
  const requestMode = useCallback((m) => {
    if (m === mode) return;
    if (m === "op") {
      call("switch_mode", { mode: "op", password: "" })
        .then(() => { setMode("op"); setStatusMsg("已切換至 OP 模式"); })
        .catch((e) => { const { code, message } = errInfo(e); notify({ kind: "error", code, message }); });
    } else {
      setPwPrompt(m);
    }
  }, [mode, notify]);

  const submitPassword = useCallback(async (pw) => {
    const m = pwPrompt;
    try {
      const res = await call("switch_mode", { mode: m, password: pw });
      setMode(res.mode || m);
      setPwPrompt(null);
      setStatusMsg(`已切換至${MODE_LABELS[res.mode || m]}`);
      return true;
    } catch (e) {
      const { code, message } = errInfo(e);
      notify({ kind: "error", code, message });
      return false;
    }
  }, [pwPrompt, notify]);

  // ---------- runtime ----------
  const restartSidecar = useCallback(async () => {
    setRestarting(true);
    setStatusMsg("重新啟動 Python sidecar…");
    try {
      const i = await restart();
      setSidecarInfo(i);
      setRuntimeStatus(null);
      try { const rs = await call("runtime_status", {}); setRuntimeStatus(rs); syncModeFromStatus(rs); } catch (e) { /* ignore */ }
      setStatusMsg(`sidecar 已連線 · pid ${i && i.pid}`);
    } catch (e) {
      const { code, message } = errInfo(e);
      notify({ kind: "error", code, message });
    } finally {
      setRestarting(false);
    }
  }, [notify, syncModeFromStatus]);

  const openLog = useCallback(async () => {
    try { await openLogDir(); } catch (e) { const { code, message } = errInfo(e); notify({ kind: "error", code, message }); }
  }, [notify]);

  // ---------- settings ----------
  const setOutputDir = useCallback(async () => {
    const p = await pickFolder();
    if (p) setSettings((s) => ({ ...s, output_dir: p }));
  }, []);
  const setOutputOptions = useCallback((patch) => {
    setSettings((s) => ({ ...s, output_options: { ...s.output_options, ...patch } }));
    call("set_settings", { patch: { output_options: { ...settings.output_options, ...patch } } }).catch(() => {});
  }, [settings.output_options]);
  const setSaveOriginals = useCallback((v) => {
    setSettings((s) => ({ ...s, save_originals: v }));
    call("set_settings", { patch: { save_originals: v } }).catch(() => {});
  }, []);
  const importLegacySettings = useCallback(async () => {
    try {
      const s = await call("import_legacy_settings", {});
      if (s) setSettings((prev) => ({ ...prev, ...s }));
      notify({ kind: "success", code: "OK", message: "已從舊版 GUI（QSettings）匯入輸出目錄與視窗設定。" });
    } catch (e) { const { code, message } = errInfo(e); notify({ kind: "error", code, message }); }
  }, [notify]);

  const imageSrcFor = useCallback((name) => (isTauri ? null : fileUrl(name)), []);

  const visibleNav = mode === "op" ? NAV.filter((n) => n.op) : NAV;
  const showChips = screen === "run" || screen === "results";
  const ngCount = result && result.final === "NG" ? result.summary.defect_count : 0;

  const app = {
    screen, setScreen: navigate, mode, rt, sidecarUp, isTauri,
    image, imageLoaded: !!image, imageLoading, recipe, catalog, recipeList,
    running, runPct, runMsg, result, job, jobError,
    selectedDefect, setSelectedDefect, showOverlay, setShowOverlay,
    history, startRun, cancelRun, setStatusMsg, notify,
    goResults: () => navigate("results"),
    openRecipePicker, openImagePicker: () => setPicker("image"), pickImageFile, loadImage, loadRecipe,
    batch, startBatch, cancelBatch, setBatchRecursive, pickBatchFolder,
    monitor, startMonitor, stopMonitor, pickMonitorFolder,
    settings, setOutputDir, setOutputOptions, setSaveOriginals, importLegacySettings,
    imageSrcFor, designerDirtyRef,
  };

  return (
    <div className="app-frame">
      <TitleBar />
      <div className="shell">
        <Sidebar
          nav={visibleNav} screen={screen} setScreen={navigate} mode={mode} setMode={requestMode}
          rt={rt} sidecarUp={sidecarUp} onRuntime={() => setPicker("runtime")}
          onSettings={() => setPicker("settings")} settingsOpen={picker === "settings"}
          collapsed={sbCollapsed} onToggleCollapse={() => setSbCollapsed(!sbCollapsed)} ngCount={ngCount}
        />

        <div className="main-col">
          <header className="topbar">
            <span className="topbar-title">{SCREEN_TITLE[screen]}</span>
            <div className="topbar-divider"></div>
            {showChips && (
              <React.Fragment>
                <Chip icon={imageLoading ? <span className="spinner"></span> : <IcImage size={14} />} label="影像" empty={!image}
                  value={imageLoading ? "載入中…" : image ? image.name : "點擊載入"} onClick={() => !running && setPicker("image")} />
                <Chip icon={<IcRecipe size={14} />} label="Recipe" empty={!recipe}
                  value={recipe ? recipe.recipe.recipe_name : "點擊載入"} onClick={() => !running && openRecipePicker()} />
              </React.Fragment>
            )}
            {running && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: 180 }}>
                <ProgressBar pct={runPct} />
                <span className="mono" style={{ color: "var(--text-2)", flexShrink: 0 }}>{runPct}%</span>
              </div>
            )}
            <div style={{ flex: 1 }}></div>
            <RuntimePill rt={rt} onClick={() => setPicker("runtime")} />
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
              sidecar {sidecarUp ? "ready" : "offline"} · {settings.machine && settings.machine.machine_id} · {MODE_LABELS[mode]}
            </span>
          </footer>
        </div>
      </div>

      {picker === "image" && (
        <Drawer title="載入檢測影像" onClose={() => setPicker(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Btn variant="secondary" icon={<IcFolder size={14} />} onClick={pickImageFile}>選擇檔案…</Btn>
            {!isTauri && (
              <React.Fragment>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>samples/（合成影像）</div>
                <div className="panel" style={{ borderRadius: "var(--r-md)" }}>
                  {MOCK_IMAGES.map((img) => (
                    <div key={img.path} className="row-item" onClick={() => loadImage(img.path)}>
                      <IcImage size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{img.w} × {img.h} · {img.size}</div>
                      </div>
                      <IcChevronR size={14} style={{ color: "var(--text-3)" }} />
                    </div>
                  ))}
                </div>
              </React.Fragment>
            )}
          </div>
        </Drawer>
      )}

      {picker === "recipe" && (
        <Drawer title="載入 Recipe" onClose={() => setPicker(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Btn variant="secondary" icon={<IcFolder size={14} />} onClick={pickRecipeFile}>選擇檔案…</Btn>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>recipes/*.yaml · 載入不會寫入設備</div>
            <div className="panel" style={{ borderRadius: "var(--r-md)" }}>
              {recipeList.map((r) => (
                <div key={r.path} className="row-item" onClick={() => loadRecipe(r.path)}>
                  <IcRecipe size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.path}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>{r.recipe_name}</div>
                  </div>
                  {recipe && recipe.path === r.path ? <Badge kind="accent"><IcCheck size={11} strokeWidth={2.5} />使用中</Badge> : <IcChevronR size={14} style={{ color: "var(--text-3)" }} />}
                </div>
              ))}
              {!recipeList.length && <div style={{ padding: 14, color: "var(--text-3)", fontSize: "var(--fs-small)" }}>尚無 Recipe</div>}
            </div>
          </div>
        </Drawer>
      )}

      {pwPrompt && (
        <PasswordDialog mode={pwPrompt} onCancel={() => setPwPrompt(null)} onSubmit={submitPassword} />
      )}

      {picker === "runtime" && (
        <RuntimeDrawer rt={rt} mode={mode} restarting={restarting} onRestart={restartSidecar} onOpenLog={openLog} onClose={() => setPicker(null)} />
      )}

      {picker === "settings" && (
        <Drawer title="設定" onClose={() => setPicker(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div className="panel-title" style={{ marginBottom: 10 }}>輸出</div>
              <FormGrid>
                <FRow label="輸出目錄">
                  <div style={{ display: "flex", gap: 6 }}>
                    <TextField mono value={settings.output_dir} onChange={(e) => setSettings((s) => ({ ...s, output_dir: e.target.value }))} />
                    <Btn variant="secondary" size="sm" style={{ height: "var(--row-h)" }} icon={<IcFolder size={13} />} onClick={setOutputDir}>瀏覽</Btn>
                  </div>
                </FRow>
                {[["overlay", "儲存 overlay 影像"], ["ng_tiles", "儲存 NG tiles"], ["ng_tiles_by_defect", "NG tiles 依 defect 分資料夾"], ["csv", "輸出 CSV 報表"], ["matrix_csv", "輸出矩陣 CSV"], ["json", "輸出 JSON 報表"]].map(([k, label]) => (
                  <FRow key={k} label={label}><Toggle value={settings.output_options[k]} onChange={(v) => setOutputOptions({ [k]: v })} /></FRow>
                ))}
                <FRow label="相機直連保存原圖">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Toggle value={settings.save_originals} onChange={(v) => setSaveOriginals(v)} disabled={monitor.running} />
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>存到本次分析目錄的 origin/。監控中不可修改。</span>
                  </div>
                </FRow>
              </FormGrid>
            </div>
            <div>
              <div className="panel-title" style={{ marginBottom: 10 }}>機台</div>
              <FormGrid>
                <FRow label="Machine ID"><TextField mono value={settings.machine && settings.machine.machine_id} readOnly /></FRow>
                <FRow label="Pipeline 版本"><TextField mono value={settings.machine && settings.machine.pipeline_version} readOnly /></FRow>
              </FormGrid>
            </div>
            {mode !== "op" && (
              <div>
                <Btn variant="secondary" size="sm" icon={<IcUpload size={13} />} onClick={importLegacySettings}>匯入舊版設定（QSettings）</Btn>
              </div>
            )}
          </div>
        </Drawer>
      )}

      {confirmNav && (
        <ConfirmDialog
          title="未儲存修改"
          message="此 Recipe 有未儲存的修改，離開將捨棄。要繼續嗎？"
          confirmLabel="捨棄並離開"
          danger
          onConfirm={() => { const go = confirmNav; setConfirmNav(null); setScreen(go); }}
          onCancel={() => setConfirmNav(null)}
        />
      )}

      {closeConfirm && (
        <ConfirmDialog
          title="工作中"
          message="目前仍有工作執行中，關閉前請先取消。要強制關閉嗎？"
          confirmLabel="強制關閉"
          danger
          onConfirm={() => { setCloseConfirm(false); forceClose(); }}
          onCancel={() => setCloseConfirm(false)}
        />
      )}

      <NoticeToast notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
