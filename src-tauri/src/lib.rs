use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use std::collections::HashMap;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 数据存 E 盘（不占 C 盘）；E:\zh\data 不存在时退回系统配置目录
    if Path::new("E:\\zh\\data").is_dir() {
        return Ok(PathBuf::from("E:\\zh\\data\\rosy\\data.json"));
    }
    app.path()
        .app_config_dir()
        .map(|d| d.join("data.json"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    match fs::read_to_string(data_file(&app)?) {
        Ok(s) => serde_json::from_str(&s)
            .map(Some)
            .map_err(|e| format!("数据文件损坏: {e}")),
        Err(_) => Ok(None), // 首次启动还没有数据文件
    }
}

#[tauri::command]
fn save_data(app: tauri::AppHandle, data: Value) -> Result<(), String> {
    let path = data_file(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // 先写临时文件再原子替换，避免写一半退出损坏数据
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/* ================= Obsidian 库联动 ================= */

#[derive(Serialize, Clone)]
struct MdDoc {
    name: String, // 库内相对路径（去 .md，'/' 分隔），作为笔记分组名
    path: String, // 绝对路径，回写用
    text: String,
}

fn collect_md(dir: &Path, root: &Path, out: &mut Vec<MdDoc>) {
    if out.len() >= 200 {
        return; // 库太大时截断，防卡死
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
                let rel = rel[..rel.len() - 3].to_string(); // 去掉 ".md"（ASCII 边界安全）
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
fn read_vault(path: String) -> Result<Vec<MdDoc>, String> {
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
async fn pick_vault(app: AppHandle) -> Option<String> {
    // 对话框必须跑在主线程（COM STA），等待放在后台线程避免死锁
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
fn write_back(path: String, from: String, to: String) -> Result<bool, String> {
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if !text.contains(&from) {
        return Ok(false); // 笔记已变动，找不到原行，不动文件
    }
    let updated = text.replacen(&from, &to, 1);
    let p = PathBuf::from(&path);
    let tmp = p.with_extension("md.rosy.tmp"); // 非 .md 后缀，不触发自身监听循环
    fs::write(&tmp, &updated).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(true)
}

struct VaultWatcher(Mutex<HashMap<String, RecommendedWatcher>>);   // 逐库监听

/* ================= 弹窗命令通道 ================= */

// 弹窗（todo-panel 扩展）→ 应用 的命令通道：期望态映射（{done:{id:bool}}），
// 重放安全——应用离线时命令留盘，下次启动处理
#[tauri::command]
fn read_cmd(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match fs::read_to_string(dir.join("cmd.json")) {
        Ok(s) => serde_json::from_str(&s).map(Some).map_err(|e| format!("命令解析失败: {e}")),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn ack_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match fs::remove_file(dir.join("cmd.json")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn watch_vault(app: AppHandle, state: State<'_, VaultWatcher>, path: String) -> Result<(), String> {
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
    // 逐库保存 watcher（同路径重复监听时替换旧的，其他库不受影响）
    state.0.lock().map_err(|_| "监听状态异常")?.insert(path.clone(), watcher);
    eprintln!("[watch_vault] 已监听 {path}");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultWatcher(Mutex::new(HashMap::new())))
        .setup(|app| {
            // 弹窗命令通道：监听 cmd.json（todo-panel 扩展写入），变化即推 cmd-received。
            // 应用一起来就注册、不依赖前端调用——弹窗勾选在窗口未聚焦时也实时生效
            let handle = app.handle().clone();
            if let Ok(cfg) = handle.path().app_config_dir() {
                let _ = fs::create_dir_all(&cfg);
                match notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
                    if let Ok(ev) = res {
                        if !matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) { return; }
                        if ev.paths.iter().any(|p| p.file_name().and_then(|n| n.to_str()) == Some("cmd.json")) {
                            let _ = handle.emit("cmd-received", "cmd");
                        }
                    }
                }) {
                    Ok(mut wv) => {
                        if let Err(e) = wv.watch(&cfg, RecursiveMode::NonRecursive) {
                            eprintln!("[cmd] 监听配置目录失败: {e}");
                        }
                        if let Ok(mut map) = app.state::<VaultWatcher>().0.lock() {
                            map.insert("__cmd__".into(), wv);
                        }
                    }
                    Err(e) => eprintln!("[cmd] 创建监听失败: {e}"),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            read_vault,
            pick_vault,
            write_back,
            watch_vault,
            read_cmd,
            ack_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
