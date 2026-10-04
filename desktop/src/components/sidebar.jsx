// AOI Console — 寬版側邊欄（分組導覽 + 執行環境卡 + 模式切換，可收合）
import React, { useEffect, useRef, useState } from "react";
import { Btn } from "./components.jsx";
import { IcChevronR, IcGear, IcLock } from "./icons.jsx";
import { MODE_LABELS } from "../data/catalog.js";

export function Sidebar({ nav, screen, setScreen, mode, setMode, rt, sidecarUp, onRuntime, onSettings, settingsOpen, collapsed, onToggleCollapse, ngCount }) {
  const groups = [
    { label: "檢測", items: nav.filter((n) => !n.engOnly) },
    { label: "工程", items: nav.filter((n) => n.engOnly) },
  ].filter((g) => g.items.length);
  return (
    <nav className={"sidebar" + (collapsed ? " collapsed" : "")}>
      <div className="sb-head">
        <span className="sb-logo">A</span>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sb-app">TileScope AOI</div>
            <div className="sb-sub">v0.1.0 · Tauri</div>
          </div>
        )}
        <button className="sb-collapse" onClick={onToggleCollapse} title={collapsed ? "展開側邊欄" : "收合側邊欄"}>
          <IcChevronR size={14} style={{ transform: collapsed ? "none" : "rotate(180deg)" }} />
        </button>
      </div>

      <div className="sb-scroll">
        {groups.map((g) => (
          <div key={g.label} className="sb-group">
            {!collapsed && <div className="sb-group-label">{g.label}</div>}
            {g.items.map((n) => {
              const Ic = n.icon;
              return (
                <button key={n.id} className={"sb-item" + (screen === n.id ? " active" : "")} onClick={() => setScreen(n.id)} title={collapsed ? n.label : undefined}>
                  <Ic size={17} />
                  {!collapsed && <span className="sb-label">{n.label}</span>}
                  {!collapsed && n.id === "results" && ngCount > 0 && <span className="sb-count">{ngCount}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <button className="sb-runtime" onClick={onRuntime} title="執行環境">
          <span className={"dot " + rt.tone}></span>
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
              <div className="sb-rt-main">{rt.label}</div>
              <div className="sb-rt-sub">{sidecarUp ? `sidecar ready · pid ${rt.pid || "—"}` : "sidecar offline"}{rt.dllNote ? ` · ${rt.dllNote}` : ""}</div>
            </div>
          )}
          {!collapsed && <IcChevronR size={13} style={{ opacity: 0.5 }} />}
        </button>
        {!collapsed ? (
          <div className="sb-mode">
            {[["op", "OP"], ["eng", "工程"], ["admin", "管理"]].map(([v, l]) => (
              <button key={v} className={mode === v ? "on" : ""} onClick={() => setMode(v)}>{v !== "op" && mode !== v && <IcLock size={10} style={{ marginRight: 3, opacity: 0.55 }} />}{l}</button>
            ))}
          </div>
        ) : (
          <button className="sb-item" onClick={() => setMode(mode === "op" ? "eng" : mode === "eng" ? "admin" : "op")} title={MODE_LABELS[mode] + "（點擊切換）"}>
            <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{{ op: "OP", eng: "ENG", admin: "ADM" }[mode]}</span>
          </button>
        )}
        {mode !== "op" && (
          <button className={"sb-item" + (settingsOpen ? " active" : "")} onClick={onSettings} title={collapsed ? "設定" : undefined}>
            <IcGear size={17} />
            {!collapsed && <span className="sb-label">設定</span>}
          </button>
        )}
      </div>
    </nav>
  );
}

export function PasswordDialog({ mode, onSubmit, onCancel }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    ref.current && ref.current.focus();
    const k = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await onSubmit(pw);
    setBusy(false);
    if (!ok) { setErr(true); setPw(""); }
  };
  return (
    <React.Fragment>
      <div className="overlay-dim" onClick={onCancel}></div>
      <form className="pw-dialog fade-in" onSubmit={submit}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="pw-ic"><IcLock size={16} /></span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>權限驗證</div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>請輸入{MODE_LABELS[mode]}密碼</div>
          </div>
        </div>
        <input ref={ref} type="password" className="field mono-field" value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }}
          style={err ? { borderColor: "var(--ng)", boxShadow: "0 0 0 2px var(--ng-soft)" } : null} />
        {err && <div style={{ fontSize: "var(--fs-small)", color: "var(--ng)" }}>密碼錯誤，權限未變更。</div>}
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>驗證由後端執行；工程 1234 · 管理 5678（示範）。</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" type="button" onClick={onCancel}>取消</Btn>
          <Btn variant="primary" type="submit" disabled={!pw || busy}>{busy ? "驗證中…" : "確認"}</Btn>
        </div>
      </form>
    </React.Fragment>
  );
}
