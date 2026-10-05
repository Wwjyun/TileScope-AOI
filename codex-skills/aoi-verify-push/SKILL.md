---
name: aoi-verify-push
description: Work on the local AOI_CVbased repository and finish changes through its canonical Todo, validation, intentional staging, commit, and push workflow. Use for general project edits, continuing Todo.md, changing the pipeline/GUI/recipes/tests/docs, synchronizing GitHub, or any AOI task that should leave origin/main updated.
---

# AOI Verify and Push

Use this as the common repository finish workflow. Narrower AOI skills provide detector, CUDA, desktop, or release-specific steps; this skill owns the Todo update, change-scoped validation, intentional staging, commit, and push for any change.

## Workflow

1. Start from the repository root (the directory containing `AGENT.md` and `Todo.md`); do not assume a fixed drive or user profile path.
2. Run `git status --short --branch` and preserve unrelated/user-owned changes.
3. Read `AGENT.md`, then read the relevant sections of the sole canonical `Todo.md`.
4. Implement within the module boundaries defined by `AGENT.md`.
5. Update tests and mark only genuinely completed Todo items; append a dated `完成紀錄` entry newest-first.
6. Run the change-scoped validation matrix below (plus any narrower skill's required validation).
7. Stage only explicit task files. Never use `git add .` in a dirty workspace.
8. Inspect the staged diff, commit a concise outcome, and push `main` to `origin/main` unless the user explicitly opts out.
9. Confirm branch synchronization and report validations, commit hash, push result, hardware checks not run, and relevant untracked artifacts.

## Change-scoped validation matrix

Match validation to the changed surface instead of running everything unconditionally:

| Change surface | Required validation |
| --- | --- |
| Python core / detectors (`core/`, `detectors/`, `devices/`, `tools/`, `recipes/`, `gpu/` Python, tests) | Full unittest; `compileall` over the Python surface; pipeline/reporter changes add a CLI smoke with a synthetic image writing only to `outputs_validation/` |
| Sidecar (`aoi_sidecar/`) | `python -m aoi_sidecar --smoke-test`; full unittest; the smoke already proves no Qt module loads |
| Rust host (`desktop/src-tauri/`) | `cargo test` and `cargo clippy` from `desktop\src-tauri` |
| Frontend (`desktop/src/`) | `npm run build` in `desktop/` — from an ASCII staging dir when the repo path is non-ASCII |
| Packaging / specs (`packaging/`, `desktop/src-tauri/tauri.conf.json`) | The matching build script's frozen `--smoke-test` when the machine can build a package |
| Classic GUI (`gui/`, `gui_launcher.py`) | Offscreen `MainWindow` smoke (load `recipes/DEMO.yaml`, assert the window title and detector list) |
| CUDA source/ABI (`gpu/*.cu`, `gpu/include/`, ctypes) | Static checks only on a machine without `nvcc`; leave RTX 3090 items unchecked |

The Python commands below run through the project virtual environment (`.\env\Scripts\python.exe`):

```powershell
.\env\Scripts\python.exe -m unittest discover -s tests -v
.\env\Scripts\python.exe -m compileall main.py gui_launcher.py tools contour_preprocess_tool core detectors devices gui gpu aoi_sidecar
.\env\Scripts\python.exe -m aoi_sidecar --smoke-test
.\env\Scripts\python.exe gpu\preflight_cuda_build.py
```

Always finish with `git diff --check`. Summarize long unittest output with `Select-String -Pattern '^(Ran|OK|FAILED|ERROR:|FAIL:)'`; validators print many PASS lines.

Do not commit release ZIPs, logs, validation output, generated reports, native build products, or unrelated files.
