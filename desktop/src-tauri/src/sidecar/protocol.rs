// NDJSON / JSON-RPC 2.0 line framing, message classification and response routing.
// Kept free of real process I/O so the routing logic is unit-testable with an
// in-memory reader.

use std::collections::HashMap;
use std::io::BufRead;
use std::sync::mpsc::Sender;

use serde::Serialize;
use serde_json::Value;

/// A parsed sidecar line. Responses carry an `id`; everything else with
/// `method == "event"` is an event notification re-emitted to the webview.
#[derive(Debug, Clone, PartialEq)]
pub enum Message {
    Response {
        id: u64,
        result: Option<Value>,
        error: Option<Value>,
    },
    Event {
        topic: String,
        payload: Value,
    },
    Other,
}

/// Error shape returned to the webview by `sidecar_call`.
#[derive(Debug, Clone, Serialize)]
pub struct CallError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl CallError {
    pub fn internal(message: impl Into<String>) -> Self {
        CallError {
            code: "INTERNAL".into(),
            message: message.into(),
            data: None,
        }
    }

    pub fn timeout() -> Self {
        CallError {
            code: "TIMEOUT".into(),
            message: "sidecar call timed out".into(),
            data: None,
        }
    }

    pub fn offline() -> Self {
        CallError {
            code: "SIDECAR_OFFLINE".into(),
            message: "sidecar 未連線".into(),
            data: None,
        }
    }

    /// Map a JSON-RPC `error` object into a `CallError`, preferring the stable
    /// code in `error.data.code` (e.g. `CUDA_UNAVAILABLE`) over the numeric RPC
    /// code.
    pub fn from_rpc_error(error: &Value) -> Self {
        let message = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("sidecar error")
            .to_string();
        let data = error.get("data").cloned();
        let stable_code = data
            .as_ref()
            .and_then(|d| d.get("code"))
            .and_then(|c| c.as_str())
            .map(str::to_string);
        let code = stable_code.unwrap_or_else(|| {
            error
                .get("code")
                .and_then(|c| c.as_str())
                .unwrap_or("INTERNAL")
                .to_string()
        });
        CallError {
            code,
            message,
            data,
        }
    }
}

/// Classify one NDJSON line. Returns `None` for blank/unparseable lines.
pub fn classify(line: &str) -> Option<Message> {
    let value: Value = serde_json::from_str(line).ok()?;
    let object = value.as_object()?;

    if let Some(id) = object.get("id").and_then(|i| i.as_u64()) {
        return Some(Message::Response {
            id,
            result: object.get("result").cloned(),
            error: object.get("error").cloned(),
        });
    }

    if object.get("method").and_then(|m| m.as_str()) == Some("event") {
        let params = object.get("params").cloned().unwrap_or(Value::Null);
        let topic = params
            .get("topic")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        let payload = params.get("payload").cloned().unwrap_or(Value::Null);
        return Some(Message::Event { topic, payload });
    }

    Some(Message::Other)
}

/// Resolve a pending call or return an event to re-emit. The caller re-emits
/// the returned `(topic, payload)` *after* releasing any lock on shared state.
pub fn route_message(
    message: Message,
    pending: &mut HashMap<u64, Sender<Result<Value, CallError>>>,
) -> Option<(String, Value)> {
    match message {
        Message::Response { id, result, error } => {
            if let Some(tx) = pending.remove(&id) {
                let outcome = match (result, error) {
                    (Some(result), _) => Ok(result),
                    (_, Some(error)) => Err(CallError::from_rpc_error(&error)),
                    (None, None) => Err(CallError::internal("empty response")),
                };
                let _ = tx.send(outcome);
            }
            None
        }
        Message::Event { topic, payload } => Some((topic, payload)),
        Message::Other => None,
    }
}

/// Read NDJSON lines from `reader` until EOF, routing each to `pending` and
/// passing events to `emit`. This is the reader-thread body, exercised in tests
/// with an in-memory `Cursor` (the production thread routes line-by-line under a
/// short lock instead of holding it for the whole read loop).
#[allow(dead_code)]
pub fn process_reader<R: BufRead, F: FnMut(&str, Value)>(
    reader: &mut R,
    pending: &mut HashMap<u64, Sender<Result<Value, CallError>>>,
    emit: &mut F,
) -> std::io::Result<()> {
    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(message) = classify(trimmed) {
            if let Some((topic, payload)) = route_message(message, pending) {
                emit(&topic, payload);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::sync::mpsc;

    #[test]
    fn classifies_response_with_id() {
        let m = classify(r#"{"jsonrpc":"2.0","id":7,"result":{"ok":true}}"#).unwrap();
        match m {
            Message::Response { id, result, error } => {
                assert_eq!(id, 7);
                assert_eq!(result, Some(serde_json::json!({"ok": true})));
                assert!(error.is_none());
            }
            other => panic!("expected response, got {:?}", other),
        }
    }

    #[test]
    fn classifies_event_notification() {
        let m = classify(
            r#"{"jsonrpc":"2.0","method":"event","params":{"topic":"job://progress","payload":{"pct":50}}}"#,
        )
        .unwrap();
        match m {
            Message::Event { topic, payload } => {
                assert_eq!(topic, "job://progress");
                assert_eq!(payload["pct"], 50);
            }
            other => panic!("expected event, got {:?}", other),
        }
    }

    #[test]
    fn classifies_unknown_notification_as_other() {
        let m = classify(r#"{"jsonrpc":"2.0","method":"hello","params":{}}"#).unwrap();
        assert_eq!(m, Message::Other);
    }

    #[test]
    fn error_mapping_prefers_stable_code() {
        let err = serde_json::json!({
            "code": -32000,
            "message": "CUDA unavailable",
            "data": { "code": "CUDA_UNAVAILABLE" }
        });
        let mapped = CallError::from_rpc_error(&err);
        assert_eq!(mapped.code, "CUDA_UNAVAILABLE");
        assert_eq!(mapped.message, "CUDA unavailable");
    }

    #[test]
    fn error_mapping_falls_back_to_rpc_code() {
        let err = serde_json::json!({ "code": "METHOD_NOT_FOUND", "message": "unknown" });
        let mapped = CallError::from_rpc_error(&err);
        assert_eq!(mapped.code, "METHOD_NOT_FOUND");
    }

    #[test]
    fn routing_resolves_pending_and_emits_events() {
        let mut pending = HashMap::new();
        let (tx, rx) = mpsc::channel();
        pending.insert(42, tx);

        let mut emitted: Vec<(String, Value)> = Vec::new();
        let mut emit = |topic: &str, payload: Value| {
            emitted.push((topic.to_string(), payload));
        };

        let input = concat!(
            r#"{"jsonrpc":"2.0","id":42,"result":{"job_id":"J-1"}}"#,
            "\n",
            r#"{"jsonrpc":"2.0","method":"event","params":{"topic":"job://progress","payload":{"pct":10}}}"#,
            "\n"
        );
        let mut reader = Cursor::new(input.as_bytes());
        process_reader(&mut reader, &mut pending, &mut emit).unwrap();

        assert!(pending.is_empty());
        let got = rx.recv().unwrap().unwrap();
        assert_eq!(got["job_id"], "J-1");
        assert_eq!(emitted.len(), 1);
        assert_eq!(emitted[0].0, "job://progress");
    }

    #[test]
    fn routing_reports_error_for_failed_call() {
        let mut pending = HashMap::new();
        let (tx, rx) = mpsc::channel();
        pending.insert(9, tx);

        let mut emit = |_: &str, _: Value| {};
        let input = r#"{"jsonrpc":"2.0","id":9,"error":{"code":"BUSY","message":"in progress","data":{"code":"BUSY"}}}"#;
        let mut reader = Cursor::new(input.as_bytes());
        process_reader(&mut reader, &mut pending, &mut emit).unwrap();

        let err = rx.recv().unwrap().unwrap_err();
        assert_eq!(err.code, "BUSY");
    }
}
