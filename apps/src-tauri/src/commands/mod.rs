pub mod account;
pub mod apikey;
pub mod login;
pub mod requestlog;
pub mod service;
pub mod shared;
pub mod settings;
pub mod system;
pub mod startup;
pub mod updater;
pub mod usage;
mod registry;

pub(crate) use registry::invoke_handler;
