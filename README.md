# Rosy

macOS 风格待办应用 · Tauri 2 + 原生 HTML/CSS/JS（无框架）· Ubuntu 22.04 / GNOME 42（Wayland）。

为单机日常使用打磨：应用内管理任务，
顶栏时钟弹窗直接看今天该做什么、直接勾选。

## 功能

**应用内**

- 学习 / 生活两清单、今天视图、月历 + 周历（拖拽改期）、每周固定任务批量生成
- 悬停快捷改期 / 删除（可撤销）、搜索、深浅色主题、快捷键 `N` 新建 / `/` 搜索
- 列表按截止日期、时间排序；「已完成」组默认收起，支持一键全部删除（可撤销）
- 窗口尺寸记忆：记住上次大小与位置（最小 960×620；关窗瞬间定格，避免析构期假 resize）
- macOS 质感：无边框窗口自绘标题栏、便签风格应用图标

**与桌面的联动（现状）**

- **不接系统日历**：数据只在 Rosy 内部（`data.json`），不与 EDS / GNOME 日历联动
  （联动代码已于 2026-10-02 整体移除，缘由见 `HANDOFF.md`）
- **顶栏时钟弹窗 = Rosy 任务列表**（`todo-panel@local` 扩展 v4）：
  弹窗里移除月历，只列【学习】清单中带截止日期的未完成任务、按日期排序、
  高度随内容伸缩（上限半屏）；行悬停成粉色胶囊、可直接勾选完成、
  底部有 macOS 风格的「清除 / 请勿打扰」
- **弹窗 → 应用通道**：扩展把勾选写进 `~/.config/com.rosy.app/cmd.json`
  （`{done: {id: bool}}` 期望状态、幂等重放），应用监听应用后写 `ack_cmd` 确认
- Obsidian 联动代码保留但已断开：现有导入是全量追加式，重复导入会造成任务翻倍
  （2026-10-02 实际发生过，已重置并断开）；重连前需先给 `reimportAllVaults`
  加去重 / 按笔记过滤，见 `HANDOFF.md`

## 数据与通道

都在 `~/.config/com.rosy.app/`：

| 文件 | 用途 |
| --- | --- |
| `data.json` | **v2 布局** `{ v:2, tasks:[...], prefs:{...} }`:任务保持顶层(顶栏扩展直读 `tasks`),偏好收在 `prefs`;400ms 防抖 + 临时文件原子替换。schema 收口在 `js/store.js` 的 `toData()/hydrate()`,兼容读取 v1 平铺旧档并自动落为 v2 |
| `cmd.json` / ack | 弹窗 → 应用的期望状态通道（应用处理后删除该文件确认） |

## 开发

```bash
npm install
npm run tauri dev      # 开发模式热重载
npm run tauri build    # 产出 .deb（src-tauri/target/release/bundle/deb/）
```

依赖：Node 18+、Rust stable、Tauri v2 的 Ubuntu 系统依赖（清单见 `HANDOFF.md`）。

本机部署方式：用户级启动器 `~/.local/share/applications/rosy.desktop`
直接指向 `src-tauri/target/release/rosy`（改完 `npm run tauri build` 重开应用即生效）。
`sudo dpkg -i` 装系统 deb 是可选的，系统版 `/usr/bin/rosy` 容易和源码版脱节。

弹窗扩展部署：把 `extras/gnome-extension/` 放到
`~/.local/share/gnome-shell/extensions/todo-panel@local/`（改 JS 需注销重登，CSS 可热重载）。

## 结构

```
src/index.html              标记(骨架)+ 9 个 <link> + ES module 入口 main.js
src/css/                    9 个样式文件,按原分区注释切分(base/window/sidebar/batch/
                            content/calendar/detail/picker/animations)
src/js/                     20 个原生 ES modules(无框架无打包器):
  store.js      共享可变状态唯一来源 + 数据 schema 收口(toData/hydrate,v2 布局)
  tauri.js      window.__TAURI__ 单点(浏览器预览自动降级)
  utils.js      DOM/日期/转义工具
  data.js       防抖保存 + 任务查询(inView/countFor 等走 views 注册表)
  views.js      视图注册表:成员判定/导航标记——加"清单类新视图"零改动
  rows/toast    任务行 HTML / toast+撤销
  sidebar       侧栏(导航由 views.navHTML() 生成)
  views-list / views-calendar / render(详情+总调度) / quickadd / picker
  task-events / detail-events   列表交互 / 详情编辑(副作用模块)
  obsidian / cmd-channel        多库联动 / 弹窗 cmd.json 通道
  split-drag / batch / window-chrome   分栏拖拽 / 每周批量 / 窗口控制
src-tauri/src/lib.rs        入口:run() + setup + invoke_handler
src-tauri/src/storage.rs    data.json 原子读写
src-tauri/src/obsidian.rs   库读取/选目录/监听/回写 + VaultWatcher
src-tauri/src/cmd_channel.rs  弹窗 cmd.json 通道(监听注册在 setup)
src-tauri/capabilities/     窗口权限(set-size / center 等)
design/date-menu-mockup.html  顶栏弹窗的 HTML 设计稿
extras/gnome-extension/     todo-panel@local 扩展源码副本(部署在 ~/.local/share/gnome-shell/extensions/)
extras/sample-user-data.json  原 zip 自带的示例数据(v1 布局),代码未引用,仅留档
HANDOFF.md                  完整交接文档:Ubuntu 依赖、EDS 的坑与结局、弹窗规则、数据模型、平台差异
```

改前端后必须 `cargo build`(资源编译期嵌入);前端接了三道静态检查
(`node --check` + check.mjs:导入完整/依赖图可达/视图判断不泄漏),在 `refactor/modular` 分支。

## 文档

交接与排坑细节都在 [HANDOFF.md](HANDOFF.md)（先读它）：
各阶段完成情况、EDS 本地日历为什么走不通、弹窗历版规则、`data.json` 数据模型、Wayland 下的验证手段。

## 许可

[MIT](LICENSE)。
