import { $, esc, mkday } from './utils.js';
import { TASKS, state, obsState, obsSources, obsOrder, obsExpanded, obsHidden, T,
         setTasks, setObsState, setObsSources, setObsOrder, setObsHidden, setObsMenuOpen, setVaultMenuOpen, setAddMenuOpen } from './store.js';
import { invoke, tauriListen } from './tauri.js';
import { allTasks, matchSearch, saveObsPrefs, loadObsPrefs, scheduleSave } from './data.js';
import { rowHTML } from './rows.js';
import { render } from './render.js';
import { showToast } from './toast.js';
function parseObsidianMarkdown(name, text, path=null, vaultName=null, vaultPath=null){
  const out = [];
  String(text).split(/\r?\n/).forEach(line=>{
    const rawLine = line.replace(/\r$/,'');
    const m = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.+)$/);
    if(!m) return;
    let done = m[1].toLowerCase()==='x', title = m[2];
    let due = null;
    const dm = title.match(/(?:📅|🗓|@due\(|\[due::[ \t]*)\s*(\d{4}-\d{2}-\d{2})/);
    if(dm){
      const p = dm[1].split('-').map(Number);
      due = {ts:new Date(p[0],p[1]-1,p[2]).getTime(), time:null};
      const tm = title.match(/([01]?\d|2[0-3]):[0-5]\d/);
      if(tm) due.time = tm[0];
    }
    title = title
      .replace(/(?:📅|🗓)\s*\d{4}-\d{2}-\d{2}/g,'')
      .replace(/@due\([^)]*\)/g,'')
      .replace(/\[due::[ \t]*\d{4}-\d{2}-\d{2}\]/g,'')
      .replace(/✅\s*\d{4}-\d{2}-\d{2}/g,'')
      .replace(/\s{2,}/g,' ').trim();
    if(!title) return;
    out.push(T({title, done, due, src:'obsidian', srcNote: vaultName? vaultName+'/'+name : name, listId:null, srcPath: path||null, srcLine: rawLine, srcVault: vaultPath||null}));
  });
  return out;
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
async function reimportAllSources({silent=false}={}){
  const imported = []; let notes = 0; const failed = [];
  for(const v of obsSources){
    try{
      const docs = await invoke('read_source', {path: v.path});
      const isNote = v.kind==='note';
      docs.forEach(d=>{
        // 单篇笔记 srcNote=纯文件名;库来源照旧「库名/相对路径」
        const ts = parseObsidianMarkdown(d.name, d.text, d.path, isNote? null : v.name, v.path);
        if(ts.length){ notes++; imported.push(...ts); }
      });
      try{ await invoke('watch_source', {path: v.path}); }catch(e){ console.error('监听失败', v.path, e); }
    }catch(e){ console.error('读取来源失败', v.path, e); failed.push(v); }
  }
  // 按来源替换:仍连接的来源整替(去重,重复导入不再翻倍);被移除/失效来源的任务随之清除
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
function renderObsidianView(){
  const items = allTasks().filter(t=>t.src==='obsidian' && matchSearch(t));
  $('#viewTitle').textContent = 'Obsidian';
  $('#ringBox').style.display = 'none';
  if(!obsState.connected){
    $('#viewSub').textContent = '让笔记里的任务出现在这里';
    $('#taskScroll').innerHTML = `
      <div class="obs-cta">
        <div class="obs-cta-ico">📒</div>
        <div class="obs-cta-title">连接你的 Obsidian 笔记</div>
        <div class="obs-cta-sub">选择 <b>.md 笔记</b>或整个库文件夹，自动识别 <b>- [ ]</b> 任务与 <b>📅 截止日期</b>，<br>可混合添加多个来源，内容变更自动同步</div>
        <button class="obs-cta-btn" id="obsConnectNoteBtn">添加笔记…</button>
        <div class="obs-cta-sub" style="margin-top:10px">或 <span class="lnk" id="obsConnectVaultBtn">添加整个笔记库</span> · 还没准备好？<span class="lnk" id="obsDemoBtn">载入示例笔记</span></div>
      </div>`;
    return;
  }
  const byNote = {};
  items.forEach(t=>{ (byNote[t.srcNote] = byNote[t.srcNote]||[]).push(t); });
  const activeN = items.filter(t=>!t.done).length;
  const nNote = obsSources.filter(v=>v.kind!=='vault').length, nVault = obsSources.length - nNote;
  const srcLabel = [nNote? `${nNote} 篇笔记`:'', nVault? `${nVault} 个库`:''].filter(Boolean).join(' · ') || '0 个来源';
  $('#viewSub').innerHTML = `${activeN} 个待办 · 来自 ${Object.keys(byNote).length} 个笔记` +
    ` · <span class="lnk" id="vaultMgr">${srcLabel}</span>` +
    (obsHidden.length? ` · <span class="lnk" id="obsHiddenMgr">已屏蔽 ${obsHidden.length} 篇</span>` : '');
  // 显示顺序：已保存的顺序优先，新笔记追加在后
  const names = Object.keys(byNote);
  const ordered = [...obsOrder.filter(n=>byNote[n]), ...names.filter(n=>!obsOrder.includes(n))];
  setObsOrder(ordered); saveObsPrefs();
  let html = '';
  if(!items.length){
    html += `<div class="empty"><div class="big">📎</div>笔记里还没有 - [ ] 任务<br>在 Obsidian 里把想追踪的条目改成 <b>- [ ]</b> 开头，保存后这里会自动出现</div>`;
  } else {
    ordered.forEach(note=>{
      const ts = byNote[note];
      const expanded = obsExpanded[note]===true;   // 默认收起
      const pend = ts.filter(t=>!t.done).length;
      html += `<div class="group-head obs-head ${expanded?'':'collapsed'}" data-note="${esc(note)}" title="点击展开/收起">
          <svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5L8 6l-4 3.5"/></svg>
          <span class="note-ico">📝</span>
          <span class="note-name">${esc(note)}</span>
          <span class="gcnt">${pend}/${ts.length}</span>
          <span class="obs-head-acts">
            <button class="icon-btn" data-obsact="up" title="上移"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10V2.5M2.8 5.5L6 2.3l3.2 3.2"/></svg></button>
            <button class="icon-btn" data-obsact="down" title="下移"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v7.5M2.8 6.5L6 9.7l3.2-3.2"/></svg></button>
            <button class="icon-btn" data-obsact="hide" title="屏蔽这篇笔记（全局不再显示）"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7s2.2-3.8 5-3.8S12 7 12 7s-2.2 3.8-5 3.8S2 7 2 7z"/><circle cx="7" cy="7" r="1.6"/><path d="M2.8 11.2L11.2 2.8"/></svg></button>
          </span>
        </div>
        <div class="grp-wrap ${expanded?'open':''}"><div class="grp-clip">` + ts.map(rowHTML).join('') + `</div></div>`;
    });
  }
  $('#taskScroll').innerHTML = html;
  const selRow = $('#taskScroll .row.selected');
  if(selRow) selRow.scrollIntoView({block:'nearest'});
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
function openObsHiddenMenu(anchor){
  const m = $('#obsHiddenMenu');
  m.innerHTML = `<div class="mi-title">已屏蔽的笔记 · 点击恢复</div>` +
    obsHidden.map(n=>`<div class="menu-item" data-note="${esc(n)}">📝 ${esc(n)}</div>`).join('');
  m.classList.remove('hidden');
  setObsMenuOpen(true);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, window.innerWidth-260)+'px';
  m.style.top = Math.max(12, Math.min(r.bottom+8, window.innerHeight-160))+'px';
  m.style.transformOrigin = 'top left';
}
function closeObsHiddenMenu(){ $('#obsHiddenMenu').classList.add('hidden'); setObsMenuOpen(false); }
$('#obsHiddenMenu').addEventListener('click', e=>{
  const it = e.target.closest('.menu-item'); if(!it) return;
  unhideNote(it.dataset.note);
  showToast(`已恢复「${it.dataset.note}」`);
});
function openVaultMenu(anchor){
  const m = $('#vaultMenu');
  m.innerHTML = `<div class="mi-title">已连接的笔记 / 笔记库 · 点击移除</div>` +
    obsSources.map((v,i)=>`<div class="menu-item" data-i="${i}"><span style="flex:none">${v.kind==='note'?'📝':'📁'}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.name)}</span><span style="opacity:.65;font-size:11px">移除</span></div>`).join('');
  m.classList.remove('hidden');
  setVaultMenuOpen(true);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, window.innerWidth-300)+'px';
  m.style.top = Math.max(12, Math.min(r.bottom+8, window.innerHeight-160))+'px';
  m.style.transformOrigin = 'top left';
}
function closeVaultMenu(){ $('#vaultMenu').classList.add('hidden'); setVaultMenuOpen(false); }
$('#vaultMenu').addEventListener('click', e=>{
  const it = e.target.closest('.menu-item'); if(!it) return;
  const v = obsSources[+it.dataset.i]; if(!v) return;
  obsSources.splice(+it.dataset.i,1);
  closeVaultMenu();
  if(obsSources.length){ reimportAllSources(); }   // 按来源替换:该来源的任务随之清除,其余不受影响
  else {
    setTasks(TASKS.filter(t=>t.src!=='obsidian'));
    setObsState({connected:false, vault:'', vaultPath:undefined, notes:0, count:0});
    render(); scheduleSave();
  }
  showToast(`已移除「${v.name}」`);
});
/* 「添加」下拉:笔记(可多选)/ 整个笔记库 */
function openAddSourceMenu(anchor){
  const m = $('#addSourceMenu');
  m.innerHTML = `<div class="menu-item" data-addkind="note">📝 添加笔记…<span style="margin-left:auto;opacity:.6;font-size:11px">可多选</span></div>` +
    `<div class="menu-item" data-addkind="vault">📁 添加笔记库…</div>`;
  m.classList.remove('hidden');
  setAddMenuOpen(true);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, window.innerWidth-220)+'px';
  m.style.top = Math.max(12, r.bottom+8)+'px';
  m.style.transformOrigin = 'top left';
}
function closeAddSourceMenu(){ $('#addSourceMenu').classList.add('hidden'); setAddMenuOpen(false); }
$('#addSourceMenu').addEventListener('click', e=>{
  const it = e.target.closest('.menu-item'); if(!it) return;
  const kind = it.dataset.addkind;
  closeAddSourceMenu();
  (async ()=>{
    if(kind==='note'){
      if(invoke){ const ps = await invoke('pick_note'); if(ps && ps.length) connectNotes(ps); else showToast('已取消选择'); }
      else { $('#obsNoteFile').click(); }   // 浏览器预览
    } else {
      if(invoke){ const p = await invoke('pick_vault'); if(p) connectVault(p); else showToast('已取消选择'); }
      else { $('#obsFile').click(); }
    }
  })();
});
$('#obsFile').addEventListener('change', e=>{
  if(e.target.files && e.target.files.length) importFiles(e.target.files);
  e.target.value='';
});
$('#obsNoteFile').addEventListener('change', e=>{
  if(e.target.files && e.target.files.length) importFiles(e.target.files);
  e.target.value='';
});
loadObsPrefs();
export { demoImport, reimportAllSources, connectNotes, connectVault, renderObsidianView, moveNote, hideNote,
         openObsHiddenMenu, closeObsHiddenMenu, openVaultMenu, closeVaultMenu, openAddSourceMenu, closeAddSourceMenu };
