"""
Re-export shim — backward compatibility cho các import cũ.
Các module thật:
  actions/maps_actions.py          — Google Maps
  actions/alerts_policy_actions.py — Google Alerts + Policy page
"""
from actions.maps_actions import maps_interaction  # noqa: F401
from actions.alerts_policy_actions import (  # noqa: F401
    alerts_interaction,
    policy_interaction,
)
