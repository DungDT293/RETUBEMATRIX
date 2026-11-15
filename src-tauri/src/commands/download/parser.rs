//! Parsing stdout/stderr from yt-dlp, media file paths detection, and download error building.

use crate::types::BackendError;

pub(crate) fn parse_printed_filepaths(contents: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for line in contents.lines() {
        let path = line.trim();
        if path.is_empty() || paths.iter().any(|existing| existing == path) {
            continue;
        }
        paths.push(path.to_string());
    }
    paths
}

pub(crate) fn is_media_filepath(path: &str) -> bool {
    matches!(
        std::path::Path::new(path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("mp3" | "m4a" | "opus" | "mp4" | "mkv" | "webm" | "flac" | "wav")
    )
}

pub(crate) fn push_unique_filepath(paths: &mut Vec<String>, path: &str) {
    if !path.is_empty() && !paths.iter().any(|existing| existing == path) {
        paths.push(path.to_string());
    }
}

pub(crate) fn parse_ytdlp_output_filepath(line: &str) -> Option<String> {
    let line = line.trim();
    let candidate = if line.contains("[download]")
        || line.contains("[ExtractAudio]")
        || line.contains("[SplitChapters]")
        || line.contains("[VideoRemuxer]")
        || line.contains("[VideoConvertor]")
    {
        line.split_once("Destination:")
            .map(|(_, path)| path)
            .or_else(|| {
                line.strip_prefix("[download] ")
                    .and_then(|path| path.strip_suffix(" has already been downloaded"))
            })
    } else if let Some(path) = line.strip_prefix("[Merger] Merging formats into ") {
        Some(path)
    } else if !line.starts_with('[') && is_media_filepath(line) {
        Some(line)
    } else {
        None
    }?;

    let candidate = candidate
        .trim()
        .trim_matches(|character| character == '"' || character == '\'');
    (!candidate.is_empty() && is_media_filepath(candidate)).then(|| candidate.to_string())
}

pub(crate) fn job_output_filepaths(
    output_directory: &str,
    printed_filepaths: &[String],
    observed_filepaths: &[String],
) -> Vec<String> {
    let Ok(output_directory) = std::fs::canonicalize(output_directory) else {
        return Vec::new();
    };
    let mut paths = Vec::new();

    for filepath in printed_filepaths.iter().chain(observed_filepaths) {
        let filepath = std::path::Path::new(filepath);
        let filepath = if filepath.is_absolute() {
            filepath.to_path_buf()
        } else {
            output_directory.join(filepath)
        };
        let Ok(filepath) = std::fs::canonicalize(filepath) else {
            continue;
        };
        let filepath_text = filepath.to_string_lossy();
        if filepath.is_file()
            && filepath.starts_with(&output_directory)
            && is_media_filepath(&filepath_text)
        {
            push_unique_filepath(&mut paths, &filepath_text);
        }
    }

    paths
}


pub(crate) fn is_aria2_not_found_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    (lower.contains("aria2c") || lower.contains("aria2"))
        && (lower.contains("not found")
            || lower.contains("no such file")
            || lower.contains("is not recognized"))
}


pub(crate) fn build_download_error_message(exit_code: Option<i32>, recent_lines: &[String]) -> BackendError {
    if recent_lines
        .iter()
        .any(|line| is_aria2_not_found_line(line))
    {
        return BackendError::new(
            crate::types::code::ARIA2_NOT_FOUND,
            "aria2c not found. Install aria2 and ensure aria2c is available in PATH.",
        )
        .with_retryable(false);
    }

    if recent_lines.iter().any(|line| {
        let lower = line.to_lowercase();
        lower.contains("does not pass filter") || lower.contains("skipped by filter")
    }) {
        return BackendError::new(
            crate::types::code::YT_SKIPPED_FILTER,
            "Skipped by yt-dlp match filter.",
        )
        .with_retryable(false);
    }

    let reason = recent_lines
        .iter()
        .rev()
        .find(|line| {
            let lower = line.to_lowercase();
            lower.contains("error")
                || lower.contains("unable")
                || lower.contains("failed")
                || lower.contains("http error")
                || lower.contains("forbidden")
                || lower.contains("too many requests")
                || lower.contains("timed out")
        })
        .cloned()
        .or_else(|| recent_lines.last().cloned())
        .unwrap_or_else(|| "Unknown error".to_string());

    match exit_code {
        Some(code) => {
            BackendError::from_message(format!("Download failed (exit code {}): {}", code, reason))
                .with_param("exitCode", code)
        }
        None => BackendError::from_message(format!("Download failed: {}", reason)),
    }
}


pub(crate) fn detect_source(url: &str) -> Option<String> {
    if url.contains("youtube.com") || url.contains("youtu.be") {
        Some("youtube".to_string())
    } else if url.contains("tiktok.com") {
        Some("tiktok".to_string())
    } else if url.contains("facebook.com") || url.contains("fb.watch") {
        Some("facebook".to_string())
    } else if url.contains("instagram.com") {
        Some("instagram".to_string())
    } else if url.contains("twitter.com") || url.contains("x.com") {
        Some("twitter".to_string())
    } else if url.contains("bilibili.com") || url.contains("b23.tv") {
        Some("bilibili".to_string())
    } else if url.contains("youku.com") {
        Some("youku".to_string())
    } else {
        Some("other".to_string())
    }
}

pub(crate) fn generate_thumbnail_url(url: &str) -> Option<String> {
    if url.contains("youtube.com") || url.contains("youtu.be") {
        let video_id = if url.contains("v=") {
            url.split("v=").nth(1).and_then(|s| s.split('&').next())
        } else if url.contains("youtu.be/") {
            url.split("youtu.be/")
                .nth(1)
                .and_then(|s| s.split('?').next())
        } else {
            None
        };
        video_id.map(|id| format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", id))
    } else {
        None
    }
}


#[cfg(test)]
mod parser_tests {
    use super::*;

    #[test]
    fn printed_filepaths_preserve_multiple_output_files() {
        let filepaths =
            parse_printed_filepaths("/tmp/video.mp4\n/tmp/01 - Intro.mp4\n/tmp/02 - End.mp4\n");

        assert_eq!(
            filepaths,
            vec![
                "/tmp/video.mp4".to_string(),
                "/tmp/01 - Intro.mp4".to_string(),
                "/tmp/02 - End.mp4".to_string(),
            ]
        );
    }

    #[test]
    fn parses_only_paths_emitted_by_the_current_ytdlp_process() {
        assert_eq!(
            parse_ytdlp_output_filepath(
                r#"[Merger] Merging formats into "C:\Downloads\Video.mp4""#
            )
            .as_deref(),
            Some(r"C:\Downloads\Video.mp4")
        );
        assert_eq!(
            parse_ytdlp_output_filepath(
                r"[SplitChapters] Chapter 001; Destination: C:\Downloads\01 - Intro.mp4"
            )
            .as_deref(),
            Some(r"C:\Downloads\01 - Intro.mp4")
        );
        assert_eq!(
            parse_ytdlp_output_filepath(
                r"[download] C:\Downloads\Video.mp4 has already been downloaded"
            )
            .as_deref(),
            Some(r"C:\Downloads\Video.mp4")
        );
        assert_eq!(
            parse_ytdlp_output_filepath(
                r"[VideoRemuxer] Remuxing video from webm to mp4; Destination: C:\Downloads\Video.mp4"
            )
            .as_deref(),
            Some(r"C:\Downloads\Video.mp4")
        );
        assert_eq!(
            parse_ytdlp_output_filepath("unrelated process output"),
            None
        );
    }

    #[test]
    fn output_fallback_ignores_concurrent_and_outside_files() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("youwee-job-output-{nonce}"));
        let outside = std::env::temp_dir().join(format!("youwee-unrelated-{nonce}.mp4"));
        std::fs::create_dir_all(&root).expect("test output directory should be created");
        let main = root.join("video.mp4");
        let chapter = root.join("01 - Intro.mp4");
        let concurrent = root.join("unrelated-concurrent.mp4");
        std::fs::write(&main, b"main").expect("main output should be written");
        std::fs::write(&chapter, b"chapter").expect("chapter output should be written");
        std::fs::write(&concurrent, b"other").expect("concurrent output should be written");
        std::fs::write(&outside, b"outside").expect("outside output should be written");

        let filepaths = job_output_filepaths(
            &root.to_string_lossy(),
            &[main.to_string_lossy().to_string()],
            &[
                chapter.to_string_lossy().to_string(),
                outside.to_string_lossy().to_string(),
            ],
        );

        assert_eq!(filepaths.len(), 2);
        assert!(filepaths.contains(
            &std::fs::canonicalize(main)
                .unwrap()
                .to_string_lossy()
                .to_string()
        ));
        assert!(filepaths.contains(
            &std::fs::canonicalize(chapter)
                .unwrap()
                .to_string_lossy()
                .to_string()
        ));
        assert!(!filepaths
            .iter()
            .any(|path| path.contains("unrelated-concurrent")));
        assert!(!filepaths.contains(
            &std::fs::canonicalize(&outside)
                .unwrap()
                .to_string_lossy()
                .to_string()
        ));

        std::fs::remove_dir_all(root).ok();
        std::fs::remove_file(outside).ok();
    }

    #[test]

    fn process_exit_errors_include_exit_code_param() {
        let error = build_download_error_message(Some(15), &["ERROR: interrupted".to_string()]);
        let wire = error.to_wire();

        assert_eq!(wire.code, crate::types::code::PROCESS_EXIT_NON_ZERO);
        assert_eq!(
            wire.params
                .and_then(|params| params.get("exitCode").cloned()),
            Some(serde_json::Value::from(15))
        );
    }
}
