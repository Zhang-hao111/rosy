// Obsidian 任务语法的唯一读写收口(纯函数,可测试):
// 解析 .md 行 → 任务对象;勾选翻转一行;外部任务稳定 id;id 台账解析/剪枝。
// 行解析与翻转同文件——改 Markdown 任务语法两边同步,不再分居两模块。
import { T } from './store.js';

/* 32-bit FNV-1a:无依赖、分布均匀,做内容寻址 id 足够 */
export function fnv1a(str){
  let h = 0x811c9dc5;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/* 外部任务 id = 1e9 + 内容哈希:重导入(全量重建)后同一行任务 id 保持稳定。
   dupIdx:同文件内相同行文本重复出现时的序号,防同 id 撞车(重复行不入台账,身份本就无法区分)。
   手动任务 id 走 uid(<1e9,hydrate 恢复时只统计 <1e9),两段空间隔离。 */
export function makeTaskId(srcPath, srcLine, dupIdx=0){
  return 1e9 + fnv1a(`${srcPath ?? ''}\n${srcLine ?? ''}::${dupIdx}`) % 9e8;
}

/* ---- 日期标记:读(解析)写(回写)共用同一份正则 ----
   「紧邻时间」属于标记的一部分:📅 2026-10-05 09:00 整体识别、整体剥离。
   远离标记的普通时间文本(如「14:00 开会」)是标题内容,不识别为 due.time——
   否则回写时间会与解析乒乓(写回 09:00 → 再解析时残进标题 → 再写回…)。 */
const TIME = '(?:[01]?\\d|2[0-3]):[0-5]\\d';
const DATE = '\\d{4}-\\d{2}-\\d{2}';
const DATE_MARKER = new RegExp(`(?:📅|🗓|@due\\(\\s*|\\[due::[ \\t]*)\\s*(${DATE})(?:[ \\t]+(${TIME}))?`);
/* 全部标记变体(含 ✅ 完成日期);@due(...) 宽松匹配括号内任意内容,剥离时不错留残片 */
const MARKER_SCAN = new RegExp(
  `(?:📅|🗓)\\s*${DATE}(?:\\s+${TIME})?` +
  `|@due\\([^)]*\\)` +
  `|\\[due::[ \\t]*${DATE}(?:[ \\t]+${TIME})?[ \\t]*\\]` +
  `|✅\\s*${DATE}`, 'g');
export function stripDateMarkers(s){
  return String(s).replace(MARKER_SCAN, '').replace(/\s{2,}/g, ' ').trim();
}
const isoOf = ts => { const d = new Date(ts); const p = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };

/* ledger(身份台账)可选传入:首次出现的行查账保身份(miss 派生并入账),
   同文件重复行文本(本文件内第 2+ 次出现)不入账——同文本行本就无法区分身份,
   其 id 用 dupIdx 派生、确定且稳定,但改文件结构(重复变单份)后会回到台账 id。 */
export function parseObsidianMarkdown(name, text, path=null, vaultName=null, vaultPath=null, ledger=null){
  const out = [];
  const dup = new Map();   // (path,rawLine) → 已出现次数
  String(text).split(/\r?\n/).forEach(line=>{
    const rawLine = line.replace(/\r$/,'');
    const m = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.+)$/);
    if(!m) return;
    let done = m[1].toLowerCase()==='x', title = m[2];
    let due = null;
    const dm = title.match(DATE_MARKER);
    if(dm){
      const p = dm[1].split('-').map(Number);
      due = {ts:new Date(p[0],p[1]-1,p[2]).getTime(), time: dm[2] || null};
    }
    title = stripDateMarkers(title);
    if(!title) return;
    const key = `${path ?? ''}\n${rawLine}`;
    const dupIdx = dup.get(key) || 0;
    dup.set(key, dupIdx+1);
    const id = (ledger && dupIdx===0)
      ? resolveObsId(path ?? '', rawLine, ledger)
      : makeTaskId(path, rawLine, dupIdx);
    out.push(T({ id, title, done, due,
      src:'obsidian', srcNote: vaultName? vaultName+'/'+name : name, listId:null,
      srcPath: path||null, srcLine: rawLine, srcVault: vaultPath||null }));
  });
  return out;
}

/* 勾选翻转的唯一写端:回写笔记时由 task-events.js 调用 */
export function flipTaskLine(line, done){
  return done
    ? line.replace(/^(\s*[-*+]\s+\[)\s?(?:x|X)?(\])/,'$1x$2')
    : line.replace(/^(\s*[-*+]\s+\[)\s?(?:x|X)?(\])/,'$1 $2');
}

/* ---- id 台账:{ "<笔记路径>": { "<行原文>": id } } ----
   重导入解析每行先查账(身份跨「我们自己改行」保持稳定:回写时新旧行指向同一 id);
   miss 则派生并入账。调用方约定:同文件内重复行文本只让首行走本函数,
   重复行走 makeTaskId(path, rawLine, n) 且不入账(入账会互相覆盖)。 */
export function resolveObsId(path, rawLine, ledger){
  if(!ledger[path]) ledger[path] = {};
  if(!Object.prototype.hasOwnProperty.call(ledger[path], rawLine)){
    ledger[path][rawLine] = makeTaskId(path, rawLine, 0);
  }
  return ledger[path][rawLine];
}
/* 剪枝:某路径本次解析未见到的行从台账清除(防无限增长);由 reimport 每来源完成后调用 */
export function pruneLedger(ledger, path, seenLines){
  const m = ledger[path];
  if(!m) return;
  const seen = new Set(seenLines);
  for(const k of Object.keys(m)) if(!seen.has(k)) delete m[k];
}

/* ---- editTaskLine:标题/日期编辑的行变换(回写用,与解析共用同一份标记正则) ----
   返回新行;无实际变化返回 null(调用方跳过回写)。
   语义:清洗后标题(含行内 #tag,与 Rosy 展示一致)可整体替换;
        日期标记改写为规范 📅 形式并统一置于行尾;清除日期 = 移除全部标记;
        仅改标题时,原有标记原样保留(不强制规范化)。 */
export function editTaskLine(line, {title, due} = {}){
  const m = line.match(/^(\s*[-*+]\s+\[( |x|X)\]\s+)(.*)$/);
  if(!m) return null;
  const markers = [];
  let cleaned = m[3].replace(MARKER_SCAN, s => { markers.push(s); return ''; })
                    .replace(/\s{2,}/g, ' ').trim();
  if(title !== undefined) cleaned = String(title).trim();
  if(!cleaned) return null;
  if(due !== undefined){
    markers.length = 0;
    if(due) markers.push(`📅 ${isoOf(due.ts)}${due.time ? ' ' + due.time : ''}`);
  }
  const out = m[1] + cleaned + (markers.length ? ' ' + markers.join(' ').replace(/\s{2,}/g, ' ').trim() : '');
  return out === line ? null : out;
}
