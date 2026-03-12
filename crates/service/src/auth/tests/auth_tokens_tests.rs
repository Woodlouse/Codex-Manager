use super::next_account_sort;
use crate::account_identity::{build_account_storage_id, pick_existing_account_id_by_identity};
use codexmanager_core::storage::{now_ts, Account, Storage};

fn build_account(
    id: &str,
    chatgpt_account_id: Option<&str>,
    workspace_id: Option<&str>,
) -> Account {
    let now = now_ts();
    Account {
        id: id.to_string(),
        label: id.to_string(),
        issuer: "https://auth.openai.com".to_string(),
        chatgpt_account_id: chatgpt_account_id.map(|v| v.to_string()),
        workspace_id: workspace_id.map(|v| v.to_string()),
        group_name: None,
        sort: 0,
        status: "active".to_string(),
        created_at: now,
        updated_at: now,
    }
}

#[test]
fn pick_existing_account_requires_exact_scope_when_workspace_present() {
    let storage = Storage::open_in_memory().expect("open in memory");
    storage.init().expect("init");
    storage
        .insert_account(&build_account("acc-ws-a", Some("cgpt-1"), Some("ws-a")))
        .expect("insert ws-a");

    let found = pick_existing_account_id_by_identity(
        storage.list_accounts().expect("list accounts").iter(),
        Some("cgpt-1"),
        Some("ws-b"),
        Some("sub-fallback"),
        None,
    );

    assert_eq!(found, None);
}

#[test]
fn pick_existing_account_matches_exact_workspace_scope() {
    let storage = Storage::open_in_memory().expect("open in memory");
    storage.init().expect("init");
    storage
        .insert_account(&build_account("acc-ws-a", Some("cgpt-1"), Some("ws-a")))
        .expect("insert ws-a");
    storage
        .insert_account(&build_account("acc-ws-b", Some("cgpt-1"), Some("ws-b")))
        .expect("insert ws-b");

    let found = pick_existing_account_id_by_identity(
        storage.list_accounts().expect("list accounts").iter(),
        Some("cgpt-1"),
        Some("ws-b"),
        Some("sub-fallback"),
        None,
    );

    assert_eq!(found.as_deref(), Some("acc-ws-b"));
}

#[test]
fn build_account_storage_id_keeps_login_scope_shape() {
    let account_id = build_account_storage_id("sub-1", Some("cgpt-1"), Some("ws-a"), None);
    assert_eq!(account_id, "sub-1::cgpt=cgpt-1|ws=ws-a");
}

#[test]
fn next_account_sort_uses_step_five() {
    let storage = Storage::open_in_memory().expect("open in memory");
    storage.init().expect("init");
    storage
        .insert_account(&build_account("acc-1", Some("cgpt-1"), Some("ws-1")))
        .expect("insert account 1");
    storage
        .update_account_sort("acc-1", 2)
        .expect("update sort 1");
    storage
        .insert_account(&build_account("acc-2", Some("cgpt-2"), Some("ws-2")))
        .expect("insert account 2");
    storage
        .update_account_sort("acc-2", 7)
        .expect("update sort 2");

    assert_eq!(next_account_sort(&storage), 12);
}
