import { $, $$, TODAY, esc, dueLabel, _now } from './utils.js';
import { state, TASKS, LISTS, obsExpanded, listColorOf } from './store.js';
import { allTasks, countFor, saveObsPrefs } from './data.js';
import { render } from './render.js';
import { closeListMenu } from './quickadd.js';
import { closePicker } from './picker.js';
import { VIEWS, navHTML } from './views.js';

/* 导航项由 views.js 注册表生成(替代原 index.html 静态标记) */
$('#smartNav').innerHTML = navHTML();

/* ================= 侧栏 ================= */
function renderSidebar(){
  for(const d of VIEWS){
    if(!d.badge) continue;
    const el = $(`#smartNav .cnt[data-count="${d.id}"]`);
    if(!el) continue;
    const n = countFor(d.id);
    el.textContent = n || '';
    if(d.accent) el.closest('.nav-item').classList.toggle('accent-count', !!n);
  }
  $$('#smartNav .nav-item').forEach(el=>el.classList.toggle('active', el.dataset.view===state.view));
}

/* ================= 侧栏：迷你月历 / 清单进度 / 即将到来 ================= */
let miniY = _now.getFullYear(), miniM = _now.getMonth();
function renderMiniCal(){
  const first = new Date(miniY, miniM, 1), offset = (first.getDay()+6)%7, dim = new Date(miniY,miniM+1,0).getDate();
  const selKey = state.view==='calendar' ? state.calSel : null;
  let html = `<div class="mc-head"><span class="mc-title">${miniY}年${miniM+1}月</span>
    <span class="mc-nav">
      <button class="mc-btn" id="mcPrev"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 2.5L4 6l3.5 3.5"/></svg></button>
      <button class="mc-btn" id="mcNext"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2.5L8 6l-3.5 3.5"/></svg></button>
    </span></div><div class="mc-grid">`;
  for(const w of ['一','二','三','四','五','六','日']) html += `<div class="mc-wd">${w}</div>`;
  for(let i=0;i<42;i++){
    const dayNum = i - offset + 1;
    if(dayNum<1 || dayNum>dim){ html += '<div></div>'; continue; }
    const dObj = new Date(miniY,miniM,dayNum), ts = dObj.getTime();
    const hasTask = allTasks().some(t=>t.due && t.due.ts===ts && !t.done);
    const isToday = ts===TODAY, isSel = ts===selKey;
    html += `<button class="mc-d ${isToday?'mctoday':''} ${isSel?'mcsel':''}" data-ts="${ts}">${dayNum}${hasTask?'<span class="mdot"></span>':''}</button>`;
  }
  $('#miniCal').innerHTML = html + '</div>';
}
function renderProg(){
  $('#progList').innerHTML = LISTS.map(l=>{
    const all = TASKS.filter(t=>t.listId===l.id);
    const done = all.filter(t=>t.done).length, total = all.length;
    const pct = total ? Math.round(done/total*100) : 0;
    return `<div class="prog-item ${state.view===l.id?'active':''}" data-view="${l.id}" title="打开「${l.name}」">
      <div class="prog-top"><span class="dot" style="background:${l.color}"></span>${l.name}<span class="pcnt">${done}/${total}</span></div>
      <div class="prog-bar"><i style="width:${pct}%;background:${l.color}"></i></div>
    </div>`;
  }).join('');
}
function renderUpcoming(){
  const ups = allTasks().filter(t=>!t.done && t.due && t.due.ts>TODAY).sort((a,b)=>a.due.ts-b.due.ts).slice(0,3);
  const el = $('#upList');
  if(!ups.length){ el.innerHTML = '<div class="up-empty">暂无近期安排 🎉</div>'; return; }
  el.innerHTML = ups.map(t=>{
    return `<div class="up-item" data-id="${t.id}" title="查看详情">
      <span class="dot" style="background:${listColorOf(t)}"></span>
      <span class="ut">${esc(t.title)}</span>
      <span class="ud">${dueLabel(t)}</span></div>`;
  }).join('');
}
$('#miniCal').addEventListener('click', e=>{
  const nav = e.target.closest('.mc-btn');
  if(nav){
    if(nav.id==='mcPrev'){ if(--miniM<0){miniM=11;miniY--;} } 
    else { if(++miniM>11){miniM=0;miniY++;} }
    renderMiniCal(); return;
  }
  const d = e.target.closest('.mc-d'); if(!d) return;
  const ts = +d.dataset.ts;
  state.view='calendar'; state.calSel=ts;
  state.calY=new Date(ts).getFullYear(); state.calM=new Date(ts).getMonth();
  state.selected=null; render();
});
$('#progList').addEventListener('click', e=>{
  const item = e.target.closest('.prog-item'); if(!item) return;
  state.view = item.dataset.view; state.selected = null; closeListMenu(); closePicker(); render();
});
$('#upList').addEventListener('click', e=>{
  const item = e.target.closest('.up-item'); if(!item) return;
  const t = TASKS.find(x=>x.id===+item.dataset.id); if(!t) return;
  state.selected = t.id;
  if(t.src==='obsidian'){
    // 跳到 Obsidian 视图，自动展开所属笔记分组
    state.view = 'obsidian';
    obsExpanded[t.srcNote] = true; saveObsPrefs();
    closeListMenu(); closePicker(); render();
    const sel = $('#taskScroll .row.selected');
    if(sel) sel.scrollIntoView({block:'nearest'});
    return;
  }
  if(t.listId) state.view = t.listId;
  render();
});
export { renderSidebar, renderMiniCal, renderProg, renderUpcoming };
