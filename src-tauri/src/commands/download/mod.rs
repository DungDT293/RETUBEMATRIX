//! Download command and processing engine module.

pub mod args;
pub mod executor;
pub mod parser;
pub mod process;
pub mod templates;
pub mod workflows;

use std::sync::atomic::AtomicBool;

pub static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

pub use executor::*;
pub use templates::resolve_filename_template;


