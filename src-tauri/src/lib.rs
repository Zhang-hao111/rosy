// Rosy 后端入口:模块组装。
// storage       数据持久化(load_data/save_data,原子写)
// obsidian      Obsidian 库联动(读库/选目录/监听/回写)+ VaultWatcher 监听表
// cmd_channel   顶栏弹窗命令通道(cmd.json 监听与读写)
mod cmd_channel;
mod obsidian;
mod storage;

use obsidian::VaultWatcher;
use std::collections::HashMap;
use std::sync::Mutex;

/// 诊断日志:debug 构建打 stderr,release 静默。未引入 log 依赖保持精简;
/// release 分支用 format_args! 消费变量,避免 dlog 调用点报 unused 警告
macro_rules! dlog {
    ($($t:tt)*) => { {
        #[cfg(debug_assertions)]
        eprintln!($($t)*);
        #[cfg(not(debug_assertions))]
        let _ = format_args!($($t)*);
    } };
}
pub(crate) use dlog;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultWatcher(Mutex::new(HashMap::new())))
        .setup(|app| {
            // 弹窗命令通道:监听 cmd.json(todo-panel 扩展写入),变化即推 cmd-received
            cmd_channel::watch_cmd_json(app.handle().clone());
            // debug E2E 桥:ROSY_E2E=1 时启用(自动化测试驱动前端编辑链路)
            if cmd_channel::is_e2e() {
                cmd_channel::watch_e2e_cmd(app.handle().clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::load_data,
            storage::save_data,
            obsidian::read_source,
            obsidian::pick_vault,
            obsidian::pick_note,
            obsidian::write_back,
            obsidian::watch_source,
            obsidian::remove_line,
            obsidian::append_line,
            cmd_channel::read_cmd,
            cmd_channel::ack_cmd,
            cmd_channel::is_e2e,
            cmd_channel::e2e_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
