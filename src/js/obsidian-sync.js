// Obsidian 来源同步:来源表管理(notes/vault 混合)、读取/监听编排、按来源整体替换、
// 回写后的来源移除、浏览器降级导入。视图与菜单 UI 在 views-obsidian.js;解析在 obsidian-parse.js。
import { $, mkday } from './utils.js';
import { TASKS, state, obsState, obsSources, obsOrder, obsHidden, obsIds,
         setTasks, setObsState, setObsOrder, setObsHidden } from './store.js';
import { invoke, tauriListen } from './tauri.js';
import { saveObsPrefs, scheduleSave } from './data.js';
import { parseObsidianMarkdown, resolveObsId, pruneLedger } from './obsidian-parse.js';
import { render } from './render.js';
import { showToast } from './toast.js';

/* ---- 统一回写入口:界面改动(勾选/标题/日期) → 笔记行替换 ----
   成功:新行继承任务 id(台账登记)、task.srcLine 更新、落盘;
   失败(笔记已变):toast 告知,本地改动保留,下次重导入按笔记还原(笔记赢) */
export async function syncTaskToNote(task, newLine){
  if(!invoke || !task.srcPath || !newLine || newLine === task.srcLine) return false;
  const ok = await invoke('write_back', {path: task.srcPath, from: task.srcLine, to: newLine});
  if(ok){
    obsIds[task.srcPath] ||= {};
    obsIds[task.srcPath][newLine] = task.id;   // 新行继承身份;旧行键由下次 reimport 的剪枝清掉
    task.srcLine = newLine;
    scheduleSave();
  } else {
    showToast('笔记内容已变动，未能回写');
  }
  return !!ok;
}
/* ---- 标题编辑防抖:逐键回写会抖坏笔记,停手 800ms(或失焦)才落笔 ----
   到期时任务已被切走(state.selected 变化)则不落笔,防串行写旧值 */
const noteEditTimers = new Map();   // task.id → {timer, task, buildLine}
export function debounceNoteEdit(task, buildLine){
  if(!invoke || task.src!=='obsidian' || !task.srcPath) return;
  const prev = noteEditTimers.get(task.id);
  if(prev) clearTimeout(prev.timer);
  const entry = {task, buildLine, timer: null};
  entry.timer = setTimeout(()=>{ noteEditTimers.delete(task.id); flushNoteEntry(entry); }, 800);
  noteEditTimers.set(task.id, entry);
}
export function flushNoteEdit(task){
  const entry = noteEditTimers.get(task.id);
  if(!entry) return;
  clearTimeout(entry.timer);
  noteEditTimers.delete(task.id);
  flushNoteEntry(entry);
}
function flushNoteEntry(entry){
  if(state.selected !== entry.task.id) return;   // 已切走:丢弃
  const line = entry.buildLine();
  if(line) syncTaskToNote(entry.task, line);
}
/* 台账登记/复登记:回写新行时继承身份(syncTaskToNote);撤销追加时身份复原(undoDelete)。
   行消失的清理交给 reimport 的 pruneLedger——但注意:删除后 watcher 触发的重导入会立即剪掉
   该行,所以撤销路径必须在追加成功后重新登记(否则重导入派生新 id,身份漂移) */
export function rememberLedgerLine(path, line, id){
  obsIds[path] ||= {};
  obsIds[path][line] = id;
  scheduleSave();
}
function applyImport(docs, vault){
  let notes = 0; const imported = [];
  docs.forEach(d=>{
    const ts = parseObsidianMarkdown(d.name, d.text);
    if(ts.length){ notes++; imported.push(...ts); }
  });
  if(!imported.length){ showToast('没有在笔记中找到 - [ ] 任务'); return; }
  setTasks(imported.concat(TASKS));
  docs.forEach(d=>{ if(!obsOrder.includes(d.name)) obsOrder.push(d.name); });
  saveObsPrefs();
  setObsState({connected:true, vault, notes, count: imported.length});
  render();
  showToast(`已从「${vault}」导入 ${imported.length} 个任务`);
}
function importFiles(fileList){
  const files = [...fileList].filter(f=>/\.md$/i.test(f.name)).slice(0,80);
  if(!files.length){ showToast('所选文件夹里没有 .md 文件'); return; }
  const vault = (files[0].webkitRelativePath||'').split('/')[0] || '我的笔记库';
  Promise.all(files.map(f=>new Promise(res=>{
    const r = new FileReader();
    r.onload = ()=>res({name:f.name.replace(/\.md$/i,''), text:String(r.result)});
    r.onerror = ()=>res(null);
    r.readAsText(f);
  }))).then(docs=>applyImport(docs.filter(Boolean), vault));
}
function demoImport(){
  if(obsState.connected && obsState.vault==='示例笔记库'){ showToast('示例笔记已载入'); return; }
  const iso = ts => { const d=new Date(ts); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
  applyImport([
    {name:'学习计划/期末复习', text:
`# 期末复习

- [ ] 高数：刷完第 3 章习题 📅 ${iso(mkday(7))}
- [x] 英语单词 List 1-3
- [ ] 预约自习室 📅 ${iso(mkday(1))}
- [ ] 整理错题本`},
    {name:'生活/日常事务', text:
`# 日常事务

- [ ] 缴纳水电费 📅 ${iso(mkday(3))}
- [x] 给妈妈打电话
- [ ] 预约牙医复诊 📅 ${iso(mkday(-1))}
- [ ] 深度清洁厨房`}
  ], '示例笔记库');
}
/* ---- 真实连接:Rust 侧读取 / 监听 / 回写(笔记与笔记库两种来源共存) ---- */
function vaultNameOf(p){ return p.split(/[\\/]/).filter(Boolean).pop() || '我的笔记库'; }
function noteNameOf(p){ return (p.split(/[\\/]/).filter(Boolean).pop() || '笔记').replace(/\.md$/i, ''); }
const truncWarned = new Set();   // 截断提示每个来源只弹一次(防 watch 循环刷屏)
async function reimportAllSources({silent=false}={}){
  const imported = []; let notes = 0; const failed = [];
  for(const v of obsSources){
    try{
      const r = await invoke('read_source', {path: v.path});
      const isNote = v.kind==='note';
      const seenByPath = new Map();   // 本来源各笔记文件本次见到的行(供台账剪枝;键=笔记绝对路径)
      r.docs.forEach(d=>{
        // 单篇笔记 srcNote=纯文件名;库来源照旧「库名/相对路径」
        const ts = parseObsidianMarkdown(d.name, d.text, d.path, isNote? null : v.name, v.path, obsIds);
        if(!seenByPath.has(d.path)) seenByPath.set(d.path, new Set());
        ts.forEach(t=>{ if(t.srcLine) seenByPath.get(d.path).add(t.srcLine); });
        if(ts.length){ notes++; imported.push(...ts); }
      });
      for(const [p, seen] of seenByPath) pruneLedger(obsIds, p, seen);   // 剪掉本次没见到的行,台账不无限增长
      if(r.truncated && !truncWarned.has(v.path)){
        truncWarned.add(v.path);
        showToast(`「${v.name}」超过 200 篇，仅同步前 200 篇`);
      }
      try{ await invoke('watch_source', {path: v.path}); }catch(e){ console.error('监听失败', v.path, e); }
    }catch(e){ console.error('读取来源失败', v.path, e); failed.push(v); }
  }
  // 按来源替换:仍连接的来源整替(外部任务 id 内容派生、重导入稳定,见 obsidian-parse.js);
  // 被移除/失效来源的任务随之清除
  const paths = new Set(obsSources.map(v=>v.path));
  setTasks(imported.concat(TASKS.filter(t=>t.src!=='obsidian' || !paths.has(t.srcVault))));
  [...new Set(imported.map(t=>t.srcNote))].forEach(n=>{ if(!obsOrder.includes(n)) obsOrder.push(n); });
  setObsState({connected: true, vault: obsSources.length? obsSources[obsSources.length-1].name : obsState.vault,
              vaultPath: obsSources.length? obsSources[0].path : undefined, notes, count: imported.length});
  render(); scheduleSave();
  return {imported, notes, failed};
}
async function connectNotes(paths, {silent=false}={}){
  if(!invoke){ $('#obsNoteFile').click(); return; }    // 浏览器预览退回网页选择
  for(const p of paths){
    if(!obsSources.some(v=>v.path===p)) obsSources.push({name: noteNameOf(p), path: p, kind:'note'});
  }
  const res = await reimportAllSources({silent});
  if(!silent){
    const failedPick = res.failed.filter(f=>paths.includes(f.path)).length;
    if(failedPick === paths.length) showToast('连接失败:无法读取所选笔记');
    else showToast(`已连接 ${paths.length - failedPick} 篇笔记 · 共 ${obsSources.length} 个来源`);
  }
}
async function connectVault(path, {silent=false}={}){
  if(!invoke){ $('#obsFile').click(); return; }        // 浏览器预览退回网页选择
  const name = vaultNameOf(path);
  if(!obsSources.some(v=>v.path===path)) obsSources.push({name, path, kind:'vault'});
  const res = await reimportAllSources({silent});
  if(!silent){
    if(res.failed.some(f=>f.path===path)) showToast('连接失败：无法读取该文件夹');
    else showToast(`已连接「${name}」· ${res.imported.length} 个任务 · 共 ${obsSources.length} 个来源`);
  }
}
/* 「已连接」菜单里的移除:按来源替换,该来源的任务随之清除,其余来源不受影响 */
function removeSource(i){
  const v = obsSources[i]; if(!v) return;
  obsSources.splice(i,1);
  if(obsSources.length){
    reimportAllSources();
  } else {
    setTasks(TASKS.filter(t=>t.src!=='obsidian'));
    setObsState({connected:false, vault:'', vaultPath:undefined, notes:0, count:0});
    render(); scheduleSave();
  }
  showToast(`已移除「${v.name}」`);
}
function moveNote(note, dir){
  const names = [...new Set([...obsOrder, ...TASKS.filter(t=>t.src==='obsidian').map(t=>t.srcNote)])];
  const i = names.indexOf(note);
  const j = dir==='up'? i-1 : i+1;
  if(i<0 || j<0 || j>=names.length) return;
  [names[i], names[j]] = [names[j], names[i]];
  setObsOrder(names); saveObsPrefs(); render();
}
function hideNote(note){
  if(!obsHidden.includes(note)) obsHidden.push(note);
  saveObsPrefs();
  const sel = TASKS.find(x=>x.id===state.selected);
  if(sel && sel.src==='obsidian' && sel.srcNote===note) state.selected=null;
  render();
  showToast(`已屏蔽「${note}」· 点击撤销恢复`, ()=>unhideNote(note));
}
function unhideNote(note){
  setObsHidden(obsHidden.filter(x=>x!==note));
  saveObsPrefs(); render();
}
/* 来源变更 → 防抖后所有来源重读（笔记文件是唯一事实源） */
let vaultTimer = null, vaultListening = false;
async function listenVaultChanges(){
  if(!invoke || vaultListening) return;
  vaultListening = true;
  try{
    await tauriListen('vault-changed', ()=>{
      clearTimeout(vaultTimer);
      vaultTimer = setTimeout(async ()=>{
        if(!obsSources.length) return;
        try{
          const before = JSON.stringify(TASKS.filter(t=>t.src==='obsidian'));
          await reimportAllSources({silent:true});
          const after = JSON.stringify(TASKS.filter(t=>t.src==='obsidian'));
          if(before!==after) showToast('已同步笔记变更');
        }catch(e){ console.error('重读笔记失败', e); }
      }, 500);
    });
  }catch(e){ console.error('注册监听失败', e); }
}
listenVaultChanges();
/* 浏览器预览的一次性导入入口(index.html 两个隐藏 file input) */
$('#obsFile').addEventListener('change', e=>{
  if(e.target.files && e.target.files.length) importFiles(e.target.files);
  e.target.value='';
});
$('#obsNoteFile').addEventListener('change', e=>{
  if(e.target.files && e.target.files.length) importFiles(e.target.files);
  e.target.value='';
});
export { demoImport, reimportAllSources, connectNotes, connectVault, removeSource, moveNote, hideNote, unhideNote };
