use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::model::UpdateActionResponse;
use super::runtime::current_exe_path;
#[cfg(target_os = "windows")]
use super::runtime::CREATE_NO_WINDOW;
use super::state::{
    clear_pending_update, pending_update_path, read_pending_update, script_dir_from_pending,
};

fn portable_executable_candidates() -> &'static [&'static str] {
    if cfg!(target_os = "windows") {
        &["CodexManager-portable.exe", "CodexManager.exe"]
    } else if cfg!(target_os = "macos") {
        &[
            "CodexManager-portable.app",
            "CodexManager.app",
            "CodexManager",
        ]
    } else {
        &["CodexManager-portable", "CodexManager"]
    }
}

pub(super) fn resolve_portable_restart_exe(
    staging_dir: &Path,
    current_exe_name: &str,
) -> Result<String, String> {
    if staging_dir.join(current_exe_name).is_file() {
        return Ok(current_exe_name.to_string());
    }

    for candidate in portable_executable_candidates() {
        if staging_dir.join(candidate).is_file() {
            return Ok((*candidate).to_string());
        }
    }

    Err(format!(
        "便携包无效：暂存目录中未找到可执行文件，期望名称之一为 [{}]",
        portable_executable_candidates().join(", ")
    ))
}

fn spawn_portable_apply_worker(
    script_dir: &Path,
    target_dir: &Path,
    staging_dir: &Path,
    exe_name: &str,
    pending_path: &Path,
    pid_to_wait: u32,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let script_path = script_dir.join("apply-portable-update.ps1");
        let script = r#"
param(
  [Parameter(Mandatory=$true)][string]$TargetDir,
  [Parameter(Mandatory=$true)][string]$StagingDir,
  [Parameter(Mandatory=$true)][string]$ExeName,
  [Parameter(Mandatory=$true)][string]$PendingFile,
  [Parameter(Mandatory=$true)][int]$PidToWait
)
$ErrorActionPreference = "Stop"
for ($i = 0; $i -lt 240; $i++) {
  if (-not (Get-Process -Id $PidToWait -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 500
}
Get-ChildItem -LiteralPath $StagingDir -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $TargetDir $_.Name) -Recurse -Force
}
if (Test-Path -LiteralPath $PendingFile) {
  Remove-Item -LiteralPath $PendingFile -Force -ErrorAction SilentlyContinue
}
Start-Process -FilePath (Join-Path $TargetDir $ExeName) | Out-Null
"#;
        fs::write(&script_path, script).map_err(|err| format!("写入更新应用脚本失败：{err}"))?;

        let args = vec![
            "-TargetDir".to_string(),
            target_dir.display().to_string(),
            "-StagingDir".to_string(),
            staging_dir.display().to_string(),
            "-ExeName".to_string(),
            exe_name.to_string(),
            "-PendingFile".to_string(),
            pending_path.display().to_string(),
            "-PidToWait".to_string(),
            pid_to_wait.to_string(),
        ];

        let try_spawn = |shell: &str| -> Result<(), String> {
            let mut cmd = Command::new(shell);
            cmd.arg("-NoProfile")
                .arg("-ExecutionPolicy")
                .arg("Bypass")
                .arg("-File")
                .arg(&script_path)
                .args(&args);
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.spawn()
                .map(|_| ())
                .map_err(|err| format!("启动 {shell} 失败：{err}"))
        };

        if try_spawn("powershell.exe").is_ok() {
            return Ok(());
        }
        return try_spawn("pwsh.exe");
    }

    #[cfg(not(target_os = "windows"))]
    {
        let script_path = script_dir.join("apply-portable-update.sh");
        let script = r#"#!/usr/bin/env sh
TARGET_DIR="$1"
STAGING_DIR="$2"
EXE_NAME="$3"
PENDING_FILE="$4"
PID_TO_WAIT="$5"

i=0
while kill -0 "$PID_TO_WAIT" 2>/dev/null && [ "$i" -lt 240 ]; do
  i=$((i + 1))
  sleep 0.5
done

cp -Rf "$STAGING_DIR"/. "$TARGET_DIR"/
rm -f "$PENDING_FILE"
chmod +x "$TARGET_DIR/$EXE_NAME" 2>/dev/null || true
"$TARGET_DIR/$EXE_NAME" >/dev/null 2>&1 &
"#;
        fs::write(&script_path, script).map_err(|err| format!("写入更新应用脚本失败：{err}"))?;

        #[cfg(unix)]
        {
            fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
                .map_err(|err| format!("设置更新应用脚本权限失败：{err}"))?;
        }

        Command::new("sh")
            .arg(&script_path)
            .arg(target_dir)
            .arg(staging_dir)
            .arg(exe_name)
            .arg(pending_path)
            .arg(pid_to_wait.to_string())
            .spawn()
            .map_err(|err| format!("启动更新应用脚本失败：{err}"))?;
        Ok(())
    }
}

fn schedule_app_exit(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(280));
        app.exit(0);
    });
}

fn launch_installer(installer_path: &Path) -> Result<(), String> {
    if !installer_path.is_file() {
        return Err(format!("未找到安装包：{}", installer_path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new(installer_path);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn()
            .map_err(|err| format!("启动安装包失败：{err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(installer_path)
            .spawn()
            .map_err(|err| format!("打开安装包失败：{err}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let ext = installer_path
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        if ext == "appimage" {
            #[cfg(unix)]
            {
                let _ = fs::set_permissions(installer_path, fs::Permissions::from_mode(0o755));
            }
            Command::new(installer_path)
                .spawn()
                .map_err(|err| format!("启动 AppImage 失败：{err}"))?;
            return Ok(());
        }

        Command::new("xdg-open")
            .arg(installer_path)
            .spawn()
            .map_err(|err| format!("打开安装包失败：{err}"))?;
        Ok(())
    }
}

pub(super) fn apply_portable_impl(app: tauri::AppHandle) -> Result<UpdateActionResponse, String> {
    let pending = read_pending_update(&app)?
        .ok_or_else(|| "未找到已准备更新，请先调用 app_update_prepare".to_string())?;

    if pending.mode != "portable" {
        return Err("已准备更新并非便携模式".to_string());
    }

    let staging_dir = PathBuf::from(
        pending
            .staging_dir
            .as_ref()
            .ok_or_else(|| "便携更新缺少暂存目录".to_string())?,
    );
    if !staging_dir.is_dir() {
        return Err(format!("未找到暂存目录：{}", staging_dir.display()));
    }

    let exe_path = current_exe_path()?;
    let target_dir = exe_path
        .parent()
        .ok_or_else(|| "解析目标应用目录失败".to_string())?
        .to_path_buf();
    let exe_name = exe_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "解析当前可执行文件名失败".to_string())?
        .to_string();
    let restart_exe_name = resolve_portable_restart_exe(&staging_dir, &exe_name)?;
    let pending_path = pending_update_path(&app)?;
    let script_dir = script_dir_from_pending(&pending, &app)?;
    let pid = std::process::id();

    spawn_portable_apply_worker(
        &script_dir,
        &target_dir,
        &staging_dir,
        &restart_exe_name,
        &pending_path,
        pid,
    )?;

    schedule_app_exit(app);
    Ok(UpdateActionResponse {
        ok: true,
        message: "便携更新已就绪，应用将重启以完成替换".to_string(),
    })
}

pub(super) fn launch_installer_impl(app: tauri::AppHandle) -> Result<UpdateActionResponse, String> {
    let pending = read_pending_update(&app)?
        .ok_or_else(|| "未找到已准备更新，请先调用 app_update_prepare".to_string())?;
    if pending.mode != "installer" {
        return Err("已准备更新并非安装包模式".to_string());
    }

    let installer_path = PathBuf::from(
        pending
            .installer_path
            .as_ref()
            .ok_or_else(|| "待安装更新中缺少安装包路径".to_string())?,
    );

    launch_installer(&installer_path)?;
    clear_pending_update(&app)?;

    Ok(UpdateActionResponse {
        ok: true,
        message: format!("已启动安装包：{}", installer_path.display()),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::resolve_portable_restart_exe;

    #[test]
    fn resolve_portable_restart_exe_prefers_existing_current_name() {
        let staging = std::env::temp_dir().join(format!(
            "codexmanager-updater-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("duration")
                .as_nanos()
        ));
        fs::create_dir_all(&staging).expect("create staging");
        let exe_name = if cfg!(target_os = "windows") {
            "current.exe"
        } else {
            "current"
        };
        fs::write(staging.join(exe_name), b"bin").expect("write exe");

        let resolved = resolve_portable_restart_exe(&staging, exe_name).expect("resolved executable");
        assert_eq!(resolved, exe_name);
        let _ = fs::remove_dir_all(&staging);
    }
}
