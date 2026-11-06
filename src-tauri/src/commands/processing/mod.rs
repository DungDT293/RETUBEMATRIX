//! Các tiện ích media còn được dùng sau khi xóa trang Processing.
//!
//! Chỉ giữ:
//! - `get_video_metadata` cho SplitMediaDialog / Reup.
//! - `generate_video_thumbnail` cho DuplicateDownloadDialog.

mod metadata;
mod preview;

pub use metadata::*;
pub use preview::*;
