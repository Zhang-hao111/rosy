// 数据持久化:data.json 的读写(原子写),与具体 schema 无关(Value 透写)。
use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // ROSY_DATA_DIR 显式指定数据目录(测试/便携使用);默认存系统配置目录
    if let Ok(dir) = std::env::var("ROSY_DATA_DIR") {
        if !dir.trim().is_empty() {
            return Ok(PathBuf::from(dir).join("data.json"));
        }
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
    // 先写临时文件并 fsync 再原子替换:掉电时目标文件要么旧要么新,不会半写/空
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
