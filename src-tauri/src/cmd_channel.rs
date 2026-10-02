// 弹窗命令通道:todo-panel 扩展写 cmd.json(期望态映射 {done:{id:bool}},重放安全)
// → 这里监听文件变化推给前端 → 前端 read_cmd 执行后 ack_cmd 删除确认。
use notify::{EventKind, RecursiveMode, Watcher};
use serde_json::Value;
use std::fs;
use tauri::{AppHandle, Emitter, Manager};

use crate::obsidian::VaultWatcher;

// 注册 cmd.json 监听:应用一起来就挂上,不依赖前端调用——
// 弹窗勾选在窗口未聚焦时也实时生效。失败只记日志,不打断启动。
pub fn watch_cmd_json(handle: AppHandle) {
    if let Ok(cfg) = handle.path().app_config_dir() {
        let _ = fs::create_dir_all(&cfg);
        let cb_handle = handle.clone();   // 闭包持有自己的克隆,原 handle 用于注册状态
        match notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if let Ok(ev) = res {
                if !matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) { return; }
                if ev.paths.iter().any(|p| p.file_name().and_then(|n| n.to_str()) == Some("cmd.json")) {
                    let _ = cb_handle.emit("cmd-received", "cmd");
                }
            }
        }) {
            Ok(mut wv) => {
                if let Err(e) = wv.watch(&cfg, RecursiveMode::NonRecursive) {
                    eprintln!("[cmd] 监听配置目录失败: {e}");
                }
                // watcher 必须存活才生效,寄存进 VaultWatcher 表
                if let Ok(mut map) = handle.state::<VaultWatcher>().0.lock() {
                    map.insert("__cmd__".into(), wv);
                }
            }
            Err(e) => eprintln!("[cmd] 创建监听失败: {e}"),
        }
    }
}

#[tauri::command]
pub fn read_cmd(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match fs::read_to_string(dir.join("cmd.json")) {
        Ok(s) => serde_json::from_str(&s).map(Some).map_err(|e| format!("命令解析失败: {e}")),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn ack_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match fs::remove_file(dir.join("cmd.json")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
