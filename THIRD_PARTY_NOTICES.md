# Third-party components

The root MIT license covers only rights the licensor owns and is authorized to license.
It does not grant rights to third-party software, company work product, hardware SDKs,
or the legacy acquisition application referenced during development.
See [source provenance](docs/source-provenance.md) and `distribution-policy.json`.

| Component | License / source |
| --- | --- |
| OpenCV Python | See the installed distribution's OpenCV and third-party notices; [upstream](https://github.com/opencv/opencv-python) |
| NumPy | BSD and bundled-library notices; [upstream](https://github.com/numpy/numpy) |
| ONNX Runtime | MIT and bundled third-party notices; [upstream](https://github.com/microsoft/onnxruntime) |
| PyYAML | MIT; [upstream](https://github.com/yaml/pyyaml) |
| Qt / PySide6 / shiboken6 | LGPL/GPL/commercial options vary by component; [Qt obligations](https://www.qt.io/development/open-source-lgpl-obligations) |
| pythonnet / clr-loader | See installed package licenses; [pythonnet](https://github.com/pythonnet/pythonnet), [clr-loader](https://github.com/pythonnet/clr-loader) |
| PyInstaller | GPL with bootloader exception; [upstream](https://pyinstaller.org/en/stable/license.html) |

`tools/collect_dependency_licenses.py` copies installed license and notice files into
the package's `licenses/` directory, with package versions and source paths in an index.
Missing notices fail collection. This inventory is evidence for review; it is not a
determination that every distribution obligation has been fulfilled.

Sapera, LSI-8181 and DAQNavi binaries are not redistributed. Their driver installations
and permissions must be supplied separately by an authorized user.
