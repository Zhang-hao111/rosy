import { $, DAY, TODAY, WD, esc, hexRgba } from './utils.js';
import { state, listColorOf } from './store.js';
import { allTasks, matchSearch } from './data.js';
import { rowHTML, activeDoneSplits } from './rows.js';
/* ================= 日历视图 ================= */
function calChipHTML(t){
  const col = listColorOf(t);
  return `<div class="cchip ${t.done?'done':''}" draggable="true" data-id="${t.id}" style="background:${hexRgba(col,.16)};color:${col}" title="${esc(t.title)}">` +
    `${t.due.time? `<span class="t">${t.due.time}</span>`:''}${esc(t.title)}</div>`;
}
function calNavHTML(){
  return `
      <button class="cal-btn" id="calPrev"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 2.5L4 6l3.5 3.5"/></svg></button>
      <button class="cal-btn" id="calNext"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2.5L8 6l-3.5 3.5"/></svg></button>
      <button class="cal-today-btn" id="calToday">今天</button>
      <span class="cal-spacer"></span>
      <span class="cal-seg" title="切换周历 / 月历">
        <button id="calModeW" class="${state.calMode==='week'?'on':''}">周</button>
        <button id="calModeM" class="${state.calMode!=='week'?'on':''}">月</button>
      </span>`;
}
function syncCalYM(){ const d=new Date(state.calSel); state.calY=d.getFullYear(); state.calM=d.getMonth(); }

function renderCalendar(monthChanged, dayChanged){
  $('#viewTitle').textContent = '日历';
  $('#ringBox').style.display = 'none';
  let html = '';

  if(state.calMode==='week'){
    /* ---- 周历：calSel 所在周的周一为起点 ---- */
    const mon = state.calSel - ((new Date(state.calSel).getDay()+6)%7)*DAY;
    const days = Array.from({length:7},(_,i)=> new Date(mon + i*DAY));
    const wkA = days[0], wkB = days[6];
    const wkAll = allTasks().filter(t=> t.due && t.due.ts>=mon && t.due.ts<mon+7*DAY && matchSearch(t));
    $('#viewSub').textContent = `${wkAll.length} 项安排`;
    html = `<div class="cal-wrap"><div class="cal-head">
        <span class="cal-title">${wkA.getMonth()+1}月${wkA.getDate()}日 – ${wkB.getMonth()+1}月${wkB.getDate()}日</span>${calNavHTML()}
      </div>
      <div class="cal-grid week ${monthChanged?'stagger':''}">`;
    days.forEach((dObj,i)=>{
      const ts = dObj.getTime(), isToday = ts===TODAY, isSel = ts===state.calSel;
      const chips = allTasks().filter(t=> t.due && t.due.ts===ts && matchSearch(t))
        .sort((x,y)=> (x.due.time||'99').localeCompare(y.due.time||'99') || (x.done?1:0)-(y.done?1:0));
      html += `<div class="cell ${isToday?'todaycell':''} ${isSel?'sel':''}" data-ts="${ts}" style="--i:${i}">` +
        `<div class="wk-head"><span class="dnum">${dObj.getDate()}</span><span class="wk-wd">周${WD[dObj.getDay()]}</span></div>` +
        chips.map(calChipHTML).join('') +
        `</div>`;
    });
    html += `</div></div>`;
  } else {
    /* ---- 月历 ---- */
    const monthTasks = allTasks().filter(t=> t.due && new Date(t.due.ts).getFullYear()===state.calY && new Date(t.due.ts).getMonth()===state.calM);
    $('#viewSub').textContent = `${monthTasks.length} 项安排`;
    const first = new Date(state.calY, state.calM, 1);
    const offset = (first.getDay()+6)%7;                 // 周一开头
    const dim = new Date(state.calY, state.calM+1, 0).getDate();
    const rows = Math.ceil((offset+dim)/7);              // 只渲染需要的周数行，日历更紧凑
    html = `<div class="cal-wrap"><div class="cal-head">
        <span class="cal-title">${state.calY}年${state.calM+1}月</span>${calNavHTML()}
      </div>
      <div class="cal-grid ${monthChanged?'stagger':''}">`;
    for(const w of ['一','二','三','四','五','六','日']) html += `<div class="cal-wd">${w}</div>`;
    for(let i=0;i<rows*7;i++){
      const dayNum = i - offset + 1;
      const dObj = new Date(state.calY, state.calM, dayNum);
      const ts = dObj.getTime();
      const other = dayNum<1 || dayNum>dim;
      const isToday = ts===TODAY, isSel = ts===state.calSel;
      const dayTs = ts;
      let chips = allTasks().filter(t=> t.due && t.due.ts===dayTs && matchSearch(t))
        .sort((x,y)=> (x.due.time||'99').localeCompare(y.due.time||'99') || (x.done?1:0)-(y.done?1:0));
      const shown = chips.slice(0,2), extra = chips.length - shown.length;
      html += `<div class="cell ${other?'other':''} ${isToday?'todaycell':''} ${isSel?'sel':''}" data-ts="${ts}" style="--i:${i}">` +
        `<span class="dnum">${dObj.getDate()}</span>` +
        shown.map(calChipHTML).join('') +
        (extra>0? `<div class="more-chip">还有 ${extra} 项…</div>`:'') +
        `</div>`;
    }
    html += `</div>`;

    const sel = new Date(state.calSel);
    const dayAll = allTasks().filter(t=> t.due && t.due.ts===state.calSel && matchSearch(t));
    const {active, done} = activeDoneSplits(dayAll);
    html += `<div class="daypane ${dayChanged?'anim2':''}">
        <div class="daypane-title">${sel.getMonth()+1}月${sel.getDate()}日 星期${WD[sel.getDay()]} · ${active.length+done.length} 项</div>`;
    html += active.length? active.map(rowHTML).join('') : `<div class="empty" style="padding:26px 0">这一天没有安排 🎉</div>`;
    if(done.length) html += done.map(rowHTML).join('');
    html += `</div></div>`;
  }
  $('#taskScroll').innerHTML = html;
}
export { renderCalendar, syncCalYM };
