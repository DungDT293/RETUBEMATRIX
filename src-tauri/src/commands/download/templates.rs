//! Filename formatting, playlist/queue indexing, chapter templates, and display titles.

use crate::database::{add_history_collection_in_db, add_log_internal, ensure_collection_for_download_in_db};

pub(crate) fn number_width(total: Option<u32>) -> usize {
    total
        .filter(|value| *value >= 100)
        .map(|value| value.to_string().len())
        .unwrap_or(2)
}

pub(crate) fn build_playlist_prefix(
    enabled: bool,
    playlist_index: Option<u32>,
    playlist_total: Option<u32>,
) -> Option<String> {
    if !enabled {
        return None;
    }

    let width = number_width(playlist_total);
    playlist_index
        .map(|index| format!("{index:0width$} - "))
        .or_else(|| Some(format!("%(playlist_index)0{width}d - ")))
}

pub(crate) fn build_queue_prefix(
    enabled: bool,
    queue_index: Option<u32>,
    queue_total: Option<u32>,
) -> Option<String> {
    if !enabled {
        return None;
    }

    let index = queue_index?;
    let width = number_width(queue_total);
    Some(format!("{index:0width$} - "))
}

pub(crate) fn filename_metadata_template(field: &str) -> Option<&'static str> {
    match field {
        "uploadDate" => Some("%(upload_date>%Y-%m-%d)s"),
        "viewCount" => Some("%(view_count)sviews"),
        "uploader" => Some("%(uploader)s"),
        "duration" => Some("%(duration_string)s"),
        "resolution" => Some("%(height)sp"),
        "videoId" => Some("%(id)s"),
        _ => None,
    }
}

pub(crate) fn build_filename_metadata_prefix(enabled: bool, fields: &[String]) -> Option<String> {
    if !enabled {
        return None;
    }

    let mut templates = Vec::new();
    for field in fields {
        let Some(template) = filename_metadata_template(field.as_str()) else {
            continue;
        };
        if !templates.contains(&template) {
            templates.push(template);
        }
    }

    if templates.is_empty() {
        None
    } else {
        Some(format!("{}_", templates.join("_")))
    }
}

pub(crate) fn build_output_template(
    number_playlist_items: bool,
    playlist_index: Option<u32>,
    playlist_total: Option<u32>,
    number_queue_items: bool,
    queue_index: Option<u32>,
    queue_total: Option<u32>,
    filename_metadata_enabled: bool,
    filename_metadata_fields: &[String],
) -> String {
    let item_prefix = build_playlist_prefix(number_playlist_items, playlist_index, playlist_total)
        .or_else(|| build_queue_prefix(number_queue_items, queue_index, queue_total))
        .unwrap_or_default();
    let metadata_prefix =
        build_filename_metadata_prefix(filename_metadata_enabled, filename_metadata_fields)
            .unwrap_or_default();
    format!("{item_prefix}{metadata_prefix}%(title)s.%(ext)s")
}

pub fn resolve_filename_template(template: &str) -> String {
    let mut t = template.to_string();
    t = t.replace("[Kênh]", "%(uploader)s")
        .replace("{uploader}", "%(uploader)s")
        .replace("[uploader]", "%(uploader)s")
        .replace("[Ngày đăng]", "%(upload_date>%Y-%m-%d)s")
        .replace("{upload_date}", "%(upload_date>%Y-%m-%d)s")
        .replace("[upload_date]", "%(upload_date>%Y-%m-%d)s")
        .replace("[Tiêu đề]", "%(title)s")
        .replace("{title}", "%(title)s")
        .replace("[title]", "%(title)s")
        .replace("[ID]", "%(id)s")
        .replace("{id}", "%(id)s")
        .replace("[id]", "%(id)s")
        .replace("[Lượt xem]", "%(view_count)s")
        .replace("{view_count}", "%(view_count)s")
        .replace("[view_count]", "%(view_count)s")
        .replace("[Độ phân giải]", "%(height)sp")
        .replace("{resolution}", "%(height)sp")
        .replace("[resolution]", "%(height)sp");
    if !t.ends_with(".%(ext)s") && !t.ends_with(".%(ext)") {
        t = format!("{}.%(ext)s", t.trim_end_matches('.'));
    }
    t
}

pub(crate) fn build_chapter_output_template(
    number_playlist_items: bool,
    playlist_index: Option<u32>,
    playlist_total: Option<u32>,
    number_queue_items: bool,
    queue_index: Option<u32>,
    queue_total: Option<u32>,
    number_chapter_files: bool,
) -> String {
    let item_prefix = build_playlist_prefix(number_playlist_items, playlist_index, playlist_total)
        .or_else(|| build_queue_prefix(number_queue_items, queue_index, queue_total))
        .unwrap_or_default();
    let chapter_prefix = if number_chapter_files {
        "%(section_number)02d - "
    } else {
        ""
    };
    format!("{item_prefix}{chapter_prefix}%(section_title)s.%(ext)s")
}

pub(crate) fn output_path_arg(output_path: &str) -> String {
    format!("home:{output_path}")
}

pub(crate) fn build_auto_collection_names(
    enabled: bool,
    playlist_collection_name: Option<&str>,
    split_embedded_chapters: bool,
    parent_title: Option<&str>,
) -> Vec<String> {
    if !enabled {
        return Vec::new();
    }

    let mut names = Vec::new();
    for raw_name in [
        playlist_collection_name,
        split_embedded_chapters.then_some(parent_title).flatten(),
    ]
    .into_iter()
    .flatten()
    {
        let name = raw_name.trim();
        if name.is_empty() {
            continue;
        }
        let normalized = name.to_lowercase();
        if names
            .iter()
            .any(|existing: &String| existing.trim().to_lowercase() == normalized)
        {
            continue;
        }
        names.push(name.to_string());
    }
    names
}

pub(crate) fn assign_history_auto_collections(history_id: &str, collection_names: &[String]) {
    for collection_name in collection_names {
        let result =
            ensure_collection_for_download_in_db(collection_name, None).and_then(|collection| {
                add_history_collection_in_db(history_id.to_string(), collection.id)
            });
        if let Err(error) = result {
            add_log_internal(
                "error",
                "Failed to organize download into collection",
                Some(&error),
                None,
            )
            .ok();
        }
    }
}


pub(crate) fn title_from_filepath(filepath: &str) -> Option<String> {
    std::path::Path::new(filepath)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

pub(crate) fn display_title_for_download(
    metadata_title: Option<String>,
    current_title: Option<String>,
    final_filepath: &Option<String>,
    total_count: Option<u32>,
) -> Option<String> {
    let filepath_title = || {
        final_filepath
            .as_ref()
            .and_then(|path| title_from_filepath(path))
    };

    if total_count.unwrap_or(1) > 1 {
        current_title.or_else(filepath_title).or(metadata_title)
    } else {
        metadata_title.or_else(filepath_title).or(current_title)
    }
}

#[cfg(test)]
mod display_title_tests {
    use super::*;

    #[test]


    fn single_download_display_title_keeps_unicode_metadata_title() {
        let title = display_title_for_download(
            Some("Machiot - Đổi Nhạc Nền Vol. 2".to_string()),
            Some("Machiot - i Nhc Nn Vol. 2".to_string()),
            &None,
            None,
        );

        assert_eq!(title.as_deref(), Some("Machiot - Đổi Nhạc Nền Vol. 2"));
    }

    #[test]
    fn single_download_display_title_prefers_utf8_filepath_over_stdout_title() {
        let filepath = Some("Machiot - Đổi Nhạc Nền Vol. 2.mp4".to_string());
        let title = display_title_for_download(
            None,
            Some("Machiot - i Nhc Nn Vol. 2".to_string()),
            &filepath,
            None,
        );

        assert_eq!(title.as_deref(), Some("Machiot - Đổi Nhạc Nền Vol. 2"));
    }

    #[test]
    fn playlist_display_title_keeps_current_item_title() {
        let filepath = Some("Playlist name.mp4".to_string());
        let title = display_title_for_download(
            Some("Playlist name".to_string()),
            Some("Video item title".to_string()),
            &filepath,
            Some(3),
        );

        assert_eq!(title.as_deref(), Some("Video item title"));
    }
}

#[cfg(test)]
mod playlist_chapter_tests {
    use super::*;

    #[test]
    fn output_template_is_unchanged_when_numbering_is_off() {
        assert_eq!(
            build_output_template(false, None, None, false, None, None, false, &[]),
            "%(title)s.%(ext)s"
        );
    }

    #[test]
    fn output_template_uses_frontend_playlist_index_for_expanded_playlist_items() {
        assert_eq!(
            build_output_template(true, Some(3), Some(120), false, None, None, false, &[]),
            "003 - %(title)s.%(ext)s"
        );
    }

    #[test]
    fn output_template_uses_frontend_queue_index_for_regular_queue_items() {
        assert_eq!(
            build_output_template(false, None, None, true, Some(7), Some(42), false, &[]),
            "07 - %(title)s.%(ext)s"
        );
    }

    #[test]
    fn output_template_prefers_playlist_index_over_queue_index() {
        assert_eq!(
            build_output_template(
                true,
                Some(3),
                Some(120),
                true,
                Some(7),
                Some(42),
                false,
                &[]
            ),
            "003 - %(title)s.%(ext)s"
        );
    }

    #[test]
    fn output_template_adds_allowlisted_filename_metadata_prefix() {
        let fields = vec!["uploadDate".to_string(), "viewCount".to_string()];

        assert_eq!(
            build_output_template(false, None, None, false, None, None, true, &fields),
            "%(upload_date>%Y-%m-%d)s_%(view_count)sviews_%(title)s.%(ext)s"
        );
    }

    #[test]
    fn output_template_keeps_numbering_before_filename_metadata() {
        let fields = vec!["videoId".to_string()];

        assert_eq!(
            build_output_template(
                true,
                Some(3),
                Some(120),
                true,
                Some(7),
                Some(42),
                true,
                &fields
            ),
            "003 - %(id)s_%(title)s.%(ext)s"
        );
    }

    #[test]
    fn output_template_ignores_unknown_filename_metadata_fields() {
        let fields = vec![
            "uploadDate".to_string(),
            "output".to_string(),
            "--cookies".to_string(),
            "uploadDate".to_string(),
        ];

        assert_eq!(
            build_output_template(false, None, None, false, None, None, true, &fields),
            "%(upload_date>%Y-%m-%d)s_%(title)s.%(ext)s"
        );
    }

    #[test]
    fn chapter_template_numbers_chapters_without_playlist_prefix() {
        assert_eq!(
            build_chapter_output_template(false, None, None, false, None, None, true),
            "%(section_number)02d - %(section_title)s.%(ext)s"
        );
    }

    #[test]
    fn chapter_template_uses_playlist_and_chapter_numbers_when_both_are_enabled() {
        assert_eq!(
            build_chapter_output_template(true, Some(3), Some(120), false, None, None, true),
            "003 - %(section_number)02d - %(section_title)s.%(ext)s"
        );
    }

    #[test]
    fn output_path_arg_uses_ytdlp_home_path_slot() {
        assert_eq!(
            output_path_arg("C:/very/long/folder"),
            "home:C:/very/long/folder"
        );
    }

    #[test]

    fn auto_collection_names_are_default_off() {
        assert!(
            build_auto_collection_names(false, Some("Playlist"), true, Some("Video")).is_empty()
        );
    }

    #[test]
    fn auto_collection_names_include_playlist_and_split_parent() {
        assert_eq!(
            build_auto_collection_names(true, Some("Playlist"), true, Some("Video")),
            vec!["Playlist".to_string(), "Video".to_string()]
        );
    }

    #[test]
    fn auto_collection_names_dedupe_playlist_and_parent() {
        assert_eq!(
            build_auto_collection_names(true, Some("Same Name"), true, Some(" same name ")),
            vec!["Same Name".to_string()]
        );
    }
}
