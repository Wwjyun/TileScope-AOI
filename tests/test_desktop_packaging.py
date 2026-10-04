from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC_DIR = ROOT / "packaging" / "specs"
BUILD_DIR = ROOT / "packaging" / "scripts"


def _read_ascii(path: Path) -> str:
    data = path.read_bytes()
    for byte in data:
        if byte > 127:
            raise AssertionError(f"{path} is not pure ASCII (byte 0x{byte:02X})")
    return data.decode("ascii")


class DesktopPackagingContractTests(unittest.TestCase):
    def setUp(self):
        self.spec = _read_ascii(SPEC_DIR / "aoi-sidecar.spec")
        self.build = _read_ascii(BUILD_DIR / "build_desktop.ps1")
        self.conf = _read_ascii(ROOT / "desktop" / "src-tauri" / "tauri.conf.json")

    def test_sidecar_spec_resolves_root_from_specpath(self):
        self.assertIn("SPEC_DIR = Path(SPECPATH).resolve()", self.spec)
        self.assertIn("ROOT = SPEC_DIR.parent.parent", self.spec)

    def test_sidecar_spec_bundles_datas_and_uses_onedir_console(self):
        self.assertIn("'recipes'", self.spec)
        self.assertIn("models/demo12", self.spec)
        self.assertIn("build_provenance.json", self.spec)
        self.assertIn("dependency_licenses", self.spec)
        self.assertIn("distribution-policy.json", self.spec)
        self.assertIn("source-provenance.md", self.spec)
        self.assertIn("THIRD_PARTY_NOTICES.md", self.spec)
        self.assertIn("LICENSE", self.spec)
        self.assertIn("name='aoi-sidecar'", self.spec)
        self.assertIn("console=True", self.spec)

    def test_sidecar_spec_excludes_qt(self):
        for name in ("PySide6", "shiboken6", "PyQt5", "PyQt6"):
            self.assertIn(f"'{name}'", self.spec)

    def test_sidecar_spec_keeps_no_qt_or_pythonnet_hidden_imports(self):
        self.assertIn("hiddenimports=[]", self.spec)

    def test_build_script_locates_root_from_own_location(self):
        self.assertIn(
            '[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\\.."))',
            self.build,
        )

    def test_build_script_runs_frozen_smoke_and_qt_check(self):
        self.assertIn("--smoke-test", self.build)
        self.assertIn("Qt artifacts", self.build)

    def test_build_script_mirrors_sidecar_and_builds_with_tauri(self):
        self.assertIn("src-tauri\\sidecar", self.build)
        self.assertIn("npx tauri build", self.build)

    def test_build_script_has_webview2_mode_parameter(self):
        self.assertIn("WebView2Mode", self.build)
        for mode in ("offlineInstaller", "embedBootstrapper", "downloadBootstrapper"):
            self.assertIn(mode, self.build)
        self.assertIn("webviewInstallMode", self.build)

    def test_build_script_stages_non_ascii_paths(self):
        self.assertIn("Test-IsPureAscii", self.build)
        self.assertIn("-gt 127", self.build)
        self.assertIn("StagingRoot", self.build)

    def test_tauri_conf_bundles_nsis_and_sidecar(self):
        self.assertIn('"targets": ["nsis"]', self.conf)
        self.assertIn('"sidecar/"', self.conf)
        self.assertIn('"identifier"', self.conf)
        self.assertIn('"version"', self.conf)


if __name__ == "__main__":
    unittest.main()
