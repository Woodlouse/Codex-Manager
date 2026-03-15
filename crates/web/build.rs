use std::collections::VecDeque;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    emit_embedded_ui_tracking(&manifest_dir);
    compile_windows_icon(&manifest_dir);
}

fn emit_embedded_ui_tracking(manifest_dir: &Path) {
    let dist_dir = manifest_dir.join("../../apps/dist");
    println!("cargo:rerun-if-changed={}", dist_dir.display());

    let fingerprint = if dist_dir.is_dir() {
        fingerprint_tree(&dist_dir)
    } else {
        "missing".to_string()
    };
    println!("cargo:rustc-env=CODEXMANAGER_WEB_DIST_FINGERPRINT={fingerprint}");
}

fn fingerprint_tree(root: &Path) -> String {
    let mut pending = VecDeque::from([root.to_path_buf()]);
    let mut items = Vec::new();

    while let Some(dir) = pending.pop_front() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push_back(path);
                continue;
            }
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            let modified = metadata
                .modified()
                .ok()
                .and_then(|ts| ts.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|ts| ts.as_secs())
                .unwrap_or_default();
            items.push(format!(
                "{}:{}:{}",
                relative.to_string_lossy().replace('\\', "/"),
                metadata.len(),
                modified
            ));
        }
    }

    items.sort();
    if items.is_empty() {
        "empty".to_string()
    } else {
        items.join("|")
    }
}

#[cfg(windows)]
fn compile_windows_icon(manifest_dir: &Path) {
    // 仅在主包构建时嵌入图标，避免作为依赖参与其它目标（例如桌面端）链接时引入资源冲突风险。
    if std::env::var_os("CARGO_PRIMARY_PACKAGE").is_none() {
        return;
    }

    let icon_path = manifest_dir.join("../../apps/src-tauri/icons/icon.ico");
    println!("cargo:rerun-if-changed={}", icon_path.display());

    if !icon_path.is_file() {
        panic!("Windows icon not found: {}", icon_path.display());
    }

    let mut res = winres::WindowsResource::new();
    res.set_icon(icon_path.to_string_lossy().as_ref());
    res.compile()
        .expect("failed to compile Windows resources (icon)");
}

#[cfg(not(windows))]
fn compile_windows_icon(_manifest_dir: &Path) {}
