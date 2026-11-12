//! Command utilities for cross-platform process spawning
//!
//! On Windows, console applications spawn a visible terminal window by default.
//! This module provides utilities to hide the console window.

use tokio::process::Command;

/// Windows flag to prevent console window from appearing
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Windows flag to prioritize interactive apps (mouse, UI, browser) over background tasks
#[cfg(windows)]
pub const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x00004000;

/// Extension trait to configure Command for hidden window on Windows
pub trait CommandExt {
    /// Hide console window on Windows (no-op on other platforms)
    fn hide_window(&mut self) -> &mut Self;

    /// Hide console window and assign BELOW_NORMAL_PRIORITY_CLASS on Windows (no-op on other platforms)
    /// Guarantees that heavy tasks (FFmpeg, yt-dlp) do not freeze desktop UI, cursor, or browser.
    fn hide_window_background(&mut self) -> &mut Self;
}

impl CommandExt for Command {
    #[cfg(windows)]
    fn hide_window(&mut self) -> &mut Self {
        self.creation_flags(CREATE_NO_WINDOW);
        self
    }

    #[cfg(windows)]
    fn hide_window_background(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt as _;
        self.as_std_mut().creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
        self
    }

    #[cfg(not(windows))]
    fn hide_window(&mut self) -> &mut Self {
        self
    }

    #[cfg(not(windows))]
    fn hide_window_background(&mut self) -> &mut Self {
        self
    }
}

/// Extension trait for std::process::Command
impl CommandExt for std::process::Command {
    #[cfg(windows)]
    fn hide_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt as _;
        self.creation_flags(CREATE_NO_WINDOW);
        self
    }

    #[cfg(windows)]
    fn hide_window_background(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt as _;
        self.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
        self
    }

    #[cfg(not(windows))]
    fn hide_window(&mut self) -> &mut Self {
        self
    }

    #[cfg(not(windows))]
    fn hide_window_background(&mut self) -> &mut Self {
        self
    }
}
