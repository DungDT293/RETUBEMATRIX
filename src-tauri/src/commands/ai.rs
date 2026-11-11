use crate::database::update_history_summary;
use crate::services::{
    generate_ai_text, generate_summary_custom_with_hooks, get_deno_path, run_ytdlp_json,
    test_connection, AIConfig, LongSummaryFormat, LongSummaryHooks, LongSummaryProgress,
    SummaryStyle,
};
use crate::types::BackendError;
use crate::utils::{normalize_url, validate_url};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

static CANCELLED_SUMMARY_REQUESTS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn cancelled_summary_requests() -> &'static Mutex<HashSet<String>> {
    CANCELLED_SUMMARY_REQUESTS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn normalize_request_id(request_id: Option<String>) -> Option<String> {
    request_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn clear_cancelled_summary_request(request_id: Option<&str>) {
    if let Some(request_id) = request_id {
        if let Ok(mut requests) = cancelled_summary_requests().lock() {
            requests.remove(request_id);
        }
    }
}

fn take_cancelled_summary_request(request_id: Option<&str>) -> bool {
    request_id
        .and_then(|request_id| {
            cancelled_summary_requests()
                .lock()
                .ok()
                .map(|mut requests| requests.remove(request_id))
        })
        .unwrap_or(false)
}

fn is_summary_request_cancelled(request_id: &str) -> bool {
    cancelled_summary_requests()
        .lock()
        .map(|requests| requests.contains(request_id))
        .unwrap_or(false)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryProgressPayload {
    request_id: String,
    stage: String,
    chunk_index: Option<usize>,
    chunk_count: usize,
}

async fn generate_summary_with_progress(
    app: &AppHandle,
    config: &AIConfig,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    long_summary_format: &LongSummaryFormat,
    long_summary_words: Option<u32>,
    request_id: Option<String>,
) -> Result<crate::services::SummaryResult, String> {
    let request_id = normalize_request_id(request_id);
    if take_cancelled_summary_request(request_id.as_deref()) {
        return Err(crate::services::AIError::Cancelled.to_wire_string());
    }
    let progress_request_id = request_id.clone();
    let progress_app = app.clone();
    let progress = move |progress: LongSummaryProgress| {
        if let Some(request_id) = progress_request_id.as_deref() {
            let payload = SummaryProgressPayload {
                request_id: request_id.to_string(),
                stage: progress.stage.to_string(),
                chunk_index: progress.chunk_index,
                chunk_count: progress.chunk_count,
            };
            progress_app.emit("summary-progress", payload).ok();
        }
    };
    let cancel_request_id = request_id.clone();
    let should_cancel = move || {
        cancel_request_id
            .as_deref()
            .map(is_summary_request_cancelled)
            .unwrap_or(false)
    };
    let hooks = LongSummaryHooks {
        progress: request_id
            .as_ref()
            .map(|_| &progress as &(dyn Fn(LongSummaryProgress) + Send + Sync)),
        should_cancel: request_id
            .as_ref()
            .map(|_| &should_cancel as &(dyn Fn() -> bool + Send + Sync)),
    };

    let result = generate_summary_custom_with_hooks(
        config,
        transcript,
        style,
        language,
        title,
        long_summary_format,
        long_summary_words,
        &hooks,
    )
    .await
    .map_err(|e| e.to_wire_string());
    clear_cancelled_summary_request(request_id.as_deref());
    result
}

/// Get the AI config file path
fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    Ok(app_data_dir.join("ai_config.json"))
}

/// Save AI configuration
#[tauri::command]
pub async fn save_ai_config(app: AppHandle, config: AIConfig) -> Result<(), String> {
    let path = get_config_path(&app)?;
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

/// Load AI configuration
#[tauri::command]
pub async fn get_ai_config(app: AppHandle) -> Result<AIConfig, String> {
    let path = get_config_path(&app)?;

    if !path.exists() {
        return Ok(AIConfig::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;

    let config: AIConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config)
}

/// Test AI connection
#[tauri::command]
pub async fn test_ai_connection(config: AIConfig) -> Result<String, String> {
    test_connection(&config)
        .await
        .map_err(|e| e.to_wire_string())
}

/// Generate summary for a video transcript
#[tauri::command]
pub async fn generate_video_summary(
    app: AppHandle,
    transcript: String,
    history_id: Option<String>,
    title: Option<String>,
    request_id: Option<String>,
) -> Result<String, String> {
    let config = get_ai_config(app.clone()).await?;

    if !config.enabled {
        return Err("AI features are disabled. Enable them in Settings.".to_string());
    }

    let result = generate_summary_with_progress(
        &app,
        &config,
        &transcript,
        &config.summary_style,
        &config.summary_language,
        title.as_deref(),
        &LongSummaryFormat::Auto,
        None,
        request_id,
    )
    .await?;

    // If history_id is provided, save summary to database
    if let Some(id) = history_id {
        update_history_summary(id, result.summary.clone())?;
    }

    Ok(result.summary)
}

/// Generate summary with custom style and language options
#[tauri::command]
pub async fn generate_summary_with_options(
    app: AppHandle,
    transcript: String,
    style: String,
    language: String,
    title: Option<String>,
    long_summary_format: Option<String>,
    long_summary_words: Option<u32>,
    request_id: Option<String>,
) -> Result<SummaryResult, String> {
    let config = get_ai_config(app.clone()).await?;

    if !config.enabled {
        return Err("AI features are disabled. Enable them in Settings.".to_string());
    }

    // Parse style string to enum
    let summary_style = match style.to_lowercase().as_str() {
        "short" => SummaryStyle::Short,
        "concise" => SummaryStyle::Concise,
        "detailed" => SummaryStyle::Detailed,
        _ => SummaryStyle::Concise,
    };
    let long_summary_format = parse_long_summary_format(long_summary_format.as_deref());

    let result = generate_summary_with_progress(
        &app,
        &config,
        &transcript,
        &summary_style,
        &language,
        title.as_deref(),
        &long_summary_format,
        long_summary_words,
        request_id,
    )
    .await?;

    Ok(SummaryResult {
        summary: result.summary,
    })
}

fn parse_long_summary_format(value: Option<&str>) -> LongSummaryFormat {
    match value.unwrap_or("auto").to_lowercase().as_str() {
        "final" | "final-summary" => LongSummaryFormat::Final,
        "parts" | "by-parts" => LongSummaryFormat::Parts,
        _ => LongSummaryFormat::Auto,
    }
}

#[tauri::command]
pub fn cancel_summary_generation(request_id: String) -> Result<(), String> {
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return Ok(());
    }

    cancelled_summary_requests()
        .lock()
        .map_err(|e| format!("Failed to lock summary cancellation state: {}", e))?
        .insert(request_id.to_string());
    Ok(())
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct SummaryResult {
    pub summary: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_CANCEL_MUTEX: Mutex<()> = Mutex::new(());

    fn reset_cancelled_summary_requests() {
        cancelled_summary_requests().lock().unwrap().clear();
    }

    #[test]
    fn take_cancelled_summary_request_consumes_existing_marker() {
        let _guard = TEST_CANCEL_MUTEX.lock().unwrap();
        reset_cancelled_summary_requests();
        cancel_summary_generation("summary-race".to_string()).unwrap();

        assert!(take_cancelled_summary_request(Some("summary-race")));
        assert!(!take_cancelled_summary_request(Some("summary-race")));

        reset_cancelled_summary_requests();
    }

    #[test]
    fn clear_cancelled_summary_request_removes_marker_after_completion() {
        let _guard = TEST_CANCEL_MUTEX.lock().unwrap();
        reset_cancelled_summary_requests();
        cancel_summary_generation("summary-complete".to_string()).unwrap();

        clear_cancelled_summary_request(Some("summary-complete"));

        assert!(!take_cancelled_summary_request(Some("summary-complete")));

        reset_cancelled_summary_requests();
    }

    #[test]
    fn test_local_viral_titles_vietnamese() {
        let start = std::time::Instant::now();
        let sample_title = "Cách làm bánh mì tại nhà";
        let res = generate_local_viral_titles(
            sample_title,
            Some("Ẩm thực"),
            Some(&["Bánh mì Sài Gòn".to_string()]),
        );
        let elapsed = start.elapsed();

        // Must return in < 50ms (virtually instantaneous local fallback)
        assert!(elapsed < std::time::Duration::from_millis(50), "Local fallback took too long: {:?}", elapsed);
        assert_eq!(res.variants.len(), 5, "Must generate exactly 5 variants");
        assert_eq!(res.source, "local_nlp_fallback");
        assert_eq!(res.original_title, sample_title);

        for v in &res.variants {
            assert!(!v.title.trim().is_empty(), "Title variant cannot be empty");
            assert!(v.estimated_ctr.starts_with('+'), "Estimated CTR should be formatted like +42%");
            assert!(!v.psychological_trigger.trim().is_empty(), "Trigger cannot be empty");
            assert!(v.title.contains("Cách làm bánh mì tại nhà"), "Must preserve 90-95% core keywords at front");
            assert!(!v.title.contains("⚠️ CẢNH BÁO"), "Must not prepend rigid clickbait");
            assert!(!v.title.contains("Tôi đã thử"), "Must not prepend rigid clickbait");
        }
    }

    #[test]
    fn test_local_viral_titles_english() {
        let start = std::time::Instant::now();
        let sample_title = "How to build a SaaS in 7 days";
        let res = generate_local_viral_titles(
            sample_title,
            Some("Technology"),
            Some(&["Startup".to_string()]),
        );
        let elapsed = start.elapsed();

        assert!(elapsed < std::time::Duration::from_millis(50));
        assert_eq!(res.variants.len(), 5);
        assert_eq!(res.source, "local_nlp_fallback");

        for v in &res.variants {
            assert!(!v.title.trim().is_empty());
            assert!(v.estimated_ctr.starts_with('+'));
            assert!(!v.psychological_trigger.trim().is_empty());
            assert!(v.title.contains("How to build a SaaS in 7 days"), "Must preserve 90-95% core keywords at front");
            assert!(!v.title.contains("Stop Doing This"), "Must not prepend rigid clickbait");
            assert!(!v.title.contains("Dead Wrong"), "Must not prepend rigid clickbait");
        }
    }

    #[test]
    fn test_detect_genre() {
        assert_eq!(detect_genre("CONTROL AURA 2 HOURS OF VIRAL AURA PHONK AGGRESSIVE"), "music");
        assert_eq!(detect_genre("Deep House Remix Bass Boosted 2026"), "music");
        assert_eq!(detect_genre("Chill Lofi Beats To Study To"), "music");
        assert_eq!(detect_genre("Nhạc Lofi Buồn Tâm Trạng"), "music");
        assert_eq!(detect_genre("Bản Phối Mới Nhất 2026"), "music");
        assert_eq!(detect_genre("Elden Ring Walkthrough Gameplay Part 1"), "gaming");
        assert_eq!(detect_genre("How to make sourdough bread"), "howto");
        assert_eq!(detect_genre("Hướng dẫn lập trình Rust cơ bản"), "howto");
        assert_eq!(detect_genre("My Trip to Tokyo Vlog"), "general");
    }

    #[test]
    fn test_local_viral_titles_music_english() {
        let sample_title = "CONTROL AURA 2 HOURS OF VIRAL AURA PHONK AGGRESSIVE";
        let res = generate_local_viral_titles(
            sample_title,
            Some("Phonk Music"),
            Some(&["Drift Phonk".to_string()]),
        );

        assert_eq!(res.variants.len(), 5);
        let formulas: Vec<_> = res.variants.iter().map(|v| v.formula.as_str()).collect();
        assert!(formulas.contains(&"Edition / Format"));
        assert!(formulas.contains(&"Bass / Energy"));
        assert!(formulas.contains(&"Curated Playlist / Mix"));
        assert!(formulas.contains(&"Audio Release / Visualizer"));
        assert!(formulas.contains(&"Niche Trigger / Purpose"));

        for v in &res.variants {
            assert!(!v.title.contains("Stop Doing This"), "Should not contain vlog clickbait");
            assert!(!v.title.contains("Dead Wrong"), "Should not contain vlog clickbait");
            assert!(v.title.contains("CONTROL AURA 2 HOURS OF VIRAL AURA PHONK AGGRESSIVE"), "Should preserve 90-95% core keywords");
        }

        assert!(res.variants.iter().any(|v| v.title.contains("[Slowed + Reverb]")));
        assert!(res.variants.iter().any(|v| v.title.contains("[Bass Boosted Edition]")));
        assert!(res.variants.iter().any(|v| v.title.contains("Best Viral Phonk Mix 2026")));
        assert!(res.variants.iter().any(|v| v.title.contains("(Official Audio Visualizer)")));
        assert!(res.variants.iter().any(|v| v.title.contains("[Drift Phonk]")));
    }

    #[test]
    fn test_local_viral_titles_music_vietnamese() {
        let sample_title = "Nhạc Lofi Chill Buồn Tâm Trạng";
        let res = generate_local_viral_titles(
            sample_title,
            Some("Âm nhạc"),
            None,
        );

        assert_eq!(res.variants.len(), 5);
        let formulas: Vec<_> = res.variants.iter().map(|v| v.formula.as_str()).collect();
        assert!(formulas.contains(&"Edition / Format"));
        assert!(formulas.contains(&"Bass / Energy"));
        assert!(formulas.contains(&"Curated Playlist / Mix"));
        assert!(formulas.contains(&"Audio Release / Visualizer"));
        assert!(formulas.contains(&"Niche Trigger / Purpose"));

        assert!(res.variants.iter().any(|v| v.title.contains("[Bản Phối Mới 2026]")));
        assert!(res.variants.iter().any(|v| v.title.contains("(Remix Bass Cực Căng)")));
        assert!(res.variants.iter().any(|v| v.title.contains("| Nhạc Chill Thư Giãn")));
        assert!(res.variants.iter().any(|v| v.title.contains("(Official Audio)")));
        assert!(res.variants.iter().any(|v| v.title.contains("[Tuyển Tập Hay Nhất 2026]")));
    }

    #[test]
    fn test_local_smart_description() {
        let start = std::time::Instant::now();
        let res = generate_local_smart_description(
            "Cách làm bánh mì tại nhà",
            Some("Ẩm thực"),
            Some(&["banhmi".to_string(), "monngon".to_string()]),
            Some("Bếp Cô Ba"),
        );
        let elapsed = start.elapsed();

        assert!(elapsed < std::time::Duration::from_millis(50));
        assert_eq!(res.source, "local_nlp_fallback");
        assert!(!res.tier1_hook_seo.is_empty());
        assert!(!res.tier2_summary_chapters.is_empty());
        assert!(!res.tier3_cta_credits.is_empty());
        assert_eq!(res.tier4_hashtags.len(), 13, "Should have 13 hashtags");
        assert!(!res.full_description.is_empty());
    }

    #[test]
    fn test_local_hook_analysis() {
        let start = std::time::Instant::now();
        let res = generate_local_hook_analysis(
            "Cách làm bánh mì tại nhà",
            Some("Chào mừng các bạn đến với kênh"),
            Some("Ẩm thực"),
        );
        let elapsed = start.elapsed();

        assert!(elapsed < std::time::Duration::from_millis(50));
        assert_eq!(res.source, "local_nlp_fallback");
        assert_eq!(res.remake_hooks.len(), 3);
        assert!(!res.hook_diagnosis.is_empty());
        assert!(!res.predicted_retention_risk.is_empty());
        assert!(res.target_avd_goal.contains(">70%"));

        let hook_types: Vec<_> = res.remake_hooks.iter().map(|h| h.hook_type.as_str()).collect();
        assert!(hook_types.contains(&"Visual Hook"));
        assert!(hook_types.contains(&"Audio Hook"));
        assert!(hook_types.contains(&"Curiosity Statement"));
    }

    #[tokio::test]
    async fn test_ai_quick_command_timeout_duration() {
        assert_eq!(AI_QUICK_COMMAND_TIMEOUT, std::time::Duration::from_millis(2500));

        let start = std::time::Instant::now();
        let hanging_future = async {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            "fast"
        };
        let res = tokio::time::timeout(AI_QUICK_COMMAND_TIMEOUT, hanging_future).await;
        assert_eq!(res.unwrap(), "fast");
        assert!(start.elapsed() < AI_QUICK_COMMAND_TIMEOUT);
    }
}

/// Get available AI models for a provider
#[tauri::command]
pub fn get_ai_models(provider: String) -> Vec<ModelOption> {
    match provider.to_lowercase().as_str() {
        "gemini" => vec![
            ModelOption {
                value: "gemini-2.0-flash".to_string(),
                label: "Gemini 2.0 Flash (Recommended)".to_string(),
            },
            ModelOption {
                value: "gemini-1.5-flash".to_string(),
                label: "Gemini 1.5 Flash".to_string(),
            },
            ModelOption {
                value: "gemini-2.5-pro".to_string(),
                label: "Gemini 2.5 Pro".to_string(),
            },
        ],
        "openai" => vec![
            ModelOption {
                value: "gpt-5.5".to_string(),
                label: "GPT-5.5 (Recommended)".to_string(),
            },
            ModelOption {
                value: "gpt-5.4".to_string(),
                label: "GPT-5.4".to_string(),
            },
            ModelOption {
                value: "gpt-5.4-mini".to_string(),
                label: "GPT-5.4 Mini".to_string(),
            },
        ],
        "ollama" => vec![
            ModelOption {
                value: "qwen2.5:0.5b".to_string(),
                label: "Qwen 2.5 0.5B (Siêu nhẹ - 2GB RAM)".to_string(),
            },
            ModelOption {
                value: "gpt-oss:20b".to_string(),
                label: "GPT-OSS 20B (Recommended)".to_string(),
            },
            ModelOption {
                value: "qwen3:8b".to_string(),
                label: "Qwen 3 8B".to_string(),
            },
            ModelOption {
                value: "gemma3:12b".to_string(),
                label: "Gemma 3 12B".to_string(),
            },
        ],
        "lmstudio" => vec![
            ModelOption {
                value: "qwen2.5-0.5b-instruct".to_string(),
                label: "Qwen 2.5 0.5B (Siêu nhẹ - 2GB RAM)".to_string(),
            },
            ModelOption {
                value: "openai/gpt-oss-20b".to_string(),
                label: "GPT-OSS 20B (Recommended)".to_string(),
            },
            ModelOption {
                value: "qwen/qwen3-8b".to_string(),
                label: "Qwen 3 8B".to_string(),
            },
            ModelOption {
                value: "google/gemma-3-12b".to_string(),
                label: "Gemma 3 12B".to_string(),
            },
        ],
        "deepseek" => vec![
            ModelOption {
                value: "deepseek-v4-flash".to_string(),
                label: "DeepSeek V4 Flash (Recommended)".to_string(),
            },
            ModelOption {
                value: "deepseek-v4-pro".to_string(),
                label: "DeepSeek V4 Pro".to_string(),
            },
        ],
        "qwen" => vec![
            ModelOption {
                value: "qwen-2.5-0.5b".to_string(),
                label: "Qwen 2.5 0.5B (Siêu nhẹ - 2GB RAM)".to_string(),
            },
            ModelOption {
                value: "qwen3-max".to_string(),
                label: "Qwen 3 Max (Recommended)".to_string(),
            },
            ModelOption {
                value: "qwen3.5-plus".to_string(),
                label: "Qwen 3.5 Plus".to_string(),
            },
            ModelOption {
                value: "qwen3.5-flash".to_string(),
                label: "Qwen 3.5 Flash".to_string(),
            },
        ],
        "proxy" => vec![
            ModelOption {
                value: "gpt-5.5".to_string(),
                label: "GPT-5.5 (Recommended)".to_string(),
            },
            ModelOption {
                value: "gpt-5.4".to_string(),
                label: "GPT-5.4".to_string(),
            },
            ModelOption {
                value: "gpt-5.4-mini".to_string(),
                label: "GPT-5.4 Mini".to_string(),
            },
            ModelOption {
                value: "gemini-2.0-flash".to_string(),
                label: "Gemini 2.0 Flash".to_string(),
            },
            ModelOption {
                value: "deepseek-v4-flash".to_string(),
                label: "DeepSeek V4 Flash".to_string(),
            },
            ModelOption {
                value: "qwen3.5-plus".to_string(),
                label: "Qwen 3.5 Plus".to_string(),
            },
        ],
        _ => vec![],
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ModelOption {
    pub value: String,
    pub label: String,
}

/// Get available summary languages
#[tauri::command]
pub fn get_summary_languages() -> Vec<LanguageOption> {
    vec![
        LanguageOption {
            value: "auto".to_string(),
            label: "Auto (Same as video)".to_string(),
        },
        LanguageOption {
            value: "en".to_string(),
            label: "English".to_string(),
        },
        LanguageOption {
            value: "vi".to_string(),
            label: "Vietnamese".to_string(),
        },
        LanguageOption {
            value: "ja".to_string(),
            label: "Japanese".to_string(),
        },
        LanguageOption {
            value: "ko".to_string(),
            label: "Korean".to_string(),
        },
        LanguageOption {
            value: "zh".to_string(),
            label: "Chinese".to_string(),
        },
        LanguageOption {
            value: "es".to_string(),
            label: "Spanish".to_string(),
        },
        LanguageOption {
            value: "fr".to_string(),
            label: "French".to_string(),
        },
        LanguageOption {
            value: "de".to_string(),
            label: "German".to_string(),
        },
        LanguageOption {
            value: "pt".to_string(),
            label: "Portuguese".to_string(),
        },
        LanguageOption {
            value: "ru".to_string(),
            label: "Russian".to_string(),
        },
    ]
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct LanguageOption {
    pub value: String,
    pub label: String,
}

// =========================================================================
// AI SUITE UPGRADES: VIRAL TITLE, SMART DESCRIPTION, DEEP HOOK ANALYZER
// =========================================================================

pub const AI_QUICK_COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(2500);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleVariantItem {
    pub formula: String,
    pub title: String,
    pub estimated_ctr: String,
    pub psychological_trigger: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTitleVariants {
    pub original_title: String,
    pub variants: Vec<TitleVariantItem>,
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartDescriptionResult {
    pub tier1_hook_seo: String,
    pub tier2_summary_chapters: String,
    pub tier3_cta_credits: String,
    pub tier4_hashtags: Vec<String>,
    pub full_description: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookScriptItem {
    pub hook_type: String,
    pub duration_seconds: u32,
    pub script: String,
    pub visual_action: String,
    pub retention_strategy: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookAnalysisResult {
    pub title: String,
    pub hook_diagnosis: String,
    pub predicted_retention_risk: String,
    pub target_avd_goal: String,
    pub remake_hooks: Vec<HookScriptItem>,
    pub source: String,
}

fn extract_json_payload(raw: &str) -> Option<&str> {
    let trimmed = raw.trim();
    if let Some(start) = trimmed.find("```json") {
        let after = &trimmed[start + 7..];
        if let Some(end) = after.find("```") {
            return Some(after[..end].trim());
        }
    } else if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        if let Some(end) = after.find("```") {
            return Some(after[..end].trim());
        }
    }
    if (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
    {
        return Some(trimmed);
    }
    if let (Some(first), Some(last)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if first < last {
            return Some(&trimmed[first..=last]);
        }
    }
    None
}

fn is_vietnamese_text(text: &str) -> bool {
    let lower = text.to_lowercase();
    let vn_chars = [
        'à', 'á', 'ả', 'ã', 'ạ', 'ă', 'ằ', 'ắ', 'ẳ', 'ẵ', 'ặ', 'â', 'ầ', 'ấ', 'ẩ', 'ẫ', 'ậ',
        'è', 'é', 'ẻ', 'ẽ', 'ẹ', 'ê', 'ề', 'ế', 'ể', 'ễ', 'ệ',
        'ì', 'í', 'ỉ', 'ĩ', 'ị',
        'ò', 'ó', 'ỏ', 'õ', 'ọ', 'ô', 'ồ', 'ố', 'ổ', 'ỗ', 'ộ', 'ơ', 'ờ', 'ớ', 'ở', 'ỡ', 'ợ',
        'ù', 'ú', 'ủ', 'ũ', 'ụ', 'ư', 'ừ', 'ứ', 'ử', 'ữ', 'ự',
        'ỳ', 'ý', 'ỷ', 'ỹ', 'ỵ', 'đ',
    ];
    lower.chars().any(|c| vn_chars.contains(&c))
}

fn extract_core_topic(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "Nội Dung Đột Phá".to_string();
    }
    let re_hashtag = regex::Regex::new(r"#[^\s]+").ok();
    let without_hashtags = if let Some(re) = re_hashtag {
        re.replace_all(trimmed, "").to_string()
    } else {
        trimmed.to_string()
    };

    let re_bracket = regex::Regex::new(r"\[[^\]]*\]|\([^\)]*\)|\{[^\}]*\}").ok();
    let without_brackets = if let Some(re) = re_bracket {
        re.replace_all(&without_hashtags, "").to_string()
    } else {
        without_hashtags
    };
    
    let parts: Vec<&str> = without_brackets
        .split(|c| c == '|' || c == '—' || c == '–' || c == '•' || c == '~' || c == ':')
        .collect();
    let candidate = parts.first().copied().unwrap_or(without_brackets.as_str()).trim();
    let cleaned = candidate
        .trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace() || c == '#')
        .trim();
    if cleaned.len() < 3 {
        trimmed.to_string()
    } else {
        cleaned.to_string()
    }
}

pub fn detect_genre(title: &str) -> &'static str {
    let lower = title.to_lowercase();
    let music_kw = [
        "phonk", "remix", "edm", "bass", "song", "music", "audio", "jazz",
        "chill", "lofi", "lo-fi", "beat", "instrumental", "soundtrack", "ost",
        "synthwave", "trap", "ambient", "playlist", "track", "rap", "hiphop",
        "hip-hop", "pop", "rock", "bản phối", "nhạc", "ca khúc", "bài hát",
    ];
    let gaming_kw = [
        "gameplay", "walkthrough", "mod", "playthrough", "speedrun", "gaming",
    ];
    let howto_kw = [
        "how to", "tutorial", "guide", "hướng dẫn", "cách làm", "cách để",
    ];

    if music_kw.iter().any(|&k| lower.contains(k)) {
        "music"
    } else if gaming_kw.iter().any(|&k| lower.contains(k)) {
        "gaming"
    } else if howto_kw.iter().any(|&k| lower.contains(k)) {
        "howto"
    } else {
        "general"
    }
}

pub(crate) fn generate_local_viral_titles(
    original_title: &str,
    niche: Option<&str>,
    competitor_keywords: Option<&[String]>,
) -> AiTitleVariants {
    let core = extract_core_topic(original_title);
    let is_vn = is_vietnamese_text(original_title);

    let mut genre = detect_genre(original_title);
    if genre == "general" {
        if let Some(n) = niche {
            let n_genre = detect_genre(n);
            if n_genre != "general" {
                genre = n_genre;
            }
        }
    }

    let extra_kw = competitor_keywords
        .and_then(|kw| kw.first())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let variants = if genre == "music" {
        if is_vn {
            vec![
                TitleVariantItem {
                    formula: "Edition / Format".to_string(),
                    title: format!("{} [Bản Phối Mới 2026]", core),
                    estimated_ctr: "+42%".to_string(),
                    psychological_trigger: "Bản Phối & Phiên Bản Mới (Thu hút người nghe tìm kiếm âm hưởng hiện đại, mới lạ)".to_string(),
                },
                TitleVariantItem {
                    formula: "Bass / Energy".to_string(),
                    title: format!("{} (Remix Bass Cực Căng)", core),
                    estimated_ctr: "+48%".to_string(),
                    psychological_trigger: "Năng Lượng Âm Thanh (Đánh trúng thị hiếu thích bass mạnh, giai điệu sôi động)".to_string(),
                },
                TitleVariantItem {
                    formula: "Curated Playlist / Mix".to_string(),
                    title: match extra_kw {
                        Some(kw) => format!("{} | Tuyển Tập {} Hay Nhất", core, kw),
                        None => format!("{} | Nhạc Chill Thư Giãn", core),
                    },
                    estimated_ctr: "+39%".to_string(),
                    psychological_trigger: "Tuyển Tập Trải Nghiệm (Phục vụ nhu cầu nghe thư giãn, tập trung làm việc kéo dài)".to_string(),
                },
                TitleVariantItem {
                    formula: "Audio Release / Visualizer".to_string(),
                    title: format!("{} (Official Audio)", core),
                    estimated_ctr: "+36%".to_string(),
                    psychological_trigger: "Chất Lượng Chính Thức (Tạo độ tin cậy cao về chất lượng âm thanh gốc chuẩn studio)".to_string(),
                },
                TitleVariantItem {
                    formula: "Niche Trigger / Purpose".to_string(),
                    title: match extra_kw {
                        Some(kw) => format!("{} [{}]", core, kw),
                        None => format!("{} [Tuyển Tập Hay Nhất 2026]", core),
                    },
                    estimated_ctr: "+45%".to_string(),
                    psychological_trigger: "Định Hướng Ngữ Cảnh (Tối ưu từ khóa tìm kiếm theo tâm trạng và gu thưởng thức)".to_string(),
                },
            ]
        } else {
            let kw_format = competitor_keywords
                .and_then(|kws| kws.iter().find(|k| {
                    let kl = k.to_lowercase();
                    kl.contains("slow") || kl.contains("reverb") || kl.contains("sped") || kl.contains("remix")
                }))
                .map(|s| s.trim());

            let v1_title = match kw_format {
                Some(kw) => format!("{} [{}]", core, kw),
                None => format!("{} [Slowed + Reverb]", core),
            };

            let lower_core = core.to_lowercase();
            let mix_suffix = if lower_core.contains("phonk") {
                "Best Viral Phonk Mix 2026"
            } else if lower_core.contains("lofi") || lower_core.contains("lo-fi") || lower_core.contains("chill") {
                "Best Lofi Chill Beats 2026"
            } else if lower_core.contains("jazz") || lower_core.contains("christmas") {
                "Cozy Holiday Jazz Mix 2026"
            } else if lower_core.contains("edm") {
                "Best EDM Festival Mix 2026"
            } else {
                "Best Viral Music Mix 2026"
            };

            let v5_title = match extra_kw {
                Some(kw) if !kw.to_lowercase().contains("slow") && !kw.to_lowercase().contains("bass") => {
                    format!("{} [{}]", core, kw)
                }
                _ => {
                    if lower_core.contains("lofi") || lower_core.contains("chill") {
                        format!("{} [Late Night Study / Relax]", core)
                    } else if lower_core.contains("jazz") || lower_core.contains("christmas") {
                        format!("{} [Cozy Holiday Mix]", core)
                    } else {
                        format!("{} [Gym Workout Motivation]", core)
                    }
                }
            };

            vec![
                TitleVariantItem {
                    formula: "Edition / Format".to_string(),
                    title: v1_title,
                    estimated_ctr: "+42%".to_string(),
                    psychological_trigger: "Format & Aesthetic Variant (Captures search traffic for slowed/reverb/remix editions)".to_string(),
                },
                TitleVariantItem {
                    formula: "Bass / Energy".to_string(),
                    title: format!("{} [Bass Boosted Edition]", core),
                    estimated_ctr: "+48%".to_string(),
                    psychological_trigger: "Acoustic Power & Dopamine Rush (Attracts listeners seeking intense drop and bass response)".to_string(),
                },
                TitleVariantItem {
                    formula: "Curated Playlist / Mix".to_string(),
                    title: format!("{} | {}", core, mix_suffix),
                    estimated_ctr: "+39%".to_string(),
                    psychological_trigger: "Curated Compilation Appeal (Signals uninterrupted streaming and viral track discovery)".to_string(),
                },
                TitleVariantItem {
                    formula: "Audio Release / Visualizer".to_string(),
                    title: format!("{} (Official Audio Visualizer)", core),
                    estimated_ctr: "+36%".to_string(),
                    psychological_trigger: "Official Authority & High Fidelity (Establishes pristine sound quality and visual aesthetic)".to_string(),
                },
                TitleVariantItem {
                    formula: "Niche Trigger / Purpose".to_string(),
                    title: v5_title,
                    estimated_ctr: "+45%".to_string(),
                    psychological_trigger: "Contextual Search Intent (Connects audio to workout, driving, gaming, or focus routines)".to_string(),
                },
            ]
        }
    } else if genre == "gaming" {
        if is_vn {
            vec![
                TitleVariantItem {
                    formula: "Highlights Đỉnh Cao".to_string(),
                    title: format!("{} | Highlight Đỉnh Cao 2026", core),
                    estimated_ctr: "+44%".to_string(),
                    psychological_trigger: "Thu hút người xem tìm kiếm pha xử lý xuất thần nhất".to_string(),
                },
                TitleVariantItem {
                    formula: "Full Trận Đấu".to_string(),
                    title: format!("{} (Full Trận Đấu Mãn Nhãn)", core),
                    estimated_ctr: "+41%".to_string(),
                    psychological_trigger: "Đáp ứng nhu cầu xem trọn vẹn diễn biến trận đấu".to_string(),
                },
                TitleVariantItem {
                    formula: "Chiến Thuật Pro".to_string(),
                    title: match extra_kw {
                        Some(kw) => format!("{} [Chiến Thuật {}]", core, kw),
                        None => format!("{} [Pha Xử Lý Không Tưởng]", core),
                    },
                    estimated_ctr: "+47%".to_string(),
                    psychological_trigger: "Khai thác sự tò mò về kỹ năng và tư duy xử lý tình huống".to_string(),
                },
                TitleVariantItem {
                    formula: "Không Bình Luận".to_string(),
                    title: format!("{} (Không Bình Luận - 4K 60FPS)", core),
                    estimated_ctr: "+38%".to_string(),
                    psychological_trigger: "Mang lại trải nghiệm thuần khiết tập trung tối đa vào game".to_string(),
                },
                TitleVariantItem {
                    formula: "Khoảnh Khắc Xuất Thần".to_string(),
                    title: format!("{} | Khoảnh Khắc Xuất Thần 2026", core),
                    estimated_ctr: "+45%".to_string(),
                    psychological_trigger: "Tối ưu CTR với những khoảnh khắc cao trào kịch tính".to_string(),
                },
            ]
        } else {
            vec![
                TitleVariantItem {
                    formula: "Best Highlights".to_string(),
                    title: format!("{} | Best Highlights 2026", core),
                    estimated_ctr: "+44%".to_string(),
                    psychological_trigger: "Attracts viewers searching for peak clutch moments".to_string(),
                },
                TitleVariantItem {
                    formula: "Full Match Gameplay".to_string(),
                    title: format!("{} (Full Match Gameplay)", core),
                    estimated_ctr: "+41%".to_string(),
                    psychological_trigger: "Satisfies audience wanting full unedited match experience".to_string(),
                },
                TitleVariantItem {
                    formula: "Pro Strategy".to_string(),
                    title: match extra_kw {
                        Some(kw) => format!("{} [{} Pro Strategy]", core, kw),
                        None => format!("{} [Insane Clutch Play]", core),
                    },
                    estimated_ctr: "+47%".to_string(),
                    psychological_trigger: "Highlights top-tier game sense and reaction skills".to_string(),
                },
                TitleVariantItem {
                    formula: "No Commentary".to_string(),
                    title: format!("{} (No Commentary - 4K 60FPS)", core),
                    estimated_ctr: "+38%".to_string(),
                    psychological_trigger: "Pure immersion for distraction-free watching".to_string(),
                },
                TitleVariantItem {
                    formula: "Epic Moments".to_string(),
                    title: format!("{} | Epic Moments 2026", core),
                    estimated_ctr: "+45%".to_string(),
                    psychological_trigger: "Capitalizes on viral entertainment value and excitement".to_string(),
                },
            ]
        }
    } else if genre == "howto" {
        if is_vn {
            vec![
                TitleVariantItem {
                    formula: "Hướng Dẫn A-Z".to_string(),
                    title: format!("{} [Hướng Dẫn Chi Tiết A-Z]", core),
                    estimated_ctr: "+43%".to_string(),
                    psychological_trigger: "Cam kết cung cấp trọn bộ quy trình dễ theo dõi".to_string(),
                },
                TitleVariantItem {
                    formula: "Cực Kỳ Dễ Làm".to_string(),
                    title: format!("{} (Cực Kỳ Dễ Làm Cho Người Mới)", core),
                    estimated_ctr: "+46%".to_string(),
                    psychological_trigger: "Hạ thấp rào cản thực hiện cho người mới bắt đầu".to_string(),
                },
                TitleVariantItem {
                    formula: "Bí Quyết Chuẩn 2026".to_string(),
                    title: format!("{} | Bí Quyết Chuẩn Nhất 2026", core),
                    estimated_ctr: "+48%".to_string(),
                    psychological_trigger: "Khẳng định độ mới và tính ứng dụng thực tế cao".to_string(),
                },
                TitleVariantItem {
                    formula: "Mẹo Thực Chiến".to_string(),
                    title: match extra_kw {
                        Some(kw) => format!("{} [Mẹo Hay Với {}]", core, kw),
                        None => format!("{} (Cách Làm Nhanh Gấp 10 Lần)", core),
                    },
                    estimated_ctr: "+44%".to_string(),
                    psychological_trigger: "Kích thích click nhờ bí quyết rút ngắn thời gian".to_string(),
                },
                TitleVariantItem {
                    formula: "Công Thức Thành Công".to_string(),
                    title: format!("{} [Công Thức Bất Bại]", core),
                    estimated_ctr: "+45%".to_string(),
                    psychological_trigger: "Tạo sự an tâm tuyệt đối về kết quả đầu ra".to_string(),
                },
            ]
        } else {
            vec![
                TitleVariantItem {
                    formula: "Step-by-Step Guide".to_string(),
                    title: format!("{} [Step-by-Step Guide]", core),
                    estimated_ctr: "+43%".to_string(),
                    psychological_trigger: "Clear sequential instructions ensuring zero confusion".to_string(),
                },
                TitleVariantItem {
                    formula: "Beginner Friendly".to_string(),
                    title: format!("{} (Beginner Friendly Walkthrough)", core),
                    estimated_ctr: "+46%".to_string(),
                    psychological_trigger: "Eliminates complexity for first-time learners".to_string(),
                },
                TitleVariantItem {
                    formula: "2026 Masterclass".to_string(),
                    title: format!("{} | Complete 2026 Masterclass", core),
                    estimated_ctr: "+48%".to_string(),
                    psychological_trigger: "Signals fresh, authoritative, up-to-date best practices".to_string(),
                },
                TitleVariantItem {
                    formula: "Pro Tips".to_string(),
                    title: match extra_kw {
                        Some(kw) => format!("{} [Pro Tips For {}]", core, kw),
                        None => format!("{} (5 Pro Tips to Master It)", core),
                    },
                    estimated_ctr: "+44%".to_string(),
                    psychological_trigger: "High-value shortcuts that dramatically speed up results".to_string(),
                },
                TitleVariantItem {
                    formula: "Fast & Proven Method".to_string(),
                    title: format!("{} [Fast & Proven Method]", core),
                    estimated_ctr: "+45%".to_string(),
                    psychological_trigger: "Guarantees actionable efficiency and reliable outcome".to_string(),
                },
            ]
        }
    } else if is_vn {
        vec![
            TitleVariantItem {
                formula: "Bản Cập Nhật 2026".to_string(),
                title: format!("{} [Bản Cập Nhật 2026]", core),
                estimated_ctr: "+42%".to_string(),
                psychological_trigger: "Kích thích tò mò về những điểm mới nhất trong năm 2026".to_string(),
            },
            TitleVariantItem {
                formula: "Chi Tiết Trọn Vẹn".to_string(),
                title: format!("{} (Chi Tiết Từ A Đến Z)", core),
                estimated_ctr: "+45%".to_string(),
                psychological_trigger: "Cung cấp cái nhìn toàn cảnh không bỏ sót thông tin".to_string(),
            },
            TitleVariantItem {
                formula: "Góc Nhìn Thực Tế".to_string(),
                title: format!("{} | Góc Nhìn Thực Tế Mới Nhất", core),
                estimated_ctr: "+40%".to_string(),
                psychological_trigger: "Tăng độ tin cậy với góc nhìn khách quan thực chiến".to_string(),
            },
            TitleVariantItem {
                formula: "Lưu Ý Quan Trọng".to_string(),
                title: match extra_kw {
                    Some(kw) => format!("{} [Tiêu Điểm {}]", core, kw),
                    None => format!("{} (Những Điều Cần Biết Trước)", core),
                },
                estimated_ctr: "+46%".to_string(),
                psychological_trigger: "Đánh trúng tâm lý phòng tránh sai lầm và đón đầu xu hướng".to_string(),
            },
            TitleVariantItem {
                formula: "Phiên Bản Hoàn Chỉnh".to_string(),
                title: format!("{} [Phiên Bản Hoàn Chỉnh]", core),
                estimated_ctr: "+43%".to_string(),
                psychological_trigger: "Khẳng định chất lượng tổng hợp chuẩn xác và đầy đủ nhất".to_string(),
            },
        ]
    } else {
        vec![
            TitleVariantItem {
                formula: "2026 Edition".to_string(),
                title: format!("{} [2026 Edition]", core),
                estimated_ctr: "+42%".to_string(),
                psychological_trigger: "Signals fresh, modern, and up-to-date relevance".to_string(),
            },
            TitleVariantItem {
                formula: "Full Breakdown".to_string(),
                title: format!("{} (Complete Breakdown)", core),
                estimated_ctr: "+45%".to_string(),
                psychological_trigger: "Promises comprehensive coverage with zero fluff".to_string(),
            },
            TitleVariantItem {
                formula: "In-Depth Perspective".to_string(),
                title: format!("{} | In-Depth Perspective", core),
                estimated_ctr: "+40%".to_string(),
                psychological_trigger: "Offers objective analysis and unique viewpoint".to_string(),
            },
            TitleVariantItem {
                formula: "Key Takeaways".to_string(),
                title: match extra_kw {
                    Some(kw) => format!("{} [Deep Dive: {}]", core, kw),
                    None => format!("{} (Everything You Need to Know)", core),
                },
                estimated_ctr: "+46%".to_string(),
                psychological_trigger: "Addresses essential insights audience cannot afford to miss".to_string(),
            },
            TitleVariantItem {
                formula: "Master Edition".to_string(),
                title: format!("{} [Complete Master Edition]", core),
                estimated_ctr: "+43%".to_string(),
                psychological_trigger: "Establishes definitive authority and polished quality".to_string(),
            },
        ]
    };

    AiTitleVariants {
        original_title: original_title.to_string(),
        variants,
        source: "local_nlp_fallback".to_string(),
    }
}

pub(crate) fn generate_local_smart_description(
    title: &str,
    niche: Option<&str>,
    competitor_tags: Option<&[String]>,
    competitor_channel: Option<&str>,
) -> SmartDescriptionResult {
    let core = extract_core_topic(title);
    let is_vn = is_vietnamese_text(title);
    let niche_str = niche.unwrap_or("Chia Sẻ Kinh Nghiệm");

    let mut hashtags = Vec::new();
    let sanitize_tag = |s: &str| -> String {
        let tag = s.replace(|c: char| !c.is_alphanumeric(), "");
        if tag.starts_with('#') {
            tag
        } else {
            format!("#{}", tag)
        }
    };

    hashtags.push(sanitize_tag(niche_str));
    let clean_core_slug = core.split_whitespace().take(2).collect::<Vec<_>>().join("");
    hashtags.push(sanitize_tag(&clean_core_slug));
    hashtags.push(if is_vn { "#XuHuong".to_string() } else { "#Trending".to_string() });

    if let Some(tags) = competitor_tags {
        for t in tags.iter().take(7) {
            let st = sanitize_tag(t);
            if !hashtags.contains(&st) && st.len() > 2 {
                hashtags.push(st);
            }
        }
    }
    let default_tags = if is_vn {
        vec![
            "#KienThucMoi", "#MeoHay", "#BiQuyet", "#KhamPha", "#HuongDan",
            "#ReviewChiTiet", "#ReupYTB", "#ChiaSe", "#HocHoi", "#KinhNghiem",
            "#CapNhat", "#XuHuongMoi", "#MoiNhat",
        ]
    } else {
        vec![
            "#TipsAndTricks", "#LifeHacks", "#Masterclass", "#TopSecrets", "#HowTo",
            "#Tutorial", "#ViralVideo", "#TrendingNow", "#BestTips", "#LearnFast",
            "#SecretsExposed", "#ProTips", "#MustWatch",
        ]
    };
    for dt in default_tags {
        if hashtags.len() >= 13 {
            break;
        }
        let sdt = dt.to_string();
        if !hashtags.contains(&sdt) {
            hashtags.push(sdt);
        }
    }
    let mut fill_idx = 1;
    while hashtags.len() < 13 {
        let fallback_tag = if is_vn {
            format!("#Top{}", fill_idx)
        } else {
            format!("#Tag{}", fill_idx)
        };
        if !hashtags.contains(&fallback_tag) {
            hashtags.push(fallback_tag);
        }
        fill_idx += 1;
    }

    let (tier1, tier2, tier3) = if is_vn {
        let t1 = format!(
            "Khám phá bí quyết làm chủ {} cực nhanh và hiệu quả. Hướng dẫn chi tiết từng bước giúp bạn nắm trọn kiến thức và áp dụng ngay hôm nay!",
            core
        );
        let t2 = format!(
            "📌 TÓM TẮT NỘI DUNG VIDEO:\nTrong video hôm nay, chúng ta cùng đào sâu chủ đề '{}' trong lĩnh vực {}. Bạn sẽ nắm được toàn bộ quy trình, các lưu ý then chốt và phương pháp tối ưu tốt nhất.\n\n⏱️ TIMESTAMPS / DANH MỤC NỘI DUNG:\n00:00 - Điểm nhấn cao trào & Giới thiệu\n01:15 - Vấn đề cốt lõi cần giải quyết\n03:45 - Hướng dẫn chi tiết từng bước (Step-by-step)\n06:20 - Sai lầm phổ biến & Cách phòng tránh\n08:50 - Bí quyết thực chiến tối ưu hiệu quả\n10:30 - Tổng kết & Lời khuyên quan trọng",
            core, niche_str
        );
        let channel_info = competitor_channel.map(|ch| format!("\nTham khảo phong cách từ {}", ch)).unwrap_or_default();
        let t3 = format!(
            "🔔 ĐĂNG KÝ KÊNH & KẾT NỐI:\n👉 Đăng ký kênh ngay để không bỏ lỡ các video mới nhất: https://youtube.com/@channel?sub_confirmation=1\n👍 Đừng quên bấm LIKE và BẬT CHUÔNG thông báo để ủng hộ chúng mình ra thêm nhiều video hữu ích nhé!\n💬 Hãy để lại bình luận nếu bạn có bất kỳ câu hỏi nào.{} \n\n---\n⚖️ BẢN QUYỀN & TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM (FAIR USE):\n© Video này tuân thủ nguyên tắc Sử dụng Hợp lý (Fair Use) theo Đạo luật Bản quyền Hoa Kỳ (Mục 107 của Đạo luật Bản quyền năm 1976) cho các mục đích như giáo dục, nghiên cứu, bình luận và đánh giá.\n🎵 Âm nhạc và tư liệu hình ảnh được cấp phép từ nguồn nhạc sạch thương mại hoặc giấy phép Creative Commons.\nNếu bạn là chủ sở hữu bản quyền có thắc mắc, vui lòng liên hệ trực tiếp trước khi gửi khiếu nại để giải quyết hòa bình trong 24h.",
            channel_info
        );
        (t1, t2, t3)
    } else {
        let t1 = format!(
            "Discover the ultimate masterclass on {} with actionable step-by-step strategies. Watch this complete breakdown to level up your results today!",
            core
        );
        let t2 = format!(
            "📌 VIDEO SUMMARY & HIGHLIGHTS:\nIn this video, we break down everything you need to know about '{}' in the {} space. Practical, proven, and ready for immediate implementation.\n\n⏱️ TIMESTAMPS / CHAPTERS:\n00:00 - Introduction & Hook\n01:15 - Core Challenge & Breakdown\n03:45 - Step-by-Step Implementation Guide\n06:20 - Common Mistakes to Avoid\n08:50 - Pro-Level Optimization Tactics\n10:30 - Final Takeaways & Action Plan",
            core, niche_str
        );
        let t3 = format!(
            "🔔 SUBSCRIBE & STAY CONNECTED:\n👉 Subscribe to the channel for weekly tactical guides: https://youtube.com/@channel?sub_confirmation=1\n👍 Leave a LIKE and Turn on the NOTIFICATION BELL to support the channel!\n💬 Drop your questions and thoughts in the comments below.\n\n---\n⚖️ COPYRIGHT DISCLAIMER (FAIR USE):\n© Under Section 107 of the Copyright Act 1976, allowance is made for 'fair use' for purposes such as criticism, comment, news reporting, teaching, scholarship, and research.\n🎵 Audio and visual assets are sourced under Commercial Clean Audio licenses or Creative Commons.\nIf you have any copyright inquiries, please contact us directly for immediate resolution."
        );
        (t1, t2, t3)
    };

    let full_description = format!(
        "{}\n\n{}\n\n{}\n\n{}",
        tier1,
        tier2,
        tier3,
        hashtags.join(" ")
    );

    SmartDescriptionResult {
        tier1_hook_seo: tier1,
        tier2_summary_chapters: tier2,
        tier3_cta_credits: tier3,
        tier4_hashtags: hashtags,
        full_description,
        source: "local_nlp_fallback".to_string(),
    }
}

pub(crate) fn generate_local_hook_analysis(
    title: &str,
    transcript_preview: Option<&str>,
    niche: Option<&str>,
) -> HookAnalysisResult {
    let core = extract_core_topic(title);
    let is_vn = is_vietnamese_text(title);
    let niche_str = niche.unwrap_or("Chung");

    let has_transcript = transcript_preview.map(|t| !t.trim().is_empty()).unwrap_or(false);

    let (diagnosis, risk, remake_hooks) = if is_vn {
        let diag = format!(
            "Phân tích 5-10 giây đầu cho chủ đề '{}' (Ngách: {}): {}. Điểm yếu lớn nhất ở video đối thủ là mở đầu theo lối mòn tự sự, thiếu 'Pattern Interrupt' (yếu tố ngắt quán tính lướt màn hình) và chưa kích hoạt ngay cảm xúc tò mò trong 3 giây đầu tiên.",
            core,
            niche_str,
            if has_transcript { "Đã rà soát đoạn mở thoại đối thủ" } else { "Đánh giá dựa trên cấu trúc từ khóa tiêu đề" }
        );
        let rsk = "Rủi ro tụt xem cao nhất (Retention Drop) xảy ra ở giây 0:03 - 0:06 khi người xem chưa thấy lý do đủ mạnh để tiếp tục xem. Tỷ lệ thoát dự kiến có thể lên đến 40-50% nếu không remake lại đoạn hook này.".to_string();
        let hooks = vec![
            HookScriptItem {
                hook_type: "Visual Hook".to_string(),
                duration_seconds: 3,
                script: "Dừng lại 3 giây! Bạn đã bao giờ thấy điều này chưa? [Cắt chớp nhoáng vào khoảnh khắc đỉnh cao nhất]".to_string(),
                visual_action: "Cắt ngay vào cảnh cao trào nhất (climax teaser) với hiệu ứng Zoom-punch cực mạnh, kết hợp màn hình rung nhẹ (shake) và âm thanh Whoosh.".to_string(),
                retention_strategy: "Pattern Interrupt - Phá vỡ thói quen lướt vô thức trên điện thoại, buộc não bộ người xem phải dừng lại xử lý khung hình mới lạ.".to_string(),
            },
            HookScriptItem {
                hook_type: "Audio Hook".to_string(),
                duration_seconds: 5,
                script: format!("⚠️ [Âm thanh Cảnh Báo khẩn cấp + Tiếng tim đập dồn] Đừng vội làm {} nếu bạn chưa biết điều sống còn này!", core),
                visual_action: "Âm thanh Bass Drop chấn động kết hợp tiếng còi cảnh báo khẩn cấp (Emergency Siren SFX), giọng đọc dồn dập vào thẳng vấn đề trên nền đen bí ẩn.".to_string(),
                retention_strategy: "Auditory Alarm & Urgency - Đánh thức sự chú ý tức thì qua thính giác, kích hoạt trạng thái cảnh giác cao độ.".to_string(),
            },
            HookScriptItem {
                hook_type: "Curiosity Statement".to_string(),
                duration_seconds: 8,
                script: format!("99% mọi người đều đang làm sai hoàn toàn về {}. Đây là bí mật mà không ai muốn nói cho bạn biết!", core),
                visual_action: "Hiện dòng chữ lớn tương phản cao (Vàng/Đỏ) đập vào giữa màn hình theo nhịp nói, gạch chéo đỏ vào quan niệm cũ và hé lộ kết quả bất ngờ.".to_string(),
                retention_strategy: "Cognitive Dissonance & Curiosity Gap - Tấn công thẳng vào niềm tin sai lầm cũ, mở ra câu hỏi lớn mà người xem phải xem hết video để tìm lời giải.".to_string(),
            },
        ];
        (diag, rsk, hooks)
    } else {
        let diag = format!(
            "First 5-10 seconds analysis for '{}' (Niche: {}): {}. Competitor hook lacks a visceral Pattern Interrupt and fails to present high-stakes urgency within the critical first 3 seconds.",
            core,
            niche_str,
            if has_transcript { "Verified against competitor spoken transcript" } else { "Evaluated from title and keyword semantic footprint" }
        );
        let rsk = "Retention leak risk is highest at seconds 0:03 - 0:06. Without an immediate visual or auditory hook, up to 45% of viewers swipe away before understanding the video's core value.".to_string();
        let hooks = vec![
            HookScriptItem {
                hook_type: "Visual Hook".to_string(),
                duration_seconds: 3,
                script: "Stop scrolling! Have you ever seen this before?! [Cut to the most intense 1-second climax]".to_string(),
                visual_action: "Instant climax teaser cut at 0:00 with dramatic zoom-punch effect, white flash transition, and whoosh SFX.".to_string(),
                retention_strategy: "Pattern Interrupt - Breaks automatic scroll fatigue and forces instant ocular focus.".to_string(),
            },
            HookScriptItem {
                hook_type: "Audio Hook".to_string(),
                duration_seconds: 5,
                script: format!("⚠️ [Emergency alarm SFX + Sub-bass drop] Stop everything! What you're about to see about {} changes everything.", core),
                visual_action: "Heavy bass drop sound with high-frequency alert tone, dark moody background with pulsing kinetic soundwave graphics.".to_string(),
                retention_strategy: "Auditory Shock - Commands full acoustic attention and spikes dopamine anticipation.".to_string(),
            },
            HookScriptItem {
                hook_type: "Curiosity Statement".to_string(),
                duration_seconds: 8,
                script: format!("Why does nobody talk about this fatal mistake with {}? Here is what they are actively hiding from you.", core),
                visual_action: "Bold kinetic typography snapping to center screen, striking through outdated advice with a giant red cross.".to_string(),
                retention_strategy: "Curiosity Gap & Bold Claim - Destabilizes existing knowledge, making it impossible to leave without getting the answer.".to_string(),
            },
        ];
        (diag, rsk, hooks)
    };

    HookAnalysisResult {
        title: title.to_string(),
        hook_diagnosis: diagnosis,
        predicted_retention_risk: risk,
        target_avd_goal: ">70% AVD (Đạt tiêu chuẩn tối ưu thuật toán đề xuất YouTube)".to_string(),
        remake_hooks,
        source: "local_nlp_fallback".to_string(),
    }
}

#[tauri::command]
pub async fn ai_rewrite_viral_titles_cmd(
    app: AppHandle,
    original_title: String,
    niche: Option<String>,
    competitor_keywords: Option<Vec<String>>,
    slm_mode: Option<bool>,
) -> Result<AiTitleVariants, String> {
    let mut config = get_ai_config(app).await.unwrap_or_default();
    let is_slm = slm_mode.unwrap_or(false) || config.model.to_lowercase().contains("0.5b");

    if is_slm {
        config.summary_max_tokens = Some(700);
    }

    if config.enabled {
        let is_vn = is_vietnamese_text(&original_title);
        let mut genre = detect_genre(&original_title);
        if genre == "general" {
            if let Some(n) = niche.as_deref() {
                let n_genre = detect_genre(n);
                if n_genre != "general" {
                    genre = n_genre;
                }
            }
        }

        let is_music = genre == "music";

        let (language_rule, few_shot_input_title, few_shot_niche, few_shot_json) = if is_vn {
            if is_music {
                (
                    "Vietnamese (100% Tiếng Việt chuẩn. TUYỆT ĐỐI không pha tiếng Anh)",
                    "Waiting For You - MONO",
                    "Nhạc / Remix",
                    r#"{"variants":[{"formula":"Bản Phối Mới","title":"Waiting For You - MONO [Bản Phối Mới 2026]","estimatedCtr":"+42%","psychologicalTrigger":"Thu hút người nghe tìm kiếm âm hưởng hiện đại mới lạ"},{"formula":"Remix Bass Căng","title":"Waiting For You - MONO (Remix Bass Cực Căng)","estimatedCtr":"+48%","psychologicalTrigger":"Đánh trúng thị hiếu thích giai điệu sôi động bùng nổ"},{"formula":"Giai Điệu Chill","title":"Waiting For You - MONO | Nhạc Chill Thư Giãn","estimatedCtr":"+39%","psychologicalTrigger":"Phục vụ nhu cầu nghe thư giãn khi học tập làm việc"},{"formula":"Bản Chuẩn Gốc","title":"Waiting For You - MONO (Official Audio)","estimatedCtr":"+36%","psychologicalTrigger":"Tạo độ tin cậy về chất lượng âm thanh gốc chuẩn studio"},{"formula":"Tuyển Tập Hay Nhất","title":"Waiting For You - MONO [Tuyển Tập Hay Nhất 2026]","estimatedCtr":"+45%","psychologicalTrigger":"Tối ưu tìm kiếm theo xu hướng tuyển tập thịnh hành"}]}"#,
                )
            } else {
                (
                    "Vietnamese (100% Tiếng Việt chuẩn. TUYỆT ĐỐI không pha tiếng Anh)",
                    "Cách làm bánh mì tại nhà giòn xốp",
                    "Ẩm thực / Hướng dẫn",
                    r#"{"variants":[{"formula":"Bí Quyết Thực Chiến","title":"Cách làm bánh mì tại nhà giòn xốp [Công Thức Bất Bại]","estimatedCtr":"+42%","psychologicalTrigger":"Khẳng định tỷ lệ thành công cao cho người làm"},{"formula":"Tiết Kiệm Thời Gian","title":"Cách làm bánh mì tại nhà giòn xốp (Nhanh Gọn Cực Dễ)","estimatedCtr":"+45%","psychologicalTrigger":"Giảm rào cản thao tác cho người bận rộn"},{"formula":"Chuẩn Vị Lò Nướng","title":"Cách làm bánh mì tại nhà giòn xốp | Chuẩn Vị Lò Nướng 2026","estimatedCtr":"+48%","psychologicalTrigger":"Đảm bảo chất lượng thành phẩm thơm ngon chuẩn vị"},{"formula":"Hướng Dẫn Chi Tiết","title":"Cách làm bánh mì tại nhà giòn xốp [Hướng Dẫn Từng Bước A-Z]","estimatedCtr":"+39%","psychologicalTrigger":"Cung cấp chi tiết đầy đủ không bỏ sót thao tác"},{"formula":"Giải Pháp Gia Đình","title":"Cách làm bánh mì tại nhà giòn xốp (Bằng Nồi Chiên Không Dầu)","estimatedCtr":"+46%","psychologicalTrigger":"Tận dụng thiết bị sẵn có trong căn bếp gia đình"}]}"#,
                )
            }
        } else if is_music {
            (
                "English (100% in English. CRITICAL: NEVER output Vietnamese or mix languages)",
                "METAMORPHOSIS - INTERWORLD",
                "Music / Phonk",
                r#"{"variants":[{"formula":"Aesthetic Format","title":"METAMORPHOSIS - INTERWORLD [Slowed + Reverb]","estimatedCtr":"+42%","psychologicalTrigger":"Captures high-intent search for atmospheric slowed editions"},{"formula":"Bass Boosted","title":"METAMORPHOSIS - INTERWORLD [Bass Boosted Edition]","estimatedCtr":"+48%","psychologicalTrigger":"Appeals to listeners seeking intense low-end impact"},{"formula":"Curated Mix","title":"METAMORPHOSIS - INTERWORLD | Best Viral Phonk Mix 2026","estimatedCtr":"+40%","psychologicalTrigger":"Curated continuous viral phonk streaming"},{"formula":"Official Release","title":"METAMORPHOSIS - INTERWORLD (Official Audio Visualizer)","estimatedCtr":"+36%","psychologicalTrigger":"Establishes authentic studio quality and visualizer"},{"formula":"Workout Energy","title":"METAMORPHOSIS - INTERWORLD [Gym Workout Motivation]","estimatedCtr":"+45%","psychologicalTrigger":"Targeted algorithmic fitness and focus context"}]}"#,
            )
        } else {
            (
                "English (100% in English. CRITICAL: NEVER output Vietnamese or mix languages)",
                "How to Build a Custom Mechanical Keyboard",
                "Technology / Guide",
                r#"{"variants":[{"formula":"Beginner Friendly","title":"How to Build a Custom Mechanical Keyboard [Beginner Friendly Guide]","estimatedCtr":"+44%","psychologicalTrigger":"Lowers entry barrier for first-time builders"},{"formula":"Sound Profile Focus","title":"How to Build a Custom Mechanical Keyboard (Ultra Thocky Sound Test)","estimatedCtr":"+48%","psychologicalTrigger":"Appeals directly to sound profile enthusiasts"},{"formula":"Step-by-Step Blueprint","title":"How to Build a Custom Mechanical Keyboard | Step-by-Step Walkthrough","estimatedCtr":"+41%","psychologicalTrigger":"Clear roadmap ensuring flawless execution"},{"formula":"Budget Build","title":"How to Build a Custom Mechanical Keyboard [Under $100 Budget Build]","estimatedCtr":"+46%","psychologicalTrigger":"Attracts cost-conscious builders seeking value"},{"formula":"2026 Masterclass","title":"How to Build a Custom Mechanical Keyboard (2026 Edition)","estimatedCtr":"+43%","psychologicalTrigger":"Signals fresh, up-to-date components and tools"}]}"#,
            )
        };

        let prompt = format!(
            r#"### MANDATORY RULES (STRICT QWEN/SLM RULES-FIRST):
1. Output ONLY a valid, raw JSON object matching the exact schema below. No markdown fences (no ```json), no explanations.
2. PRESERVE 90-95% CORE TOPIC: Keep the original core title keywords intact at the beginning. NEVER rephrase or translate the main topic. NEVER add clickbait prefixes (do NOT prepend "Warning", "Stop doing this", "Why 90%...", "I tested...").
3. TRANSFORM ONLY 5-10% TAIL: Creatively transform ONLY the ending tail (suffix brackets [...], (...), or after "|"). Do NOT use rigid or boilerplate templates. Adapt each tail naturally to the niche (e.g. edition, sound style, guide clarity, 2026 freshness).
4. STRICT 100% LANGUAGE MATCH: Output language MUST be {}. NEVER mix languages.
5. Generate EXACTLY 5 diverse tail variants with non-repetitive formula names and psychological triggers.

### FEW-SHOT EXAMPLE:
Input:
- Original Title: "{}"
- Niche: "{}"
Output:
{}

### ACTUAL TASK:
- Original Title: "{}"
- Niche: "{}"
- Competitor Keywords: "{}"

JSON Output:"#,
            language_rule,
            few_shot_input_title,
            few_shot_niche,
            few_shot_json,
            original_title,
            niche.as_deref().unwrap_or(if is_music { "Music" } else { "General" }),
            competitor_keywords.as_ref().map(|k| k.join(", ")).unwrap_or_default()
        );

        // Fast 2.5s Timeout Guard: Ngăn chặn tuyệt đối việc treo UI hoặc quay vòng vô tận khi Ollama / Cloud API lag
        if let Ok(Ok(raw_res)) = tokio::time::timeout(AI_QUICK_COMMAND_TIMEOUT, generate_ai_text(&config, &prompt)).await {
            if let Some(json_str) = extract_json_payload(&raw_res) {
                #[derive(Deserialize)]
                struct LlmVariantsWrapper {
                    variants: Vec<TitleVariantItem>,
                }
                if let Ok(mut parsed) = serde_json::from_str::<LlmVariantsWrapper>(json_str) {
                    if !parsed.variants.is_empty() {
                        if parsed.variants.len() < 5 {
                            let local = generate_local_viral_titles(
                                &original_title,
                                niche.as_deref(),
                                competitor_keywords.as_deref(),
                            );
                            for item in local.variants {
                                if parsed.variants.len() >= 5 {
                                    break;
                                }
                                if !parsed.variants.iter().any(|v| v.formula == item.formula) {
                                    parsed.variants.push(item);
                                }
                            }
                        }
                        return Ok(AiTitleVariants {
                            original_title,
                            variants: parsed.variants,
                            source: if is_slm { "slm_qwen_0.5b".to_string() } else { "llm".to_string() },
                        });
                    }
                }
            }
        }
    }

    let mut local = generate_local_viral_titles(
        &original_title,
        niche.as_deref(),
        competitor_keywords.as_deref(),
    );
    if is_slm {
        local.source = "slm_qwen_0.5b_local".to_string();
    }
    Ok(local)
}

#[tauri::command]
pub async fn ai_generate_smart_description_cmd(
    app: AppHandle,
    title: String,
    niche: Option<String>,
    competitor_tags: Option<Vec<String>>,
    competitor_channel: Option<String>,
    slm_mode: Option<bool>,
) -> Result<SmartDescriptionResult, String> {
    let mut config = get_ai_config(app).await.unwrap_or_default();
    let is_slm = slm_mode.unwrap_or(false) || config.model.to_lowercase().contains("0.5b");

    if is_slm {
        config.summary_max_tokens = Some(900);
    }

    if config.enabled {
        let is_vn = is_vietnamese_text(&title);
        let prompt = format!(
            r##"### MANDATORY RULES (STRICT QWEN/SLM RULES-FIRST):
1. Output ONLY a valid, raw JSON object matching the exact schema below.
2. DO NOT include markdown code blocks (no ```json or ```), no intro, no chit-chat.
3. Structure 4 Tiers:
   - "tier1HookSeo": 2-3 hook sentences (<150 chars) with core keywords.
   - "tier2SummaryChapters": Concise summary + 5 realistic timestamp chapters (00:00 - 10:30).
   - "tier3CtaCredits": Call to action + Section 107 Fair Use disclaimer + audio credit.
   - "tier4Hashtags": Array of exactly 13 hashtags (first 3 primary, 10 underground).
   - "fullDescription": Combined text of Tier 1, Tier 2, Tier 3, Tier 4.
4. Output language: {}

### FEW-SHOT EXAMPLE:
Input:
- Title: "Cách làm cà phê muối béo ngậy"
- Niche: "Pha chế"
Output:
{{"tier1HookSeo":"Bí quyết pha cà phê muối thơm béo, đậm đà chỉ trong 3 phút tại nhà. Mẹo đánh lớp kem muối bông mịn không bị tan chìm!","tier2SummaryChapters":"Hướng dẫn chi tiết từng công đoạn pha chế cà phê muối chuẩn vị quán.\n00:00 - Chuẩn bị nguyên liệu\n01:20 - Kỹ thuật pha phin giọt chậm\n03:15 - Công thức đánh sốt kem muối\n05:40 - Rót tầng & trang trí\n07:50 - Thưởng thức & lưu ý bảo quản","tier3CtaCredits":"🔔 Hãy Đăng ký kênh và bấm chuông để cập nhật công thức đồ uống mới nhất!\n\n© Bản quyền thuộc về kênh. Tuyên bố miễn trừ trách nhiệm Bản quyền theo Mục 107 của Đạo luật Bản quyền 1976. Nhạc nền bản quyền sạch YouTube Library.","tier4Hashtags":["#caphemuoi","#phache","#caphe","#douong","#monngonmoingay","#coffee","#saltcoffee","#barista","#congthucdouong","#reviewmonngon","#anngon","#diy","#trending"],"fullDescription":"Bí quyết pha cà phê muối thơm béo...\n\nHướng dẫn chi tiết...\n\n🔔 Hãy Đăng ký kênh...\n\n#caphemuoi #phache #caphe"}}

### ACTUAL TASK:
- Video Title: "{}"
- Niche: "{}"
- Competitor Channel: "{}"
- Competitor Tags: "{}"

JSON Output:"##,
            if is_vn { "Vietnamese (Tiếng Việt chuẩn xác)." } else { "English (Match video title language)." },
            title,
            niche.as_deref().unwrap_or("General"),
            competitor_channel.as_deref().unwrap_or(""),
            competitor_tags.as_ref().map(|t| t.join(", ")).unwrap_or_default()
        );

        // Fast 2.5s Timeout Guard: Ngăn chặn tuyệt đối việc treo UI hoặc quay vòng vô tận khi Ollama / Cloud API lag
        if let Ok(Ok(raw_res)) = tokio::time::timeout(AI_QUICK_COMMAND_TIMEOUT, generate_ai_text(&config, &prompt)).await {
            if let Some(json_str) = extract_json_payload(&raw_res) {
                if let Ok(mut parsed) = serde_json::from_str::<SmartDescriptionResult>(json_str) {
                    parsed.source = if is_slm { "slm_qwen_0.5b".to_string() } else { "llm".to_string() };
                    if parsed.full_description.trim().is_empty() {
                        parsed.full_description = format!(
                            "{}\n\n{}\n\n{}\n\n{}",
                            parsed.tier1_hook_seo,
                            parsed.tier2_summary_chapters,
                            parsed.tier3_cta_credits,
                            parsed.tier4_hashtags.join(" ")
                        );
                    }
                    if parsed.tier4_hashtags.is_empty() {
                        let local_desc = generate_local_smart_description(
                            &title,
                            niche.as_deref(),
                            competitor_tags.as_deref(),
                            competitor_channel.as_deref(),
                        );
                        parsed.tier4_hashtags = local_desc.tier4_hashtags;
                    }
                    return Ok(parsed);
                }
            }
        }
    }

    let mut local = generate_local_smart_description(
        &title,
        niche.as_deref(),
        competitor_tags.as_deref(),
        competitor_channel.as_deref(),
    );
    if is_slm {
        local.source = "slm_qwen_0.5b_local".to_string();
    }
    Ok(local)
}

#[tauri::command]
pub async fn extract_video_seo_tags_cmd(
    app: AppHandle,
    video_url: String,
) -> Result<serde_json::Value, String> {
    if video_url.trim().is_empty() {
        return Err("URL video không được để trống".to_string());
    }

    validate_url(&video_url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let normalized = normalize_url(&video_url);

    let mut args: Vec<String> = vec![
        "--skip-download".to_string(),
        "--dump-single-json".to_string(),
        "--no-playlist".to_string(),
        "--no-warnings".to_string(),
        "--ignore-no-formats-error".to_string(),
        "--socket-timeout".to_string(),
        "10".to_string(),
    ];

    if normalized.contains("youtube.com") || normalized.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.push("--".to_string());
    args.push(normalized.clone());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let timeout_duration = std::time::Duration::from_secs(10);
    let run_fut = run_ytdlp_json(&app, &args_ref);
    let raw_json = match tokio::time::timeout(timeout_duration, run_fut).await {
        Ok(res) => res?,
        Err(_) => return Err("Timeout 10s khi trích xuất thẻ SEO tags từ yt-dlp".to_string()),
    };

    let parsed_val: serde_json::Value = serde_json::from_str(&raw_json)
        .map_err(|e| format!("Lỗi phân tích cú pháp JSON yt-dlp: {}", e))?;

    let tags = parsed_val
        .get("tags")
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    let categories = parsed_val
        .get("categories")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    let title = parsed_val
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let description = parsed_val
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let channel_follower_count = parsed_val
        .get("channel_follower_count")
        .and_then(|v| v.as_i64());

    let channel = parsed_val
        .get("channel")
        .or_else(|| parsed_val.get("uploader"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let view_count = parsed_val
        .get("view_count")
        .and_then(|v| v.as_i64());

    let id = parsed_val
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Drop raw strings and tree immediately to free memory
    drop(parsed_val);
    drop(raw_json);

    let mut final_tags = tags;
    if final_tags.is_empty() && !description.is_empty() {
        for word in description.split_whitespace() {
            if word.starts_with('#') && word.len() > 1 {
                let clean = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '_');
                if !clean.is_empty() && !final_tags.iter().any(|t| t.eq_ignore_ascii_case(clean)) {
                    final_tags.push(clean.to_string());
                }
            }
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "id": id,
        "title": title,
        "tags": final_tags,
        "categories": categories,
        "description": description,
        "channelFollowerCount": channel_follower_count,
        "channel_follower_count": channel_follower_count,
        "channel": channel,
        "viewCount": view_count,
        "view_count": view_count
    }))
}

#[tauri::command]
pub async fn ai_analyze_hook_deep_cmd(
    app: AppHandle,
    title: String,
    transcript_preview: Option<String>,
    niche: Option<String>,
) -> Result<HookAnalysisResult, String> {
    let config = get_ai_config(app).await.unwrap_or_default();

    if config.enabled {
        let prompt = format!(
            r#"You are an elite YouTube Video Retention Director analyzing the first 5-10 seconds of a video.
Video details:
- Title: "{}"
- Niche: "{}"
- Spoken Opening Transcript Preview: "{}"

Provide an in-depth diagnosis and craft 3 remake hook scripts to hit >70% AVD (Average View Duration):
1. "Visual Hook" (0-3s, extreme pattern interrupt / visual teaser)
2. "Audio Hook" (0-5s, intense soundbite, warning alarm, visceral auditory stimulus)
3. "Curiosity Statement" (0-8s, cognitive dissonance, controversial bold claim)

Respond ONLY with valid JSON:
{{
  "title": "...",
  "hookDiagnosis": "...",
  "predictedRetentionRisk": "...",
  "targetAvdGoal": ">70% AVD",
  "remakeHooks": [
    {{
      "hookType": "Visual Hook",
      "durationSeconds": 3,
      "script": "...",
      "visualAction": "...",
      "retentionStrategy": "..."
    }},
    {{
      "hookType": "Audio Hook",
      "durationSeconds": 5,
      "script": "...",
      "visualAction": "...",
      "retentionStrategy": "..."
    }},
    {{
      "hookType": "Curiosity Statement",
      "durationSeconds": 8,
      "script": "...",
      "visualAction": "...",
      "retentionStrategy": "..."
    }}
  ]
}}
Language requirement: Match the language of the video title (Vietnamese if Vietnamese). Output raw JSON only."#,
            title,
            niche.as_deref().unwrap_or("General"),
            transcript_preview.as_deref().unwrap_or("N/A")
        );

        // Fast 2.5s Timeout Guard: Ngăn chặn tuyệt đối việc treo UI hoặc quay vòng vô tận khi Ollama / Cloud API lag
        if let Ok(Ok(raw_res)) = tokio::time::timeout(AI_QUICK_COMMAND_TIMEOUT, generate_ai_text(&config, &prompt)).await {
            if let Some(json_str) = extract_json_payload(&raw_res) {
                if let Ok(mut parsed) = serde_json::from_str::<HookAnalysisResult>(json_str) {
                    parsed.title = title.clone();
                    parsed.source = "llm".to_string();
                    return Ok(parsed);
                }
            }
        }
    }

    Ok(generate_local_hook_analysis(
        &title,
        transcript_preview.as_deref(),
        niche.as_deref(),
    ))
}
