# TileScope AOI — Claude Code Instructions

`AGENT.md` is the authoritative contributor contract for this repository. Its rules were written for Codex and apply to Claude Code unchanged:

@AGENT.md

## Architecture in one paragraph

The primary GUI is the Tauri 2 desktop app in `desktop/` (Rust host `desktop/src-tauri/src/`, React frontend `desktop/src/`, product "TileScope AOI", identifier `com.tilescope.aoi`), which spawns the Qt-free Python sidecar `aoi_sidecar/` (`python -m aoi_sidecar`, stdio NDJSON JSON-RPC 2.0, protocol v1; `--smoke-test`). The legacy PySide6 GUI is "TileScope AOI Classic" (`gui/`, `gui_launcher.py`), kept during migration. `core/`, `detectors/`, `devices/`, `gpu/`, `tools/`, and `recipes/` are shared by both surfaces; the CUDA ABI keeps its `visionflow_cuda*` file names.

## Claude Code specifics

- Shell: Windows PowerShell 5.1 is the primary tool (`;` / `if ($?)` instead of `&&`). Always run Python through `.\env\Scripts\python.exe`.
- `Todo.md` is large; read the relevant section with offsets or Grep instead of the whole file. Append completion records at the top of `## 完成紀錄`, newest first, matching the existing dated style.
- Operator-facing text, Todo entries, and reports are Traditional Chinese; code identifiers and commit messages stay English.
- The working tree may contain untracked personal files (slides, diagrams, study notes, local build workspaces) that are not part of this project. Never stage, move, or delete untracked files you did not create; the local, unversioned artifacts list documents them. Never enumerate personal file names in committed text.
- Before running the full unittest suite, point `TEMP`/`TMP` at an ASCII path (for example `C:\Users\Public\aoi_test_tmp`): `cv2.imwrite` fails under a non-ASCII `TEMP`.
- The desktop frontend build (vite/rollup) segfaults on a non-ASCII path; `build_desktop.ps1` stages `desktop/` under an ASCII path automatically. Keep the same workaround in any manual frontend build.
- Quick summary check of unittest output: pipe through `Select-String -Pattern '^(Ran|OK|FAILED|ERROR:|FAIL:)'`; validators print many PASS lines.

## DeepSeek Harness (DSH)

DSH loads `AGENTS.md`/`CLAUDE.md` (and their `.local.md` overlays) but does not expand `@path` imports or discover other file names, so the DSH contract is reached through this pointer:

- Read `HERMES.md` — DSH environment mechanics, the skill catalog imported into `$DSH_HOME\skills`, and the subagent delegation rules (`aoi-coder`).

## Project skills

Project skills live in `.claude/skills/` and are Claude Code copies of the Git-tracked Codex sources in `codex-skills/`. When a skill changes, update both copies (Codex-specific `agents/openai.yaml` files are not copied).

| Skill | Use for |
| --- | --- |
| `aoi-verify-push` | Default finish for any code/doc change: Todo update, change-scoped validation, explicit staging, commit, push |
| `aoi-desktop-development` | Tauri desktop host, React frontend, sidecar protocol/method changes, the mock backend |
| `aoi-detector-development` | Detector add/modify/migrate, `PreprocessPlan` operators, CPU/CUDA routing tests |
| `aoi-cuda-validate` | CUDA source/ABI/DLL work and RTX 3090 evidence |
| `aoi-release` | Desktop installer packaging, version bump, tag, GitHub Release |
| `aoi-weekly-report` | Thursday–Wednesday weekly report (no application validation) |

`archify` (`.claude/skills/archify/`) is the exception to the mirroring rule above: it is vendored third-party tooling (MIT, `tt-a1i/archify`) used to render the `架構圖/` diagram set, and it has **no** `codex-skills/` counterpart. Do not mirror or reformat it; update it by re-vendoring upstream. Render through `node .claude/skills/archify/bin/archify.mjs`, pass `--repo-root .` whenever a spec declares `sources` evidence, and finish with `validate` → `deliver` → `visual-check` at `--quality showcase`. Diagram outputs stay untracked under `架構圖/` per the unversioned artifacts list.

Deliberate trim of the vendored copy (2026-09-19): `examples/*.html` (5 rendered showcases, 3.95 MB) and `test/` (132 fixtures, 1.74 MB) are **not** vendored. They are regenerable artifacts — `node scripts/render-examples.mjs` rebuilds the showcases — and together they were 64% of tracked bytes, which made GitHub report this repository as an HTML project instead of Python. The 14 `examples/*.json` authoring specs, `bin/`, `scripts/`, `renderers/`, `schemas/`, `assets/` and `references/` are all kept, so the `SKILL.md` authoring loop (`validate` → `deliver` → `visual-check`) and `archify.mjs demo`/`doctor` work unchanged. The `test` npm script inside the skill no longer runs; do not re-add `test/` when re-vendoring upstream.

## Delegating implementation work

Claude Code is the supervisor; DeepSeek workers do the implementation-heavy editing. Route work through the `deepseek-worker-routing` skill: the supervisor owns requirement interpretation, architecture, task decomposition, final review, validation, and merge decisions; workers implement in isolated git worktrees.

- A worker brief must pin the absolute interpreter path (`<repo>\env\Scripts\python.exe`) and explicitly forbid creating, deleting, or "repairing" any virtualenv or the `env\` folder. Workers in a fresh worktree have no `env\` of their own and must not touch the shared one.
- The supervisor reviews every worker diff and reruns the validation itself before accepting; never report a worker's claims as verified.
- If a worker cannot start or reports a route mismatch, stop and say so — do not silently do the work with the expensive model.

The `aoi-coder` subagent (`.claude/agents/aoi-coder.md`) is a lighter in-process path for well-scoped edits: the main session keeps planning, `Todo.md` interpretation, cross-module design, final review, full validation, `Todo.md`/`完成紀錄` updates, commit, and push. Parallel subagents must not edit the same files; use `isolation: "worktree"` when scopes could overlap.

The `llm-delegate` MCP (`.mcp.json` → `.claude/mcp/llm_delegate_server.py`) sends a coding brief plus explicitly listed files to an OpenAI-compatible API (DeepSeek by default; GLM and Qwen via OpenRouter). Configuration is environment-only (`DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, optional `*_MODEL`/`*_BASE_URL`/`LLM_DELEGATE_PROVIDER`); never print, commit, or pass key values as arguments. Every listed file leaves the machine, so send only what the task needs. Review the returned diff before `apply_proposal`, then run the tests yourself.
