from __future__ import annotations

from PySide6.QtWidgets import QInputDialog, QLineEdit, QWidget

from core.access_control import DEFAULT_MODE_PASSWORDS, MODE_LABELS, PermissionManager

__all__ = ["MODE_LABELS", "DEFAULT_MODE_PASSWORDS", "PermissionManager", "ModePasswordPrompt"]


class ModePasswordPrompt:
    """Qt password prompt kept separate from authorization policy."""

    def request_password(self, parent: QWidget, mode: str) -> tuple[str, bool]:
        return QInputDialog.getText(
            parent,
            "權限驗證",
            f"請輸入{MODE_LABELS[mode]}密碼：",
            QLineEdit.EchoMode.Password,
        )
