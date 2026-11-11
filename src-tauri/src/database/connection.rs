use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// Global database connection wrapped in Mutex for thread safety
pub static DB_CONNECTION: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();
pub static APP_DATA_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

pub fn get_app_data_dir() -> Option<PathBuf> {
    APP_DATA_DIR.get().cloned()
}

#[cfg(test)]
static DB_TEST_LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();

pub const MAX_LOG_ENTRIES: i64 = 500;
const DATABASE_FILE_NAME: &str = "retubematrix.db";
const LEGACY_DATABASE_FILE_NAME: &str = "logs.db";
const MIGRATING_DATABASE_FILE_NAME: &str = "retubematrix.db.migrating";

fn database_sidecar_path(path: &Path, suffix: &str) -> Option<PathBuf> {
    let filename = path.file_name()?.to_string_lossy();
    Some(path.with_file_name(format!("{filename}{suffix}")))
}

fn remove_incomplete_database(path: &Path) {
    std::fs::remove_file(path).ok();
    if let Some(wal_path) = database_sidecar_path(path, "-wal") {
        std::fs::remove_file(wal_path).ok();
    }
    if let Some(shm_path) = database_sidecar_path(path, "-shm") {
        std::fs::remove_file(shm_path).ok();
    }
}

fn migrating_database_path(db_path: &Path) -> PathBuf {
    db_path.with_file_name(MIGRATING_DATABASE_FILE_NAME)
}

fn verify_database_file(path: &Path) -> Result<(), String> {
    let conn = Connection::open(path)
        .map_err(|e| format!("Failed to open migrated database for verification: {e}"))?;
    let check_result: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|e| format!("Failed to verify migrated database: {e}"))?;
    if check_result.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(format!(
            "Migrated database failed integrity check: {check_result}"
        ))
    }
}

fn migrate_legacy_database(legacy_path: &Path, db_path: &Path) -> Result<(), String> {
    let temp_db_path = migrating_database_path(db_path);
    remove_incomplete_database(&temp_db_path);

    let legacy_conn = Connection::open(legacy_path)
        .map_err(|e| format!("Failed to open legacy database for migration: {e}"))?;
    let temp_db_path_arg = temp_db_path.to_string_lossy().to_string();
    let vacuum_result = legacy_conn.execute("VACUUM INTO ?1", params![temp_db_path_arg]);
    drop(legacy_conn);

    if let Err(e) = vacuum_result {
        remove_incomplete_database(&temp_db_path);
        return Err(format!(
            "Failed to migrate legacy database from {} to {}: {e}",
            legacy_path.display(),
            db_path.display()
        ));
    }

    if let Err(e) = verify_database_file(&temp_db_path) {
        remove_incomplete_database(&temp_db_path);
        return Err(e);
    }

    std::fs::rename(&temp_db_path, db_path).map_err(|e| {
        remove_incomplete_database(&temp_db_path);
        format!(
            "Failed to finalize migrated database at {}: {e}",
            db_path.display()
        )
    })?;

    verify_database_file(db_path)?;

    Ok(())
}

fn resolve_database_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    let db_path = app_data_dir.join(DATABASE_FILE_NAME);
    let temp_db_path = migrating_database_path(&db_path);
    if db_path.exists() {
        remove_incomplete_database(&temp_db_path);
        return Ok(db_path);
    }

    let legacy_path = app_data_dir.join(LEGACY_DATABASE_FILE_NAME);
    let youwee_local = app_data_dir.join("youwee.db");
    if legacy_path.exists() {
        migrate_legacy_database(&legacy_path, &db_path)?;
    } else if youwee_local.exists() {
        migrate_legacy_database(&youwee_local, &db_path)?;
    } else if let Some(parent) = app_data_dir.parent() {
        let old_dir_youwee = parent.join("com.vanloctech.youwee").join("youwee.db");
        let old_dir_legacy = parent.join("com.vanloctech.youwee").join(LEGACY_DATABASE_FILE_NAME);
        if old_dir_youwee.exists() {
            migrate_legacy_database(&old_dir_youwee, &db_path)?;
        } else if old_dir_legacy.exists() {
            migrate_legacy_database(&old_dir_legacy, &db_path)?;
        } else {
            remove_incomplete_database(&temp_db_path);
        }
    } else {
        remove_incomplete_database(&temp_db_path);
    }

    Ok(db_path)
}

fn rebuild_history_search_index(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM history_search_fts", [])
        .map_err(|e| format!("Failed to clear history search index: {}", e))?;
    conn.execute(
        "INSERT INTO history_search_fts (rowid, history_id, title, filepath, url, summary)
         SELECT rowid, id, title, filepath, url, COALESCE(summary, '') FROM history",
        [],
    )
    .map_err(|e| format!("Failed to rebuild history search index: {}", e))?;
    Ok(())
}

fn init_history_search_index(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS history_search_fts USING fts5(
            history_id UNINDEXED,
            title,
            filepath,
            url,
            summary,
            tokenize = 'unicode61 remove_diacritics 2'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create history search index: {}", e))?;

    conn.execute_batch(
        "CREATE TRIGGER IF NOT EXISTS history_search_insert AFTER INSERT ON history BEGIN
            INSERT INTO history_search_fts (rowid, history_id, title, filepath, url, summary)
            VALUES (new.rowid, new.id, new.title, new.filepath, new.url, COALESCE(new.summary, ''));
        END;
        CREATE TRIGGER IF NOT EXISTS history_search_delete AFTER DELETE ON history BEGIN
            DELETE FROM history_search_fts WHERE rowid = old.rowid;
        END;
        CREATE TRIGGER IF NOT EXISTS history_search_update AFTER UPDATE ON history BEGIN
            DELETE FROM history_search_fts WHERE rowid = old.rowid;
            INSERT INTO history_search_fts (rowid, history_id, title, filepath, url, summary)
            VALUES (new.rowid, new.id, new.title, new.filepath, new.url, COALESCE(new.summary, ''));
        END;",
    )
    .map_err(|e| format!("Failed to create history search triggers: {}", e))?;

    let history_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count history rows: {}", e))?;
    let search_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM history_search_fts", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Failed to count history search rows: {}", e))?;
    if history_count != search_count {
        rebuild_history_search_index(conn)?;
    }

    Ok(())
}

/// Initialize the SQLite database
pub fn init_database(app: &AppHandle) -> Result<(), String> {
    if DB_CONNECTION.get().is_some() {
        return Ok(());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    APP_DATA_DIR.set(app_data_dir.clone()).ok();

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    let db_path = resolve_database_path(&app_data_dir)?;

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode & busy timeout for concurrent read/write without UI freeze
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;").ok();

    // Create logs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            log_type TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT,
            url TEXT,
            created_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create logs table: {}", e))?;

    // Create indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(log_type)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC)",
        [],
    )
    .ok();

    // Create history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            thumbnail TEXT,
            filepath TEXT NOT NULL,
            filesize INTEGER,
            duration INTEGER,
            quality TEXT,
            format TEXT,
            source TEXT,
            downloaded_at INTEGER NOT NULL,
            summary TEXT,
            media_id TEXT,
            canonical_url TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create history table: {}", e))?;

    // Migration: Add summary column if it doesn't exist
    conn.execute("ALTER TABLE history ADD COLUMN summary TEXT", [])
        .ok(); // Ignore error if column already exists

    // Migration: Add time_range column if it doesn't exist
    conn.execute("ALTER TABLE history ADD COLUMN time_range TEXT", [])
        .ok(); // Ignore error if column already exists

    // Migration: Add duplicate detection identity columns if they don't exist
    conn.execute("ALTER TABLE history ADD COLUMN media_id TEXT", [])
        .ok(); // Ignore error if column already exists
    conn.execute("ALTER TABLE history ADD COLUMN canonical_url TEXT", [])
        .ok(); // Ignore error if column already exists
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_media_id ON history(media_id)",
        [],
    )
    .ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_canonical_url ON history(canonical_url)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create tags table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS history_tags (
            history_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            UNIQUE(history_id, tag_id)
        )",
        [],
    )
    .map_err(|e| format!("Failed to create history_tags table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL UNIQUE,
            color TEXT,
            created_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create collections table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS history_collections (
            history_id TEXT NOT NULL,
            collection_id TEXT NOT NULL,
            UNIQUE(history_id, collection_id)
        )",
        [],
    )
    .map_err(|e| format!("Failed to create history_collections table: {}", e))?;

    // Create history indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_downloaded ON history(downloaded_at DESC)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_source ON history(source)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tags_normalized_name ON tags(normalized_name)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_tags_history_id ON history_tags(history_id)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_tags_tag_id ON history_tags(tag_id)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_collections_normalized_name ON collections(normalized_name)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_collections_history_id ON history_collections(history_id)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_collections_collection_id ON history_collections(collection_id)",
        [],
    )
    .ok();

    // Keep history text search local and fast. If FTS5 is unavailable, history search
    // falls back to LIKE in the query layer.
    if let Err(e) = init_history_search_index(&conn) {
        log::warn!("{}", e);
    }

    // Create processing_jobs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS processing_jobs (
            id TEXT PRIMARY KEY,
            input_path TEXT NOT NULL,
            output_path TEXT,
            task_type TEXT NOT NULL,
            user_prompt TEXT,
            ffmpeg_command TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            progress REAL DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create processing_jobs table: {}", e))?;

    // Create processing_presets table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS processing_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            task_type TEXT NOT NULL,
            prompt_template TEXT NOT NULL,
            icon TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create processing_presets table: {}", e))?;

    // Create processing indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_processing_jobs_created ON processing_jobs(created_at DESC)",
        [],
    )
    .ok();

    // Create followed_channels table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS followed_channels (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            thumbnail TEXT,
            platform TEXT NOT NULL DEFAULT 'youtube',
            last_checked_at TEXT,
            last_video_id TEXT,
            check_interval INTEGER NOT NULL DEFAULT 15,
            auto_download INTEGER NOT NULL DEFAULT 0,
            download_quality TEXT NOT NULL DEFAULT 'best',
            download_format TEXT NOT NULL DEFAULT 'mp4',
            created_at TEXT NOT NULL,
            filter_min_duration INTEGER,
            filter_max_duration INTEGER,
            filter_include_keywords TEXT,
            filter_exclude_keywords TEXT,
            filter_max_videos INTEGER,
            download_threads INTEGER NOT NULL DEFAULT 1,
            download_video_codec TEXT NOT NULL DEFAULT 'h264',
            download_audio_bitrate TEXT NOT NULL DEFAULT '192',
            download_preferred_fps TEXT NOT NULL DEFAULT 'original',
            youtube_content_type TEXT NOT NULL DEFAULT 'videos',
            total_videos INTEGER
        )",
        [],
    )
    .map_err(|e| format!("Failed to create followed_channels table: {}", e))?;

    // Create channel_videos table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS channel_videos (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            thumbnail TEXT,
            duration REAL,
            upload_date TEXT,
            upload_timestamp INTEGER,
            video_type TEXT DEFAULT 'video',
            status TEXT NOT NULL DEFAULT 'new',
            created_at TEXT NOT NULL,
            FOREIGN KEY (channel_id) REFERENCES followed_channels(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Failed to create channel_videos table: {}", e))?;

    // Create channel indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_channel_videos_channel ON channel_videos(channel_id)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_channel_videos_status ON channel_videos(status)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_videos_unique ON channel_videos(channel_id, video_id)",
        [],
    )
    .ok();

    // Create persisted download queues table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS download_queues (
            queue_kind TEXT PRIMARY KEY,
            items_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create download_queues table: {}", e))?;

    // Migration: Add download_threads column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN download_threads INTEGER NOT NULL DEFAULT 1",
        [],
    )
    .ok();

    // Migration: Add download_video_codec column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN download_video_codec TEXT NOT NULL DEFAULT 'h264'",
        [],
    )
    .ok();

    // Migration: Add download_audio_bitrate column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN download_audio_bitrate TEXT NOT NULL DEFAULT '192'",
        [],
    )
    .ok();

    // Migration: Add download preferred FPS column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN download_preferred_fps TEXT NOT NULL DEFAULT 'original'",
        [],
    )
    .ok();

    // Migration: Add YouTube content type column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN youtube_content_type TEXT NOT NULL DEFAULT 'videos'",
        [],
    )
    .ok();

    // Migration: Add total_videos column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN total_videos INTEGER",
        [],
    )
    .ok();

    // Migration: Add upload_timestamp column if it doesn't exist
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN upload_timestamp INTEGER",
        [],
    )
    .ok();

    // Migration: Add video_type column if it doesn't exist
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN video_type TEXT DEFAULT 'video'",
        [],
    )
    .ok();

    // Migration: Update existing followed_channels to 'all' so they scan all tabs (videos, shorts, streams)
    conn.execute(
        "UPDATE followed_channels SET youtube_content_type = 'all' WHERE youtube_content_type = 'videos'",
        [],
    )
    .ok();

    // Migration: Add youtube_channel_id column to followed_channels for real-time RSS polling
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN youtube_channel_id TEXT",
        [],
    )
    .ok();

    // Migration: Add Reup pipeline settings & filename template to followed_channels
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN reup_mod_enabled INTEGER DEFAULT 0",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN reup_mod_speed REAL DEFAULT 1.03",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN reup_mod_pitch REAL DEFAULT 1.02",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN reup_mod_flip INTEGER DEFAULT 0",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN reup_mod_crop REAL DEFAULT 0.015",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN custom_filename_template TEXT",
        [],
    )
    .ok();

    // Migration: Add view_count to channel_videos
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN view_count INTEGER",
        [],
    )
    .ok();

    // Migration: Add risk assessment & BKT test mode to followed_channels
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN risk_status TEXT DEFAULT 'green'",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN risk_reason TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN bkt_test_mode INTEGER DEFAULT 0",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN bkt_profile_id TEXT",
        [],
    )
    .ok();

    // Migration: Add risk status, BKT auto-test & Reup level flags to channel_videos
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN risk_status TEXT DEFAULT 'green'",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN risk_reason TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN is_bkt_test INTEGER DEFAULT 0",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN bkt_youtube_id TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN bkt_check_status TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN bkt_restriction TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN reup_pipeline_level INTEGER DEFAULT 1",
        [],
    )
    .ok();

    // Migration: Add pipeline level, risk status & bkt fields to processing_jobs
    conn.execute(
        "ALTER TABLE processing_jobs ADD COLUMN pipeline_level INTEGER DEFAULT 1",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE processing_jobs ADD COLUMN risk_status TEXT DEFAULT 'green'",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE processing_jobs ADD COLUMN risk_reason TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE processing_jobs ADD COLUMN is_bkt_test INTEGER DEFAULT 0",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE processing_jobs ADD COLUMN channel_video_id TEXT",
        [],
    )
    .ok();

    // Outlier Hunter: Settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS outlier_hunter_settings (
            id TEXT PRIMARY KEY DEFAULT 'default',
            enabled INTEGER NOT NULL DEFAULT 1,
            niches TEXT NOT NULL DEFAULT '[\"review phim\",\"tin tức\",\"công nghệ\",\"giải trí\"]',
            min_views INTEGER NOT NULL DEFAULT 25000,
            max_subscribers INTEGER NOT NULL DEFAULT 25000,
            min_sub_outlier REAL NOT NULL DEFAULT 5.0,
            min_baseline_outlier REAL NOT NULL DEFAULT 5.0,
            min_duration INTEGER NOT NULL DEFAULT 180,
            min_vph REAL NOT NULL DEFAULT 300.0,
            min_engagement_rate REAL NOT NULL DEFAULT 0.012,
            min_comments INTEGER NOT NULL DEFAULT 15,
            auto_download INTEGER NOT NULL DEFAULT 0,
            auto_reup_level TEXT NOT NULL DEFAULT 'v1',
            auto_bkt_test INTEGER NOT NULL DEFAULT 0,
            scan_interval_minutes INTEGER NOT NULL DEFAULT 60,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| format!("Failed to create outlier_hunter_settings table: {}", e))?;

    // Migration: Update default outlier settings to modern adaptive thresholds (Ikigai golden niches)
    conn.execute(
        "UPDATE outlier_hunter_settings
         SET min_views = 3000,
             max_subscribers = 150000,
             min_sub_outlier = 1.8,
             min_baseline_outlier = 1.8,
             min_duration = 60,
             min_vph = 0.5,
             min_engagement_rate = 0.002,
             min_comments = 2
         WHERE id = 'default' AND min_views >= 20000",
        [],
    ).ok();

    // Outlier Hunter: Outlier Videos table with Sparkline history
    conn.execute(
        "CREATE TABLE IF NOT EXISTS outlier_videos (
            id TEXT PRIMARY KEY,
            niche TEXT NOT NULL,
            title TEXT NOT NULL,
            thumbnail_url TEXT NOT NULL DEFAULT '',
            channel_id TEXT NOT NULL,
            channel_name TEXT NOT NULL,
            subscribers INTEGER NOT NULL,
            views INTEGER NOT NULL,
            likes INTEGER NOT NULL DEFAULT 0,
            comments INTEGER NOT NULL DEFAULT 0,
            duration INTEGER NOT NULL,
            upload_timestamp INTEGER NOT NULL,
            hours_published REAL NOT NULL,
            avg_vph REAL NOT NULL,
            current_vph REAL,
            momentum_score REAL DEFAULT 1.0,
            sub_outlier_ratio REAL NOT NULL,
            baseline_median_views INTEGER NOT NULL,
            baseline_outlier_ratio REAL NOT NULL,
            engagement_rate REAL NOT NULL,
            view_history TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'discovered',
            local_filepath TEXT,
            reup_filepath TEXT,
            bkt_status TEXT DEFAULT 'none',
            opportunity_score REAL DEFAULT 0.0,
            demand_signal TEXT DEFAULT '',
            hook_analysis TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            last_ping_at TEXT NOT NULL,
            tags TEXT,
            categories TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create outlier_videos table: {}", e))?;

    conn.execute("ALTER TABLE outlier_videos ADD COLUMN opportunity_score REAL DEFAULT 0.0", []).ok();
    conn.execute("ALTER TABLE outlier_videos ADD COLUMN demand_signal TEXT DEFAULT ''", []).ok();
    conn.execute("ALTER TABLE outlier_videos ADD COLUMN hook_analysis TEXT DEFAULT ''", []).ok();
    conn.execute("ALTER TABLE outlier_videos ADD COLUMN acceleration_status TEXT DEFAULT ''", []).ok();
    conn.execute("ALTER TABLE outlier_videos ADD COLUMN view_velocity REAL DEFAULT 0.0", []).ok();
    conn.execute("ALTER TABLE outlier_videos ADD COLUMN tags TEXT", []).ok();
    conn.execute("ALTER TABLE outlier_videos ADD COLUMN categories TEXT", []).ok();

    conn.execute("CREATE INDEX IF NOT EXISTS idx_outlier_status ON outlier_videos(status)", []).ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_outlier_momentum ON outlier_videos(momentum_score DESC)", []).ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_outlier_niche ON outlier_videos(niche)", []).ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_outlier_opp ON outlier_videos(opportunity_score DESC)", []).ok();

    // BKT Test Channels Pool table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS bkt_test_channels (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            youtube_channel_name TEXT,
            youtube_channel_id TEXT,
            daily_quota INTEGER NOT NULL DEFAULT 15,
            daily_used INTEGER NOT NULL DEFAULT 0,
            last_reset_date TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            priority INTEGER NOT NULL DEFAULT 1,
            note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create bkt_test_channels table: {}", e))?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_bkt_test_channels_active ON bkt_test_channels(is_active)", []).ok();

    // BKT Test Jobs table (tracking individual test tasks)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS bkt_test_jobs (
            id TEXT PRIMARY KEY,
            test_channel_id TEXT NOT NULL,
            video_source_type TEXT NOT NULL,
            source_ref_id TEXT,
            video_title TEXT NOT NULL,
            video_path TEXT NOT NULL,
            reup_path TEXT,
            youtube_video_id TEXT,
            status TEXT NOT NULL DEFAULT 'queued',
            restriction TEXT,
            error_message TEXT,
            tested_date TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (test_channel_id) REFERENCES bkt_test_channels(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Failed to create bkt_test_jobs table: {}", e))?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_bkt_test_jobs_channel ON bkt_test_jobs(test_channel_id)", []).ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_bkt_test_jobs_status ON bkt_test_jobs(status)", []).ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_bkt_test_jobs_date ON bkt_test_jobs(tested_date)", []).ok();

    // Auto-Publish target profile columns migration
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN main_target_profile_id TEXT", []).ok();
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN auto_publish_main INTEGER DEFAULT 0", []).ok();
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN target_title TEXT", []).ok();
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN target_description TEXT", []).ok();
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN target_tags TEXT", []).ok();
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN thumbnail_path TEXT", []).ok();

    // Seamless migration: If legacy youwee.db exists, import existing data
    if let Some(parent) = app_data_dir.parent() {
        let old_youwee_db = parent.join("com.vanloctech.youwee").join("youwee.db");
        if old_youwee_db.exists() {
            let old_path_str = old_youwee_db.to_string_lossy().to_string();
            if conn.execute("ATTACH DATABASE ?1 AS old_youwee_db", params![old_path_str]).is_ok() {
                let _ = conn.execute("INSERT OR IGNORE INTO bkt_test_channels SELECT * FROM old_youwee_db.bkt_test_channels", []);
                let _ = conn.execute("INSERT OR IGNORE INTO followed_channels SELECT * FROM old_youwee_db.followed_channels", []);
                let _ = conn.execute("INSERT OR IGNORE INTO channel_videos SELECT * FROM old_youwee_db.channel_videos", []);
                let _ = conn.execute("INSERT OR IGNORE INTO outlier_videos SELECT * FROM old_youwee_db.outlier_videos", []);
                let _ = conn.execute("DETACH DATABASE old_youwee_db", []);
            }
        }
    }

    DB_CONNECTION
        .set(Mutex::new(conn))
        .map_err(|_| "Database already initialized".to_string())?;

    Ok(())
}

/// Get database connection
pub fn get_db() -> Result<std::sync::MutexGuard<'static, Connection>, String> {
    DB_CONNECTION
        .get()
        .ok_or_else(|| "Database not initialized".to_string())?
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))
}

#[cfg(test)]
pub fn db_test_guard() -> std::sync::MutexGuard<'static, ()> {
    DB_TEST_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .expect("lock shared database test mutex")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_temp_app_data_dir() -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("youwee-db-path-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp app data dir");
        dir
    }

    fn create_sample_database(path: &Path, message: &str) {
        let conn = Connection::open(path).expect("open sample database");
        conn.execute_batch(
            "CREATE TABLE logs (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                log_type TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT,
                url TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE history (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                thumbnail TEXT,
                filepath TEXT NOT NULL,
                filesize INTEGER,
                duration INTEGER,
                quality TEXT,
                format TEXT,
                source TEXT,
                downloaded_at INTEGER NOT NULL,
                summary TEXT
            );",
        )
        .expect("create sample tables");
        conn.execute(
            "INSERT INTO logs (id, timestamp, log_type, message, created_at)
             VALUES ('log-1', '2026-06-06T00:00:00Z', 'info', ?1, 1)",
            params![message],
        )
        .expect("insert sample log");
        conn.execute(
            "INSERT INTO history (id, url, title, filepath, downloaded_at)
             VALUES ('history-1', 'https://example.com/video', 'Sample video', '/tmp/video.mp4', 1)",
            [],
        )
        .expect("insert sample history");
    }

    #[test]
    fn resolves_new_database_path_without_creating_file() {
        let dir = make_temp_app_data_dir();
        let path = resolve_database_path(&dir).expect("resolve database path");

        assert_eq!(path, dir.join(DATABASE_FILE_NAME));
        assert!(!path.exists());
        assert!(!dir.join(LEGACY_DATABASE_FILE_NAME).exists());

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn migrates_legacy_database_and_keeps_backup() {
        let dir = make_temp_app_data_dir();
        let legacy_path = dir.join(LEGACY_DATABASE_FILE_NAME);
        create_sample_database(&legacy_path, "legacy log");

        let path = resolve_database_path(&dir).expect("migrate legacy database");

        assert_eq!(path, dir.join(DATABASE_FILE_NAME));
        assert!(path.exists());
        assert!(legacy_path.exists());
        assert!(!migrating_database_path(&path).exists());

        let conn = Connection::open(path).expect("open migrated database");
        let log_message: String = conn
            .query_row("SELECT message FROM logs WHERE id = 'log-1'", [], |row| {
                row.get(0)
            })
            .expect("read migrated log");
        let history_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
            .expect("count migrated history");
        assert_eq!(log_message, "legacy log");
        assert_eq!(history_count, 1);

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn removes_stale_migrating_database_when_resolving_path() {
        let dir = make_temp_app_data_dir();
        let db_path = dir.join(DATABASE_FILE_NAME);
        let temp_db_path = migrating_database_path(&db_path);
        fs::write(&temp_db_path, b"incomplete").expect("write stale migrating database");

        let path = resolve_database_path(&dir).expect("resolve database path");

        assert_eq!(path, db_path);
        assert!(!temp_db_path.exists());

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn existing_new_database_is_not_overwritten_by_legacy_database() {
        let dir = make_temp_app_data_dir();
        let legacy_path = dir.join(LEGACY_DATABASE_FILE_NAME);
        let db_path = dir.join(DATABASE_FILE_NAME);
        create_sample_database(&legacy_path, "legacy log");
        create_sample_database(&db_path, "new log");
        let temp_db_path = migrating_database_path(&db_path);
        fs::write(&temp_db_path, b"incomplete").expect("write stale migrating database");

        let path = resolve_database_path(&dir).expect("resolve existing new database");

        assert_eq!(path, db_path);
        assert!(!temp_db_path.exists());
        let conn = Connection::open(path).expect("open existing new database");
        let log_message: String = conn
            .query_row("SELECT message FROM logs WHERE id = 'log-1'", [], |row| {
                row.get(0)
            })
            .expect("read existing new log");
        assert_eq!(log_message, "new log");

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn migrates_committed_legacy_wal_data() {
        let dir = make_temp_app_data_dir();
        let legacy_path = dir.join(LEGACY_DATABASE_FILE_NAME);
        let legacy_conn = Connection::open(&legacy_path).expect("open legacy database");
        legacy_conn
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                PRAGMA wal_autocheckpoint = 0;
                CREATE TABLE logs (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    log_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    details TEXT,
                    url TEXT,
                    created_at INTEGER NOT NULL
                );
                INSERT INTO logs (id, timestamp, log_type, message, created_at)
                VALUES ('wal-log', '2026-06-06T00:00:00Z', 'info', 'wal log', 1);",
            )
            .expect("create legacy WAL database");

        let path = resolve_database_path(&dir).expect("migrate legacy WAL database");
        drop(legacy_conn);

        let conn = Connection::open(path).expect("open migrated database");
        let log_message: String = conn
            .query_row("SELECT message FROM logs WHERE id = 'wal-log'", [], |row| {
                row.get(0)
            })
            .expect("read migrated WAL log");
        assert_eq!(log_message, "wal log");

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn corrupt_legacy_database_fails_without_creating_new_database() {
        let dir = make_temp_app_data_dir();
        let legacy_path = dir.join(LEGACY_DATABASE_FILE_NAME);
        let db_path = dir.join(DATABASE_FILE_NAME);
        fs::write(&legacy_path, b"not a sqlite database").expect("write corrupt legacy database");

        let err = resolve_database_path(&dir).expect_err("expected migration failure");

        assert!(err.contains("Failed to migrate legacy database"));
        assert!(legacy_path.exists());
        assert!(!db_path.exists());
        assert!(!migrating_database_path(&db_path).exists());

        fs::remove_dir_all(dir).ok();
    }
}
