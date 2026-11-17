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

fn configure_connection(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")
        .map_err(|e| format!("Failed to configure database connection: {e}"))
}

fn migrate_bkt_test_jobs_foreign_key(conn: &Connection) -> Result<(), String> {
    let channel_foreign_key_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_foreign_key_list('bkt_test_jobs')
             WHERE \"from\" = 'test_channel_id'
               AND \"table\" = 'bkt_test_channels'
               AND \"to\" = 'id'
               AND on_delete = 'CASCADE'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to inspect bkt_test_jobs channel foreign key: {e}"))?;
    let orphan_jobs: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM bkt_test_jobs AS jobs
             LEFT JOIN bkt_test_channels AS channels
               ON channels.id = jobs.test_channel_id
             WHERE channels.id IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to inspect orphan bkt_test_jobs: {e}"))?;
    if orphan_jobs > 0 {
        return Err(format!(
            "Cannot migrate bkt_test_jobs: {orphan_jobs} job(s) reference missing bkt_test_channels"
        ));
    }
    if channel_foreign_key_count > 0 {
        return Ok(());
    }

    let table_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bkt_test_jobs'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to inspect bkt_test_jobs table definition: {e}"))?;
    let has_test_profile_id: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('bkt_test_jobs') WHERE name = 'test_profile_id'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to inspect bkt_test_jobs test profile column: {e}"))?;
    let test_profile_select = if has_test_profile_id > 0 {
        "test_profile_id"
    } else {
        "NULL"
    };
    let mut table_definition_sql = table_sql.trim().trim_end_matches(';').to_string();
    if has_test_profile_id == 0 {
        let closing = table_definition_sql
            .rfind(')')
            .ok_or_else(|| "Failed to locate bkt_test_jobs table definition end".to_string())?;
        table_definition_sql.insert_str(closing, ", test_profile_id TEXT");
    }
    let closing = table_definition_sql
        .rfind(')')
        .ok_or_else(|| "Failed to locate bkt_test_jobs table definition end".to_string())?;
    table_definition_sql.insert_str(
        closing,
        ", FOREIGN KEY (test_channel_id) REFERENCES bkt_test_channels(id) ON DELETE CASCADE",
    );

    let mut schema_object_stmt = conn
        .prepare(
            "SELECT sql FROM sqlite_master
             WHERE tbl_name = 'bkt_test_jobs'
               AND type IN ('index', 'trigger')
               AND sql IS NOT NULL
               AND name NOT LIKE 'sqlite_autoindex_%'
               AND name NOT IN (
                    'idx_bkt_test_jobs_channel',
                    'idx_bkt_test_jobs_status',
                    'idx_bkt_test_jobs_date'
               )
             ORDER BY type, name",
        )
        .map_err(|e| format!("Failed to inspect bkt_test_jobs indexes and triggers: {e}"))?;
    let schema_objects: Vec<String> = schema_object_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to read bkt_test_jobs indexes and triggers: {e}"))?
        .collect::<Result<_, _>>()
        .map_err(|e| format!("Failed to parse bkt_test_jobs indexes and triggers: {e}"))?;
    drop(schema_object_stmt);

    let schema_objects_sql = schema_objects
        .into_iter()
        .map(|sql| format!("{sql};"))
        .collect::<String>();

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to begin bkt_test_jobs foreign-key migration: {e}"))?;
    tx.execute_batch(&format!(
        "ALTER TABLE bkt_test_jobs RENAME TO bkt_test_jobs_legacy;
         {table_definition_sql};
         INSERT INTO bkt_test_jobs (
            id, test_channel_id, video_source_type, source_ref_id,
            video_title, video_path, reup_path, youtube_video_id,
            status, restriction, error_message, tested_date, created_at, updated_at,
            main_target_profile_id, auto_publish_main, target_title, target_description,
            target_tags, thumbnail_path, channel_id, target_profile_id, test_profile_id
         )
         SELECT id, test_channel_id, video_source_type, source_ref_id,
            video_title, video_path, reup_path, youtube_video_id,
            status, restriction, error_message, tested_date, created_at, updated_at,
            main_target_profile_id, auto_publish_main, target_title, target_description,
            target_tags, thumbnail_path, channel_id, target_profile_id, {test_profile_select}
         FROM bkt_test_jobs_legacy;
         DROP TABLE bkt_test_jobs_legacy;
         CREATE INDEX IF NOT EXISTS idx_bkt_test_jobs_channel ON bkt_test_jobs(test_channel_id);
         CREATE INDEX IF NOT EXISTS idx_bkt_test_jobs_status ON bkt_test_jobs(status);
         CREATE INDEX IF NOT EXISTS idx_bkt_test_jobs_date ON bkt_test_jobs(tested_date);
         {schema_objects_sql}",
        schema_objects_sql = schema_objects_sql,
        test_profile_select = test_profile_select
    ))
    .map_err(|e| format!("Failed to migrate bkt_test_jobs foreign key: {e}"))?;
    tx.commit()
        .map_err(|e| format!("Failed to commit bkt_test_jobs foreign-key migration: {e}"))
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

    // Xử lý tệp rỗng/hỏng (0 bytes) do tiến trình hoặc script cũ để lại
    if db_path.exists() {
        if let Ok(meta) = std::fs::metadata(&db_path) {
            if meta.len() == 0 {
                let _ = std::fs::remove_file(&db_path);
            }
        }
    }

    if db_path.exists() {
        if let Ok(meta) = std::fs::metadata(&db_path) {
            if meta.len() > 1024 {
                remove_incomplete_database(&temp_db_path);
                return Ok(db_path);
            }
        }
    }

    // 1. Tệp di sản ngay trong thư mục app_data_dir hiện tại
    let legacy_path = app_data_dir.join(LEGACY_DATABASE_FILE_NAME);
    let youwee_local = app_data_dir.join("youwee.db");
    if legacy_path.exists() {
        migrate_legacy_database(&legacy_path, &db_path)?;
        return Ok(db_path);
    } else if youwee_local.exists() {
        migrate_legacy_database(&youwee_local, &db_path)?;
        return Ok(db_path);
    }

    #[allow(unused_mut)]
    let mut candidate_paths: Vec<PathBuf> = Vec::new();

    // 2. Quét các thư mục anh em trong cùng parent (bỏ qua khi chạy unit test)
    #[cfg(not(test))]
    if let Some(parent) = app_data_dir.parent() {
        candidate_paths.push(parent.join("com.retubematrix.app").join(DATABASE_FILE_NAME));
        candidate_paths.push(parent.join("RETubeMatrix").join(DATABASE_FILE_NAME));
        candidate_paths.push(parent.join("com.retubematrix.v2").join(DATABASE_FILE_NAME));
        candidate_paths.push(parent.join("com.vanloctech.youwee").join(DATABASE_FILE_NAME));
        candidate_paths.push(parent.join("com.vanloctech.youwee").join("youwee.db"));
        candidate_paths.push(parent.join("com.vanloctech.youwee").join(LEGACY_DATABASE_FILE_NAME));
    }

    // 3. Quét chéo thư mục Roaming (%APPDATA%) trên Windows (bỏ qua khi chạy unit test)
    #[cfg(not(test))]
    if let Ok(appdata) = std::env::var("APPDATA") {
        let roaming_dir = PathBuf::from(appdata);
        candidate_paths.push(roaming_dir.join("com.retubematrix.app").join(DATABASE_FILE_NAME));
        candidate_paths.push(roaming_dir.join("RETubeMatrix").join(DATABASE_FILE_NAME));
        candidate_paths.push(roaming_dir.join("com.vanloctech.youwee").join(DATABASE_FILE_NAME));
        candidate_paths.push(roaming_dir.join("com.vanloctech.youwee").join("youwee.db"));
        candidate_paths.push(roaming_dir.join("com.vanloctech.youwee").join(LEGACY_DATABASE_FILE_NAME));
    }

    // 4. Quét chéo thư mục Local (%LOCALAPPDATA%) trên Windows (bỏ qua khi chạy unit test)
    #[cfg(not(test))]
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let local_dir = PathBuf::from(local_appdata);
        candidate_paths.push(local_dir.join("com.retubematrix.app").join(DATABASE_FILE_NAME));
        candidate_paths.push(local_dir.join("RETubeMatrix").join(DATABASE_FILE_NAME));
        candidate_paths.push(local_dir.join("com.vanloctech.youwee").join(DATABASE_FILE_NAME));
        candidate_paths.push(local_dir.join("com.vanloctech.youwee").join("youwee.db"));
        candidate_paths.push(local_dir.join("com.vanloctech.youwee").join(LEGACY_DATABASE_FILE_NAME));
    }

    // Lọc các ứng viên hợp lệ, loại trừ chính db_path và sắp xếp theo dung lượng giảm dần (ưu tiên DB có dữ liệu lớn nhất)
    let mut valid_candidates: Vec<(PathBuf, u64)> = candidate_paths
        .into_iter()
        .filter(|p| p != &db_path && p.exists())
        .filter_map(|p| {
            let meta = std::fs::metadata(&p).ok()?;
            if meta.len() > 1024 {
                Some((p, meta.len()))
            } else {
                None
            }
        })
        .collect();

    valid_candidates.sort_by(|a, b| b.1.cmp(&a.1));

    let mut migrated = false;
    for (cand, len) in valid_candidates {
        log::info!(
            "[DB RESOLVE] Thử khôi phục dữ liệu từ candidate: {} ({} bytes) -> {}",
            cand.display(),
            len,
            db_path.display()
        );
        if migrate_legacy_database(&cand, &db_path).is_ok() {
            migrated = true;
            break;
        }
    }

    if !migrated {
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

    // Enable foreign keys, WAL mode, busy timeout for safe concurrent access.
    configure_connection(&conn)?;

    // Create logs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            log_type TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT,
            url TEXT,
            trace_id TEXT,
            feature TEXT,
            operation TEXT,
            stage TEXT,
            status TEXT,
            error_code TEXT,
            retryable INTEGER,
            duration_ms INTEGER,
            context_json TEXT,
            created_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create logs table: {}", e))?;

    for column in [
        ("trace_id", "TEXT"),
        ("feature", "TEXT"),
        ("operation", "TEXT"),
        ("stage", "TEXT"),
        ("status", "TEXT"),
        ("error_code", "TEXT"),
        ("retryable", "INTEGER"),
        ("duration_ms", "INTEGER"),
        ("context_json", "TEXT"),
    ] {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('logs') WHERE name = ?1",
                [column.0],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to inspect logs column {}: {e}", column.0))?;
        if exists == 0 {
            conn.execute(
                &format!("ALTER TABLE logs ADD COLUMN {} {}", column.0, column.1),
                [],
            )
            .map_err(|e| format!("Failed to add logs column {}: {e}", column.0))?;
        }
    }

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
            total_videos INTEGER,
            consecutive_green_count INTEGER NOT NULL DEFAULT 0,
            enable_fast_track INTEGER NOT NULL DEFAULT 0
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
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN target_profile_id TEXT",
        [],
    )
    .ok();
    // Seamless sync: Migrate existing bkt_profile_id to target_profile_id
    conn.execute(
        "UPDATE followed_channels SET target_profile_id = bkt_profile_id WHERE (target_profile_id IS NULL OR target_profile_id = '') AND (bkt_profile_id IS NOT NULL AND bkt_profile_id != '')",
        [],
    )
    .ok();

    // Migration: Add Trusted Channel Fast-Track columns to followed_channels
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN consecutive_green_count INTEGER NOT NULL DEFAULT 0",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN enable_fast_track INTEGER NOT NULL DEFAULT 0",
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
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN original_title TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN original_description TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE channel_videos ADD COLUMN description TEXT",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN direct_upload_target INTEGER NOT NULL DEFAULT 0",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN upload_interval_minutes INTEGER NOT NULL DEFAULT 45",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN upload_interval_mode TEXT NOT NULL DEFAULT 'auto_30_60'",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN download_mode TEXT NOT NULL DEFAULT 'all'",
        [],
    )
    .ok();
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN is_trusted_clean INTEGER NOT NULL DEFAULT 0",
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
    // Legacy databases may predate updated_at; add the non-null column safely.
    conn.execute(
        "ALTER TABLE bkt_test_channels ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
        [],
    )
    .ok();
    conn.execute(
        "UPDATE bkt_test_channels SET updated_at = CURRENT_TIMESTAMP WHERE updated_at = ''",
        [],
    )
    .ok();

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
            test_profile_id TEXT,
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
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN channel_id TEXT", []).ok();
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN target_profile_id TEXT", []).ok();
    conn.execute("ALTER TABLE bkt_test_jobs ADD COLUMN test_profile_id TEXT", []).ok();
    // Seamless sync: Migrate main_target_profile_id to target_profile_id
    conn.execute(
        "UPDATE bkt_test_jobs SET target_profile_id = main_target_profile_id WHERE (target_profile_id IS NULL OR target_profile_id = '') AND (main_target_profile_id IS NOT NULL AND main_target_profile_id != '')",
        [],
    ).ok();
    migrate_bkt_test_jobs_foreign_key(&conn)?;

    // Seamless migration: If legacy youwee.db exists, import existing data ONCE (preserve backup)
    if let Some(parent) = app_data_dir.parent() {
        let old_dir = parent.join("com.vanloctech.youwee");
        let old_youwee_db = old_dir.join("youwee.db");
        let migrated_flag = old_dir.join("youwee.db.migrated");
        if old_youwee_db.exists() && !migrated_flag.exists() {
            let old_path_str = old_youwee_db.to_string_lossy().to_string();
            if conn.execute("ATTACH DATABASE ?1 AS old_youwee_db", params![old_path_str]).is_ok() {
                let _ = conn.execute("INSERT OR IGNORE INTO bkt_test_channels SELECT * FROM old_youwee_db.bkt_test_channels", []);
                let _ = conn.execute("INSERT OR IGNORE INTO followed_channels SELECT * FROM old_youwee_db.followed_channels", []);
                let _ = conn.execute("INSERT OR IGNORE INTO channel_videos SELECT * FROM old_youwee_db.channel_videos", []);
                let _ = conn.execute("INSERT OR IGNORE INTO outlier_videos SELECT * FROM old_youwee_db.outlier_videos", []);
                let _ = conn.execute("DETACH DATABASE old_youwee_db", []);
                // Tạo cờ đánh dấu đã migration xong để không import đè lại dữ liệu người dùng đã xóa
                let _ = std::fs::copy(&old_youwee_db, &migrated_flag);
            }
        }
    }

    // Cross-candidate fallback: Nếu followed_channels rỗng (0 dòng) nhưng có DB anh em chứa dữ liệu, tự động import phục hồi
    let current_channel_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM followed_channels", [], |r| r.get(0))
        .unwrap_or(0);
    if current_channel_count == 0 {
        let mut check_dirs = Vec::new();
        if let Some(parent) = app_data_dir.parent() {
            check_dirs.push(parent.join("com.retubematrix.app"));
            check_dirs.push(parent.join("RETubeMatrix"));
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            let roaming_dir = PathBuf::from(appdata);
            check_dirs.push(roaming_dir.join("com.retubematrix.app"));
            check_dirs.push(roaming_dir.join("RETubeMatrix"));
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let local_dir = PathBuf::from(local);
            check_dirs.push(local_dir.join("com.retubematrix.app"));
            check_dirs.push(local_dir.join("RETubeMatrix"));
        }

        for dir in check_dirs {
            let cand_file = dir.join(DATABASE_FILE_NAME);
            if cand_file != db_path && cand_file.exists() {
                if let Ok(meta) = std::fs::metadata(&cand_file) {
                    if meta.len() > 1024 {
                        let cand_str = cand_file.to_string_lossy().to_string();
                        if conn.execute("ATTACH DATABASE ?1 AS cand_db", params![cand_str]).is_ok() {
                            let _ = conn.execute("INSERT OR IGNORE INTO followed_channels SELECT * FROM cand_db.followed_channels", []);
                            let _ = conn.execute("INSERT OR IGNORE INTO channel_videos SELECT * FROM cand_db.channel_videos", []);
                            let _ = conn.execute("INSERT OR IGNORE INTO bkt_test_channels SELECT * FROM cand_db.bkt_test_channels", []);
                            let _ = conn.execute("INSERT OR IGNORE INTO bkt_test_jobs SELECT * FROM cand_db.bkt_test_jobs", []);
                            let _ = conn.execute("INSERT OR IGNORE INTO outlier_videos SELECT * FROM cand_db.outlier_videos", []);
                            let _ = conn.execute("INSERT OR IGNORE INTO history SELECT * FROM cand_db.history", []);
                            let _ = conn.execute("DETACH DATABASE cand_db", []);
                            log::info!("[DB HEAL] Đã khôi phục dữ liệu từ candidate DB: {}", cand_file.display());
                            break;
                        }
                    }
                }
            }
        }
    }

    // Startup Reconcile Sweep: Quét và giải phóng các tác vụ BKT bị gián đoạn khi app tắt/khởi động lại
    let _ = super::reconcile_bkt_jobs_on_startup_db(&conn);

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
    let mutex = DB_TEST_LOCK.get_or_init(|| Mutex::new(()));
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
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
    fn enables_foreign_keys_for_each_connection() {
        let conn = Connection::open_in_memory().expect("open test connection");
        configure_connection(&conn).expect("configure test connection");
        let enabled: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("read foreign key pragma");
        assert_eq!(enabled, 1);
    }

    #[test]
    fn migrates_when_an_unrelated_foreign_key_already_exists() {
        let conn = Connection::open_in_memory().expect("open test connection");
        configure_connection(&conn).expect("configure test connection");
        conn.execute_batch(
            "CREATE TABLE source_types (id TEXT PRIMARY KEY);
             CREATE TABLE bkt_test_channels (id TEXT PRIMARY KEY);
             CREATE TABLE bkt_test_jobs (
                id TEXT PRIMARY KEY,
                test_channel_id TEXT NOT NULL,
                video_source_type TEXT NOT NULL,
                source_ref_id TEXT,
                video_title TEXT NOT NULL,
                video_path TEXT NOT NULL,
                reup_path TEXT,
                youtube_video_id TEXT,
                status TEXT NOT NULL,
                restriction TEXT,
                error_message TEXT,
                tested_date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                main_target_profile_id TEXT,
                auto_publish_main INTEGER DEFAULT 0,
                target_title TEXT,
                target_description TEXT,
                target_tags TEXT,
                thumbnail_path TEXT,
                channel_id TEXT,
                target_profile_id TEXT,
                test_profile_id TEXT,
                FOREIGN KEY (video_source_type) REFERENCES source_types(id)
                    MATCH FULL ON UPDATE CASCADE ON DELETE SET NULL
                    DEFERRABLE INITIALLY DEFERRED
             );
             INSERT INTO source_types (id) VALUES ('local_file');
             INSERT INTO bkt_test_channels (id) VALUES ('channel-1');
             INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                status, tested_date, created_at, updated_at, test_profile_id
             ) VALUES ('job-1', 'channel-1', 'local_file', 'title', 'video.mp4',
                       'queued', '2026-11-13', '2026-11-13', '2026-11-13', 'snapshot-profile');",
        )
        .expect("create legacy schema with unrelated foreign key");
        conn.execute_batch(
            "CREATE INDEX idx_bkt_test_jobs_channel ON bkt_test_jobs(test_channel_id);
             CREATE INDEX idx_bkt_test_jobs_status ON bkt_test_jobs(status);
             CREATE INDEX idx_bkt_test_jobs_date ON bkt_test_jobs(tested_date);
             CREATE INDEX idx_bkt_test_jobs_custom_title ON bkt_test_jobs(video_title);
             CREATE TABLE bkt_job_audit (job_id TEXT NOT NULL, status TEXT NOT NULL);
             CREATE TRIGGER bkt_test_jobs_audit_update
             AFTER UPDATE OF status ON bkt_test_jobs
             BEGIN
                 INSERT INTO bkt_job_audit(job_id, status) VALUES (NEW.id, NEW.status);
             END;",
        )
        .expect("create legacy BKT indexes and trigger");

        migrate_bkt_test_jobs_foreign_key(&conn).expect("migrate missing BKT channel foreign key");

        let preserved_profile: String = conn
            .query_row(
                "SELECT test_profile_id FROM bkt_test_jobs WHERE id = 'job-1'",
                [],
                |row| row.get(0),
            )
            .expect("read preserved test profile snapshot");
        assert_eq!(preserved_profile, "snapshot-profile");

        let custom_index_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_bkt_test_jobs_custom_title'",
                [],
                |row| row.get(0),
            )
            .expect("read preserved custom BKT index");
        assert_eq!(custom_index_count, 1);
        for index_name in [
            "idx_bkt_test_jobs_channel",
            "idx_bkt_test_jobs_status",
            "idx_bkt_test_jobs_date",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?1",
                    [index_name],
                    |row| row.get(0),
                )
                .expect("read standard BKT index count");
            assert_eq!(count, 1, "standard index must exist exactly once: {index_name}");
        }
        let custom_trigger_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name = 'bkt_test_jobs_audit_update'",
                [],
                |row| row.get(0),
            )
            .expect("read preserved BKT trigger");
        assert_eq!(custom_trigger_count, 1);
        conn.execute("UPDATE bkt_test_jobs SET status = 'checking' WHERE id = 'job-1'", [])
            .expect("run preserved BKT trigger");
        let audit_status: String = conn
            .query_row("SELECT status FROM bkt_job_audit WHERE job_id = 'job-1'", [], |row| row.get(0))
            .expect("read preserved BKT trigger output");
        assert_eq!(audit_status, "checking");

        let channel_fk_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_foreign_key_list('bkt_test_jobs')
                 WHERE \"from\" = 'test_channel_id' AND \"table\" = 'bkt_test_channels' AND \"to\" = 'id'",
                [],
                |row| row.get(0),
            )
            .expect("read migrated channel foreign key");
        assert_eq!(channel_fk_count, 1);
        let source_fk_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_foreign_key_list('bkt_test_jobs')
                 WHERE \"from\" = 'video_source_type' AND \"table\" = 'source_types' AND \"to\" = 'id'",
                [],
                |row| row.get(0),
            )
            .expect("read preserved source type foreign key");
        assert_eq!(source_fk_count, 1);
        let source_fk = conn
            .query_row(
                "SELECT on_update, on_delete, match FROM pragma_foreign_key_list('bkt_test_jobs')
                 WHERE \"from\" = 'video_source_type'",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
            )
            .expect("read preserved source foreign-key actions");
        assert_eq!(source_fk.0, "CASCADE");
        assert_eq!(source_fk.1, "SET NULL");
        let source_table_sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bkt_test_jobs'",
                [],
                |row| row.get(0),
            )
            .expect("read migrated table SQL");
        assert!(source_table_sql.contains("MATCH FULL"));
        assert!(source_table_sql.contains("DEFERRABLE INITIALLY DEFERRED"));
    }

    #[test]
    fn rejects_orphans_even_when_required_channel_foreign_key_already_exists() {
        let conn = Connection::open_in_memory().expect("open test connection");
        configure_connection(&conn).expect("configure test connection");
        conn.execute_batch(
            "CREATE TABLE bkt_test_channels (id TEXT PRIMARY KEY);
             CREATE TABLE bkt_test_jobs (
                id TEXT PRIMARY KEY,
                test_channel_id TEXT NOT NULL REFERENCES bkt_test_channels(id) ON DELETE CASCADE,
                video_source_type TEXT NOT NULL,
                video_title TEXT NOT NULL,
                video_path TEXT NOT NULL,
                status TEXT NOT NULL,
                tested_date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
             );
             PRAGMA foreign_keys = OFF;
             INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                status, tested_date, created_at, updated_at
             ) VALUES ('orphan-job', 'missing-channel', 'local_file', 'title', 'video.mp4',
                       'queued', '2026-11-13', '2026-11-13', '2026-11-13');
             PRAGMA foreign_keys = ON;",
        )
        .expect("create orphan schema");

        let result = migrate_bkt_test_jobs_foreign_key(&conn);
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(error.contains("missing bkt_test_channels"), "unexpected migration error: {error}");
    }

    #[test]
    fn migrates_legacy_bkt_jobs_foreign_key_and_preserves_cascade() {
        let conn = Connection::open_in_memory().expect("open test connection");
        configure_connection(&conn).expect("configure test connection");
        conn.execute_batch(
            "CREATE TABLE bkt_test_channels (id TEXT PRIMARY KEY);
             CREATE TABLE bkt_test_jobs (
                id TEXT PRIMARY KEY,
                test_channel_id TEXT NOT NULL,
                video_source_type TEXT NOT NULL,
                source_ref_id TEXT,
                video_title TEXT NOT NULL,
                video_path TEXT NOT NULL,
                reup_path TEXT,
                youtube_video_id TEXT,
                status TEXT NOT NULL,
                restriction TEXT,
                error_message TEXT,
                tested_date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                main_target_profile_id TEXT,
                auto_publish_main INTEGER DEFAULT 0,
                target_title TEXT,
                target_description TEXT,
                target_tags TEXT,
                thumbnail_path TEXT,
                channel_id TEXT,
                target_profile_id TEXT
             );
             INSERT INTO bkt_test_channels (id) VALUES ('channel-1');
             INSERT INTO bkt_test_jobs (
                id, test_channel_id, video_source_type, video_title, video_path,
                status, tested_date, created_at, updated_at
             ) VALUES ('job-1', 'channel-1', 'local_file', 'title', 'video.mp4',
                       'queued', '2026-11-13', '2026-11-13', '2026-11-13');",
        )
        .expect("create legacy BKT schema");

        migrate_bkt_test_jobs_foreign_key(&conn).expect("migrate legacy BKT foreign key");

        let foreign_key_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_list('bkt_test_jobs')", [], |row| row.get(0))
            .expect("read migrated BKT foreign keys");
        assert_eq!(foreign_key_count, 1);
        let preserved_jobs: i64 = conn
            .query_row("SELECT COUNT(*) FROM bkt_test_jobs", [], |row| row.get(0))
            .expect("read migrated BKT jobs");
        assert_eq!(preserved_jobs, 1);

        conn.execute("DELETE FROM bkt_test_channels WHERE id = 'channel-1'", [])
            .expect("delete parent channel");
        let remaining_jobs: i64 = conn
            .query_row("SELECT COUNT(*) FROM bkt_test_jobs", [], |row| row.get(0))
            .expect("read cascaded BKT jobs");
        assert_eq!(remaining_jobs, 0);
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
