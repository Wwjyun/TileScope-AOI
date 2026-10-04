// ============================================================
// AOI Console — shared React components
// ============================================================
import React, { useEffect, useRef } from "react";
import { IcX, IcCheck, IcAlert, IcMinus } from "./icons.jsx";

export function Btn({ variant = "secondary", size, icon, children, ...rest }) {
  const cls = ["btn", `btn-${variant}`, size ? `btn-${size}` : ""].join(" ");
  return (
    <button className={cls} {...rest}>
      {icon}{children}
    </button>
  );
}

export function IconBtn({ title, children, ...rest }) {
  return (
    <button className="icon-btn" title={title} {...rest}>{children}</button>
  );
}

export function Chip({ icon, label, value, empty, onClick, title }) {
  return (
    <button className={"chip" + (empty ? " empty" : "")} onClick={onClick} title={title || value}>
      {icon}
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span className="chip-value">{value}</span>
    </button>
  );
}

export function Badge({ kind = "neutral", children }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

export function ResultBadge({ result }) {
  if (result === "PASS") return <Badge kind="pass"><IcCheck size={12} strokeWidth={2.4} />PASS</Badge>;
  if (result === "NG") return <Badge kind="ng"><IcX size={12} strokeWidth={2.4} />NG</Badge>;
  if (result === "ERROR") return <Badge kind="ng"><IcAlert size={12} strokeWidth={2.4} />ERROR</Badge>;
  if (result === "取消" || result === "CANCELLED") return <Badge kind="neutral"><IcMinus size={12} strokeWidth={2.4} />取消</Badge>;
  return <Badge kind="neutral">—</Badge>;
}

export function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className={"seg" + (disabled ? " disabled" : "")} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={"seg-item" + (opt.value === value ? " active" : "")}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >{opt.label}</button>
      ))}
    </div>
  );
}

export function Panel({ title, actions, children, flush, style, className }) {
  return (
    <section className={"panel " + (className || "")} style={style}>
      {title !== undefined && (
        <header className="panel-header">
          <span className="panel-title">{title}</span>
          <div style={{ flex: 1 }}></div>
          {actions}
        </header>
      )}
      <div className={"panel-body" + (flush ? " flush" : "")} style={{ flex: 1 }}>{children}</div>
    </section>
  );
}

export function FormGrid({ children }) {
  return <div className="form-grid">{children}</div>;
}

export function FRow({ label, children }) {
  return (
    <React.Fragment>
      <label className="form-label">{label}</label>
      <div style={{ minWidth: 0 }}>{children}</div>
    </React.Fragment>
  );
}

export function TextField({ mono, ...rest }) {
  return <input className={"field" + (mono ? " mono-field" : "")} {...rest} />;
}

export function NumField({ value, onChange, step = 1, min, max, decimals }) {
  const clamp = (v) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return decimals !== undefined ? +v.toFixed(decimals) : v;
  };
  const bump = (dir) => onChange(clamp((+value || 0) + dir * step));
  return (
    <div className="num-field">
      <input
        className="field mono-field"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(isNaN(v) ? e.target.value : v);
        }}
        onBlur={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(clamp(v));
        }}
      />
      <div className="num-steps">
        <button onClick={() => bump(1)} tabIndex={-1}>▲</button>
        <button onClick={() => bump(-1)} tabIndex={-1}>▼</button>
      </div>
    </div>
  );
}

export function Toggle({ value, onChange, disabled }) {
  return (
    <button
      className={"toggle" + (value ? " on" : "")}
      onClick={() => !disabled && onChange(!value)}
      style={disabled ? { opacity: 0.5, cursor: "default" } : null}
      role="switch" aria-checked={value}
    ></button>
  );
}

// 依參數型別自動選擇控件（對應 PySide 的 _make_param_widget）
export function ParamControl({ value, onChange, readOnly }) {
  if (typeof value === "boolean") {
    return <Toggle value={value} onChange={onChange} disabled={readOnly} />;
  }
  if (typeof value === "number") {
    if (readOnly) return <TextField mono value={String(value)} readOnly />;
    const isFloat = !Number.isInteger(value) || Math.abs(value) <= 1;
    return <NumField value={value} onChange={onChange} step={isFloat ? 0.01 : 1} decimals={isFloat ? 3 : 0} />;
  }
  return <TextField mono value={String(value)} readOnly={readOnly} onChange={(e) => onChange && onChange(e.target.value)} />;
}

export function ProgressBar({ pct }) {
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${pct}%` }}></div>
    </div>
  );
}

export function Drawer({ title, onClose, children, width }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <React.Fragment>
      <div className="overlay-dim" onClick={onClose}></div>
      <aside className="drawer" style={width ? { width } : null}>
        <header className="drawer-header">
          <span className="drawer-title">{title}</span>
          <IconBtn title="關閉" onClick={onClose}><IcX size={16} /></IconBtn>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </React.Fragment>
  );
}

export function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="empty-state">
      <div style={{ opacity: 0.55 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: "var(--text-2)", fontSize: 13 }}>{title}</div>
      {hint && <div style={{ fontSize: "var(--fs-small)", maxWidth: 260, lineHeight: 1.55 }}>{hint}</div>}
      {action}
    </div>
  );
}

export function NoticeToast({ notice, onClose }) {
  if (!notice) return null;
  const tone = notice.kind || "info";
  return (
    <div className={`notice-toast ${tone}`} onClick={onClose} role="status">
      <span className="mono" style={{ fontWeight: 600, flexShrink: 0 }}>{notice.code || tone.toUpperCase()}</span>
      <span style={{ flex: 1 }}>{notice.message}</span>
    </div>
  );
}

// Modal confirmation (inline, no alert()); used for close-while-running and
// leaving the Designer with unsaved changes.
export function ConfirmDialog({ title, message, confirmLabel = "確認", danger, onConfirm, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current && ref.current.focus();
    const k = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);
  return (
    <React.Fragment>
      <div className="overlay-dim" onClick={onCancel}></div>
      <div className="confirm-dialog fade-in" role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
        <div className="title">{title}</div>
        {message && <div style={{ fontSize: "var(--fs-small)", color: "var(--text-2)", lineHeight: 1.55 }}>{message}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel}>取消</Btn>
          <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </React.Fragment>
  );
}
