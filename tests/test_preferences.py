"""GuiPreferences QSettings migration from the legacy ``VisionFlow/AOI`` store."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PySide6.QtCore import QSettings

from gui.preferences import GuiPreferences, migrate_legacy_settings


class GuiPreferencesMigrationTests(unittest.TestCase):
    def test_migrate_copies_legacy_keys_only_when_new_store_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            new = QSettings(str(root / "new.ini"), QSettings.Format.IniFormat)
            legacy = QSettings(str(root / "legacy.ini"), QSettings.Format.IniFormat)
            legacy.setValue("output/directory", "C:/out")
            legacy.setValue("paths/recipe", "C:/r.yaml")
            legacy.sync()

            self.assertTrue(migrate_legacy_settings(new, legacy))
            self.assertEqual(new.value("output/directory"), "C:/out")
            self.assertEqual(new.value("paths/recipe"), "C:/r.yaml")

    def test_migrate_leaves_non_empty_new_store_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            new = QSettings(str(root / "new.ini"), QSettings.Format.IniFormat)
            legacy = QSettings(str(root / "legacy.ini"), QSettings.Format.IniFormat)
            new.setValue("output/directory", "C:/new")
            legacy.setValue("output/directory", "C:/old")
            legacy.sync()

            self.assertFalse(migrate_legacy_settings(new, legacy))
            self.assertEqual(new.value("output/directory"), "C:/new")

    def test_migrate_is_a_noop_when_legacy_has_no_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            new = QSettings(str(root / "new.ini"), QSettings.Format.IniFormat)
            legacy = QSettings(str(root / "legacy.ini"), QSettings.Format.IniFormat)
            self.assertFalse(migrate_legacy_settings(new, legacy))

    def test_default_constructor_accepts_injected_settings_without_migration(self):
        # An injected store is used as-is; migration is the caller's decision.
        with tempfile.TemporaryDirectory() as tmp:
            settings = QSettings(str(Path(tmp) / "injected.ini"), QSettings.Format.IniFormat)
            preferences = GuiPreferences(settings)
            self.assertIs(preferences.settings, settings)


if __name__ == "__main__":
    unittest.main()
