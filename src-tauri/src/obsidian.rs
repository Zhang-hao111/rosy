// Obsidian 库联动:读取 .md、原生选目录、监听变更、勾选回写笔记。
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
pub struct MdDoc {
    pub name: String, // 库内相对路径(去 .md,'/' 分隔),作为笔记分组名
    pub path: String, // 绝对路径,回写用
    pub text: String,
}

fn collect_md(dir: &Path, root: &Path, out: &mut Vec<MdDoc>) {
    if out.len() >= 200 {
        return; // 库太大时截断,防卡死
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        let fname = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        if p.is_dir() {
            // 跳过 .obsidian/.git/.trash 等隐藏目录
            if fname.starts_with('.') || fname == "node_modules" {
                continue;
            }
            collect_md(&p, root, out);
        } else if fname.to_lowercase().ends_with(".md") {
            if let Ok(text) = fs::read_to_string(&p) {
                let rel = p
                    .strip_prefix(root)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .replace('\\', "/");
                let rel = rel[..rel.len() - 3].to_string(); // 去掉 ".md"(ASCII 边界安全)
                out.push(MdDoc {
                    name: rel,
                    path: p.to_string_lossy().into_owned(),
                    text,
                });
            }
        }
        if out.len() >= 200 {
            return;
        }
    }
}

#[tauri::command]
pub fn read_vault(path: String) -> Result<Vec<MdDoc>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("文件夹不存在或已移动".into());
    }
    let mut out = Vec::new();
    collect_md(&root, &root, &mut out);
    out.sort_by(|a, b| a.name.cmp(&b.name));
    eprintln!("[read_vault] {path}: {} 个 md", out.len());
    Ok(out)
}

#[tauri::command]
pub async fn pick_vault(app: AppHandle) -> Option<String> {
    // 对话框必须跑在主线程(COM STA),等待放在后台线程避免死锁
    let (tx, rx) = std::sync::mpsc::channel();
    let r = app.run_on_main_thread(move || {
        eprintln!("[pick_vault] 主线程打开对话框…");
        let picked = rfd::FileDialog::new()
            .set_title("选择 Obsidian 笔记库文件夹")
            .pick_folder();
        eprintln!("[pick_vault] 结果: {:?}", picked.as_ref().map(|p| p.to_string_lossy()));
        let _ = tx.send(picked.map(|p| p.to_string_lossy().into_owned()));
    });
    if let Err(e) = r {
        eprintln!("[pick_vault] run_on_main_thread 失败: {e}");
        return None;
    }
    tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .ok()
        .flatten()
}

#[tauri::command]
pub fn write_back(path: String, from: String, to: String) -> Result<bool, String> {
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if !text.contains(&from) {
        return Ok(false); // 笔记已变动,找不到原行,不动文件
    }
    let updated = text.replacen(&from, &to, 1);
    let p = PathBuf::from(&path);
    let tmp = p.with_extension("md.rosy.tmp"); // 非 .md 后缀,不触发自身监听循环
    fs::write(&tmp, &updated).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(true)
}

// 逐库监听;弹窗 cmd 通道的监听也寄存在同一张表(key="__cmd__"),随应用生命周期存活
pub struct VaultWatcher(pub Mutex<HashMap<String, RecommendedWatcher>>);

#[tauri::command]
pub fn watch_vault(app: AppHandle, state: State<'_, VaultWatcher>, path: String) -> Result<(), String> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(ev) = res {
            if !matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) {
                return;
            }
            let paths: Vec<String> = ev
                .paths
                .iter()
                .filter(|p| {
                    p.extension()
                        .and_then(|e| e.to_str())
                        .map_or(false, |e| e.eq_ignore_ascii_case("md"))
                })
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if !paths.is_empty() {
                let _ = handle.emit("vault-changed", paths);
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    // 逐库保存 watcher(同路径重复监听时替换旧的,其他库不受影响)
    state.0.lock().map_err(|_| "监听状态异常")?.insert(path.clone(), watcher);
    eprintln!("[watch_vault] 已监听 {path}");
    Ok(())
}
