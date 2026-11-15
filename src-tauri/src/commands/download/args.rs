//! Argument building and normalization helpers for yt-dlp.

use std::vec::Vec;

pub(crate) fn extract_time_range(download_sections: &Option<String>) -> Option<String> {
    download_sections.as_ref().and_then(|s| {
        let stripped = s.strip_prefix('*').unwrap_or(s);
        if stripped.is_empty() {
            None
        } else {
            Some(stripped.to_string())
        }
    })
}

pub(crate) fn append_subtitle_args(
    args: &mut Vec<String>,
    subtitle_mode: &str,
    subtitle_langs: &str,
    subtitle_embed: bool,
    subtitle_format: &str,
) {
    if subtitle_mode == "off" {
        return;
    }

    args.push("--write-subs".to_string());
    if subtitle_mode == "auto" {
        args.push("--write-auto-subs".to_string());
    }

    args.push("--sub-langs".to_string());
    if subtitle_mode == "auto" && subtitle_langs.trim().is_empty() {
        // An empty Auto selection deliberately means every available language.
        args.push("all".to_string());
    } else {
        args.push(subtitle_langs.to_string());
    }

    args.push("--sub-format".to_string());
    args.push(subtitle_format.to_string());
    if subtitle_embed {
        args.push("--embed-subs".to_string());
    }
}

pub(crate) fn normalize_aria2_args(raw_args: &str) -> Option<String> {
    let trimmed = raw_args.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(rest) = trimmed.strip_prefix("aria2c:") {
        let normalized = rest.trim_start();
        return if normalized.is_empty() {
            None
        } else {
            Some(format!("aria2c:{}", normalized))
        };
    }
    if let Some(rest) = trimmed.strip_prefix("aria2:") {
        let normalized = rest.trim_start();
        return if normalized.is_empty() {
            None
        } else {
            Some(format!("aria2c:{}", normalized))
        };
    }
    Some(format!("aria2c:{}", trimmed))
}


#[cfg(test)]
mod subtitle_args_tests {
    use super::*;

    #[test]
    fn auto_subtitles_respect_selected_languages() {
        let mut args = Vec::new();

        append_subtitle_args(&mut args, "auto", "en,ru", false, "srt");

        assert_eq!(
            args,
            vec![
                "--write-subs",
                "--write-auto-subs",
                "--sub-langs",
                "en,ru",
                "--sub-format",
                "srt",
            ]
        );
    }

    #[test]
    fn auto_subtitles_use_all_only_without_a_language_selection() {
        let mut args = Vec::new();

        append_subtitle_args(&mut args, "auto", "  ", false, "vtt");

        assert_eq!(args[3], "all");
    }

    #[test]
    fn manual_subtitles_do_not_request_auto_generated_captions() {
        let mut args = Vec::new();

        append_subtitle_args(&mut args, "manual", "vi", true, "ass");

        assert_eq!(
            args,
            vec![
                "--write-subs",
                "--sub-langs",
                "vi",
                "--sub-format",
                "ass",
                "--embed-subs",
            ]
        );
    }
}

