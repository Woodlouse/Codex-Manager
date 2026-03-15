use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};

use super::state::current_unsaved_settings_draft_sections;

fn format_unsaved_settings_discard_message(
    sections: &[String],
    action_label: &str,
) -> Option<String> {
    if sections.is_empty() {
        return None;
    }

    Some(format!(
        "设置页仍有 {} 个未保存区块：{}。如果现在{}，这些本地草稿会丢失。是否继续？",
        sections.len(),
        sections.join("、"),
        action_label
    ))
}

fn confirm_discard_unsaved_settings(action_label: &str) -> bool {
    let sections = current_unsaved_settings_draft_sections();
    let Some(message) = format_unsaved_settings_discard_message(&sections, action_label) else {
        return true;
    };

    matches!(
        MessageDialog::new()
            .set_title("CodexManager")
            .set_description(&message)
            .set_level(MessageLevel::Warning)
            .set_buttons(MessageButtons::YesNo)
            .show(),
        MessageDialogResult::Yes | MessageDialogResult::Ok
    )
}

pub(crate) fn confirm_discard_unsaved_settings_for_window_close() -> bool {
    confirm_discard_unsaved_settings("关闭窗口")
}

pub(crate) fn confirm_discard_unsaved_settings_for_app_exit() -> bool {
    confirm_discard_unsaved_settings("退出应用")
}

#[cfg(test)]
mod tests {
    use super::format_unsaved_settings_discard_message;

    #[test]
    fn omits_prompt_when_no_unsaved_sections() {
        assert!(format_unsaved_settings_discard_message(&[], "关闭窗口").is_none());
    }

    #[test]
    fn formats_unsaved_sections_prompt_with_action() {
        let message = format_unsaved_settings_discard_message(
            &["安全与传输".to_string(), "服务与网关策略".to_string()],
            "退出应用",
        )
        .expect("message should be present");

        assert!(message.contains("2 个未保存区块"));
        assert!(message.contains("安全与传输、服务与网关策略"));
        assert!(message.contains("如果现在退出应用"));
    }
}
