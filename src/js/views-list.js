import { $, WD, kindOf } from './utils.js';
import { state } from './store.js';
import { viewTasks } from './data.js';
import { rowHTML, activeDoneSplits } from './rows.js';
import { viewDef } from './views.js';
/* ================= 列表视图（今天 / 学习 / 生活） ================= */
function renderList(){
  const all = viewTasks();
  const {active, done} = activeDoneSplits(all);
  const def = viewDef(state.view);
  const title = def ? def.title : '';
  const d = new Date();
  let sub;
  if(state.view==='today') sub = `${d.getMonth()+1}月${d.getDate()}日 星期${WD[d.getDay()]} · 已完成 ${done.length} / ${active.length+done.length}`;
  else sub = `${active.length} 个待办${done.length?` · 已完成 ${done.length}`:''}`;
  $('#viewTitle').textContent = title;
  $('#viewSub').textContent = sub;

  const total = active.length + done.length, pct = total? done.length/total : 0, C = 2*Math.PI*11.5;
  $('#ringBox').style.display = '';
  $('#ringBar').style.strokeDashoffset = C*(1-pct);
  $('#ringLabel').textContent = total? Math.round(pct*100)+'%' : '';

  let html = '';
  if(!total){
    html = `<div class="empty"><div class="big">🌿</div>这里空空如也，去添加一个任务吧</div>`;
  } else {
    if(state.view==='today'){
      const od = active.filter(t=>kindOf(t)==='overdue');
      const td = active.filter(t=>kindOf(t)!=='overdue');
      if(od.length) html += `<div class="group-head overdue">已逾期<span class="gcnt">${od.length}</span></div>` + od.map(rowHTML).join('');
      if(td.length) html += `<div class="group-head">今天<span class="gcnt">${td.length}</span></div>` + td.map(rowHTML).join('');
    } else {
      if(active.length) html += `<div class="group-head">待办<span class="gcnt">${active.length}</span></div>` + active.map(rowHTML).join('');
    }
    if(done.length){
      html += `<div class="group-head clickable ${state.completedOpen?'':'collapsed'}" id="doneHead">
        <svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5L8 6l-4 3.5"/></svg>
        已完成<span class="gcnt">${done.length}</span><button class="done-clear" id="doneClear">全部删除</button></div>`;
      html += `<div class="done-wrap ${state.completedOpen?'open':''}" id="doneWrap"><div class="done-clip">` + done.map(rowHTML).join('') + `</div></div>`;
    }
  }
  $('#taskScroll').innerHTML = html;
}
export { renderList };
