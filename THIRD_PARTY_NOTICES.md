# Third-party components

The root license (PolyForm Noncommercial 1.0.0) covers only rights the licensor owns and is
authorized to license. It does not grant rights to third-party software, company work product,
or hardware SDKs. See [source provenance](docs/source-provenance.md) and `distribution-policy.json`.

## Python runtime and packaging

| Component | License / source |
| --- | --- |
| OpenCV Python | See the installed distribution's OpenCV and third-party notices; [upstream](https://github.com/opencv/opencv-python) |
| NumPy | BSD and bundled-library notices; [upstream](https://github.com/numpy/numpy) |
| ONNX Runtime | MIT and bundled third-party notices; [upstream](https://github.com/microsoft/onnxruntime) |
| PyYAML | MIT; [upstream](https://github.com/yaml/pyyaml) |
| Pillow | MIT-CMU (HPND); [upstream](https://github.com/python-pillow/Pillow) |
| plotly | MIT; [upstream](https://github.com/plotly/plotly.py) |
| Qt / PySide6 / shiboken6 (Classic GUI only) | LGPL/GPL/commercial options vary by component; [Qt obligations](https://www.qt.io/development/open-source-lgpl-obligations). The desktop sidecar excludes Qt. |
| pythonnet / clr-loader | MIT; [pythonnet](https://github.com/pythonnet/pythonnet), [clr-loader](https://github.com/pythonnet/clr-loader) |
| PyInstaller | GPL with bootloader exception; [upstream](https://pyinstaller.org/en/stable/license.html) |
| Hypothesis (tests only) | MPL-2.0; [upstream](https://github.com/HypothesisWorks/hypothesis) |

`tools/collect_dependency_licenses.py` copies installed license and notice files into the
package's `licenses/` directory, with package versions and source paths in an index. Missing
notices fail collection.

## Desktop app

| Component | License / source |
| --- | --- |
| Tauri 2 and its plugins (`tauri-plugin-dialog`, `tauri-plugin-opener`) | MIT or Apache-2.0; [upstream](https://github.com/tauri-apps/tauri) |
| Rust crates in `desktop/src-tauri/Cargo.lock` | Predominantly MIT and/or Apache-2.0; see each crate's license (`cargo metadata`) |
| React, React DOM | MIT; [upstream](https://github.com/facebook/react) |
| Vite and `@vitejs/plugin-react` (build only) | MIT; [upstream](https://github.com/vitejs/vite) |
| IBM Plex Sans / Mono via `@fontsource` | SIL Open Font License 1.1; [upstream](https://github.com/IBM/plex) |
| npm packages in `desktop/package-lock.json` | See each package's license (`npm ls --all`) |
| Microsoft Edge WebView2 Runtime (installer only) | Microsoft software license terms for WebView2 redistribution; [terms](https://developer.microsoft.com/microsoft-edge/webview2/) |

## Development tooling in this repository

| Component | License / source |
| --- | --- |
| archify (`.claude/skills/archify/`, vendored) | MIT; see its `LICENSE` and `THIRD_PARTY_NOTICES.md`; [upstream](https://github.com/tt-a1i/archify) |

This inventory is evidence for review; it is not a determination that every distribution
obligation has been fulfilled.

Sapera, LSI-8181 and DAQNavi binaries are not redistributed. Their driver installations and
permissions must be supplied separately by an authorized user.
