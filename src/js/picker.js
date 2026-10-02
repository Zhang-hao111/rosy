import { $, TODAY, DAY } from './utils.js';
import { TASKS, state } from './store.js';
import { render } from './render.js';
/* ================= 日期选择浮层 ================= */
function buildPicker(){
  const y = state.pickY, m = state.pickM;
  $('#pkTitle').textContent = `${y}年${m+1}月`;
  const first = new Date(y,m,1), offset = (first.getDay()+6)%7, dim = new Date(y,m+1,0).getDate();
  const targetTs = pickerTargetTs();
  let html = '';
  for(const w of ['一','二','三','四','五','六','日']) html += `<div class="pk-wd">${w}</div>`;
  for(let i=0;i<42;i++){
    const dayNum = i-offset+1;
    const dObj = new Date(y,m,dayNum), ts = dObj.getTime();
    const other = dayNum<1||dayNum>dim;
    const hasTask = TASKS.some(t=> t.due && t.due.ts===ts);
    html += `<button class="pk-d ${other?'other':''} ${ts===TODAY?'pktoday':''} ${targetTs===ts?'pksel':''}" data-ts="${ts}" ${other?'disabled':''}>${dObj.getDate()}${hasTask? '<span class="pdot"></span>':''}</button>`;
  }
  $('#pkGrid').innerHTML = html;
}
function pickerTargetTask(){
  if(state.pickCtx==='task') return TASKS.find(x=>x.id===state.pickTaskId) || null;
  return null;
}
function pickerTargetTs(){
  if(state.pickCtx==='task'){
    const t = pickerTargetTask();
    return t && t.due ? t.due.ts : null;
  }
  return state.view==='calendar' ? state.calSel : state.quickDate;
}
function openPicker(ctx, anchor, taskId){
  closePicker();
  state.pickCtx = ctx; state.pickTaskId = taskId||null;
  const cur = pickerTargetTs();
  const base = cur!=null ? new Date(cur) : new Date();
  state.pickY = base.getFullYear(); state.pickM = base.getMonth();
  const t = pickerTargetTask();
  $('#pkTime').value = (t ? (t.due? t.due.time : '') : state.quickTime) || '';
  buildPicker();
  const pk = $('#picker');
  pk.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const pw = 252, ph = pk.offsetHeight;
  let x = Math.min(r.left, window.innerWidth - pw - 16);
  let y = r.bottom + 8;
  const openedUp = y + ph > window.innerHeight - 12;
  if(openedUp) y = r.top - ph - 8;
  pk.style.left = x+'px'; pk.style.top = Math.max(12,y)+'px';
  pk.style.transformOrigin = `${r.left < window.innerWidth/2 ? 'left' : 'right'} ${openedUp ? 'bottom' : 'top'}`;
}
function closePicker(){ $('#picker').classList.add('hidden'); state.pickCtx=null; }
function applyPick(ts){
  const time = $('#pkTime').value || null;
  const t = pickerTargetTask();
  if(t){ t.due = {ts, time}; }
  else {
    state.quickDate = ts; state.quickTime = time||'';
    if(state.view==='calendar'){ state.calSel = ts; state.calY = new Date(ts).getFullYear(); state.calM = new Date(ts).getMonth(); }
  }
  closePicker(); render();
}
/* 浮层内部 */
$('#pkGrid').addEventListener('click', e=>{
  const d = e.target.closest('.pk-d'); if(!d || d.disabled) return;
  applyPick(+d.dataset.ts);
});
$('#pkPrev').addEventListener('click', ()=>{ if(--state.pickM<0){state.pickM=11;state.pickY--;} buildPicker(); });
$('#pkNext').addEventListener('click', ()=>{ if(++state.pickM>11){state.pickM=0;state.pickY++;} buildPicker(); });
$('#pkTime').addEventListener('change', ()=>{
  if(state.pickCtx==='quick') state.quickTime = $('#pkTime').value;
});
$('#pkClear').addEventListener('click', ()=>{
  const t = pickerTargetTask();
  if(t) t.due = null;
  else { state.quickDate=null; state.quickTime=''; }
  closePicker(); render();
});
$('#pkQuick').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  const n = b.dataset.n;
  let ts;
  if(n==='wk'){ const d=new Date(); const diff=(6-d.getDay()+7)%7||7; ts=TODAY+diff*DAY; }
  else if(n==='nw'){ const d=new Date(); const diff=(8-d.getDay())%7||7; ts=TODAY+diff*DAY; }
  else ts = TODAY + (+n)*DAY;
  applyPick(ts);
});
export { openPicker, closePicker };
