pub mod account;
pub mod apikey;
pub mod login;
mod registry;
pub mod requestlog;
pub mod service;
pub mod settings;
pub mod shared;
pub mod startup;
pub mod system;
pub mod updater;
pub mod usage;

pub(crate) use registry::invoke_handler;
