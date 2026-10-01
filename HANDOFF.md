# Rosy · Ubuntu 交接说明（请先完整读完这份）

> 本包为 Ubuntu 目标环境的完整源码交接。①本地全功能 ②Obsidian 多库联动已完成并验证；③系统日历同步曾于 2026-09-30 打通，2026-10-02 应用户要求连同全部代码移除（详见「系统日历同步（已移除）」）。

## 项目概况

- macOS 风格待办应用「Rosy」，**Tauri 2 + 原生 HTML/CSS/JS**（无前端框架、无打包器）
- 设计准则：**预览稿即最终 UI**，视觉走 macOS（Things 3）质感；主色玫瑰粉 `#ec5f9b`（深色 `#ff7aa5`），学习=柔紫 `#9d6bce`、生活=蜜桃 `#ff9372`、Obsidian=品牌紫 `#7f6df2`
- 动效是需求的一部分（勾选弹跳、划线生长、日历瀑布入场等），重构时别丢

## 目录结构

```
rosy/
├── src/index.html            # 整个应用：UI + 全部逻辑（单文件 ~2000 行，行尾 LF）
├── src-tauri/
│   ├── src/lib.rs            # Rust 命令：load_data/save_data（JSON 持久化、原子写）
│   │                         #   + Obsidian：read_vault / pick_vault(rfd) / watch_vault(notify) / write_back
│   │                         #   + 弹窗：read_cmd / ack_cmd（cmd.json 监听注册在 run() setup）
│   ├── tauri.conf.json       # 窗口/打包配置（bundle.targets 已是 ["deb"]）
│   ├── capabilities/default.json  # 权限清单（窗口控制 + core:event 监听）
│   └── icons/app-icon.svg    # 图标源文件（改后 npx tauri icon 重新生成）
├── design/date-menu-mockup.html  # 顶栏弹窗 HTML 设计稿
├── extras/gnome-extension/   # todo-panel@local 扩展源码副本（部署在 ~/.local/share/gnome-shell/extensions/）
├── extras/sample-user-data.json  # 原 zip 附带示例数据，代码未引用，仅留档
├── HANDOFF.md                # 本文件
└── README.md
```

## Ubuntu 上跑起来

```bash
# 1. 系统依赖（Tauri v2 官方清单，Ubuntu 22.04/24.04 通用）
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
     libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# 2. Rust（stable 即可）与 Node 18+
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Node 用 nvm / apt / 官方二进制均可

# 3. 运行与打包
npm install
npm run tauri dev      # 开发模式热重载
npm run tauri build    # 产出 .deb（bundle.targets 已是 ["deb"]）
```

- Wayland 下如遇渲染异常，启动命令前加 `GDK_BACKEND=x11`（原开发环境 GNOME 42 如此）
- 窗口为无边框自绘（`decorations:false + transparent:true` + 自绘红绿灯），GNOME 下正常
- 启动时 JS 会强制 `unmaximize + center`，并恢复上次窗口大小（localStorage `winSize`，无记录用默认 960×620=最小尺寸；调整大小后 400ms 防抖保存，最大化状态不记录）。改默认尺寸时注意 capabilities 已含 allow-set-size / allow-center / allow-is-maximized

## 数据

- Linux 上数据固定存放于 `~/.config/com.rosy.app/data.json`；不放也能跑：首次启动用内置示例任务，删掉 data.json 即恢复出厂
- `extras/sample-user-data.json` 是原 zip 附带的示例数据（原作者 Windows 端的数据，库路径为 `E:\...`），代码未引用，仅留档

## Obsidian 联动（已完成）

- 「添加笔记库」= 系统原生选目录（rfd），可反复添加多个库；副标题「N 个笔记库」点开菜单可移除
- 递归读取 `.md`（跳过 `.obsidian`/`.git` 等隐藏目录，上限 200 个文件）
- 只把 **`- [ ]` 复选框行**解析为任务；`📅 2026-10-07` / `@due(...)` / `[due:: ]` 可带截止日期（时间可选）
- 变更自动同步（notify 监听 + 防抖 500ms），无需手动刷新；启动自动重连，失效库自动移除并提示
- 勾选任务自动**回写笔记**：按原始行精确替换 `- [ ]`↔`- [x]`，找不到原行则不动文件并提示，绝不改其他内容
- 跨库同名笔记自动带库名前缀分组，不会混

## 系统日历同步（已移除，2026-10-02）

曾在 2026-09-30 打通「应用 ⇄ helper(systemd) ⇄ libecal ⇄ EDS ⇄ GNOME 日历」双向同步并真机验证；
应用户要求已把**全部相关代码删除**：`src-tauri/src/calendar.rs`、lib.rs 的
`calendar_available`/`sync_calendar`/`read_calendar`、前端推送/合并/同步芯片 UI、
`extras/calendar-sync/`（helper 脚本与 systemd 单元）、系统里的
`~/.local/bin/rosy-calendar-sync.py` 与单元文件、marker 与 `calendar-view.json`。

留下的经验（若将来重做日历联动，先读这段）：
- **EDS 本地日历后端（3.44）对 ics 文件的任何外部改动完全不重读**——直接改文件 GNOME 日历永远看不见
- **经 libecal 客户端的增删改几乎不落盘**（ics mtime 长期不动）——文件只是滞后持久化，不能当实时通道
- 唯一可靠路径是 libecal 客户端写入 + 把 EDS 内存视图导出给应用（即被删的 helper 方案）
- 弹窗 cmd.json 勾选通道与日历无关，一直保留；其文件监听现注册在 lib.rs `run()` 的 `setup` 里

## 时钟弹窗 = Rosy 任务列表（todo-panel@local v3，2026-09-30）

GNOME 顶栏时钟弹窗改造：右侧月历列整体隐藏（含事件/世界时钟），任务列表占满弹窗（通知区保留在下方）；数据源 ~/.config/com.rosy.app/data.json，不再读 Obsidian 待办。v4 起按用户反馈压缩：只显示未完成任务（勾选后立即从列表消失）、去掉分区标题、弹窗宽 374 固定，**高度随内容数量变化、上限屏幕高度一半**（`messageList.set_size(348,-1)` 自然高 + menu.box `max-height:半屏`；`.message-list` 的 CSS 固定宽高已删，行标题 ellipsize 保留）；**弹窗只收录【学习】清单带日期的未完成任务**，按日期升序（loadTasks 过滤）；胶囊行 margin 1px 紧挨（宽 2/3、高 1/2 逐轮压缩，行胶囊（默认透明，悬停淡粉胶囊 rgba(236,95,155,.12) 包住整行；**行 BoxLayout 必须 reactive+track_hover 否则 :hover 永不触发**，官方 PopupBaseMenuItem 同款模式）（圆角 14px、悬停加深，色条/勾选/文字包成一体）、标题 1em、勾选圆圈 20px、日期 0.95em）、列表滚动条禁用（滚轮仍可滚）、备注默认收起点行展开、字体行距紧凑。弹窗底色：扩展给 menu.box 挂 `rosy-date-menu` 类 → 半透白 rgba(255,255,255,.92)（用户反馈：纯白且透明度调低）（GNOME 42 无菜单背景模糊滤镜，真磨砂需 blur-my-shell，此前与 Dock 冲突过未装）。底部控制区 macOS 化（作用域限定 `.message-list`）：`message-list-clear-button` 改胶囊+悬停变粉；请勿打扰开关 ON 态用改色的 WhiteSur 资产 `toggle-on-pink.svg`（在扩展目录，轨道 #0860f2→#ec5f9b），OFF 态保持原灰。。**v5 尺寸实现**：WhiteSur 给 `.message-list` 强设 `width:30em` 且普通 CSS 覆盖无效（同优先级后者反而被压制），弹窗被拉到近全屏——最终用 `messageList.set_size(348,270)`（Clutter 固定尺寸，优先级高于一切 CSS）+ menu.box inline 双保险；`set_x_expand(true)` 是拉伸帮凶已删；负载 listId 曾漏传导致学习任务圆圈错用粉色（loadTasks 需输出 listId）。扩展开弹窗时向 journal 写一行 `todo-panel sizes:` 诊断（各层实际尺寸），排障用，稳定后删

- 勾选通道：弹窗写 ~/.config/com.rosy.app/cmd.json（期望态映射 {done:{id:bool}}，重放安全）→ 应用监听执行（lib.rs read_cmd/ack_cmd + cmd-received 事件）→ 防抖保存，全链路自动生效；应用离线时命令留盘，下次启动补处理
- 点击任务行 → 聚焦 Rosy 窗口（按 wm_class 找，找不到则拉起 target/release 二进制）
- 扩展文件：~/.local/share/gnome-shell/extensions/todo-panel@local/（extension.js v3 / stylesheet.css / metadata.json v3）；改 extension.js 必须注销重登（GJS 模块缓存）

## 平台差异与坑（重要）

- **`dragDropEnabled: false` 必须保持**：Tauri 文件拖放拦截会吃掉 HTML5 拖拽，日历拖拽改期失效
- **capabilities 权限编译期嵌入**：改 `capabilities/*.json` / `tauri.conf.json` 后必须重新构建
- 窗口控制（红绿灯、拖动区域）依赖 `core:window:*` 与 `core:event:*` 权限，已配好
- `LogicalSize` 在 v2 全局 API 位于 `__TAURI__.dpi`（代码已做兼容取法）
- 字体栈含 Microsoft YaHei UI + 系统回退，Ubuntu 上中文用 Noto Sans CJK 渲染正常
- 改前端 `src/index.html` 后必须重新 `cargo build`（资源编译期嵌入二进制），只刷新不生效

## 数据模型（data.json）

```jsonc
{
  "v": 1,
  "tasks": [{
    "id": 3,                       // 数字 id；启动时 uid 从 max(id)+1 恢复
    "listId": "study",             // 'study' | 'life' | null（外部来源任务为 null）
    "title": "…", "notes": "",
    "done": false, "doneAt": 0,
    "due": {"ts": 1789000000000, "time": "09:00"},  // ts=当天当地 00:00 毫秒；time 可为 null
    "subtasks": [{"title": "…", "done": false}],
    "created": 1789000000000,
    "src": "obsidian",             // 'obsidian'（外部来源标记，手动任务无此字段）
    "srcNote": "库名/笔记相对路径",  // 外部来源任务的分组名
    "srcPath": "…md",              // 笔记绝对路径（回写用；示例/日历任务无）
    "srcLine": "- [ ] …",          // 原始行文本（回写定位用）
    "srcVault": "E:/vault",        // 所属库路径
  }],
  "obsVaults": [{"name": "…", "path": "/home/x/vault"}],  // 已连接的笔记库（多库；启动自动重连）
  "obsState": {"connected": true, "vault": "…", "vaultPath": "…", "notes": 2, "count": 7},
  "obsOrder":   [],   // 笔记分组显示顺序
  "obsExpanded":{},   // 笔记分组展开状态
  "obsHidden":  [],   // 被屏蔽的笔记
  "theme": "light", "completedOpen": true, "quickList": "study", "calMode": "month"
}
```

保存链路：任何 UI 变更 → `render()` → `scheduleSave()`（400ms 防抖）→ `invoke('save_data')`（临时文件原子替换）。首次启动无数据文件时用内置示例任务。

## 验证情况与路线图

- Windows 开发机历史验证：双库导入/监听/回写、数据迁移；功能清单静态检查全过（日历推拉 E2E 随功能移除一并失效）
- Ubuntu 实机已验证：任务增删改/排序、弹窗勾选通道、窗口尺寸记忆、11 条真实数据迁移
- 路线图：本地应用 ✅、Obsidian 联动 ✅（当前断开，重连前先给 reimportAllVaults 加去重）、日历联动已移除。可选打磨：系统托盘、开机自启
