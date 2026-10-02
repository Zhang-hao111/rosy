// 详情面板交互:#detailInner 三个监听(标题/备注/子任务编辑,清单/日期/删除入口)。
import { $ } from './utils.js';
import { TASKS, state } from './store.js';
import { scheduleSave } from './data.js';
import { renderSidebar } from './sidebar.js';
import { render } from './render.js';
import { openPicker, closePicker } from './picker.js';
import { openListMenu } from './quickadd.js';
import { delTask } from './task-events.js';
$('#detailInner').addEventListener('click', e=>{
  const t = TASKS.find(x=>x.id===state.selected); if(!t) return;
  if(e.target.closest('#dClose')){ state.selected=null; closePicker(); render(); return; }
  if(e.target.closest('#dDate')){
    e.stopPropagation(); openPicker('task', e.target.closest('#dDate'), t.id); return;
  }
  if(e.target.closest('#dList')){
    e.stopPropagation(); openListMenu('detail', e.target.closest('#dList')); return;
  }
  if(e.target.closest('#dDelete')){ delTask(t.id); closePicker(); return; }
  const sc = e.target.closest('.sub-check');
  if(sc){ t.subtasks[+sc.dataset.i].done = !t.subtasks[+sc.dataset.i].done; render(); }
});
$('#detailInner').addEventListener('input', e=>{
  const t = TASKS.find(x=>x.id===state.selected); if(!t) return;
  if(e.target.id==='dTitle'){ t.title = e.target.value; renderSidebar(); const r=$(`.row[data-id="${t.id}"] .txt`); if(r) r.textContent=t.title; }
  if(e.target.id==='dNotes'){ t.notes = e.target.innerText.trim(); }
  scheduleSave();
});
$('#detailInner').addEventListener('keydown', e=>{
  const t = TASKS.find(x=>x.id===state.selected); if(!t) return;
  if(e.target.id==='dSubAdd' && e.key==='Enter' && e.target.value.trim()){
    t.subtasks.push({title:e.target.value.trim(), done:false});
    render(); setTimeout(()=>{ const i=$('#dSubAdd'); if(i) i.focus(); },0);
  }
  if(e.target.id==='dTitle' && e.key==='Enter') e.target.blur();
});
