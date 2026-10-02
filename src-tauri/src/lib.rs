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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultWatcher(Mutex::new(HashMap::new())))
        .setup(|app| {
            // 弹窗命令通道:监听 cmd.json(todo-panel 扩展写入),变化即推 cmd-received
            cmd_channel::watch_cmd_json(app.handle().clone());
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
            cmd_channel::read_cmd,
            cmd_channel::ack_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
