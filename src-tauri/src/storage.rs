// 数据持久化:data.json 的读写(原子写),与具体 schema 无关(Value 透写)。
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 数据存 E 盘(不占 C 盘);E:\zh\data 不存在时退回系统配置目录
    if Path::new("E:\\zh\\data").is_dir() {
        return Ok(PathBuf::from("E:\\zh\\data\\rosy\\data.json"));
    }
    app.path()
        .app_config_dir()
        .map(|d| d.join("data.json"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_data(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    match fs::read_to_string(data_file(&app)?) {
        Ok(s) => serde_json::from_str(&s)
            .map(Some)
            .map_err(|e| format!("数据文件损坏: {e}")),
        Err(_) => Ok(None), // 首次启动还没有数据文件
    }
}

#[tauri::command]
pub fn save_data(app: tauri::AppHandle, data: Value) -> Result<(), String> {
    let path = data_file(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // 先写临时文件再原子替换,避免写一半退出损坏数据
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
