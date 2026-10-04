// API facade: routes to the Tauri native bindings when running inside Tauri,
// otherwise to the simulated backend so the UI is reviewable in a plain browser.
import * as native from "./native.js";
import * as mock from "./mock.js";

export const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

const impl = isTauri ? native : mock;

export const call = impl.call;
export const on = impl.on;
export const fileUrl = impl.fileUrl;
export const pickFile = impl.pickFile;
export const pickFolder = impl.pickFolder;
export const saveFile = impl.saveFile;
export const info = impl.info;
export const restart = impl.restart;
export const openLogDir = impl.openLogDir;
export const allowDir = impl.allowDir;
export const openFileOrDir = impl.openFileOrDir;

export const winMinimize = impl.winMinimize;
export const winToggleMaximize = impl.winToggleMaximize;
export const winClose = impl.winClose;
export const forceClose = impl.forceClose;
export const onCloseRequested = impl.onCloseRequested;

// Normalize a sidecar error (thrown object or Error) into { code, message }.
export function errInfo(err) {
  const code = (err && (err.code || err.data?.code)) || "INTERNAL";
  const message = (err && (err.message || err.data?.message)) || String(err);
  return { code, message };
}
