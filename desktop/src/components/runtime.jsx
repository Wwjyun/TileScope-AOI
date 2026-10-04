// AOI Console — runtime 狀態（GUI → Rust → sidecar → Backend）與視窗外框
import React from "react";
import { Btn, Drawer } from "./components.jsx";
import { IconBtn } from "./components.jsx";
import { winMinimize, winToggleMaximize, winClose } from "../api/index.js";
import { IcMinus, IcSquare, IcX, IcTable, IcChip, IcStack, IcRefresh, IcFolder, IcAlert, IcCheck } from "./icons.jsx";

export function TitleBar() {
  return (
    <div className="titlebar" data-tauri-drag-region="">
      <span className="titlebar-logo" data-tauri-drag-region="">A</span>
      <span className="titlebar-name" data-tauri-drag-region="">TileScope AOI</span>
      <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }} data-tauri-drag-region="">v0.1.0</span>
      <div style={{ flex: 1 }} data-tauri-drag-region=""></div>
      <div style={{ display: "flex" }}>
        <button className="win-btn" title="最小化" onClick={winMinimize}><IcMinus size={14} /></button>
        <button className="win-btn" title="最大化" onClick={winToggleMaximize}><IcSquare size={12} /></button>
        <button className="win-btn close" title="關閉" onClick={winClose}><IcX size={14} /></button>
      </div>
    </div>
  );
}

export function RuntimePill({ rt, onClick }) {
  const title = [rt.label, rt.dllNote, rt.reason].filter(Boolean).join(" · ") || "執行環境";
  return (
    <button className="rt-pill" onClick={onClick} title={title}>
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

export function RuntimeDrawer({ rt, mode, restarting, onRestart, onOpenLog, onClose }) {
  const off = rt.sidecar === "offline";
  const starting = !off && rt.sidecar_state === "starting";
  const sideState = off ? "bad" : "ok";
  const beState = off || rt.label === "CUDA 不可用" ? "bad"
    : rt.backend === "cuda" ? "ok"
    : rt.backend === "cpu" && rt.tone === "warn" ? "warn"
    : "ok";
  const backendMeta = off ? "—"
    : rt.backend === "cuda" ? `CUDA · ${(rt.cuda && rt.cuda.dll_path) || "gpu/visionflow_cuda.dll"}`
    : rt.backend === "cpu" ? (rt.tone === "warn" ? `CPU fallback · ${rt.reason || ""}` : "CPU（OpenCV）")
    : rt.label === "CUDA 不可用" ? "CUDA 不可用"
    : "尚未執行";
  const recipeGpuText = rt.recipe_gpu_mode === "cpu" ? "cpu（僅 CPU）"
    : rt.recipe_gpu_mode === "cuda" ? "cuda（嚴格）"
    : rt.recipe_gpu_mode === "auto" ? "auto（GPU 優先，失敗改用 CPU）"
    : "—（尚未載入 Recipe）";
  return (
    <Drawer title="執行環境" onClose={onClose} width="min(420px, 100vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {off && (
          <div className="banner ng"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>Python sidecar 未回應，無法檢測。重新啟動後會重新載入 Recipe。</span></div>
        )}
        {!off && rt.tone === "warn" && (
          <div className="banner warn"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>CPU fallback：{rt.reason || "Recipe 要求 GPU，實際以 CPU 執行"}。</span></div>
        )}
        {!off && rt.label === "CUDA 不可用" && (
          <div className="banner ng"><IcAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>CUDA 不可用：DLL 缺失或初始化失敗，工作已中止。</span></div>
        )}
        <div className="chain">
          <ChainNode icon={<IcTable size={16} />} title="GUI（WebView2）" meta="React UI · 只送指令與接收事件，不處理像素" state="ok" right={<span className="dot pass" style={{ marginTop: 5 }}></span>} />
          <div className="chain-link"></div>
          <ChainNode icon={<IcChip size={16} />} title="Rust 宿主（Tauri 2）" meta="commands · event bus · 工作佇列 · 檔案 / 影像快取" state="ok" right={<span className="dot pass" style={{ marginTop: 5 }}></span>} />
          <div className="chain-link"></div>
          <ChainNode icon={<IcStack size={16} />} title="Python sidecar" state={sideState}
            meta={off ? "process 已結束" : starting ? "啟動中…" : `aoi-core ${rt.core_version || "1.1.1"} · pid ${rt.pid || "—"} · stdio JSON-RPC`}
            right={<span className={"dot " + (restarting ? "busy" : off ? "ng" : "pass")} style={{ marginTop: 5 }}></span>} />
          <div className="chain-link"></div>
          <ChainNode icon={<IcChip size={16} />} title="運算 Backend" state={off ? "bad" : beState}
            meta={backendMeta}
            right={<span className={"dot " + (off ? "ng" : rt.tone)} style={{ marginTop: 5 }}></span>} />
        </div>
        {mode !== "op" && (
          <div>
            <div className="panel-title" style={{ marginBottom: 10 }}>執行環境</div>
            <div className="kv">
              <span>CUDA DLL</span><span>{rt.dll === "present" ? "已找到" : rt.dll === "missing" ? "未找到" : "—"}{(rt.cuda && rt.cuda.dll_path) ? `（${rt.cuda.dll_path}）` : ""}</span>
              <span>Recipe GPU 模式</span><span>{recipeGpuText}</span>
              <span>影像傳輸</span><span>共享暫存檔 + asset://</span>
              <span>工作佇列上限</span><span>4</span>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" icon={restarting ? <span className="spinner"></span> : <IcRefresh size={14} />} disabled={restarting} onClick={onRestart}>
            {restarting ? "重新啟動中…" : "重新啟動 sidecar"}
          </Btn>
          <Btn variant="ghost" icon={<IcFolder size={14} />} onClick={onOpenLog}>開啟 log</Btn>
        </div>
      </div>
    </Drawer>
  );
}

export function CheckIcon() {
  return <IcCheck size={14} />;
}
