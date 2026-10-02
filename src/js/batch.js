import { $, $$, TODAY, DAY, fmtTs } from './utils.js';
import { TASKS, state, LISTS, T, setTasks } from './store.js';
import { render } from './render.js';
import { showToast } from './toast.js';
/* ================= 批量生成每周固定任务 ================= */
const wdSet = new Set([1,3,5]);   // 默认周一/三/五
let repList = null;   // null = 跟随当前上下文
function repDefList(){
  return (state.view==='today'||state.view==='calendar') ? state.quickList
       : (LISTS.some(l=>l.id===state.view) ? state.view : 'study');
}
function repEffList(){ return repList || repDefList(); }
function repDates(){
  const wds = [...wdSet];
  if(!wds.length) return [];
  const n = Math.max(1, Math.min(26, parseInt($('#repWeeks').value)||4));
  const out = [];
  for(let i=0;i<n*7;i++){
    const ts = TODAY + i*DAY;
    const wd = (new Date(ts).getDay()+6)%7 + 1;   // 周一=1 … 周日=7
    if(wds.includes(wd)) out.push(ts);
  }
  return out;
}
function renderRepPreview(){
  const title = $('#repTitle').value.trim();
  const dates = repDates();
  const time = $('#repTime').value || null;
  $$('#repSeg button').forEach(b=>b.classList.toggle('on', b.dataset.l===repEffList()));
  const el = $('#repPreview');
  if(!title) el.textContent = '先填写任务名称';
  else if(!dates.length) el.textContent = '请至少选择一个星期';
  else el.innerHTML = `将生成 <b>${dates.length}</b> 个任务 · ` + dates.slice(0,4).map(ts=>fmtTs(ts,time)).join('、') + (dates.length>4?' …':'');
  $('#repCount').textContent = `${dates.length} 个任务`;
  $('#repAdd').disabled = !(title && dates.length);
}
function batchOpen(){
  $('#batchModal').classList.remove('hidden');
  renderRepPreview();
  setTimeout(()=>$('#repTitle').focus(), 60);
}
function batchCloseFn(){ $('#batchModal').classList.add('hidden'); }
$('#batchBtn').addEventListener('click', batchOpen);
$('#batchClose').addEventListener('click', batchCloseFn);
$('#batchCancel').addEventListener('click', batchCloseFn);
$('#batchModal').addEventListener('click', e=>{ if(e.target.id==='batchModal') batchCloseFn(); });
$('#repTitle').addEventListener('input', renderRepPreview);
$('#repTime').addEventListener('input', renderRepPreview);
$('#repWeeks').addEventListener('input', renderRepPreview);
$('#wdChips').addEventListener('click', e=>{
  const chip = e.target.closest('.wd-chip'); if(!chip) return;
  const wd = +chip.dataset.wd;
  if(wdSet.has(wd)) wdSet.delete(wd); else wdSet.add(wd);
  chip.classList.toggle('on', wdSet.has(wd));
  renderRepPreview();
});
$('#repSeg').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  repList = b.dataset.l; renderRepPreview();
});
$('#repAdd').addEventListener('click', ()=>{
  const title = $('#repTitle').value.trim();
  const dates = repDates();
  if(!title || !dates.length) return;
  const time = $('#repTime').value || null;
  const listId = repEffList();
  const created = dates.map(ts=>T({title, listId, due:{ts, time}}));
  setTasks(created.concat(TASKS));
  batchCloseFn();
  render();
  showToast(`已生成 ${created.length} 个「${title}」`, ()=>{
    setTasks(TASKS.filter(t=>!created.includes(t)));
    render();
  });
});

export { batchCloseFn };
