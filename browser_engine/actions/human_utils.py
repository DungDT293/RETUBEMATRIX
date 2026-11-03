"""
Re-export shim — giữ backward compatibility với tất cả import cũ.
Các module thật nằm trong:
  actions/constants.py      — keyword pools
  actions/input_human.py    — timing, typing, mouse, scroll
  actions/popup_handler.py  — dismiss_popups, notification permission
  actions/browser_behaviors.py — address bar, tab switching
  actions/youtube_player.py — YouTube player interactions
"""
from actions.constants import (  # noqa: F401
    _ADJACENT_KEYS,
    YOUTUBE_KEYWORDS,
    GOOGLE_KEYWORDS,
)
from actions.input_human import (  # noqa: F401
    random_delay,
    human_type,
    move_mouse_to,
    move_to_locator,
    human_scroll,
    human_read_and_scroll,
)
from actions.popup_handler import (  # noqa: F401
    dismiss_popups,
    handle_notification_permission,
    maybe_handle_notification_popup,
)
from actions.browser_behaviors import (  # noqa: F401
    maybe_focus_address_bar,
    maybe_switch_tab,
    maybe_open_new_tab_and_close,
)
from actions.youtube_player import (  # noqa: F401
    try_skip_ad,
    maybe_adjust_volume,
    maybe_fullscreen,
    maybe_theater_mode,
    maybe_seek_video,
    maybe_pause_resume,
    maybe_change_quality,
    maybe_like_video,
    maybe_comment_video,
    exit_fullscreen_if_active,
)
