import { esc, kindOf, dueLabel } from './utils.js';
import { state, listColorOf } from './store.js';
/* ================= 任务行 ================= */
function hiTitle(s){
  const q = state.search; if(!q) return esc(s);
  const i = s.toLowerCase().indexOf(q); if(i<0) return esc(s);
  return esc(s.slice(0,i)) + '<mark>' + esc(s.slice(i,i+q.length)) + '</mark>' + esc(s.slice(i+q.length));
}
function rowHTML(t){
  const k = kindOf(t), dl = dueLabel(t);
  const doneSub = t.subtasks.filter(s=>s.done).length;
  const meta = [];
  if(dl) meta.push(`<span class="due ${k==='today'?'today':k==='overdue'?'overdue':t.done?'dim':''}">${dl}</span>`);
  if(t.subtasks.length) meta.push(`<span class="sub-count">${doneSub}/${t.subtasks.length}</span>`);
  if(t.src==='obsidian') meta.push(`<span class="sub-count" title="来自 Obsidian 笔记：${esc(t.srcNote||'')}">📝</span>`);
  return `<div class="row ${t.done?'done':''} ${state.selected===t.id?'selected':''}" data-id="${t.id}" draggable="true">
    <span class="lstrip" style="background:${listColorOf(t)}"></span>
    <button class="check ${t.done?'on':''}" data-id="${t.id}"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2l2.6 2.6L10 3.2"/></svg></button>
    <div class="row-main">
      <div class="row-title"><span class="txt">${hiTitle(t.title)}</span></div>
      ${t.notes && !t.subtasks.length ? `<div class="row-sub">${esc(t.notes)}</div>` : ''}
    </div>
    <div class="row-meta">${meta.join('')}
      <span class="row-acts">
        <button class="icon-btn act-date" data-id="${t.id}" title="修改日期"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.2" width="11" height="10.3" rx="2"/><path d="M2.5 6.4h11M5.2 1.8v2.4M10.8 1.8v2.4"/></svg></button>
        <button class="icon-btn danger act-del" data-id="${t.id}" title="删除任务"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6.5 4V2.8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M4 4l.7 9a1.3 1.3 0 0 0 1.3 1.2h4a1.3 1.3 0 0 0 1.3-1.2L12 4"/></svg></button>
      </span>
    </div>
  </div>`;
}

function activeDoneSplits(all){
  // 主排序=截止时间（自然形成 逾期→今天→将来→无日期 的顺序），同日按时间字段，创建顺序兜底
  const active = all.filter(t=>!t.done).sort((a,b)=>(a.due?.ts||Infinity)-(b.due?.ts||Infinity) || (a.due?.time||'99').localeCompare(b.due?.time||'99') || a.created-b.created);
  const done   = all.filter(t=> t.done).sort((a,b)=>b.doneAt-a.doneAt);
  return {active, done};
}
export { rowHTML, activeDoneSplits };
