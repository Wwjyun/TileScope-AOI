# -*- mode: python ; coding: utf-8 -*-
#
# This spec lives in packaging\specs. PyInstaller resolves relative paths against
# the spec directory, so every source path is derived from the repository root.
from pathlib import Path

SPEC_DIR = Path(SPECPATH).resolve()
ROOT = SPEC_DIR.parent.parent
VERSION_INFO = ROOT / 'build' / 'version_info' / 'aoi-sidecar.txt'

cuda_dll = ROOT / 'gpu' / 'visionflow_cuda.dll'
cuda_binaries = [(str(cuda_dll), 'gpu')] if cuda_dll.exists() else []

# The sidecar is the Qt-free stdio JSON-RPC backend for the Tauri desktop shell, so PySide6 and
# shiboken6 are excluded and the smoke test asserts no Qt module is ever imported. pythonnet and
# clr_loader are intentionally not hidden imports: the sidecar's device probe only checks file
# existence (aoi_sidecar.devices_probe uses importlib.util.find_spec), and every vendor binding
# loads the .NET runtime lazily inside a connect path. A machine without pythonnet therefore
# reports the light/camera as unavailable instead of failing to start.
a = Analysis(
    [str(ROOT / 'aoi_sidecar' / '__main__.py')],
    pathex=[str(ROOT)],
    binaries=cuda_binaries,
    datas=[
        (str(ROOT / 'recipes'), 'recipes'),
        (str(ROOT / 'models' / 'demo12'), 'models/demo12'),
        (str(ROOT / 'build_provenance.json'), '.'),
        (str(ROOT / 'build' / 'dependency_licenses'), 'licenses'),
        (str(ROOT / 'distribution-policy.json'), '.'),
        (str(ROOT / 'docs' / 'source-provenance.md'), '.'),
        (str(ROOT / 'THIRD_PARTY_NOTICES.md'), '.'),
        (str(ROOT / 'LICENSE'), '.'),
        (str(ROOT / 'NOTICE'), '.'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'PySide6',
        'PySide6_Essentials',
        'PySide6_Addons',
        'shiboken6',
        'PyQt5',
        'PyQt6',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='aoi-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version=str(VERSION_INFO),
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='aoi-sidecar',
)
