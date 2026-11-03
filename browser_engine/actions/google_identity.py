"""
Re-export shim — backward compatibility cho các import cũ.
Các module thật:
  actions/drive_actions.py  — Google Drive
  actions/gmail_actions.py  — Gmail
"""
from actions.drive_actions import drive_interaction  # noqa: F401
from actions.gmail_actions import gmail_interaction  # noqa: F401
