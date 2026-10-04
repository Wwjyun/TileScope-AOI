// ============================================================
// AOI Console — image viewer (real preview <img> + defect overlay + zoom/pan)
// Defect boxes use bbox_global (original px) × preview scale.
// ============================================================
import React, { useEffect, useRef, useState, useCallback } from "react";
import { IconBtn } from "./components.jsx";
import { EmptyState } from "./components.jsx";
import { IcImage, IcZoomOut, IcZoomIn, IcFit, IcEye } from "./icons.jsx";

export const DEFECT_COLOR = { blob: "#ff5d52", scratch: "#ffb13d", uniformity: "#5db6ff" };

function bboxColor(type) {
  return DEFECT_COLOR[type] || "#ff5d52";
}

export default function ImageViewer({
  image, // { name, width, height, scale, src } | null
  defects, // [{ id, bbox:[x,y,w,h] original px, type, tile, detector, score }]
  selectedDefect,
  onSelectDefect,
  showOverlay,
  onToggleOverlay,
  running,
  runPct,
}) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0, fitted: false });
  const [cursor, setCursor] = useState(null);

  const imgW = image ? image.width : 0;
  const imgH = image ? image.height : 0;
  const pxScale = image ? image.scale || 1 : 1;

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !image) return;
    const pad = 28;
    const sw = (el.clientWidth - pad * 2) / imgW;
    const sh = (el.clientHeight - pad * 2) / imgH;
    const scale = Math.min(sw, sh, 1);
    setView({
      scale,
      tx: (el.clientWidth - imgW * scale) / 2,
      ty: (el.clientHeight - imgH * scale) / 2,
      fitted: true,
    });
  }, [image, imgW, imgH]);

  useEffect(() => {
    if (image) fit();
  }, [image, fit]);

  useEffect(() => {
    const onResize = () => { if (image) fit(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [image, fit]);

  const zoomAt = (factor, px, py) => {
    setView((v) => {
      const scale = Math.min(8, Math.max(0.05, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k, fitted: false };
    });
  };

  const onWheel = (e) => {
    if (!image) return;
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onMouseDown = (e) => {
    if (!image) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onMouseMove = (e) => {
    const el = wrapRef.current;
    if (!el || !image) return;
    const rect = el.getBoundingClientRect();
    const ix = (e.clientX - rect.left - view.tx) / view.scale;
    const iy = (e.clientY - rect.top - view.ty) / view.scale;
    setCursor(ix >= 0 && iy >= 0 && ix <= imgW && iy <= imgH ? { x: ix, y: iy } : null);
    const d = dragRef.current;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy, fitted: false }));
    }
  };
  const onMouseUp = () => { dragRef.current = null; };

  const center = (zoomFn) => {
    const el = wrapRef.current;
    if (el) zoomFn(el.clientWidth / 2, el.clientHeight / 2);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* viewer toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "6px 10px",
        background: "var(--viewer-bg-2)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "var(--r-lg) var(--r-lg) 0 0",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)",
          color: "rgba(255,255,255,0.6)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginRight: "auto", paddingLeft: 4,
        }}>{image ? image.name : "尚未載入影像"}</span>

        <div style={{ display: "flex", alignItems: "center", gap: 2, color: "rgba(255,255,255,0.75)" }}>
          <IconBtn title="縮小" onClick={() => image && center((x, y) => zoomAt(1 / 1.25, x, y))} style={{ color: "inherit" }}><IcZoomOut size={16} /></IconBtn>
          <IconBtn title="放大" onClick={() => image && center((x, y) => zoomAt(1.25, x, y))} style={{ color: "inherit" }}><IcZoomIn size={16} /></IconBtn>
          <IconBtn title="符合視窗" onClick={() => image && fit()} style={{ color: "inherit" }}><IcFit size={16} /></IconBtn>
        </div>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)", margin: "0 6px" }}></div>
        <button
          className="btn btn-sm"
          onClick={onToggleOverlay}
          style={{
            background: showOverlay ? "var(--accent)" : "rgba(255,255,255,0.08)",
            color: showOverlay ? "#fff" : "rgba(255,255,255,0.65)",
            border: "none",
          }}
        >
          <IcEye size={13} /> 缺陷 Overlay
        </button>
      </div>

      {/* stage */}
      <div
        ref={wrapRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{
          flex: 1, position: "relative", overflow: "hidden",
          background: "var(--viewer-bg)",
          cursor: image ? (dragRef.current ? "grabbing" : "grab") : "default",
          minHeight: 0,
        }}
      >
        {!image && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <EmptyState
              icon={<IcImage size={40} strokeWidth={1.2} />}
              title="尚未載入檢測影像"
              hint="從上方工具列載入影像"
            />
          </div>
        )}

        {image && (
          <div style={{
            position: "absolute", left: 0, top: 0,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: "0 0",
            width: imgW, height: imgH,
          }}>
            <img
              src={image.src}
              width={imgW}
              height={imgH}
              alt={image.name}
              draggable={false}
              style={{ display: "block", boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 12px 40px rgba(0,0,0,0.5)" }}
            />

            {/* defect boxes */}
            {showOverlay && (defects || []).map((d) => {
              const sel = selectedDefect === d.id;
              const color = bboxColor(d.type);
              const [bx, by, bw, bh] = d.bbox || [0, 0, 0, 0];
              return (
                <div
                  key={d.id}
                  onClick={(e) => { e.stopPropagation(); if (!dragRef.current || !dragRef.current.moved) onSelectDefect(sel ? null : d.id); }}
                  title={`#${d.id} ${d.type} · detector ${d.detector}`}
                  style={{
                    position: "absolute",
                    left: bx * pxScale, top: by * pxScale,
                    width: Math.max(1, bw * pxScale), height: Math.max(1, bh * pxScale),
                    border: `${sel ? 2.5 : 1.5}px solid ${color}`,
                    borderRadius: 2,
                    boxShadow: sel ? `0 0 0 3px ${color}55, 0 0 18px ${color}88` : `0 0 8px ${color}44`,
                    cursor: "pointer",
                    animation: "aoi-fade-in 0.3s ease",
                    zIndex: sel ? 3 : 2,
                  }}
                >
                  <span style={{
                    position: "absolute", top: -20, left: -2,
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                    color: "#10171a", background: color,
                    padding: "1px 6px", borderRadius: 3,
                    whiteSpace: "nowrap",
                    display: sel ? "block" : "none",
                  }}>#{d.id} {d.type} {typeof d.score === "number" ? d.score.toFixed(2) : ""}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* scan line while running */}
        {running && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: 0, right: 0, height: 2,
              background: "linear-gradient(90deg, transparent, var(--accent) 30%, var(--accent) 70%, transparent)",
              boxShadow: "0 0 14px var(--accent)",
              animation: "aoi-scan 1.6s linear infinite",
            }}></div>
            <div style={{
              position: "absolute", right: 14, top: 12,
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(13, 20, 24, 0.82)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 6, padding: "6px 12px",
              color: "rgba(255,255,255,0.85)",
              fontFamily: "var(--font-mono)", fontSize: 12,
            }}>
              <span className="spinner"></span> 檢測中 {runPct}%
            </div>
          </div>
        )}
      </div>

      {/* status strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "5px 12px",
        background: "var(--viewer-bg-2)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "0 0 var(--r-lg) var(--r-lg)",
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "rgba(255,255,255,0.5)",
      }}>
        <span>{image ? `${Math.round(imgW / pxScale)} × ${Math.round(imgH / pxScale)} px` : "— × — px"}</span>
        <span>zoom {image ? Math.round(view.scale * 100) : 0}%</span>
        <span style={{ marginLeft: "auto" }}>
          {cursor ? `x ${Math.round(cursor.x / pxScale)}  y ${Math.round(cursor.y / pxScale)}` : "x —  y —"}
        </span>
      </div>
    </div>
  );
}
