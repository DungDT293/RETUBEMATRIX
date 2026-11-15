//! Child process management, multi-byte ANSI/UTF-8 decoding, and recent output ring buffers.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use crate::types::BackendError;

pub const RECENT_OUTPUT_LIMIT: usize = 30;

/// created.  This helper decodes via the Win32 `MultiByteToWideChar` API so
/// the full filepath (including CJK characters) is preserved.
#[cfg(windows)]
pub(crate) fn decode_process_output(bytes: &[u8]) -> String {
    // Fast path: already valid UTF-8
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }

    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    extern "system" {
        fn MultiByteToWideChar(
            code_page: u32,
            flags: u32,
            multi_byte_str: *const u8,
            multi_byte: i32,
            wide_char_str: *mut u16,
            wide_char: i32,
        ) -> i32;
    }

    const CP_ACP: u32 = 0; // System default Windows ANSI code page

    unsafe {
        let len = MultiByteToWideChar(
            CP_ACP,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            std::ptr::null_mut(),
            0,
        );
        if len <= 0 {
            return String::from_utf8_lossy(bytes).into_owned();
        }
        let mut wide = vec![0u16; len as usize];
        MultiByteToWideChar(
            CP_ACP,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            wide.as_mut_ptr(),
            len,
        );
        OsString::from_wide(&wide).to_string_lossy().into_owned()
    }
}

#[cfg(not(windows))]
pub(crate) fn decode_process_output(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// Kill all yt-dlp and ffmpeg processes
pub(crate) fn kill_all_download_processes() {
    #[cfg(unix)]
    {
        use std::process::Command as StdCommand;
        StdCommand::new("pkill")
            .args(["-9", "-f", "yt-dlp"])
            .spawn()
            .ok();
        StdCommand::new("pkill")
            .args(["-9", "-f", "ffmpeg"])
            .spawn()
            .ok();
    }
    #[cfg(windows)]
    {
        use crate::utils::CommandExt as _;
        use std::process::Command as StdCommand;
        let mut cmd1 = StdCommand::new("taskkill");
        cmd1.args(["/F", "/IM", "yt-dlp.exe"]);
        cmd1.hide_window();
        cmd1.spawn().ok();

        let mut cmd2 = StdCommand::new("taskkill");
        cmd2.args(["/F", "/IM", "ffmpeg.exe"]);
        cmd2.hide_window();
        cmd2.spawn().ok();
    }
}

pub(crate) fn push_recent_output(buffer: &mut VecDeque<String>, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    if buffer.len() >= RECENT_OUTPUT_LIMIT {
        buffer.pop_front();
    }
    buffer.push_back(trimmed.to_string());
}

pub(crate) fn push_recent_output_shared(buffer: &Arc<Mutex<VecDeque<String>>>, line: &str) {
    if let Ok(mut guard) = buffer.lock() {
        push_recent_output(&mut guard, line);
    }
}

pub(crate) fn recent_output_snapshot(buffer: &Arc<Mutex<VecDeque<String>>>) -> Vec<String> {
    buffer
        .lock()
        .map(|guard| guard.iter().cloned().collect())
        .unwrap_or_default()
}


pub(crate) fn download_cancelled_error() -> BackendError {
    BackendError::new(crate::types::code::DOWNLOAD_CANCELLED, "Download cancelled")
        .with_retryable(false)
}


#[cfg(test)]
mod process_tests {
    use super::*;

    #[test]
    fn cancelled_download_error_is_non_retryable() {
        let wire = download_cancelled_error().to_wire();

        assert_eq!(wire.code, crate::types::code::DOWNLOAD_CANCELLED);
        assert_eq!(wire.message, "Download cancelled");
        assert_eq!(wire.retryable, Some(false));
    }
}
