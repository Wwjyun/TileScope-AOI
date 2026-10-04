// Sidecar process lifecycle: launch resolution, stdio JSON-RPC, reader thread,
// pending-call routing, events re-emitted to the webview, and shutdown.

mod protocol;

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

pub use protocol::CallError;
use protocol::{classify, route_message, Message};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Sidecar {
    inner: Arc<Mutex<Inner>>,
}

/// Monotonic spawn-generation counter. Each sidecar child gets a new generation;
/// a reader thread only mutates shared state or emits events while its captured
/// generation is still current, so a stale reader from a replaced child cannot
/// clobber the new child's state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Generation(u64);

impl Generation {
    fn new() -> Self {
        Generation(0)
    }

    /// Bump the counter (a new child is starting, or the current one is being
    /// invalidated) and return the generation the new reader must carry.
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(1);
        self.0
    }

    fn is_current(&self, gen: u64) -> bool {
        gen == self.0
    }
}

struct Inner {
    child: Option<Child>,
    pending: HashMap<u64, Sender<Result<Value, CallError>>>,
    next_id: u64,
    generation: Generation,
    launch: String,
    command: String,
    pid: Option<u32>,
    state: String,
    /// Set once the app is exiting so the second `shutdown_on_exit` call (both
    /// `RunEvent::ExitRequested` and `RunEvent::Exit` invoke it) is a no-op.
    shutdown_started: bool,
    /// Last `runtime://status` payload (kept per the host contract; re-emitted
    /// to the webview on arrival so this is only a local cache).
    #[allow(dead_code)]
    last_runtime_status: Option<Value>,
}

impl Default for Inner {
    fn default() -> Self {
        Inner {
            child: None,
            pending: HashMap::new(),
            next_id: 1,
            generation: Generation::new(),
            launch: "python".into(),
            command: String::new(),
            pid: None,
            state: "offline".into(),
            shutdown_started: false,
            last_runtime_status: None,
        }
    }
}

impl Sidecar {
    pub fn new() -> Self {
        Sidecar {
            inner: Arc::new(Mutex::new(Inner::default())),
        }
    }

    /// Resolve and spawn the sidecar child process, then start the reader thread.
    pub fn spawn(&self, app: &AppHandle) -> Result<(), String> {
        let log_dir = log_dir();
        std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
        let stderr = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_dir.join("sidecar.log"))
            .map_err(|e| e.to_string())?;

        let (program, args, launch, cwd) = resolve_command(app);
        let mut cmd = Command::new(&program);
        cmd.args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(stderr));
        if let Some(cwd) = cwd {
            cmd.current_dir(cwd);
        }
        hide_window(&mut cmd);

        let mut child = cmd.spawn().map_err(|e| {
            format!(
                "failed to launch sidecar `{} {}`: {}",
                program,
                args.join(" "),
                e
            )
        })?;

        let stdout = child.stdout.take().ok_or("failed to pipe sidecar stdout")?;
        let pid = child.id();

        let gen = {
            let mut inner = self.inner.lock().unwrap();
            inner.child = Some(child);
            inner.pid = Some(pid);
            inner.launch = launch.clone();
            inner.command = format!("{} {}", program, args.join(" "));
            inner.state = "starting".into();
            inner.generation.next()
        };

        log_host(&format!(
            "sidecar started: {} {} (pid {:?}, launch={})",
            program,
            args.join(" "),
            pid,
            launch
        ));

        // Reader thread: responses resolve pending calls, events are re-emitted.
        let inner = Arc::clone(&self.inner);
        let app = app.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            let mut first_frame = false;
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        let trimmed = line.trim().to_string();
                        if trimmed.is_empty() {
                            continue;
                        }
                        let event = {
                            let mut guard = inner.lock().unwrap();
                            if !guard.generation.is_current(gen) {
                                drop(guard);
                                log_host("stale sidecar reader thread ending (generation changed)");
                                return;
                            }
                            let message = classify(&trimmed);
                            if !first_frame
                                && matches!(
                                    &message,
                                    Some(Message::Response { .. }) | Some(Message::Event { .. })
                                )
                            {
                                // First valid frame: the sidecar is talking to us.
                                guard.state = "ready".into();
                                first_frame = true;
                            }
                            match message {
                                Some(Message::Event { topic, payload }) if topic == "runtime://status" => {
                                    guard.last_runtime_status = Some(payload.clone());
                                    Some((topic, payload))
                                }
                                Some(msg) => route_message(msg, &mut guard.pending),
                                None => None,
                            }
                        };
                        if let Some((topic, payload)) = event {
                            let _ = app.emit(&topic, payload);
                        }
                    }
                    Err(_) => break,
                }
            }

            // The child is gone: fail outstanding calls and mark offline, but only
            // if this reader still owns the current generation (a restart may have
            // already replaced the child).
            let mut guard = inner.lock().unwrap();
            if !guard.generation.is_current(gen) {
                drop(guard);
                log_host("stale sidecar reader thread ended (generation changed)");
                return;
            }
            guard.child = None;
            guard.state = "offline".into();
            let leftover: Vec<_> = guard.pending.drain().map(|(_, tx)| tx).collect();
            drop(guard);

            for tx in leftover {
                let _ = tx.send(Err(CallError::offline()));
            }

            log_host("sidecar reader thread ended (child exited)");
            let _ = app.emit(
                "runtime://status",
                json!({ "sidecar": "offline", "reason": "child exited" }),
            );
        });

        Ok(())
    }

    /// Perform a JSON-RPC call with a 60 s timeout.
    pub fn call(&self, method: &str, params: Value) -> Result<Value, CallError> {
        let id = {
            let mut inner = self.inner.lock().unwrap();
            if inner.child.is_none() {
                return Err(CallError::offline());
            }
            let id = inner.next_id;
            inner.next_id = inner.next_id.wrapping_add(1);
            id
        };
        let (tx, rx) = channel();
        self.inner.lock().unwrap().pending.insert(id, tx);

        let request = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        let mut line = serde_json::to_string(&request)
            .map_err(|e| CallError::internal(e.to_string()))?;
        line.push('\n');

        let written = {
            let mut inner = self.inner.lock().unwrap();
            match inner.child.as_mut().and_then(|c| c.stdin.as_mut()) {
                Some(stdin) => stdin.write_all(line.as_bytes()).is_ok() && stdin.flush().is_ok(),
                None => false,
            }
        };
        if !written {
            // Writing failed (child gone / stdin closed): fail fast instead of
            // waiting the full 60 s timeout for a response that will never come.
            self.inner.lock().unwrap().pending.remove(&id);
            return Err(CallError::offline());
        }

        match rx.recv_timeout(Duration::from_secs(60)) {
            Ok(result) => result,
            Err(_) => {
                self.inner.lock().unwrap().pending.remove(&id);
                Err(CallError::timeout())
            }
        }
    }

    /// Send `shutdown` without waiting for a response.
    fn send_shutdown(&self) {
        let id = {
            let mut inner = self.inner.lock().unwrap();
            let id = inner.next_id;
            inner.next_id = inner.next_id.wrapping_add(1);
            id
        };
        let request = json!({ "jsonrpc": "2.0", "id": id, "method": "shutdown", "params": {} });
        if let Ok(mut line) = serde_json::to_string(&request) {
            line.push('\n');
            let mut inner = self.inner.lock().unwrap();
            if let Some(child) = inner.child.as_mut() {
                if let Some(stdin) = child.stdin.as_mut() {
                    let _ = stdin.write_all(line.as_bytes());
                    let _ = stdin.flush();
                }
            }
        }
    }

    /// Wait for the child to exit, killing it after `grace` seconds.
    fn terminate(&self, grace: Duration) {
        // Invalidate the current reader thread before tearing down: a replaced or
        // shutting-down child must not emit an `offline` event or clear a newer
        // child's state from a stale reader.
        {
            let mut inner = self.inner.lock().unwrap();
            inner.generation.next();
        }
        self.send_shutdown();
        let deadline = Instant::now() + grace;
        loop {
            let exited = {
                let mut inner = self.inner.lock().unwrap();
                match inner.child.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(_)) => {
                            inner.child = None;
                            true
                        }
                        _ => false,
                    },
                    None => true,
                }
            };
            if exited || Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        let mut inner = self.inner.lock().unwrap();
        if let Some(child) = inner.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        inner.child = None;
        inner.state = "offline".into();
        inner.pending.clear();
    }

    pub fn restart(&self, app: &AppHandle) -> Result<(), String> {
        self.terminate(Duration::from_secs(5));
        self.spawn(app)
    }

    pub fn shutdown_on_exit(&self) {
        // `RunEvent::ExitRequested` and `RunEvent::Exit` both invoke this; make it
        // idempotent so the second call (and the sidecar teardown) is a no-op.
        let already = {
            let mut inner = self.inner.lock().unwrap();
            if inner.shutdown_started {
                true
            } else {
                inner.shutdown_started = true;
                false
            }
        };
        if already {
            return;
        }
        self.terminate(Duration::from_secs(10));
    }

    pub fn info(&self) -> Value {
        let inner = self.inner.lock().unwrap();
        let state = if inner.child.is_none() {
            "offline"
        } else {
            &inner.state
        };
        json!({
            "state": state,
            "pid": inner.pid,
            "launch": inner.launch,
            "command": inner.command,
            "log_dir": log_dir().to_string_lossy(),
        })
    }
}

/// Resolve the sidecar launch command in priority order:
/// (1) `AOI_SIDECAR_EXE`, (2) packaged `<resource_dir>/sidecar/aoi-sidecar.exe`,
/// (3) dev `<repo>/env/Scripts/python.exe -m aoi_sidecar`.
fn resolve_command(app: &AppHandle) -> (String, Vec<String>, String, Option<PathBuf>) {
    if let Ok(exe) = std::env::var("AOI_SIDECAR_EXE") {
        if !exe.trim().is_empty() {
            return (exe, vec![], "exe".into(), None);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let exe = resource_dir.join("sidecar").join("aoi-sidecar.exe");
        if exe.exists() {
            return (exe.to_string_lossy().into_owned(), vec![], "exe".into(), None);
        }
    }

    let repo = std::env::var("AOI_REPO_ROOT")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(default_repo_root);
    let python = repo.join("env").join("Scripts").join("python.exe");
    (
        python.to_string_lossy().into_owned(),
        vec!["-m".into(), "aoi_sidecar".into()],
        "python".into(),
        Some(repo),
    )
}

fn default_repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn local_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(dir).join("VisionFlowAOI")
    } else if let Ok(dir) = std::env::var("APPDATA") {
        PathBuf::from(dir).join("VisionFlowAOI")
    } else {
        std::env::temp_dir().join("VisionFlowAOI")
    }
}

pub fn log_dir() -> PathBuf {
    local_data_dir().join("logs")
}

pub fn cache_dir() -> PathBuf {
    local_data_dir().join("cache")
}

pub fn log_host(message: &str) {
    let dir = log_dir();
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("desktop.log"))
    {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[{}] {}", secs, message);
    }
}

#[cfg(windows)]
fn hide_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_cmd: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_invalidates_stale_readers() {
        let mut gen = Generation::new();
        let first = gen.next();
        assert!(gen.is_current(first));

        // A restart / teardown bumps the counter again: the first reader is stale.
        let second = gen.next();
        assert!(gen.is_current(second));
        assert!(!gen.is_current(first));
    }

    #[test]
    fn generation_wraps_without_panic() {
        let mut gen = Generation(u64::MAX);
        assert_eq!(gen.next(), 0);
        assert!(gen.is_current(0));
    }
}
