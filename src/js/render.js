import { $, esc, dueLabel, kindOf } from './utils.js';
import { TASKS, state, obsState, LISTS, OBS_COLOR } from './store.js';
import { scheduleSave } from './data.js';
import { renderSidebar, renderMiniCal, renderProg, renderUpcoming } from './sidebar.js';
import { renderList } from './views-list.js';
import { renderCalendar } from './views-calendar.js';
import { renderObsidianView } from './obsidian.js';
import { renderQuickBar } from './quickadd.js';
/* ================= 详情面板 ================= */
function renderDetail(){
  const pane = $('#detailPane'), inner = $('#detailInner'), div = $('#detailDivider');
  const t = TASKS.find(x=>x.id===state.selected);
  if(!t){
    pane.classList.remove('open'); pane.style.width=''; div.style.display='none';
    inner.innerHTML=''; return;
  }
  pane.classList.add('open');
  pane.style.width = (state.detailW||300)+'px';
  div.style.display = '';
  const list = LISTS.find(l=>l.id===t.listId);
  const dl = dueLabel(t), k = kindOf(t);
  const doneSub = t.subtasks.filter(s=>s.done).length;
  inner.innerHTML = `
    <div class="d-top">
      <button class="icon-btn" id="dClose" title="关闭"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg></button>
    </div>
    <div class="d-body">
      <input class="d-title" id="dTitle" value="${esc(t.title)}" spellcheck="false">
      <div class="d-chips">
        ${t.src==='obsidian'
          ? `<div class="d-chip" style="cursor:default"><span class="dot" style="background:${OBS_COLOR}"></span>Obsidian · ${esc(t.srcNote||'')}</div>`
          : `<button class="d-chip" id="dList" title="选择清单"><span class="dot" style="background:${list.color}"></span>${list.name}</button>`}
        <button class="d-chip ${t.due && k==='overdue' ? 'due-red':''}" id="dDate" title="选择日期和时间">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.2" width="11" height="10.3" rx="2"/><path d="M2.5 6.4h11M5.2 1.8v2.4M10.8 1.8v2.4"/></svg>
          ${t.due? dl : '设置日期'}
        </button>
      </div>
      <div class="d-label">备注</div>
      <div class="d-notes" id="dNotes" contenteditable="true" spellcheck="false">${esc(t.notes)}</div>
      <div class="d-label">子任务 ${t.subtasks.length? `· ${doneSub}/${t.subtasks.length}`:''}</div>
      <div id="dSubs">${t.subtasks.map((s,i)=>`
        <div class="sub-row ${s.done?'done':''}">
          <button class="sub-check ${s.done?'on':''}" data-i="${i}"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.6 2.6L10 3.2"/></svg></button>
          <span class="sub-title">${esc(s.title)}</span>
        </div>`).join('')}</div>
      <div class="sub-add"><span class="pl">＋</span><input id="dSubAdd" placeholder="添加子任务，回车确认"></div>
    </div>
    <div class="d-footer">
      <button class="icon-btn danger" id="dDelete" title="删除任务"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6.5 4V2.8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M4 4l.7 9a1.3 1.3 0 0 0 1.3 1.2h4a1.3 1.3 0 0 0 1.3-1.2L12 4"/></svg></button>
      <span class="d-created">创建于 ${new Date(t.created).getMonth()+1}月${new Date(t.created).getDate()}日</span>
    </div>`;
}

let _prevView=null, _prevCalKey=null, _prevSel=null, _prevDetailSel=null;
function retrigger(el, cls){ if(!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function animateRow(id, cls){
  const el = document.querySelector(`.row[data-id="${id}"]`);
  if(el){ el.classList.add(cls); return; }
  const c = document.querySelector(`.cchip[data-id="${id}"]`);
  if(c) c.classList.add('chipflash');
}
function render(){
  renderSidebar(); renderMiniCal(); renderProg(); renderUpcoming();
  $('#obsReimportBtn').style.display = (state.view==='obsidian' && obsState.connected) ? 'inline-flex' : 'none';
  const viewChanged = _prevView !== state.view;
  const calKey = state.calY + '-' + state.calM;
  const monthChanged = state.view==='calendar' && calKey !== _prevCalKey;
  const dayChanged   = state.view==='calendar' && state.calSel !== _prevSel;
  if(state.view==='calendar') renderCalendar(monthChanged, dayChanged);
  else if(state.view==='obsidian') renderObsidianView();
  else renderList();
  renderDetail(); renderQuickBar();
  if(viewChanged){
    retrigger($('#taskScroll'),'anim');
    retrigger($('#viewTitle'),'anim');
    retrigger($('#viewSub'),'anim');
  }
  if(state.selected!==_prevDetailSel && state.selected!=null && $('#detailPane').classList.contains('open'))
    retrigger($('#detailInner'),'swap');
  if(state.view==='calendar'){ _prevCalKey=calKey; _prevSel=state.calSel; }
  else { _prevCalKey=null; _prevSel=null; }   // 离开日历后再次进入时重新播放入场动画
  _prevView=state.view; _prevDetailSel=state.selected;
  scheduleSave();
}
export { render, renderDetail, animateRow, retrigger };
