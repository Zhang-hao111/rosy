// 弹窗命令通道:todo-panel 扩展写 cmd.json(期望态映射 {done:{id:bool}},重放安全)
// → 这里监听文件变化推给前端 → 前端 read_cmd 执行后 ack_cmd 比对内容确认删除。
use notify::{EventKind, RecursiveMode, Watcher};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

use crate::dlog;
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
                    dlog!("[cmd] 监听配置目录失败: {e}");
                }
                // watcher 必须存活才生效,寄存进 VaultWatcher 表
                if let Ok(mut map) = handle.state::<VaultWatcher>().0.lock() {
                    map.insert("__cmd__".into(), wv);
                }
            }
            Err(e) => dlog!("[cmd] 创建监听失败: {e}"),
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
pub fn ack_cmd(app: tauri::AppHandle, expected: Option<Value>) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let path = dir.join("cmd.json");
    // 只删「内容与本次处理过的一致」的命令文件:read→ack 之间扩展又写入新命令时保留,
    // 待下次 cmd-received/启动补处理(期望态映射重放安全);无 expected 时保持旧行为
    if let Some(exp) = expected {
        let cur = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };
        match serde_json::from_str::<Value>(&cur) {
            Ok(v) if v == exp => return fs::remove_file(&path).map_err(|e| e.to_string()),
            Ok(_) => return Ok(()),   // 有更新的命令在排队,不删
            Err(_) => return fs::remove_file(&path).map_err(|e| e.to_string()), // 文件已损坏,删掉防卡死
        }
    }
    fs::remove_file(&path).map_err(|e| e.to_string())
}

/* ---- debug E2E 桥(仅 ROSY_E2E=1 时启用):外部脚本 ↔ 前端编辑链路 ----
   驱动脚本写 $ROSY_E2E_DIR/e2e-cmd.json(原子替换) → 这里监听并推 e2e-cmd 事件 →
   前端执行后经 e2e_report 写回 e2e-out.json。release 无 env,watcher 与命令均不激活。 */
pub fn e2e_dir() -> PathBuf {
    PathBuf::from(std::env::var("ROSY_E2E_DIR").unwrap_or_else(|_| "/tmp".into()))
}

pub fn watch_e2e_cmd(handle: AppHandle) {
    let dir = e2e_dir();
    let _ = fs::create_dir_all(&dir);
    let cb = handle.clone();
    let dir_in_cb = dir.clone();   // 闭包与 watch 各持一份
    // 去重:同内容只发一次(目录里其它文件的事件不应重放旧命令)
    let last = std::sync::Mutex::new(String::new());
    match notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(ev) = res {
            if !matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) { return; }
            if !ev.paths.iter().any(|p| p.file_name().and_then(|n| n.to_str()) == Some("e2e-cmd.json")) { return; }
            if let Ok(text) = fs::read_to_string(dir_in_cb.join("e2e-cmd.json")) {
                let mut l = last.lock().unwrap();
                if *l == text { return; }
                *l = text.clone();
                drop(l);
                dlog!("[e2e] 发事件 {} 字节", text.len());
                let _ = cb.emit("e2e-cmd", text);
            }
        }
    }) {
        Ok(mut wv) => {
            if let Err(e) = wv.watch(&dir, RecursiveMode::NonRecursive) {
                dlog!("[e2e] 监听 {:?} 失败: {e}", dir);
                return;
            }
            if let Ok(mut map) = handle.state::<VaultWatcher>().0.lock() {
                map.insert("__e2e__".into(), wv);
            }
        }
        Err(e) => dlog!("[e2e] 创建监听失败: {e}"),
    }
}

#[tauri::command]
pub fn is_e2e() -> bool {
    std::env::var("ROSY_E2E").ok().as_deref() == Some("1")
}

#[tauri::command]
pub fn e2e_report(text: String) -> Result<(), String> {
    fs::write(e2e_dir().join("e2e-out.json"), text).map_err(|e| e.to_string())
}
