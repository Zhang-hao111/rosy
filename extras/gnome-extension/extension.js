// 待办面板 v4：时钟弹窗 = Rosy 任务列表
// 右侧月历列整体移除（含事件/世界时钟分区），弹窗固定 374×322（通知区保留在下方）。
// 数据源 ~/.config/com.rosy.app/data.json；勾选经 cmd.json（期望态映射）传给应用：
//   扩展写期望态 → 应用监听执行 → 防抖保存。
// cmd 是「目标状态」而非事件，重放安全；应用离线时留盘，下次启动补处理。
const { GObject, St, Clutter, Gio, GLib, Pango, Gtk } = imports.gi;
const Main = imports.ui.main;
const MessageList = imports.ui.messageList;

const DATA_JSON = '/home/h/.config/com.rosy.app/data.json';
const CMD_JSON = '/home/h/.config/com.rosy.app/cmd.json';
const MAX_ROWS = 18;

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function readJson(path) {
    try {
        const [ok, bytes] = Gio.File.new_for_path(path).load_contents(null);
        return ok ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    } catch (e) {
        return null;
    }
}

function writeJsonAtomic(path, obj) {
    const file = Gio.File.new_for_path(path);
    const tmp = Gio.File.new_for_path(path + '.tmp');
    tmp.replace_contents(new TextEncoder().encode(JSON.stringify(obj)), null, false,
                         Gio.FileCreateFlags.NONE, null);
    tmp.move(file, Gio.FileCopyFlags.OVERWRITE, null, null);
}

// —— 勾选期望态覆盖层：本地立即生效，data.json 反映后自动收敛 ——
let _overlay = {};   // { taskId: desiredDone }

function loadTasks() {
    const d = readJson(DATA_JSON);
    if (!d || !Array.isArray(d.tasks)) return [];
    const out = [];
    for (const t of d.tasks) {
        const due = t.due || {};
        let done = !!t.done;
        if (_overlay[t.id] !== undefined) {
            if (!!t.done === _overlay[t.id])
                delete _overlay[t.id];            // 应用已落盘，覆盖层收敛
            else
                done = _overlay[t.id];            // 应用尚未处理，先显示期望态
        }
        const subtasks = t.subtasks || [];
        out.push({
            id: t.id, listId: t.listId || '', title: t.title || '', notes: t.notes || '', done,
            dueTs: due.ts || 0, dueTime: due.time || null,
            sub: subtasks.length, subDone: subtasks.filter(s => s.done).length,
        });
    }
    // 弹窗只收录【学习】清单里带日期的未完成任务，按日期升序
    return out.filter(t => !t.done && t.listId === 'study' && t.dueTs)
        .sort((a, b) => a.dueTs - b.dueTs);
}

function dueBadge(ts, time) {
    const d = GLib.DateTime.new_from_unix_local(ts / 1000);
    const now = GLib.DateTime.new_now_local();
    const noon = dt => GLib.DateTime.new_local(dt.get_year(), dt.get_month(), dt.get_day_of_month(), 12, 0, 0);
    const dayDiff = Math.round(noon(d).difference(noon(now)) / 86400000);
    let text, hot = false;
    if (dayDiff === 0) { text = '今天'; hot = true; }
    else if (dayDiff === -1) { text = '昨天'; hot = true; }
    else if (dayDiff === 1) text = '明天';
    else if (dayDiff === 2) text = '后天';
    else if (dayDiff >= -6 && dayDiff <= 6) text = WEEK[d.get_day_of_week() % 7];
    else text = d.get_month() + '月' + d.get_day_of_month() + '日' + (time ? ' ' + time : '');
    return { text, hot };
}

function writeToggle(id, desired) {
    const cmd = readJson(CMD_JSON) || {};
    if (!cmd.done) cmd.done = {};
    cmd.done[id] = desired;
    writeJsonAtomic(CMD_JSON, cmd);
}

const TodoSection = GObject.registerClass({
    GTypeName: 'TodoCalendarSection',
}, class TodoCalendarSection extends MessageList.MessageListSection {
    _init() {
        super._init();
        this.add_style_class_name('todo-panel-section');

        this.refresh();
    }

    refresh() {
        this._list.destroy_all_children();

        const tasks = loadTasks();

        for (const t of tasks.slice(0, MAX_ROWS))
            this._list.add_child(this._makeRow(t));
        this._sync();
    }

    _sync() {
        // GNOME 42 基类把每行当成包着 Message 的 St.Bin，并调用
        // row.child.canClose()。这里是普通任务按钮，必须自行维护状态，
        // 不能调用基类 _sync，否则首次加入任务就会报错且分区保持隐藏。
        const empty = this._list.get_n_children() === 0;
        if (this._empty !== empty) {
            this._empty = empty;
            this.notify('empty');
        }
        if (this._canClear !== false) {
            this._canClear = false;
            this.notify('can-clear');
        }
        this.visible = this.allowed && this._shouldShow();
    }

    _makeRow(t) {
        const row = new St.BoxLayout({
            style_class: 'todo-panel-row',
            x_expand: true,
            // 不设这两项 St.BoxLayout 收不到指针事件，:hover 伪类永不触发
            // （官方 PopupBaseMenuItem 同款模式），悬停胶囊就出不来
            reactive: true,
            track_hover: true,
        });

        const bar = new St.Bin({
            style_class: 'todo-panel-bar ' + (t.listId || 'life'),
            style: 'height: 26px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.add_child(bar);

        // 勾选与行体是同级按钮：点圆圈只切换状态，点行体只展开备注，互不触发
        const check = new St.Button({
            style_class: ['todo-panel-check', t.listId, t.done ? 'done' : ''].filter(Boolean).join(' '),
            can_focus: true,
            accessible_name: (t.done ? '标记未完成：' : '标记完成：') + t.title,
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (t.done) {
            check.set_child(new St.Icon({
                icon_name: 'object-select-symbolic', icon_size: 11,
                style: 'color: #fff;',
            }));
        }
        check.connect('clicked', () => this._toggle(t));
        row.add_child(check);

        const body = new St.Button({
            style_class: 'todo-panel-body',
            x_expand: true,
            // 不加这个：行体会被拉到整行高，文字顶在上面，与竖条/圆圈错位
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
            accessible_name: '查看备注：' + t.title,
        });
        const mid = new St.BoxLayout({
            vertical: true, x_expand: true, style: 'spacing: 2px;',
        });
        body.set_child(mid);
        const title = new St.Label({ text: t.title });
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        if (t.done)
            title.clutter_text.set_markup('<s>' + GLib.markup_escape_text(t.title, -1) + '</s>');
        title.add_style_class_name('todo-panel-title' + (t.done ? ' done' : ''));
        mid.add_child(title);

        const meta = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER, style: 'spacing: 6px;',
        });
        if (t.dueTs) {
            const { text, hot } = dueBadge(t.dueTs, t.dueTime);
            meta.add_child(new St.Label({
                text,
                style_class: 'todo-panel-due' + (hot && !t.done ? ' hot' : ''),
            }));
        }
        if (t.sub)
            meta.add_child(new St.Label({
                text: t.subDone + '/' + t.sub, style_class: 'todo-panel-sub',
            }));

        // 备注：默认收起，点击行展开/收起（有备注才显示箭头）
        if (t.notes) {
            const note = new St.Label({ text: t.notes, style_class: 'todo-panel-note' });
            note.clutter_text.line_wrap = true;
            note.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            note.visible = false;
            mid.add_child(note);
            const chev = new St.Icon({
                icon_name: 'pan-end-symbolic', icon_size: 10,
                style_class: 'todo-panel-chev', y_align: Clutter.ActorAlign.CENTER,
            });
            meta.add_child(chev);
            body.connect('clicked', () => {
                note.visible = !note.visible;
                chev.icon_name = note.visible ? 'pan-down-symbolic' : 'pan-end-symbolic';
            });
        }
        row.add_child(body);
        row.add_child(meta);
        return row;
    }

    _toggle(t) {
        const desired = !t.done;
        _overlay[t.id] = desired;      // 本地立即生效，data.json 落盘后收敛
        t.done = desired;
        try {
            writeToggle(t.id, desired);
        } catch (e) {
            log('todo-panel: 写勾选命令失败: ' + e);
            Main.notify('未能同步勾选', e.message || '命令写入失败，请稍后重试');
        }
        this.refresh();
    }

    // 日历的「清除」只应处理通知，不可删除待办；本类 _sync 保持
    // canClear=false，此处再显式保护。
    clear() {
    }
});

let _section = null;
let _openChangedId = null;
let _calendarColumn = null;
let _prevBoxStyle = null;

function init() {
}

function enable() {
    let dateMenu = Main.panel.statusArea.dateMenu;
    let messageList = dateMenu && dateMenu._messageList;
    if (!messageList || !messageList._sectionList) {
        log('todo-panel: 找不到日历弹窗的消息列表，未注入');
        return;
    }

    _section = new TodoSection();
    messageList._addSection(_section);
    messageList._sectionList.set_child_at_index(_section, 0);

    // 移除右侧月历列（日历 + 事件 + 世界时钟同列），任务列表占满弹窗
    _calendarColumn = dateMenu._calendar && dateMenu._calendar.get_parent();
    if (_calendarColumn)
        _calendarColumn.visible = false;
    _prevBoxStyle = dateMenu.menu.box.get_style();
    // 高度随内容数量变化，上限为屏幕高度一半
    const mon = global.display.get_monitor_geometry(global.display.get_primary_monitor());
    dateMenu.menu.box.set_style(`width: 374px; max-height: ${Math.floor(mon.height / 2)}px;` + (_prevBoxStyle || ''));
    // 半透明磨砂底（GNOME 42 无背景模糊滤镜，靠透出桌面 + 半透白实现玻璃感；
    // 专属类用于作用域限定，不污染其他弹窗）
    dateMenu.menu.box.add_style_class_name('rosy-date-menu');
    // Clutter 固定宽度 + 自然高度（高度随内容；-1 = 不限，压过 WhiteSur 的 30em）
    messageList.set_size(348, -1);
    // 列表滚动条太显眼：直接禁用（滚轮仍可滚动）
    if (messageList._scrollView)
        messageList._scrollView.vscrollbar_policy = Gtk.PolicyType.NEVER;

    // 每次展开弹窗都重读 data.json：应用里改完，下次点开就是新的
    _openChangedId = dateMenu.menu.connect('open-state-changed', (menu, open) => {
        if (open) {
            _section.refresh();
            // 诊断：分配完成后把各层实际尺寸写进 journal（排排版问题用，稳定后删）
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                const parts = [];
                const put = (n, a) => { if (a) parts.push(n + '=' + a.get_width() + 'x' + a.get_height()); };
                put('boxPointer', menu.actor);
                put('menuBox', menu.box);
                put('msgList', dateMenu._messageList);
                if (dateMenu._messageList) {
                    put('scrollView', dateMenu._messageList._scrollView);
                    put('sectionList', dateMenu._messageList._sectionList);
                }
                put('section', _section);
                put('calCol', _calendarColumn);
                log('todo-panel sizes: ' + parts.join(' '));
                return false;
            });
        }
    });
}

function disable() {
    if (_openChangedId && Main.panel.statusArea.dateMenu) {
        Main.panel.statusArea.dateMenu.menu.disconnect(_openChangedId);
        _openChangedId = null;
    }
    if (_calendarColumn) {
        _calendarColumn.visible = true;   // 还原月历列
        _calendarColumn = null;
    }
    if (Main.panel.statusArea.dateMenu && Main.panel.statusArea.dateMenu._messageList)
        Main.panel.statusArea.dateMenu._messageList.set_size(-1, -1);
    if (_prevBoxStyle !== null && Main.panel.statusArea.dateMenu) {
        Main.panel.statusArea.dateMenu.menu.box.set_style(_prevBoxStyle);
        _prevBoxStyle = null;
    }
    if (Main.panel.statusArea.dateMenu)
        Main.panel.statusArea.dateMenu.menu.box.remove_style_class_name('rosy-date-menu');
    if (_section) {
        _section.destroy();
        _section = null;
    }
}
