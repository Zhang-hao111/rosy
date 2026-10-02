import { $, fmtTs, TODAY, WD } from './utils.js';
import { TASKS, state, LISTS, T } from './store.js';
import { render, animateRow } from './render.js';
import { openPicker, closePicker } from './picker.js';
/* ================= 快速添加栏 ================= */
function renderQuickBar(){
  $('#quickBar').style.display = state.view==='obsidian' ? 'none' : '';
  const pill = $('#listPill');
  const inSmart = (state.view==='today'||state.view==='calendar');
  pill.style.display = inSmart ? '' : 'none';
  if(inSmart){
    const l = LISTS.find(x=>x.id===state.quickList);
    $('#listPillDot').style.background = l.color;
    $('#listPillName').textContent = l.name;
  }
  const inCal = state.view==='calendar';
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
  if(state.view==='today')       q.placeholder = '添加到「今天」，回车确认';
  else if(state.view==='calendar') q.placeholder = `添加到 ${fmtTs(state.calSel)}，回车确认`;
  else q.placeholder = `添加到「${(LISTS.find(l=>l.id===state.view)||{}).name}」，回车确认`;
}
/* 快速添加 */
$('#quickInput').addEventListener('keydown', e=>{
  if(e.key!=='Enter') return;
  const s = e.target.value.trim(); if(!s) return;
  let listId, d;
  if(state.view==='today'||state.view==='calendar') listId = state.quickList;
  else listId = state.view;
  if(state.view==='calendar')      d = {ts: state.calSel, time: state.quickTime||null};
  else if(state.view==='today')    d = {ts: state.quickDate || TODAY, time: state.quickTime||null};
  else                             d = state.quickDate ? {ts: state.quickDate, time: state.quickTime||null} : null;
  const nt = T({title:s, listId, due:d});
  TASKS.unshift(nt);
  e.target.value=''; state.quickDate=null; state.quickTime='';
  render();
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
  const r = anchor.getBoundingClientRect();
  const pw = 172, ph = m.offsetHeight;
  let x = Math.min(r.left, window.innerWidth - pw - 16);
  let y = r.bottom + 8;
  const up = y + ph > window.innerHeight - 12;
  if(up) y = r.top - ph - 8;
  m.style.left = x+'px'; m.style.top = Math.max(12,y)+'px';
  m.style.transformOrigin = `${r.left < window.innerWidth/2 ? 'left' : 'right'} ${up?'bottom':'top'}`;
}
function closeListMenu(){ $('#listMenu').classList.add('hidden'); menuCtx = null; }
$('#listMenu').addEventListener('click', e=>{
  const it = e.target.closest('.menu-item'); if(!it) return;
  const id = it.dataset.id;
  const ctx = menuCtx;
  if(ctx==='detail'){ const t = TASKS.find(x=>x.id===state.selected); if(t) t.listId = id; }
  else state.quickList = id;
  closeListMenu(); render();
  if(ctx==='quick') $('#quickInput').focus();
});
$('#quickDateBtn').addEventListener('click', e=>{
  e.stopPropagation();
  openPicker('quick', $('#quickDateBtn'));
});
export { renderQuickBar, openListMenu, closeListMenu };
export function listMenuOpen(){ return menuCtx !== null; }
