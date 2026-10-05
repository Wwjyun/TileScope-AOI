---
name: aoi-desktop-development
description: "Develop the TileScope AOI desktop app: the Tauri 2 host (desktop/src-tauri), the React frontend (desktop/src), and the Qt-free Python sidecar (aoi_sidecar) with its stdio JSON-RPC protocol. Use for sidecar protocol/method changes, Rust host lifecycle work, frontend screens, the mock backend, or desktop packaging and verification."
---

# AOI Desktop Development

Develop the Tauri 2 desktop app and its Qt-free Python sidecar without breaking the protocol, the UI contracts, or the CPU/GPU architecture shared with the Classic GUI.

## When to use

- **Sidecar protocol** — `aoi_sidecar/` (service, protocol framing, jobs, recipes, previews, settings): adding or changing JSON-RPC methods, event topics, error codes, or job semantics.
- **Desktop host** — `desktop/src-tauri/src/` (Rust): sidecar lifecycle, command handlers, event re-emission, asset-protocol scope.
- **Frontend screens** — `desktop/src/` (React): screens, the API facade, and the mock backend.

The sidecar is `python -m aoi_sidecar` (stdio NDJSON JSON-RPC 2.0, protocol v1; `--smoke-test` runs an in-process self-test). The Rust host spawns it, resolves it from `AOI_SIDECAR_EXE` → packaged `sidecar/aoi-sidecar.exe` → `env\Scripts\python.exe -m aoi_sidecar`, and re-emits its events to the webview.

## Protocol change rules

- Change the sidecar (`aoi_sidecar/protocol.py` + `service.py`), the Rust host (`desktop/src-tauri/src/sidecar/` + `lib.rs`), the frontend (`desktop/src/api/native.js` + the affected screens), and the mock (`desktop/src/api/mock.js`) **together**. The mock mirrors the real protocol surface so every screen renders identically in a plain browser.
- Keep the stable error codes stable: `INVALID_PARAMS`, `METHOD_NOT_FOUND`, `BUSY`, `NOT_FOUND`, `PERMISSION_DENIED`, `RECIPE_INVALID`, `CUDA_UNAVAILABLE`, `CAMERA_NOT_AVAILABLE`, `INTERNAL`. Do not rename or renumber them; the host maps `error.data.code` (stable) in preference to the numeric JSON-RPC code.
- stdout is protocol-only. The sidecar captures the real stdout file descriptor and repoints `sys.stdout` at stderr so a stray `print` can never corrupt a frame; logging and prints go to stderr. Never print to stdout from a handler.
- No pixels in JSON. Images move as file paths (temp files written by the sidecar), and the host grants the webview access through `allow_asset_dir` / the `asset:` protocol. Never embed raw image bytes in a response.
- One job at a time. `JobRunner` refuses a second job with `BUSY`; cancellation is cooperative. `job://cancelled` is emitted only after the worker thread has finished (resource release ordering the host relies on) — never before the thread returns.

## UI contracts

- **Mode mirrors the sidecar**: the frontend never stores its own authority. It calls `switch_mode` and reads the current mode from `runtime_status`/`switch_mode` results; OP is the default.
- **Backend label only from results**: the "Backend" pill and any CPU/CUDA claim come from the job result's `backend`/`backend_reason` (computed by the core from what actually ran), never from a recipe's `gpu.mode` request.
- **Inner params never sent to op/eng**: parameter visibility is governed by `ParameterSpec.parameter_group` (`outer` vs `inner`), which is authoritative. The sidecar strips inner/unknown values from `load_recipe` and `detector_catalog` in non-admin mode and preserves them on save; the frontend must not infer visibility from a parameter name.
- **Traditional Chinese** for operator-facing text (established abbreviations PASS, NG, ERROR, CPU, CUDA, ROI, DLL stay English).
- **Inline notices** for recoverable feedback; reserve modal dialogs for blocked/destructive actions. Status must remain understandable without color alone.

## Build and verify

1. Sidecar: `.\env\Scripts\python.exe -m aoi_sidecar --smoke-test`, plus the full unittest suite.
2. Rust host: `cargo test` and `cargo clippy` from `desktop\src-tauri`.
3. Frontend: `npm run build` in `desktop/`. When the repository path is non-ASCII, stage `desktop/` under an ASCII path first — vite/rollup segfaults on a non-ASCII path, and subst/junction workarounds do not help because vite resolves the real path.
4. Real-app check: launch the built app with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`, connect via CDP, and verify OP default mode, the backend pill reflecting an actual result (a CPU job end to end), and no orphan sidecar process after the window closes.
5. Packaging changes go through `packaging\scripts\build_desktop.ps1` and its frozen `aoi-sidecar.exe --smoke-test`.

## Pitfalls seen

- **Permission mode vs GPU policy confusion**: the UI mode (`op`/`eng`/`admin`) is an authorization level; `gpu.mode` (`cpu`/`auto`/`cuda`) is backend selection. They are independent — do not let a UI-mode change imply a backend, and vice versa.
- **Sync commands blocking the main thread**: Tauri commands that talk to the sidecar must be `async` and run the blocking call through `spawn_blocking` (see `sidecar_call`); a synchronous sidecar round-trip on the main thread freezes the window.
- **Restart generation race**: a replaced sidecar child keeps a stale reader thread. The host's monotonic `Generation` counter ensures a stale reader cannot clobber the new child's state or emit a bogus `offline` event; preserve that guard when touching lifecycle code.
