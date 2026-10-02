import { $, esc, dueLabel, kindOf } from './utils.js';
import { TASKS, state, obsState, LISTS, OBS_COLOR } from './store.js';
import { renderSidebar, renderMiniCal, renderProg, renderUpcoming } from './sidebar.js';
import { renderList } from './views-list.js';
import { renderCalendar } from './views-calendar.js';
import { renderObsidianView } from './views-obsidian.js';
import { renderQuickBar } from './quickadd.js';
import { viewDef } from './views.js';
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
      ${t.src==='obsidian'
        ? `<div class="d-label">备注</div>
      <div class="d-notes d-readonly" id="dNotes">${esc(t.notes)}</div>
      <div class="d-hint">Obsidian 任务不支持备注/子任务，请在笔记中维护</div>`
        : `<div class="d-label">备注</div>
      <div class="d-notes" id="dNotes" contenteditable="true" spellcheck="false">${esc(t.notes)}</div>
      <div class="d-label">子任务 ${t.subtasks.length? `· ${doneSub}/${t.subtasks.length}`:''}</div>
      <div id="dSubs">${t.subtasks.map((s,i)=>`
        <div class="sub-row ${s.done?'done':''}">
          <button class="sub-check ${s.done?'on':''}" data-i="${i}"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.6 2.6L10 3.2"/></svg></button>
          <span class="sub-title">${esc(s.title)}</span>
        </div>`).join('')}</div>
      <div class="sub-add"><span class="pl">＋</span><input id="dSubAdd" placeholder="添加子任务，回车确认"></div>`}
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
/* 渲染是纯视图函数:不触发落盘。保存由真实数据变更点各自 scheduleSave()
   (勾选/删除/新建/日期/清单/主题/来源同步…),搜索输入、翻页等纯浏览动作不再写盘 */
/* 渲染器注册:kind → 渲染函数。全新渲染类型在此加一行;smart/list 类新视图零改动。 */
const RENDERERS = { smart:renderList, list:renderList, calendar:renderCalendar, obsidian:renderObsidianView };
function render(){
  renderSidebar(); renderMiniCal(); renderProg(); renderUpcoming();
  const def = viewDef(state.view);
  $('#obsReimportBtn').style.display = (def && def.reimportBtn && obsState.connected) ? 'inline-flex' : 'none';
  const viewChanged = _prevView !== state.view;
  const calKey = state.calY + '-' + state.calM;
  const monthChanged = def && def.kind==='calendar' && calKey !== _prevCalKey;
  const dayChanged   = def && def.kind==='calendar' && state.calSel !== _prevSel;
  const renderer = RENDERERS[def ? def.kind : 'list'] || renderList;
  renderer({viewChanged, monthChanged, dayChanged});
  renderDetail(); renderQuickBar();
  if(viewChanged){
    retrigger($('#taskScroll'),'anim');
    retrigger($('#viewTitle'),'anim');
    retrigger($('#viewSub'),'anim');
  }
  if(state.selected!==_prevDetailSel && state.selected!=null && $('#detailPane').classList.contains('open'))
    retrigger($('#detailInner'),'swap');
  if(def && def.kind==='calendar'){ _prevCalKey=calKey; _prevSel=state.calSel; }
  else { _prevCalKey=null; _prevSel=null; }   // 离开日历后再次进入时重新播放入场动画
  _prevView=state.view; _prevDetailSel=state.selected;
}
export { render, renderDetail, animateRow, retrigger };
