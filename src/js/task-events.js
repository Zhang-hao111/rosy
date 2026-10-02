// 任务列表交互:#taskScroll 委托(勾选/删除/清空/撤销/拖拽改期/日历格与导航)。
// 只注册监听,不导出编排;delTask 供详情面板的删除按钮复用。
import { $, $$, TODAY, DAY, fmtTs } from './utils.js';
import { TASKS, state, obsExpanded, setTasks } from './store.js';
import { invoke } from './tauri.js';
import { scheduleSave, saveObsPrefs } from './data.js';
import { flipTaskLine } from './obsidian-parse.js';
import { syncCalYM } from './views-calendar.js';
import { render, renderDetail, animateRow, retrigger } from './render.js';
import { showToast, hideToast } from './toast.js';
import { openPicker } from './picker.js';
import { demoImport, connectNotes, connectVault, moveNote, hideNote, syncTaskToNote, rememberLedgerLine } from './obsidian-sync.js';
import { openObsHiddenMenu } from './views-obsidian.js';
$('#taskScroll').addEventListener('click', e=>{
  if(e.target.closest('#obsConnectNoteBtn')){
    (async ()=>{
      if(invoke){
        const ps = await invoke('pick_note');
        if(ps && ps.length) connectNotes(ps); else showToast('已取消选择');
      } else { $('#obsNoteFile').click(); }   // 浏览器预览
    })();
    return;
  }
  if(e.target.closest('#obsConnectVaultBtn')){
    (async ()=>{
      if(invoke){
        const p = await invoke('pick_vault');
        if(p) connectVault(p); else showToast('已取消选择');
      } else { $('#obsFile').click(); }   // 浏览器预览
    })();
    return;
  }
  if(e.target.closest('#obsDemoBtn')){ demoImport(); return; }
  if(e.target.closest('#obsHiddenMgr')){ e.stopPropagation(); openObsHiddenMenu(e.target.closest('#obsHiddenMgr')); return; }
  const obsHead = e.target.closest('.obs-head');
  if(obsHead){
    const act = e.target.closest('[data-obsact]');
    const note = obsHead.dataset.note;
    if(act){
      const a = act.dataset.obsact;
      if(a==='up') moveNote(note,'up');
      else if(a==='down') moveNote(note,'down');
      else if(a==='hide') hideNote(note);
      return;
    }
    obsExpanded[note] = !obsExpanded[note];   // 展开状态持久化
    saveObsPrefs();
    obsHead.classList.toggle('collapsed', !obsExpanded[note]);
    const wrap = obsHead.nextElementSibling;
    if(wrap) wrap.classList.toggle('open', obsExpanded[note]);
    return;
  }
  const actDate = e.target.closest('.act-date');
  if(actDate){ e.stopPropagation(); openPicker('task', actDate, +actDate.dataset.id); return; }
  const actDel = e.target.closest('.act-del');
  if(actDel){ e.stopPropagation(); delTask(+actDel.dataset.id); return; }
  const doneClear = e.target.closest('#doneClear');
  if(doneClear){ e.stopPropagation(); clearDone(); return; }
  if(e.target.closest('#doneHead')){
    state.completedOpen = !state.completedOpen;           // 就地折叠，保留过渡动画
    const w = $('#doneWrap'), h = $('#doneHead');
    if(w) w.classList.toggle('open', state.completedOpen);
    if(h) h.classList.toggle('collapsed', !state.completedOpen);
    return;
  }
  if(e.target.closest('#calPrev')){
    if(state.calMode==='week'){ state.calSel-=7*DAY; syncCalYM(); } else { if(--state.calM<0){state.calM=11;state.calY--;} }
    render(); return;
  }
  if(e.target.closest('#calNext')){
    if(state.calMode==='week'){ state.calSel+=7*DAY; syncCalYM(); } else { if(++state.calM>11){state.calM=0;state.calY++;} }
    render(); return;
  }
  if(e.target.closest('#calToday')){ state.calSel=TODAY; state.quickDate=TODAY; state.calY=new Date().getFullYear(); state.calM=new Date().getMonth(); render(); return; }
  if(e.target.closest('#calModeW')){ if(state.calMode!=='week'){ state.calMode='week'; render(); } return; }
  if(e.target.closest('#calModeM')){ if(state.calMode!=='month'){ state.calMode='month'; state.calY=new Date(state.calSel).getFullYear(); state.calM=new Date(state.calSel).getMonth(); render(); } return; }
  const chip = e.target.closest('.cchip');
  if(chip){ state.selected = +chip.dataset.id; render(); return; }
  const cell = e.target.closest('.cell');
  if(cell && !cell.classList.contains('other')){
    state.calSel = +cell.dataset.ts; state.quickDate = state.calSel; state.quickTime=''; state.selected=null; render(); return;
  }
  const check = e.target.closest('.check');
  if(check){ toggleDone(+check.dataset.id); return; }
  const row = e.target.closest('.row');
  if(row){ state.selected = +row.dataset.id; render(); }
});
function toggleDone(id){
  const t = TASKS.find(x=>x.id===id); if(!t) return;
  t.done = !t.done; t.doneAt = t.done? Date.now() : 0;
  if(t.srcPath && t.srcLine && invoke){
    syncTaskToNote(t, flipTaskLine(t.srcLine, t.done));   // 统一回写入口:成功自动更新 srcLine/台账/落盘
  }
  render();
  scheduleSave();   // 修复：勾选状态此前不会落盘
  animateRow(id, t.done ? 'justdone' : 'enter');
  if(t.done) retrigger($('#ringBox'),'pop');
}

/* 删除 + 撤销 */
let lastDeleted = null;
function delTask(id){
  const i = TASKS.findIndex(x=>x.id===id); if(i<0) return;
  const t = TASKS[i];
  lastDeleted = {task: t, index: i};
  TASKS.splice(i,1);
  if(state.selected===id) state.selected=null;
  // Obsidian 任务:删除同步笔记——立即落笔,不等撤销窗口(否则窗口期内 reimport 会把行带回来)。
  // 台账不手工清理:行消失后由 reimport 的剪枝自动清;保留台账让撤销追加时 id 直接复原
  if(t.src==='obsidian' && t.srcPath && t.srcLine && invoke){
    lastDeleted.noteOp = invoke('remove_line', {path: t.srcPath, line: t.srcLine})
      .then(ok=>{
        if(ok){ scheduleSave(); }
        else showToast('笔记内容已变动，未能同步删除');   // 下次同步该任务会按笔记复活(笔记赢)
      })
      .catch(()=>showToast('同步删除失败：无法写入笔记文件'));
  }
  render(); scheduleSave();
  const title = lastDeleted.task.title;
  showToast(`已删除「${title.length>14? title.slice(0,14)+'…' : title}」`, undoDelete);
}
/* 清空已完成（可撤销）；已完成任务的日历事件在完成时已移除，无需墓碑 */
let lastCleared = null;
function clearDone(){
  const doneTasks = TASKS.filter(t=>t.done);
  if(!doneTasks.length) return;
  const index = TASKS.findIndex(t=>t.done);
  lastCleared = {tasks: doneTasks, index};
  setTasks(TASKS.filter(t=>!t.done));
  if(lastCleared.index < TASKS.length && state.selected && !TASKS.some(t=>t.id===state.selected)) state.selected=null;
  render(); scheduleSave();
  showToast(`已清空 ${doneTasks.length} 条已完成任务`, undoClearDone);
}
function undoClearDone(){
  if(!lastCleared) return;
  TASKS.splice(Math.min(lastCleared.index, TASKS.length), 0, ...lastCleared.tasks);
  lastCleared = null; hideToast(); render(); scheduleSave();
}
function undoDelete(){
  if(!lastDeleted) return;
  TASKS.splice(Math.min(lastDeleted.index, TASKS.length), 0, lastDeleted.task);
  const t = lastDeleted.task;
  const noteOp = lastDeleted.noteOp;
  lastDeleted = null; hideToast(); render(); scheduleSave();
  // Obsidian 任务:撤销 = 行追加回笔记末尾(位置可能变化,R1 已知取舍);
  // 串行等待未完成的 remove_line,避免「先追加后删除」的乱序竞态;
  // 追加成功后重新登记台账——删除后 watcher 触发的重导入已把该行剪掉,不登记会派生新 id
  const go = ()=> invoke('append_line', {path: t.srcPath, line: t.srcLine})
    .then(()=>{ rememberLedgerLine(t.srcPath, t.srcLine, t.id); })
    .catch(()=>showToast('撤销恢复：笔记追加失败'));
  if(t.src==='obsidian' && t.srcPath && t.srcLine && invoke){
    (noteOp ? noteOp.catch(()=>{}) : Promise.resolve()).then(go);
    showToast('已恢复 · 行已追加到笔记末尾');
  }
}
/* 拖拽改期 */
$('#taskScroll').addEventListener('dragstart', e=>{
  const src = e.target.closest('[draggable="true"][data-id]');
  if(!src) return;
  e.dataTransfer.setData('text/plain', src.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  src.classList.add('dragging');
});
$('#taskScroll').addEventListener('dragend', ()=>{
  $$('.dragging').forEach(x=>x.classList.remove('dragging'));
  $$('.cell.dragover').forEach(c=>c.classList.remove('dragover'));
});
$('#taskScroll').addEventListener('dragover', e=>{
  const cell = e.target.closest('.cell');
  if(!cell || cell.classList.contains('other')) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  $$('.cell.dragover').forEach(c=>{ if(c!==cell) c.classList.remove('dragover'); });
  cell.classList.add('dragover');
});
$('#taskScroll').addEventListener('drop', e=>{
  const cell = e.target.closest('.cell:not(.other)'); if(!cell) return;
  e.preventDefault();
  const id = +e.dataTransfer.getData('text/plain');
  const t = TASKS.find(x=>x.id===id); if(!t) return;
  const ts = +cell.dataset.ts;
  const prevDue = t.due;
  t.due = {ts, time: t.due ? t.due.time : null};
  if(state.selected===id && $('#detailPane').classList.contains('open')) renderDetail();
  render(); scheduleSave();
  showToast(`已移至 ${fmtTs(ts)}`, ()=>{ t.due = prevDue; render(); scheduleSave(); });
});
export { delTask };
