// Obsidian 库联动:读取 .md、原生选目录、监听变更、勾选回写笔记。
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::dlog;

#[derive(Serialize, Clone)]
pub struct MdDoc {
    pub name: String, // 库内相对路径(去 .md,'/' 分隔),作为笔记分组名
    pub path: String, // 绝对路径,回写用
    pub text: String,
}

#[derive(Serialize, Clone)]
pub struct MdSourceRead {
    pub docs: Vec<MdDoc>,
    pub truncated: bool, // 库超过 200 篇被截断,前端会提示
}

fn collect_md(dir: &Path, root: &Path, out: &mut Vec<MdDoc>, truncated: &mut bool) {
    if out.len() >= 200 {
        *truncated = true;
        return; // 库太大时截断,防卡死
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        let fname = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        // 目录判定不跟随符号链接:库内 symlink 环会导致无限递归栈溢出
        let is_dir = fs::symlink_metadata(&p).map(|m| m.is_dir()).unwrap_or(false);
        if is_dir {
            // 跳过 .obsidian/.git/.trash 等隐藏目录
            if fname.starts_with('.') || fname == "node_modules" {
                continue;
            }
            collect_md(&p, root, out, truncated);
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
            *truncated = true;
            return;
        }
    }
}

#[tauri::command]
pub fn read_source(path: String) -> Result<MdSourceRead, String> {
    let p = PathBuf::from(&path);
    if p.is_file() {
        // 单篇笔记:整文件即一个 MdDoc
        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("笔记").to_string();
        let text = fs::read_to_string(&p).map_err(|e| format!("无法读取笔记: {e}"))?;
        dlog!("[read_source] {path}: 单篇");
        return Ok(MdSourceRead {
            docs: vec![MdDoc { name, path: p.to_string_lossy().into_owned(), text }],
            truncated: false,
        });
    }
    if !p.is_dir() {
        return Err("文件夹或文件不存在或已移动".into());
    }
    let mut out = Vec::new();
    let mut truncated = false;
    collect_md(&p, &p, &mut out, &mut truncated);
    out.sort_by(|a, b| a.name.cmp(&b.name));
    dlog!("[read_source] {path}: {} 个 md", out.len());
    Ok(MdSourceRead { docs: out, truncated })
}

#[tauri::command]
pub async fn pick_vault(app: AppHandle) -> Option<String> {
    // 对话框必须跑在主线程(COM STA),等待放在后台线程避免死锁
    let (tx, rx) = std::sync::mpsc::channel();
    let r = app.run_on_main_thread(move || {
        dlog!("[pick_vault] 主线程打开对话框…");
        let picked = rfd::FileDialog::new()
            .set_title("选择 Obsidian 笔记库文件夹")
            .pick_folder();
        dlog!("[pick_vault] 结果: {:?}", picked.as_ref().map(|p| p.to_string_lossy()));
        let _ = tx.send(picked.map(|p| p.to_string_lossy().into_owned()));
    });
    if let Err(e) = r {
        dlog!("[pick_vault] run_on_main_thread 失败: {e}");
        return None;
    }
    tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .ok()
        .flatten()
}

#[tauri::command]
pub async fn pick_note(app: AppHandle) -> Option<Vec<String>> {
    // 多选 .md 文件,同一主线程模式
    let (tx, rx) = std::sync::mpsc::channel();
    let r = app.run_on_main_thread(move || {
        dlog!("[pick_note] 主线程打开对话框…");
        let picked = rfd::FileDialog::new()
            .set_title("选择 Obsidian 笔记(可多选)")
            .add_filter("Markdown", &["md"])
            .pick_files();
        dlog!("[pick_note] 结果: {} 个文件", picked.as_ref().map_or(0, |v| v.len()));
        let _ = tx.send(picked.map(|v| {
            v.into_iter().map(|p| p.to_string_lossy().into_owned()).collect()
        }));
    });
    if let Err(e) = r {
        dlog!("[pick_note] run_on_main_thread 失败: {e}");
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
    write_atomic(&PathBuf::from(&path), &updated)?;
    Ok(true)
}

#[tauri::command]
pub fn remove_line(path: String, line: String) -> Result<bool, String> {
    // 整行匹配(兼容 CRLF:比较前去掉行尾 \n/\r),只删首处命中,连同换行一起删
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut found = false;
    let mut out = String::with_capacity(text.len());
    for l in text.split_inclusive('\n') {
        if !found && l.trim_end_matches(['\n', '\r']) == line {
            found = true;
            continue;
        }
        out.push_str(l);
    }
    if !found {
        return Ok(false); // 笔记已变动,找不到该行,不动文件
    }
    write_atomic(&PathBuf::from(&path), &out)?;
    Ok(true)
}

#[tauri::command]
pub fn append_line(path: String, line: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let mut text = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    // 换行符跟随文件现状(CRLF 文件追加 CRLF 行,避免混用)
    let eol: &str = if text.contains("\r\n") { "\r\n" } else { "\n" };
    if !text.is_empty() && !text.ends_with('\n') {
        text.push_str(eol);
    }
    text.push_str(&line);
    text.push_str(eol);
    write_atomic(&p, &text)?;
    Ok(())
}

/* 临时文件 + fsync + 原子替换(write_back 同款语义) */
fn write_atomic(p: &Path, content: &str) -> Result<(), String> {
    let tmp = p.with_extension("md.rosy.tmp"); // 非 .md 后缀,不触发自身监听循环
    let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&tmp, p).map_err(|e| e.to_string())
}

// 逐库监听;弹窗 cmd 通道的监听也寄存在同一张表(key="__cmd__"),随应用生命周期存活
pub struct VaultWatcher(pub Mutex<HashMap<String, RecommendedWatcher>>);

#[tauri::command]
pub fn watch_source(app: AppHandle, state: State<'_, VaultWatcher>, path: String) -> Result<(), String> {
    let handle = app.clone();
    // 单篇笔记监听其父目录(inotify 挂在 inode 上,回写是 tmp+rename 覆盖,
    // 直接盯文件会在第一次勾选回写后随旧 inode 断链失效),再按完整路径过滤
    let target = PathBuf::from(&path);
    let is_file = target.is_file();
    let watch_path = if is_file {
        target.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| target.clone())
    } else {
        target.clone()
    };
    let file_target = if is_file {
        fs::canonicalize(&target).unwrap_or_else(|_| target.clone())
    } else {
        target.clone()
    };
    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(ev) = res {
            if !matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) {
                return;
            }
            let paths: Vec<String> = ev
                .paths
                .iter()
                .filter(|p| {
                    // 单文件来源:只认目标文件本身(编辑器常用 tmp+rename 保存,路径即目标)
                    if is_file {
                        *p == &file_target
                            || fs::canonicalize(p).map(|c| c == file_target).unwrap_or(false)
                    } else {
                        true
                    }
                })
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
    // 目录递归监听;单篇笔记盯其父目录(NonRecursive)后按路径过滤
    let mode = if is_file { RecursiveMode::NonRecursive } else { RecursiveMode::Recursive };
    watcher
        .watch(&watch_path, mode)
        .map_err(|e| e.to_string())?;
    // 逐来源保存 watcher(同路径重复监听时替换旧的,其他来源不受影响)
    state.0.lock().map_err(|_| "监听状态异常")?.insert(path.clone(), watcher);
    dlog!("[watch_source] 已监听 {path}({})", if is_file { "文件→父目录" } else { "目录递归" });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn tmp(name: &str) -> PathBuf {
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;
        let d = env::temp_dir().join(format!("rosy-test-{name}-{n}"));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn collect_md_skips_hidden_and_symlink_loops() {
        let dir = tmp("collect");
        fs::create_dir_all(dir.join("a/nested")).unwrap();
        fs::create_dir_all(dir.join(".obsidian")).unwrap();
        fs::write(dir.join("a/nested/x.md"), "- [ ] t1").unwrap();
        fs::write(dir.join(".obsidian/y.md"), "- [ ] hidden").unwrap();
        fs::write(dir.join("b.txt"), "not markdown").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&dir, dir.join("a/loop")).unwrap(); // 自引用环:修复前会无限递归
        let mut out = Vec::new();
        let mut trunc = false;
        collect_md(&dir, &dir, &mut out, &mut trunc);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "a/nested/x");
        assert!(!trunc);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn collect_md_truncates_at_200() {
        let dir = tmp("trunc");
        for i in 0..205 {
            fs::write(dir.join(format!("f{i:03}.md")), "x").unwrap();
        }
        let mut out = Vec::new();
        let mut trunc = false;
        collect_md(&dir, &dir, &mut out, &mut trunc);
        assert_eq!(out.len(), 200);
        assert!(trunc);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_source_single_file_and_dir() {
        let dir = tmp("rs");
        fs::write(dir.join("note.md"), "- [ ] a\n- [x] b").unwrap();
        let f = read_source(dir.join("note.md").to_string_lossy().into_owned()).unwrap();
        assert_eq!(f.docs.len(), 1);
        assert_eq!(f.docs[0].name, "note");
        assert!(!f.truncated);
        let d = read_source(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(d.docs.len(), 1);
        assert!(read_source(dir.join("missing").to_string_lossy().into_owned()).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_back_replaces_once_and_reports_missing() {
        let dir = tmp("wb");
        let f = dir.join("n.md");
        fs::write(&f, "pre\n- [ ] task\npost").unwrap();
        let ok = write_back(
            f.to_string_lossy().into_owned(),
            "- [ ] task".into(),
            "- [x] task".into(),
        )
        .unwrap();
        assert!(ok);
        assert_eq!(fs::read_to_string(&f).unwrap(), "pre\n- [x] task\npost");
        assert!(!f.with_extension("md.rosy.tmp").exists()); // 临时文件不残留
        let miss = write_back(f.to_string_lossy().into_owned(), "不存在".into(), "x".into()).unwrap();
        assert!(!miss);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_line_removes_first_occurrence_only() {
        let dir = tmp("rm");
        let f = dir.join("n.md");
        fs::write(&f, "a\n- [ ] dup\n- [ ] dup\nb").unwrap();
        let ok = remove_line(f.to_string_lossy().into_owned(), "- [ ] dup".into()).unwrap();
        assert!(ok);
        assert_eq!(fs::read_to_string(&f).unwrap(), "a\n- [ ] dup\nb"); // 只删首处
        assert!(!f.with_extension("md.rosy.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_line_crlf_and_missing() {
        let dir = tmp("rmcrlf");
        let f = dir.join("n.md");
        fs::write(&f, "a\r\n- [ ] task\r\nb\r\n").unwrap();
        let ok = remove_line(f.to_string_lossy().into_owned(), "- [ ] task".into()).unwrap();
        assert!(ok);
        assert_eq!(fs::read_to_string(&f).unwrap(), "a\r\nb\r\n"); // 其余行 CRLF 原样保留
        let miss = remove_line(f.to_string_lossy().into_owned(), "没有这行".into()).unwrap();
        assert!(!miss);
        assert_eq!(fs::read_to_string(&f).unwrap(), "a\r\nb\r\n"); // 未命中不动文件
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn append_line_follows_file_eol_and_repairs_missing_final_newline() {
        let dir = tmp("ap");
        // LF 文件:末尾无换行也能正确追加
        let f = dir.join("a.md");
        fs::write(&f, "head").unwrap();
        append_line(f.to_string_lossy().into_owned(), "- [ ] x".into()).unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "head\n- [ ] x\n");
        // CRLF 文件:追加行用 CRLF
        let g = dir.join("b.md");
        fs::write(&g, "head\r\n").unwrap();
        append_line(g.to_string_lossy().into_owned(), "- [ ] y".into()).unwrap();
        assert_eq!(fs::read_to_string(&g).unwrap(), "head\r\n- [ ] y\r\n");
        let _ = fs::remove_dir_all(&dir);
    }
}
