
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const WD = ['日','一','二','三','四','五','六'];
const DAY = 86400000;
const startOfToday = ()=>{ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); };
/* TODAY 必须可变:应用跨天不重启,「今天/逾期」判定要在 0 点后自动刷新。
   ESM live binding——读方 import 到的永远是最新值;刷新由本模块尾部的定时器/聚焦钩子驱动,
   变化时广播 daychange 事件(main.js 收到后 render)。 */
export let TODAY = startOfToday();
export function refreshToday(){
  const t = startOfToday();
  if(t !== TODAY){ TODAY = t; return true; }
  return false;
}
const mkday = n => TODAY + n*DAY;
/* 属性注入防护:双/单引号必须转义——esc 的结果大量进入双引号属性
   (title/value/data-note),而任务标题、笔记文件名都是半受信外部输入 */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function hexRgba(hex,a){
  if(hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1),16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
const _now = new Date();
function fmtTs(ts, time, today=TODAY){
  const d = new Date(ts);
  const diff = Math.round((ts - today)/DAY);
  const t = time ? ' ' + time : '';
  if(ts < today)  return (diff===-1 ? '昨天' : `${d.getMonth()+1}月${d.getDate()}日`) + t;
  if(ts === today) return '今天' + t;
  if(diff===1) return '明天' + t;
  if(diff===2) return '后天' + t;
  if(diff<7)   return '周' + WD[d.getDay()] + t;
  return `${d.getMonth()+1}月${d.getDate()}日` + t;
}
function kindOf(t){
  if(!t.due) return 'none';
  if(t.due.ts < TODAY) return 'overdue';
  if(t.due.ts === TODAY) return 'today';
  return 'future';
}
function dueLabel(t){ return t.due ? fmtTs(t.due.ts, t.due.time) : ''; }
function bodyDark(){ return typeof document!=='undefined' && document.body.classList.contains('dark'); }
export { $, $$, WD, DAY, mkday, _now, esc, hexRgba, fmtTs, kindOf, dueLabel, bodyDark };
// TODAY/refreshToday 已用 export let/function 单独导出(live binding),勿在上方重复列出

/* 跨天检测:定时 + 重新可见/聚焦时各查一次,只在真跨天后广播(浏览器/node 下跳过) */
if(typeof window!=='undefined' && typeof document!=='undefined'){
  setInterval(()=>{ if(refreshToday()) window.dispatchEvent(new Event('daychange')); }, 60e3);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && refreshToday()) window.dispatchEvent(new Event('daychange')); });
  window.addEventListener('focus', ()=>{ if(refreshToday()) window.dispatchEvent(new Event('daychange')); });
}
