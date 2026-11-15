use std::collections::HashSet;
use std::sync::atomic::AtomicU32;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use tauri::AppHandle;
use tokio::sync::{mpsc, oneshot, Semaphore};

use crate::types::BktTestJob;

pub struct BktWorkerTask {
    pub app: AppHandle,
    pub job: BktTestJob,
    pub profile_id: String,
}

#[allow(dead_code)]
pub struct ActiveBktJobController {
    pub job_id: String,
    pub profile_id: String,
    pub video_path: String,
    pub reup_path: Arc<RwLock<Option<String>>>,
    pub child_pid: Arc<AtomicU32>,
    pub cancel_tx: Option<oneshot::Sender<()>>,
}

pub(crate) static BKT_SEMAPHORE: OnceLock<Arc<Semaphore>> = OnceLock::new();
pub(crate) static BKT_TASK_SENDER: OnceLock<mpsc::UnboundedSender<BktWorkerTask>> = OnceLock::new();
pub(crate) static CANCELLED_BKT_JOBS: OnceLock<Arc<RwLock<HashSet<String>>>> = OnceLock::new();
pub(crate) static CURRENT_ACTIVE_JOB: OnceLock<Mutex<Option<ActiveBktJobController>>> = OnceLock::new();

/// Lấy Semaphore giới hạn số lượng tác vụ BKT chạy đồng thời (mặc định 1 video tại 1 thời điểm)
pub fn get_bkt_semaphore() -> &'static Arc<Semaphore> {
    BKT_SEMAPHORE.get_or_init(|| Arc::new(Semaphore::new(1)))
}

pub(crate) fn get_cancelled_bkt_jobs() -> &'static Arc<RwLock<HashSet<String>>> {
    CANCELLED_BKT_JOBS.get_or_init(|| Arc::new(RwLock::new(HashSet::new())))
}

pub(crate) fn get_active_job_lock() -> &'static Mutex<Option<ActiveBktJobController>> {
    CURRENT_ACTIVE_JOB.get_or_init(|| Mutex::new(None))
}

pub mod cancel;
pub mod crud;
pub mod dispatch;
pub mod pipeline;
pub mod publish;

pub use cancel::*;
pub use crud::*;
pub use dispatch::*;
pub use pipeline::*;
pub use publish::*;
