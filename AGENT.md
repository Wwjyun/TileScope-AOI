# Repository Agent Instructions

These rules apply to every AI agent working in this repository (Codex, Claude Code, DeepSeek workers, subagents) and to human contributors.

## Project and environment

TileScope AOI is a synthetic demonstration of a recipe-driven OpenCV inspection system. The primary GUI is a Tauri 2 desktop app (`desktop/`: Rust host + React frontend) that drives a Qt-free Python sidecar (`aoi_sidecar/`); the PySide6 GUI is kept as **TileScope AOI Classic** during the migration. CUDA is an optional DLL backend.

## Source and distribution boundary


- All bundled recipes and detector defaults come from detectors/demo_defaults.py and synthetic images only.
- Public detector IDs and labels are demo1 through demo12; no production-ID aliases.
- Do not copy calibration, images, parameters, logs or legacy acquisition source from a company.
- Preserve source provenance honestly in docs/source-provenance.md. Renaming never establishes ownership.
- Private source snapshots may isolate history but are not cleared for redistribution.
- Do not rewrite remote history, delete remote tags or rename the repository without the corresponding user instruction.


Primary entry points:

- CLI: `python main.py --image <image> --recipe <recipe.yaml> --output <directory>`
- Desktop GUI (dev): `cd desktop; npm run tauri dev` (the host starts `env\Scripts\python.exe -m aoi_sidecar`; override with `AOI_REPO_ROOT` or `AOI_SIDECAR_EXE`)
- Sidecar: `python -m aoi_sidecar` (stdio protocol) and `python -m aoi_sidecar --smoke-test`
- Desktop installer: `packaging/scripts/build_desktop.ps1 -Version x.y.z` (frozen sidecar via `packaging/specs/aoi-sidecar.spec`, NSIS output `dist\desktop\TileScope-AOI-<version>-setup.exe`)
- Classic GUI: `python main.py --gui`
- Packaged GUI entry/smoke: `gui_launcher.py` and `TileScope AOI Classic.exe --smoke-test`
- Windows package build: `packaging/scripts/build_exe.ps1` using the tracked `packaging/specs/TileScope AOI Classic.spec`
- Traditional-CV tuning reference: `contour_preprocess_tool/` (run with `python -m contour_preprocess_tool`; build the independent EXE with `packaging/scripts/build_contour_preprocess_tool.ps1`)
- Standalone utilities: `tools/export_ng_tiles_by_area.py`, `tools/export_pattern_grid_tiles.py`, `tools/export_matrix_summary.py`, `tools/export_scatter_plots.py`, and `tools/export_tile_defect_distribution.py`
- Utility bundle build: `packaging/scripts/build_utility_tools.ps1`; individual utility builds use their dedicated `build_*_exporter.ps1` or `build_ng_tile_area_tool.ps1` entry point under `packaging/scripts/`
- CUDA build: `gpu/build_cuda_dll.ps1`
- CUDA validation: `gpu/validate_cuda_dll.py`
- CUDA source/ABI preflight: `gpu/preflight_cuda_build.py`

Use the workspace virtual environment for every Python command:

```powershell
.\env\Scripts\python.exe
```

The normal development machine may not have `nvcc`, CMake, or an NVIDIA GPU. Never claim that CUDA source compiled or passed runtime validation unless those commands actually ran. Record outstanding RTX 3090 validation in `Todo.md`.

## Canonical roadmap

- `Todo.md` is the only project task list. Read it before implementation work.
- Do not create separate CPU, GPU, CUDA, GUI, release, or feature Todo files.
- Mark only work that is genuinely complete. Hardware-dependent tasks remain unchecked until tested on the target machine.
- After a completed change, update the relevant checkbox and append a dated entry under `完成紀錄`.
- Keep CPU correctness, GPU optimization, deployment, and acceptance criteria in the same roadmap.

## Module ownership

- Top-level entry points: keep CLI orchestration in `main.py`, packaged startup/smoke in `gui_launcher.py`, and main packaging in `packaging/scripts/build_exe.ps1` and `packaging/specs/TileScope AOI Classic.spec`.
- `packaging/`: every PyInstaller build entry point and spec. Keep build scripts in `packaging/scripts/` and specs in `packaging/specs/`; do not add new root-level `build_*.ps1` or `*.spec` files. Specs derive the repository root from `SPECPATH` because PyInstaller resolves relative paths against the spec directory, and build scripts derive it from `$PSScriptRoot`'s grandparent. Keep these files ASCII-only: Windows PowerShell 5.1 reads BOM-less files as ANSI and a non-ASCII comment can swallow the line ending.
- `tools/`: standalone post-processing and tile-export utility sources; each tool keeps its dedicated spec/build entry point under `packaging/`.
- `core/`: pipeline, recipe loading/building, tiling, aggregation, reporting, profiling, batch/monitor processing, result schemas/compaction, GPU sessions/bridge, preprocessing plans and executors.
- `detectors/`: detector-specific feature extraction, geometry, filtering, and result metadata.
- `gpu/`: CUDA C ABI, kernels, persistent contexts, build scripts, native smoke tests, and CPU/GPU validation.
- `devices/`: optional acquisition hardware (CCD line-scan camera, LSI-8181 meter wheel, PCIe-1730 Sensor relay I/O, RS-232 light controller): backend-neutral interfaces, typed settings, simulators, vendor bindings, machine-level settings store, and frame writing. No Qt imports.
- `aoi_sidecar/`: Qt-free stdio JSON-RPC service for the desktop GUI — protocol framing, method dispatch, the single job runner, recipe load/save filtering by parameter group, previews, settings, device availability probes, and `--smoke-test`. It reuses `core/`, `detectors/` and `devices/`; it never duplicates pipeline or fallback policy and never imports Qt.
- `desktop/`: Tauri 2 desktop app. `src-tauri/` owns sidecar lifecycle (launch resolution, reader thread, pending-call routing, restart generation, shutdown) and exposes only generic commands; `src/` owns screens, the `api/` layer and the browser-mode mock. No inspection logic in Rust or JavaScript.
- `gui/`: TileScope AOI Classic (PySide6) screens, widgets, workers, status, and preview behavior; `gui/ccd_controller.py` owns the long-lived CCD sessions until device control moves to the sidecar.
- `recipes/`: YAML synthetic demonstration configurations.
- `tests/`: automated correctness, fallback, routing, and regression tests.
- `.github/workflows/`: CI only; keep GPU runtime jobs isolated from ordinary hosted runners.
- `docs/`: durable project documentation; keep release notes in `docs/release-notes/`, technical and project reports in `docs/reports/`, and text files copied into release artifacts in `docs/packaging/`.
- `weekly_reports/`: Thursday-to-Wednesday progress reports; keep this directory separate because the weekly-report workflow depends on its stable path.
- `release_artifacts/`: local versioned release ZIPs; keep the directory index tracked but never commit the ZIP contents.
- `cuda_practice/`: independent learning/device-check programs; do not make production runtime depend on them.
- `design_handoff_aoi_gui/`: v2 design prototype and handoff spec only; production UI behavior belongs in `desktop/` (and `gui/` for Classic).

Put behavior in the narrowest appropriate module. Do not duplicate pipeline or fallback policy inside individual detectors.

## CPU/GPU architecture contract

- CPU-only operation is a fully supported product mode and the correctness reference.
- Preserve `gpu.mode` semantics: `cpu` never requests/loads CUDA, `auto` may fall back, and `cuda` requires CUDA success and forbids hidden CPU fallback.
- Missing GPU, missing/old DLL, unsupported operator, CUDA initialization failure, kernel error, or OOM must not break CPU execution when fallback is enabled.
- A failed GPU step must restart the entire detector on CPU. Never combine partial GPU intermediate results with a CPU continuation.
- Preserve recipe semantics, PASS/NG, coordinates, defect metadata, output formats, and ordering. Define and test any allowed numerical tolerance.
- Do not create one CUDA workflow or exported function per detector.
- Detectors declare backend-neutral immutable `PreprocessPlan` objects using shared typed operators.
- `CpuPreprocessExecutor` defines OpenCV fallback semantics. `CudaPreprocessExecutor` selects a generic native plan, compatibility adapter, reusable primitives, or explicit fallback.
- Add a shared operator when an algorithm is reusable. Detector-named native adapters are compatibility code, not the extension model.
- Do not silently substitute a faster operation with different semantics, such as nearest-neighbor for OpenCV `INTER_AREA`.
- GPU-mode pipeline boundary: image file reading and decoding (PNG/BMP/JPEG) stay on CPU, and the decoded image is uploaded to the device exactly once. After that upload, every inspection step before aggregation must run on the GPU without further pixel H2D: Template Anchor Grid localization, tile/ROI generation, preprocessing, candidate extraction (contours or connected components), geometry/shape filtering, statistics such as CNR, and PASS/NG defect decisions. Download only final defect results plus pixels explicitly needed for overlay, NG tiles, debug images, or GUI display.
- Aggregation, report generation (overlay rendering, CSV/JSON, PNG encoding), YAML, logging, GUI control, and disk I/O stay on CPU.
- Every GPU-mode step keeps its CPU implementation as the correctness reference and the whole-detector fallback. A GPU implementation replaces a CPU step only after tests prove identical PASS/NG, defect count, bbox, area, confidence, metadata, and OpenCV contour/label ordering (or a documented, tested tolerance).
- Steps that do not yet have a verified GPU implementation remain CPU work tracked in the `Todo.md` full-GPU section. Report the actual device/host split from runtime metadata; never describe the flow as fully GPU before it is.
- Reuse context buffers across operators, tiles, and images where lifetime permits.
- Preserve context-owned resident image/device ROI lifetime and generation checks. Batch and monitor share one `GpuExecutionSession`; do not create one runtime per image or per worker.
- Tile-level CPU parallelism is opt-in. Use thread-local detector instances, preserve input ordering, and keep GPU detector or resident-image execution on the single serialized GPU path.
- Recipe caching must invalidate on file metadata changes and return independent deep copies; never expose a mutable cached recipe.
- Debug intermediate images are opt-in runtime payloads. Strip them from JSON and public tile results, and never enable them in production defaults.
- GPU default enablement requires RTX 3090 equivalence, stability, and end-to-end performance evidence.

## Compatibility and OOP rules

- Preserve the public ABI v1 primitive API unless an explicit versioned migration is planned.
- Add native capabilities through optional export probing so old DLLs retain legacy GPU or CPU fallback paths.
- Device pointers belong to native context objects; do not expose ownerless raw device pointers to Python.
- Keep runtime lifecycle explicit with `close()`/context manager behavior and safe cleanup.
- Keep shared runtime calls thread-safe. A single bounded GPU queue is preferred over competing workers.
- Avoid module globals that hold mutable detector, recipe, image, or GPU state.
- Inject runtime/backend dependencies where tests need CPU, fake DLL, legacy DLL, or failing GPU behavior.

## Desktop and sidecar contract

- Protocol v1: UTF-8 NDJSON JSON-RPC 2.0 over the sidecar's stdin/stdout. stdout carries protocol frames only (stray prints go to stderr); errors carry a stable `data.code`; events are `event` notifications with a `topic`. A protocol change updates the sidecar, the Rust host, the frontend `api/` layer, the mock and their tests in the same change.
- Never send pixels through JSON. The sidecar writes previews, overlays and thumbnails to files; the host allows only those directories in the asset-protocol scope and the frontend loads them with `convertFileSrc`.
- One job at a time on the single serialized GPU path; a second start returns `BUSY`. Cancellation is cooperative and `job://cancelled` is emitted only after the worker thread has finished and released resources. Monitor failures emit `job://failed` before `monitor://stopped`.
- Permission mode lives in the sidecar. The frontend mirrors it (default `op`), changes it only after a successful `switch_mode`, and resets after a sidecar restart. Inner and unclassified parameter values are never sent to `op`/`eng`, and engineer saves restore hidden inner values and the `camera` section from the base recipe. Frontend hiding is UX only.
- The backend label comes only from job results or `job://failed` codes, never from the recipe request or the permission mode. Show a neutral "not run yet" state until a result exists.
- Host commands that wait on the sidecar are async and never block the main thread. A restarted sidecar must not be clobbered by the previous child's reader. Closing the app leaves no orphan sidecar process.
- The desktop GUI must start and remain usable without the CUDA DLL, vendor SDKs or hardware; device availability and reasons come from `runtime_status`. Desktop device control and camera-direct monitoring are a later phase; until then Classic owns them.

## GUI interaction contract

These rules apply to the desktop GUI and Classic; Qt-specific mechanics apply to Classic only.

- Preserve the existing visual language and status hierarchy: TopBar owns global progress and actual backend, operation panels own step detail, and the status bar contains only short events.
- Backend labels must come from runtime result metadata. Never infer CUDA active from a recipe request; expose CPU fallback reasons in text or a tooltip.
- Use inline notices for recoverable feedback. Reserve modal dialogs for blocked operations, destructive choices, unsaved-change confirmation, and close prevention while background work is active.
- Recipe Designer changes must participate in dirty tracking and shared `RecipeManager` validation. Loading programmatic values must not create false dirty state.
- Persist user working context through `GuiPreferences`/`QSettings`; ignore stale paths safely and keep tests isolated with injected temporary settings.
- Batch and monitor histories use Qt model/view and bounded incremental updates. Keep status filtering proxy-based and sample oversized scatter data deterministically.
- Replace large viewer overlay sets as one bounded update: suspend per-item viewport updates, invalidate the scene, and request a repaint after the batch. Preserve explicit repaint behavior when overlays are toggled or the viewer is resized; Windows must not retain stale strips or distorted content.
- Keep hidden Results content lazy. Defer table/output population until the screen is opened and create large thumbnail collections in bounded event-loop batches so inspection completion remains responsive.
- New operator-facing text is Traditional Chinese except established industrial abbreviations such as PASS, NG, ERROR, CPU, CUDA, ROI and DLL. Status must remain understandable without color alone and keyboard paths require tests.

## CCD camera and meter wheel contract

- Camera and meter wheel support is an optional capability like the CUDA DLL. Missing Sapera LT, pythonnet, `LSI8181_64.dll`, DAQNavi (`Automation.BDaq4.dll`), drivers, or hardware must never block GUI, CLI, batch, or monitor startup; the CCD screen shows the reason.
- The original author of the external acquisition reference has permitted the user to use it in this project (recorded 2026-10-04 in docs/source-provenance.md). Keep the reference attribution in comments and keep the private C# source out of this checkout.
- Camera settings are written to hardware only on connect. An operator apply from the CCD screen while connected reconnects automatically and resumes preview; while a frame is capturing or camera monitoring runs it only marks a pending reconnect, and Recipe loads never reconnect. Starting camera-direct monitoring is an operator action: when the camera is disconnected or the loaded Recipe's camera section differs from what was written, Start connects or reconnects with the Recipe's settings (and connects the meter wheel for Software Trigger) before arming acquisition.
- Meter-wheel CMP_OUT width and polarity are machine-level settings written on connect and must be supplied by the authorized equipment operator; a zero width can never produce line triggers, so Software Trigger captures refuse to start with it. During a Sensor-started capture the controller may re-arm the compare or switch the reverse direction to finish the frame, and must report what it changed.
- Keep equipment files, images and logs private. Every device failure the operator can see carries a registered code from `devices/error_codes.py` (`[E-xxxx]`, listed in `docs/device-error-codes.md`; `tests/test_device_error_codes.py` keeps them in sync), and diagnostics end in a short line that can be typed back. `packaging/scripts/build_exe.ps1` ships `DEVICE_PARAMETER_GUIDE.md` and `ERROR_CODES.md` beside the EXE; keep the guide's field names identical to the CCD page.
- `MainWindow` owns one `CcdController`; screens never own or disconnect devices. A backend whose connect/disconnect blocks (`lifecycle_blocks`, e.g. Sapera) runs them on one background lifecycle thread started by the GUI thread; every other camera command is refused until it finishes. Driver callbacks only hand off frames; preview conversion, saving, and status refresh run elsewhere, and older preview frames may be dropped.
- Machine-level settings live in the CCD machine settings store, not in Recipes. Product-level camera parameters (exposure, gain, length, line rate, trigger options, auto-save rules) live in the optional Recipe `camera` section parsed by `devices/ccd_recipe.py` and validated strictly by `RecipeManager`.
- A Recipe without a `camera` section must never change camera settings. The Designer is the only writer of the section: CCD-screen applies become unsaved Designer edits, Engineer-mode saves preserve the section, and unedited values must not be rounded by display widgets.
- CCD controls are fail-closed through `AccessGate`: only controls explicitly registered for engineers are available in Engineer mode, OP cannot open the screen, and programmatic loads never write hardware or settings.
- Trigger automation (external-trigger meter-wheel writes, the software-trigger monitor, auto-save) follows the trigger settings actually written to the camera at connect, never unapplied edits. Driver and monitor threads only hand work to the GUI thread, which owns camera and meter-wheel commands; Stop ends monitoring but never aborts a frame that is still capturing.
- Camera-direct monitoring inspects only frames from trigger-mode connections, hands them off through the bounded `CameraFrameQueue`, and reports every frame that could not be queued as an ERROR item. `AOIPipeline.run_frame` must stay pixel-identical to inspecting the same frame saved as an 8-bit BMP, keep the file-path entry point and its result schema unchanged, and in GPU mode treat the frame as a decoded image uploaded once.
- Camera-monitor original saving is a persistent GUI preference, enabled by default, fixed for each run. Save the same read-only pixels on a single background writer to that run's `origin/`, including analysis ERROR/exception results; finish accepted writes before reporting/stopping. Preserve the `raw_image_path`/`raw_dir` schema fields. Keep at most one waiting overflow frame for ERROR evidence; if evidence capacity or disk writing fails, explicitly report `raw_image_error` and count it as a save failure. Recipe CCD snapshot auto-save remains independent when monitor original saving is disabled.
- On the camera machine the Sensor reaches the grabber only through a PCIe-1730 DI -> program -> DO path. The optional Sensor relay (`devices/sensor_relay.py`) is machine-level, off by default, and must never run alongside the machine's original I/O program. It follows the trigger written at connect: External Trigger One Frame pulses the DO from the relay thread itself; Software Trigger hands each DI edge to the GUI thread for one `Snap()`. The relay owns the card only while it runs and releases it when it stops.
- The RS-232 light controller is machine-level and brand-neutral: it sends the original program's on/off commands and per-channel brightness rendered from a template. When enabled, camera-direct monitoring switches it on at start and off at stop; otherwise it is switched by hand, and `CcdController.close()` switches it off. All serial exchanges run on one light thread.
- Do not mark CCD, meter wheel, Sensor relay, or light items hardware-validated until they run on the camera machine.

## Detector parameter access contract

- Every registered Detector parameter must be classified by the shared `ParameterSpec.parameter_group` contract as `outer` or `inner`. `parameter_group` is authoritative; the derived `engineer_visible` field exists only for compatibility and detector source must not set it directly.
- `outer` is intentionally narrow: only physical acceptance geometry that engineering personnel can tune without image-processing knowledge, such as area, width/height, radius/length, spacing/gap, dimensional tolerance, crop padding, and ROI or mask extents/insets.
- Everything else is `inner`, including enable/mode switches, coordinates or origin selection, threshold/max-value/inversion, blur, adaptive parameters, morphology, contour mode, scale, circularity/fill/white-pixel ratios, model/class selection, confidence, NMS, backend, and precision.
- `ParameterSpec` must remain fail-closed: an omitted or newly introduced classification defaults to admin-only `inner`. Never infer access from a parameter name in the GUI and never make an unknown parameter engineer-visible automatically.
- Recipe Designer exposes only `outer` parameters in Engineer mode and exposes both groups in Admin mode. OP does not gain Detector editing access. Mode changes and programmatic loads must not create false dirty state.
- Loading or saving a Recipe in Engineer mode must preserve every hidden `inner` value exactly. Parameter grouping is UI/access metadata only and must not rename Recipe fields, change defaults, alter Detector decisions, or reintroduce retired production Recipe aliases.
- Before adding or changing a Detector, audit the registry ID, `default_params`, `PARAM_SPEC`, every runtime parameter read, every behavior-affecting hard-coded constant or formula, tracked Recipes, and GUI metadata together. A tuning value must be represented in the shared schema and used by runtime, unless it is deliberately fixed as part of the Detector identity and documented as non-configurable; auditing only existing `self.params` reads is insufficient.
- Regression tests must enumerate the exact `outer` key set and required optical/algorithm `inner` keys for every registered Detector, assert `default_params` and `PARAM_SPEC` key equality, verify Engineer/Admin visibility for all registered Detectors, prove Admin edits are saved back to Recipe, and prove an Engineer-mode Recipe round trip preserves hidden `inner` values.

## Future detector development contract

- Every new traditional CV detector must express reusable image preprocessing as a cached immutable `PreprocessPlan`; detector code keeps only detector-specific parameters, decision rules, defect metadata, and deterministic ordering. Candidate extraction, geometry filtering, and statistics must be designed so the GPU-mode boundary above can keep them on the device through shared, backend-neutral operators rather than detector-specific CUDA workflows.
- Cache keys must cover the input shape/dtype and every detector parameter that changes preprocessing semantics. Use the bounded shared plan cache rather than mutable module globals or rebuilding plans for every tile.
- `CpuPreprocessExecutor` is the correctness reference. Optional CUDA execution must use shared typed operators, capability reporting, and full-detector CPU restart on unsupported semantics or failure.
- Do not add detector-specific CUDA workflows or exports for new detectors. When a reusable operation is missing, add a backend-neutral typed operator and its CPU reference first; temporary compatibility adapters require an explicit migration item in `Todo.md`.
- A new traditional CV detector is not complete without tests for direct OpenCV/CPU equivalence, plan cache reuse and invalidation, missing/legacy/failing backend routing, PASS/NG, defect count, bbox, area, confidence, metadata, and deterministic ordering as applicable.
- When detector behavior is defined by an external tuning or reference tool, preserve its exact operation order, border/channel semantics, masks, and parameter meaning. Add a direct pixel-level reference comparison that can distinguish the approved order from plausible but incorrect reorderings.
- Use `contour_preprocess_tool.engine.ContourProcessingEngine` and an exported `visionflow-traditional-cv-tuning/v1` JSON as the canonical reference for newly tuned traditional-CV detectors. The tool must process the original full-resolution pixels; OpenGL/raster view scaling is display-only. Before migrating a Detector, select the matching raw-contour or shape-filter mode and add mask pixel equivalence plus contour/bbox/area/PASS-NG contract tests.
- DL model inference, framework sessions, and TensorRT/ONNX Runtime execution are not required to fit inside `PreprocessPlan`. Reusable traditional CV preprocessing and postprocessing around the model should still use shared typed operators or an equivalent shared DL preprocessing abstraction.
- DL detectors must share model/session lifecycle, GPU scheduling, VRAM budget, warm-up, capability metrics, error handling, and fallback policy. GUI, monitor, and batch workers must not each load an independent model copy.
- A DL detector must preserve traceable preprocessing, model version, backend, input/output shape, thresholds, and fallback metadata, with CPU or approved reference-backend accuracy tests before GPU acceleration becomes a default.

## Required workflow

Before editing:

1. Run `git status --short --branch`.
2. Read the relevant `Todo.md` sections and nearby implementation/tests.
3. Identify user-owned or unrelated working-tree changes and preserve them.

While editing:

1. Make focused changes with the existing module boundaries.
2. Add or update automated tests for behavior, CPU equivalence, old-DLL routing, and failure fallback.
3. Update `Todo.md` accurately; do not mark source-only CUDA work as hardware-validated.
4. Keep generated files under ignored validation/output directories.
5. Keep `README.md` user-facing and evidence-based; keep this file focused on contributor/agent invariants. Update both when commands, architecture, packaging, or validation policy changes.

Before finishing, always run (set `TEMP`/`TMP` to an ASCII directory first: OpenCV cannot write to a non-ASCII temp path):

```powershell
.\env\Scripts\python.exe -m unittest discover -s tests -v
.\env\Scripts\python.exe -m compileall main.py gui_launcher.py tools contour_preprocess_tool core detectors devices gui gpu aoi_sidecar
.\env\Scripts\python.exe gpu\preflight_cuda_build.py
git diff --check
```

For pipeline, detector, recipe, tiling, GPU bridge, or reporter changes, also run a CLI smoke test with a synthetic image and write only to `outputs_validation/`.

For GUI changes, also run:

```powershell
$env:QT_QPA_PLATFORM='offscreen'
.\env\Scripts\python.exe -c "from pathlib import Path; from PySide6.QtWidgets import QApplication; from gui.main_window import MainWindow; app=QApplication([]); w=MainWindow(); w.recipe_panel.load_recipe(Path('recipes/DEMO.yaml')); print(w.windowTitle(), w.recipe_panel.detector_list.count())"
```

For sidecar changes, also run `.\env\Scripts\python.exe -m aoi_sidecar --smoke-test`.

For desktop changes, run `cargo test` and `cargo clippy` in `desktop\src-tauri`, `npm run lint` (catches undefined identifiers that `vite build` does not) and build the frontend with `npm run build`. Vite/rollup crashes when the project path contains non-ASCII characters, so build from an ASCII copy of `desktop\` in that case. For behavior changes, run the real app with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` and verify through CDP: OP default mode, backend label, an end-to-end CPU job, and no orphan sidecar after closing.

For desktop installer changes, run `packaging\scriptsuild_desktop.ps1`; it must pass the frozen sidecar `--smoke-test` and the stdio protocol check.

For Classic packaging, `gui_launcher.py`, or Classic spec changes, build through `packaging\scripts\build_exe.ps1` and run the packaged `--smoke-test` when the local environment can support a package build. The smoke must cover bundled recipe/MainWindow startup, CPU-only execution, missing-DLL fallback equivalence with zero GPU calls, and explicit strict-CUDA failure.

For standalone utility or utility spec/build changes, use the matching dedicated build script and run that utility's packaged `--smoke-test`. Keep utility bundle tags (`utility-tools-vX.Y.Z`) and the legacy NG Tile tool tag namespace separate from TileScope AOI application tags (`vX.Y.Z`).

For CUDA header/source/API changes:

- Run all available Python/fake-DLL/static checks locally.
- Inspect public declarations, native smoke coverage, validation tooling, and brace/argument consistency.
- If `nvcc` is unavailable, explicitly report that the DLL was not rebuilt.
- Leave RTX 3090 compile, primitive matrix, synthetic recipe equivalence, benchmark, and stress tasks unchecked until executed.

If any required validation fails, fix it and rerun the relevant full set before commit.

## Git and artifacts

- Default branch and push target: `main` → `origin/main`.
- Stage only files that belong to the current task. Do not use `git add .` in a dirty workspace.
- Never commit user-provided release ZIPs, `outputs/logs/`, `outputs_validation/`, temporary images, generated reports, packaged validation archives, DLL build outputs, or unrelated changes.
- Do not discard, reset, overwrite, or reformat unrelated user changes.
- Use a concise commit message describing the completed outcome.
- Push every completed validated change unless the user explicitly says not to push.

Typical safe sequence:

```powershell
git status --short --branch
git add -- <explicit files>
git diff --cached --check
git commit -m "<concise outcome>"
git push origin main
git status -sb
```

## Final handoff

Report:

- What changed and which roadmap items were marked.
- CPU, fallback, GUI, CUDA, and compatibility impact as applicable.
- Exact validation commands and results.
- Any validation that could not run, especially `nvcc`/RTX 3090 work.
- Commit hash and push result.
- Remaining untracked user artifacts only when relevant.
