use codexmanager_core::storage::Account;

use crate::storage_helpers::account_key;

pub(crate) fn clean_value(value: Option<String>) -> Option<String> {
    match value {
        Some(v) => {
            let trimmed = v.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        None => None,
    }
}

fn normalize_non_empty<'a>(value: Option<&'a str>) -> Option<&'a str> {
    value.map(str::trim).filter(|v| !v.is_empty())
}

fn normalize_id_part(value: Option<&str>) -> Option<String> {
    let raw = normalize_non_empty(value)?;
    Some(raw.replace("::", "_"))
}

fn same_normalized(lhs: Option<&str>, rhs: Option<&str>) -> bool {
    normalize_non_empty(lhs) == normalize_non_empty(rhs)
}

pub(crate) fn build_scope_identity_hint(
    chatgpt_account_id: Option<&str>,
    workspace_id: Option<&str>,
) -> Option<String> {
    let chatgpt = normalize_id_part(chatgpt_account_id);
    let workspace = normalize_id_part(workspace_id);
    match (chatgpt, workspace) {
        (Some(chatgpt), Some(workspace)) if chatgpt != workspace => {
            Some(format!("cgpt={chatgpt}|ws={workspace}"))
        }
        (Some(chatgpt), _) => Some(format!("cgpt={chatgpt}")),
        (None, Some(workspace)) => Some(format!("ws={workspace}")),
        (None, None) => None,
    }
}

pub(crate) fn build_account_storage_id(
    subject_account_id: &str,
    chatgpt_account_id: Option<&str>,
    workspace_id: Option<&str>,
    tags: Option<&str>,
) -> String {
    let base = subject_account_id.trim();
    let mut suffix_parts: Vec<String> = Vec::new();
    if let Some(hint) = build_scope_identity_hint(chatgpt_account_id, workspace_id) {
        suffix_parts.push(hint);
    }
    if let Some(tag) = normalize_id_part(tags) {
        suffix_parts.push(tag);
    }
    if suffix_parts.is_empty() {
        return base.to_string();
    }
    format!("{base}::{}", suffix_parts.join("|"))
}

pub(crate) fn build_fallback_subject_key(
    subject_account_id: Option<&str>,
    tags: Option<&str>,
) -> Option<String> {
    normalize_non_empty(subject_account_id).map(|subject| account_key(subject, tags))
}

pub(crate) fn pick_existing_account_id_by_identity<'a, I>(
    accounts: I,
    chatgpt_account_id: Option<&str>,
    workspace_id: Option<&str>,
    fallback_subject_key: Option<&str>,
    account_id_hint: Option<&str>,
) -> Option<String>
where
    I: IntoIterator<Item = &'a Account>,
{
    let accounts = accounts.into_iter().collect::<Vec<_>>();
    let preferred_chatgpt = normalize_non_empty(chatgpt_account_id).map(str::to_string);
    let preferred_workspace = normalize_non_empty(workspace_id).map(str::to_string);

    if let (Some(chatgpt_id), Some(workspace_id)) =
        (preferred_chatgpt.as_ref(), preferred_workspace.as_ref())
    {
        if let Some(found) = accounts.iter().find(|acc| {
            same_normalized(acc.chatgpt_account_id.as_deref(), Some(chatgpt_id.as_str()))
                && same_normalized(acc.workspace_id.as_deref(), Some(workspace_id.as_str()))
        }) {
            return Some(found.id.clone());
        }
        return None;
    }

    if let Some(chatgpt_id) = preferred_chatgpt.as_ref() {
        let mut matched = accounts.iter().filter(|acc| {
            same_normalized(acc.chatgpt_account_id.as_deref(), Some(chatgpt_id.as_str()))
        });
        if let Some(found) = matched.next() {
            if matched.next().is_none() {
                return Some(found.id.clone());
            }
        }
        if let Some(found) = accounts.iter().find(|acc| {
            same_normalized(acc.chatgpt_account_id.as_deref(), Some(chatgpt_id.as_str()))
                && normalize_non_empty(acc.workspace_id.as_deref()).is_none()
        }) {
            return Some(found.id.clone());
        }
    }

    if let Some(workspace) = preferred_workspace.as_ref() {
        if let Some(found) = accounts
            .iter()
            .find(|acc| same_normalized(acc.workspace_id.as_deref(), Some(workspace.as_str())))
        {
            return Some(found.id.clone());
        }
    }

    if let Some(account_id_hint) = normalize_non_empty(account_id_hint) {
        if let Some(found) = accounts.iter().find(|acc| acc.id == account_id_hint) {
            return Some(found.id.clone());
        }
    }

    if let Some(fallback_subject_key) = normalize_non_empty(fallback_subject_key) {
        if let Some(found) = accounts.iter().find(|acc| acc.id == fallback_subject_key) {
            return Some(found.id.clone());
        }
    }

    None
}
