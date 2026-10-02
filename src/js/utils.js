
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const WD = ['日','一','二','三','四','五','六'];
const DAY = 86400000;
const TODAY = (()=>{ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); })();
const mkday = n => TODAY + n*DAY;
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function hexRgba(hex,a){
  if(hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1),16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
const _now = new Date();
function fmtTs(ts, time){
  const d = new Date(ts);
  const diff = Math.round((ts - TODAY)/DAY);
  const t = time ? ' ' + time : '';
  if(ts < TODAY)  return (diff===-1 ? '昨天' : `${d.getMonth()+1}月${d.getDate()}日`) + t;
  if(ts === TODAY) return '今天' + t;
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
function bodyDark(){ return document.body.classList.contains('dark'); }
export { $, $$, WD, DAY, TODAY, mkday, _now, esc, hexRgba, fmtTs, kindOf, dueLabel, bodyDark };
