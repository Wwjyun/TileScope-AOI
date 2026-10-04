// VisionFlow AOI Desktop — Tauri 2 host library.
// Owns the Python sidecar process, exposes JSON-RPC commands to the React
// frontend, and re-emits sidecar events on the event bus.

mod sidecar;

use std::path::PathBuf;
use std::sync::Arc;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use sidecar::{cache_dir, log_dir, CallError, Sidecar};

/// Forward a JSON-RPC call to the sidecar (60 s timeout).
#[tauri::command]
async fn sidecar_call(
    state: State<'_, Arc<Sidecar>>,
    method: String,
    params: Option<Value>,
) -> Result<Value, CallError> {
    let params = params.unwrap_or_else(|| json!({}));
    let sidecar = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || sidecar.call(&method, params))
        .await
        .map_err(|e| CallError::internal(e.to_string()))?
}

/// Report the sidecar process state / launch info.
#[tauri::command]
fn sidecar_info(state: State<'_, Arc<Sidecar>>) -> Value {
    state.info()
}

/// Send `shutdown`, wait ≤5 s, kill, then respawn.
#[tauri::command]
async fn restart_sidecar(state: State<'_, Arc<Sidecar>>, app: AppHandle) -> Result<Value, String> {
    let sidecar = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || sidecar.restart(&app).map(|_| sidecar.info()))
        .await
        .map_err(|e| e.to_string())?
}

/// Open the host/sidecar log directory in the default file browser.
#[tauri::command]
fn open_log_dir(app: AppHandle) -> Result<Value, String> {
    let dir = log_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "dir": dir.to_string_lossy() }))
}

/// Add an existing absolute directory (recursive) to the asset-protocol scope so
/// the webview can load sidecar-written previews/overlays/NG tiles via `asset:`.
#[tauri::command]
fn allow_asset_dir(app: AppHandle, path: String) -> Result<Value, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("directory does not exist: {}", path));
    }
    let abs = std::fs::canonicalize(&p).map_err(|e| e.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(&abs, true)
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "path": abs.to_string_lossy() }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let sidecar = Arc::new(Sidecar::new());
            if let Err(e) = sidecar.spawn(app.handle()) {
                sidecar::log_host(&format!("sidecar spawn failed: {}", e));
            }
            app.manage(sidecar);

            // Pre-allow the sidecar-written cache directory.
            let cache = cache_dir();
            let _ = std::fs::create_dir_all(&cache);
            let _ = app.asset_protocol_scope().allow_directory(&cache, true);
            sidecar::log_host("VisionFlow AOI Desktop started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar_call,
            sidecar_info,
            restart_sidecar,
            open_log_dir,
            allow_asset_dir
        ])
        .build(tauri::generate_context!())
        .expect("error while building VisionFlow AOI Desktop")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                if let Some(sidecar) = app_handle.try_state::<Arc<Sidecar>>() {
                    sidecar.shutdown_on_exit();
                }
            }
            _ => {}
        });
}
