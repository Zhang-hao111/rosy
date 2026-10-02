import { $, bodyDark } from './utils.js';
import { invoke, tauriListen } from './tauri.js';
import { state, TASKS, obsSources, obsMenuOpen, vaultMenuOpen, addMenuOpen, hydrate, setObsSources } from './store.js';
import { scheduleSave } from './data.js';
import { reimportAllSources, debounceNoteEdit, flushNoteEdit, syncTaskToNote } from './obsidian-sync.js';
import { editTaskLine, flipTaskLine } from './obsidian-parse.js';
import { openObsHiddenMenu, closeObsHiddenMenu, openVaultMenu, closeVaultMenu, openAddSourceMenu, closeAddSourceMenu } from './views-obsidian.js';
import { listenCmds, processCmd } from './cmd-channel.js';
import { closeListMenu, listMenuOpen } from './quickadd.js';
import { closePicker } from './picker.js';
import './task-events.js';    // 副作用模块:任务列表交互(勾选/删除/撤销/拖拽改期/日历格)
import { delTask } from './task-events.js';
import './detail-events.js';  // 副作用模块:详情面板编辑(标题/备注/子任务/清单/日期/删除)
import { batchCloseFn } from './batch.js';
import './split-drag.js';      // 副作用模块:两条分栏拖拽
import './window-chrome.js';   // 副作用模块:红绿灯/尺寸记忆(Tauri 下生效)
import { showToast } from './toast.js';
import { render } from './render.js';
import { renderSidebar } from './sidebar.js';
import { closeTopOverlay } from './ui-overlays.js';
$('#smartNav').addEventListener('click', e=>{
  const item = e.target.closest('.nav-item'); if(!item) return;
  state.view = item.dataset.view; state.selected = null; closePicker(); render();
});
/* 顶栏:「添加」下拉(笔记/库)+ 「已屏蔽 N 篇」管理入口 */
$('#obsReimportBtn').addEventListener('click', e=>{
  e.stopPropagation();
  openAddSourceMenu(e.currentTarget);
});
$('#viewSub').addEventListener('click', e=>{
  const m = e.target.closest('#obsHiddenMgr');
  if(m) openObsHiddenMenu(m);
  const vm = e.target.closest('#vaultMgr');
  if(vm) openVaultMenu(vm);
});
document.addEventListener('click', e=>{
  const pk = $('#picker'), m = $('#listMenu');
  if(!pk.classList.contains('hidden') && !pk.contains(e.target)) closePicker();
  if(listMenuOpen() && !m.contains(e.target)) closeListMenu();
  const am = $('#addSourceMenu');
  if(addMenuOpen && !am.contains(e.target) && !e.target.closest('#obsReimportBtn')) closeAddSourceMenu();
  const hm = $('#obsHiddenMenu');
  if(obsMenuOpen && !hm.contains(e.target) && !e.target.closest('#obsHiddenMgr')) closeObsHiddenMenu();
  const vm = $('#vaultMenu');
  if(vaultMenuOpen && !vm.contains(e.target) && !e.target.closest('#vaultMgr')) closeVaultMenu();
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    if(closeTopOverlay()) return;   // 浮层注册制:后开先关(batch/添加/屏蔽/已连接/清单/日期浮层)
    if(state.selected!==null){ state.selected=null; render(); }
    return;
  }
  const ae = document.activeElement;
  if(ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable)) return;
  if(e.key==='n' || e.key==='N'){ e.preventDefault(); $('#quickInput').focus(); }
  else if(e.key==='/'){ e.preventDefault(); $('#searchInput').focus(); }
});

/* 搜索 */
$('#searchInput').addEventListener('input', e=>{
  state.search = e.target.value.trim().toLowerCase();
  render();
});

/* 主题 */
$('#themeBtn').addEventListener('click', ()=>{
  document.body.classList.toggle('dark');
  const dark = bodyDark();
  $('#themeLabel').textContent = dark ? '切换浅色模式' : '切换深色模式';
  $('#themeIcon').innerHTML = dark
    ? '<circle cx="8" cy="8" r="3.2"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2"/>'
    : '<path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z"/>';
  scheduleSave();
});
/* 跨天(utils.js 定时检测)后整体重渲染:今天/逾期分组与计数自动切换 */
window.addEventListener('daychange', ()=>render());
/* ================= 启动:恢复本地数据 =================
   schema 细节全部在 store.hydrate;这里只管编排与主题 DOM。 */
/* debug E2E 桥前端侧(仅 ROSY_E2E=1 时激活):接收 e2e-cmd 事件驱动编辑链路,
   结果经 e2e_report 写回。release 无 env,整段休眠。 */
async function setupE2E(){
  if(!invoke) return;
  let on = false;
  try{ on = await invoke('is_e2e'); }catch(e){ return; }
  if(!on) return;
  const ops = {
    tasks(){ return {tasks: TASKS.map(t=>({id:t.id, title:t.title, done:t.done, due:t.due, srcLine:t.srcLine, srcNote:t.srcNote, srcPath:t.srcPath}))}; },
    select({id}){ state.selected = id; render(); return {ok:true}; },
    async check({id, done}){
      const t = TASKS.find(x=>x.id===id); if(!t) return {error:'no task'};
      t.done = !!done; t.doneAt = t.done? Date.now() : 0;
      let ok = false;
      if(t.src==='obsidian' && t.srcLine) ok = await syncTaskToNote(t, flipTaskLine(t.srcLine, t.done));
      render(); scheduleSave(); return {ok};
    },
    async setDue({id, ts, time, clear}){
      const t = TASKS.find(x=>x.id===id); if(!t) return {error:'no task'};
      t.due = clear ? null : {ts, time: time||null};
      let ok = false;
      if(t.src==='obsidian' && t.srcLine) ok = await syncTaskToNote(t, editTaskLine(t.srcLine, {due: t.due}));
      render(); scheduleSave(); return {ok};
    },
    setTitle({id, title}){
      const t = TASKS.find(x=>x.id===id); if(!t) return {error:'no task'};
      state.selected = id; render();                       // 与真实编辑一致:先选中(防串写检查依赖它)
      t.title = title; renderSidebar();
      debounceNoteEdit(t, ()=> editTaskLine(t.srcLine, {title}));
      flushNoteEdit(t);                                    // 脚本驱动:立即落笔
      return {ok:true};
    },
    del({id}){ delTask(id); return {ok:true}; },
    undo(){ const b = document.querySelector('#toastUndo'); if(b) b.click(); return {ok:true}; },
  };
  let lastSeq = 0;
  try{
    await tauriListen('e2e-cmd', async ev=>{
      // Tauri 回调参数是事件对象 {event,id,payload};兼容直接传字符串/对象两种形态
      const raw = (ev && typeof ev === 'object' && 'payload' in ev) ? ev.payload : ev;
      let cmd; try{ cmd = typeof raw==='string'? JSON.parse(raw) : raw; }catch(e){ return; }
      if(!cmd || !(cmd.seq > lastSeq)) return;             // seq 单调:目录噪音重放旧命令时忽略
      lastSeq = cmd.seq;
      let out;
      try{ out = {...(await ops[cmd.op](cmd)), seq: cmd.seq}; }
      catch(e){ out = {error: String(e && e.message || e), seq: cmd.seq}; }
      try{ await invoke('e2e_report', {text: JSON.stringify(out)}); }catch(e){ console.error('e2e_report 失败', e); }
    });
    await invoke('e2e_report', {text: JSON.stringify({ready:true, seq:0})});
  }catch(e){ console.error('E2E 桥启动失败', e); }
}
(async function init(){
  let restored = false;
  if(invoke){
    try{
      const r = hydrate(await invoke('load_data'));
      restored = r.restored;
      if(r.theme==='dark'){
        document.body.classList.add('dark');
        $('#themeLabel').textContent = '切换浅色模式';
        $('#themeIcon').innerHTML = '<circle cx="8" cy="8" r="3.2"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2"/>';
      }
    }catch(err){ console.error('恢复数据失败', err); }
  }
  render();
  if(restored && obsSources.length && invoke){
    // 自动重连:重读所有来源并重新监听;已失效的来源自动移出列表
    reimportAllSources({silent:true}).then(res=>{
      if(res.failed.length){
        setObsSources(obsSources.filter(v=>!res.failed.includes(v)));
        showToast(`「${res.failed.map(f=>f.name).join('」「')}」已不可访问，已移除`);
        reimportAllSources({silent:true});
      }
    });
  }
  if(invoke){
    listenCmds();
    processCmd();   // 应用启动时补处理离线期间积压的弹窗命令
  }
  setupE2E();
  if(!restored) scheduleSave();
})();
