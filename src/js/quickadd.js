import { $, fmtTs, TODAY, WD } from './utils.js';
import { TASKS, state, LISTS, T } from './store.js';
import { render, animateRow } from './render.js';
import { scheduleSave } from './data.js';
import { openPicker, closePicker } from './picker.js';
import { viewDef } from './views.js';
import { positionMenu } from './ui-menu.js';
import { registerOverlay, overlayOpened } from './ui-overlays.js';
/* ================= 快速添加栏 ================= */
function renderQuickBar(){
  const def = viewDef(state.view);
  $('#quickBar').style.display = def && def.quickAdd===false ? 'none' : '';
  const pill = $('#listPill');
  const inSmart = !!(def && def.pill);
  pill.style.display = inSmart ? '' : 'none';
  if(inSmart){
    const l = LISTS.find(x=>x.id===state.quickList);
    $('#listPillDot').style.background = l.color;
    $('#listPillName').textContent = l.name;
  }
  const inCal = !!(def && def.calTarget);
  const effTs = inCal ? state.calSel : state.quickDate;
  const lbl = $('#quickDateLabel');
  const btn = $('#quickDateBtn');
  if(effTs){
    btn.classList.add('set');
    lbl.textContent = fmtTs(effTs, inCal? '' : state.quickTime) + (inCal && state.quickTime? ' '+state.quickTime:'');
  } else {
    btn.classList.remove('set');
    lbl.textContent = '日期';
  }
  const q = $('#quickInput');
  if(def && def.calTarget) q.placeholder = `添加到 ${fmtTs(state.calSel)}，回车确认`;
  else q.placeholder = `添加到「${def ? def.title : ''}」，回车确认`;
}
/* 快速添加 */
$('#quickInput').addEventListener('keydown', e=>{
  if(e.key!=='Enter') return;
  const s = e.target.value.trim(); if(!s) return;
  const def = viewDef(state.view);
  let listId, d;
  if(def && def.pill) listId = state.quickList;
  else listId = state.view;
  if(def && def.calTarget)            d = {ts: state.calSel, time: state.quickTime||null};
  else if(def && def.kind==='smart')  d = {ts: state.quickDate || TODAY, time: state.quickTime||null};
  else                                d = state.quickDate ? {ts: state.quickDate, time: state.quickTime||null} : null;
  const nt = T({title:s, listId, due:d});
  TASKS.unshift(nt);
  e.target.value=''; state.quickDate=null; state.quickTime='';
  render(); scheduleSave();
  animateRow(nt.id, 'enter');
});
$('#listPill').addEventListener('click', e=>{
  e.stopPropagation();
  openListMenu('quick', $('#listPill'));
});

/* 清单下拉菜单 */
let menuCtx = null;
function openListMenu(ctx, anchor){
  closeListMenu(); closePicker();
  menuCtx = ctx;
  const cur = ctx==='detail' ? (TASKS.find(x=>x.id===state.selected)||{}).listId : state.quickList;
  const m = $('#listMenu');
  m.innerHTML = LISTS.map(l=>`
    <div class="menu-item ${l.id===cur?'sel':''}" data-id="${l.id}">
      <span class="dot" style="background:${l.color}"></span>${l.name}
      <svg class="ck" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.6 2.6L10 3.2"/></svg>
    </div>`).join('');
  m.classList.remove('hidden');
  positionMenu(m, anchor, {width:172});
  overlayOpened('listMenu');
}
function closeListMenu(){ $('#listMenu').classList.add('hidden'); menuCtx = null; }
$('#listMenu').addEventListener('click', e=>{
  const it = e.target.closest('.menu-item'); if(!it) return;
  const id = it.dataset.id;
  const ctx = menuCtx;
  if(ctx==='detail'){ const t = TASKS.find(x=>x.id===state.selected); if(t) t.listId = id; }
  else state.quickList = id;
  closeListMenu(); render(); scheduleSave();   // listId 与 quickList 都在落盘字段里
  if(ctx==='quick') $('#quickInput').focus();
});
$('#quickDateBtn').addEventListener('click', e=>{
  e.stopPropagation();
  openPicker('quick', $('#quickDateBtn'));
});
registerOverlay('listMenu', {isOpen:listMenuOpen, close:closeListMenu});
export { renderQuickBar, openListMenu, closeListMenu };
export function listMenuOpen(){ return menuCtx !== null; }
