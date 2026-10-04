// Tauri 2 native bindings: invoke / listen / convertFileSrc / dialog / opener.
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

export async function call(method, params = {}) {
  return invoke("sidecar_call", { method, params });
}

export async function on(topic, handler) {
  return listen(topic, (event) => handler(event.payload));
}

export function fileUrl(path) {
  return convertFileSrc(path);
}

export async function pickFile(options = {}) {
  const filters = options.filters || [];
  const result = await open({ multiple: false, directory: false, filters });
  return typeof result === "string" ? result : null;
}

export async function pickFolder() {
  const result = await open({ multiple: false, directory: true });
  return typeof result === "string" ? result : null;
}

export async function saveFile(options = {}) {
  const result = await save(options);
  return typeof result === "string" ? result : null;
}

export async function info() {
  return invoke("sidecar_info");
}

export async function restart() {
  return invoke("restart_sidecar");
}

export async function openLogDir() {
  return invoke("open_log_dir");
}

export async function allowDir(path) {
  return invoke("allow_asset_dir", { path });
}

export async function openFileOrDir(path) {
  // opener plugin: open a file with its default app, or reveal a directory.
  return openPath(path);
}

export function winMinimize() {
  return getCurrentWindow().minimize();
}

export function winToggleMaximize() {
  return getCurrentWindow().toggleMaximize();
}

export function winClose() {
  return getCurrentWindow().close();
}

export function forceClose() {
  return getCurrentWindow().destroy();
}

export function onCloseRequested(handler) {
  return getCurrentWindow().onCloseRequested((event) => handler(event));
}
