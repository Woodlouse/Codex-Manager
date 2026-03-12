pub mod portable {
    pub fn bootstrap_current_process() {
        crate::process_env::load_env_from_exe_dir();
        crate::process_env::ensure_default_db_path();
        let _ = crate::rpc_auth_token();
    }
}

pub fn initialize_storage_if_needed() -> Result<(), String> {
    crate::storage_helpers::initialize_storage()
}
