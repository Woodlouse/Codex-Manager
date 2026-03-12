use std::fs;
use std::path::{Path, PathBuf};

fn collect_json_files_recursively(root: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries =
        fs::read_dir(root).map_err(|err| format!("read dir failed ({}): {err}", root.display()))?;
    for entry in entries {
        let entry =
            entry.map_err(|err| format!("read dir entry failed ({}): {err}", root.display()))?;
        let path = entry.path();
        if path.is_dir() {
            collect_json_files_recursively(&path, output)?;
            continue;
        }
        let is_json = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("json"))
            .unwrap_or(false);
        if is_json {
            output.push(path);
        }
    }
    Ok(())
}

pub(crate) fn read_account_import_contents_from_directory(
    root: &Path,
) -> Result<(Vec<PathBuf>, Vec<String>), String> {
    let mut json_files = Vec::new();
    collect_json_files_recursively(root, &mut json_files)?;
    json_files.sort();

    let mut contents = Vec::with_capacity(json_files.len());
    for path in &json_files {
        let text = fs::read_to_string(path)
            .map_err(|err| format!("read json file failed ({}): {err}", path.display()))?;
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            contents.push(trimmed.to_string());
        }
    }
    Ok((json_files, contents))
}
