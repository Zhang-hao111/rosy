import { $, esc, mkday } from './utils.js';
import { TASKS, state, obsState, obsVaults, obsOrder, obsExpanded, obsHidden, OBS_COLOR, T,
         setTasks, setObsState, setObsVaults, setObsOrder, setObsHidden, setObsMenuOpen, setVaultMenuOpen } from './store.js';
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
/* ---- 真实库连接：Rust 侧读取 / 监听 / 回写（支持多库） ---- */
function vaultNameOf(p){ return p.split(/[\\/]/).filter(Boolean).pop() || '我的笔记库'; }
async function reimportAllVaults({silent=false}={}){
  const imported = []; let notes = 0; const failed = [];
  for(const v of obsVaults){
    try{
      const docs = await invoke('read_vault', {path: v.path});
      docs.forEach(d=>{
        const ts = parseObsidianMarkdown(d.name, d.text, d.path, v.name, v.path);
        if(ts.length){ notes++; imported.push(...ts); }
      });
      try{ await invoke('watch_vault', {path: v.path}); }catch(e){ console.error('监听失败', v.path, e); }
    }catch(e){ console.error('读取库失败', v.path, e); failed.push(v); }
  }
  setTasks(imported.concat(TASKS.filter(t=>t.src!=='obsidian')));   // 整库替换（含示例任务）
  [...new Set(imported.map(t=>t.srcNote))].forEach(n=>{ if(!obsOrder.includes(n)) obsOrder.push(n); });
  setObsState({connected: true, vault: obsVaults.length? obsVaults[obsVaults.length-1].name : obsState.vault,
              vaultPath: obsVaults.length? obsVaults[0].path : undefined, notes, count: imported.length});
  render(); scheduleSave();
  return {imported, notes, failed};
}
async function connectVault(path, {silent=false}={}){
  if(!invoke){ $('#obsFile').click(); return; }        // 浏览器预览退回网页选择
  const name = vaultNameOf(path);
  if(!obsVaults.some(v=>v.path===path)) obsVaults.push({name, path});
  const res = await reimportAllVaults({silent});
  if(!silent){
    if(res.failed.some(f=>f.path===path)) showToast('连接失败：无法读取该文件夹');
    else showToast(`已连接「${name}」· ${res.imported.length} 个任务 · 共 ${obsVaults.length} 个库`);
  }
}
/* vault 变更 → 防抖后所有库重读（笔记文件是唯一事实源） */
let vaultTimer = null, vaultListening = false;
async function listenVaultChanges(){
  if(!invoke || vaultListening) return;
  vaultListening = true;
  try{
    
    await tauriListen('vault-changed', ()=>{
      clearTimeout(vaultTimer);
      vaultTimer = setTimeout(async ()=>{
        if(!obsVaults.length) return;
        try{
          const before = JSON.stringify(TASKS.filter(t=>t.src==='obsidian'));
          await reimportAllVaults({silent:true});
          const after = JSON.stringify(TASKS.filter(t=>t.src==='obsidian'));
          if(before!==after) showToast('已同步笔记变更');
        }catch(e){ console.error('重读笔记库失败', e); }
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
        <div class="obs-cta-title">连接你的 Obsidian 笔记库</div>
        <div class="obs-cta-sub">选择库文件夹，自动识别笔记里的 <b>- [ ]</b> 任务与 <b>📅 截止日期</b>，<br>支持添加多个笔记库，内容变更自动同步</div>
        <button class="obs-cta-btn" id="obsConnectBtn">选择文件夹…</button>
        <div class="obs-cta-sub" style="margin-top:12px">还没准备好？<span class="lnk" id="obsDemoBtn">载入示例笔记</span></div>
      </div>`;
    return;
  }
  const byNote = {};
  items.forEach(t=>{ (byNote[t.srcNote] = byNote[t.srcNote]||[]).push(t); });
  const activeN = items.filter(t=>!t.done).length;
  $('#viewSub').innerHTML = `${activeN} 个待办 · 来自 ${Object.keys(byNote).length} 个笔记` +
    ` · <span class="lnk" id="vaultMgr">${obsVaults.length} 个笔记库</span>` +
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
  m.innerHTML = `<div class="mi-title">已连接的笔记库 · 点击移除</div>` +
    obsVaults.map((v,i)=>`<div class="menu-item" data-i="${i}"><span class="dot" style="background:${OBS_COLOR}"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.name)}</span><span style="opacity:.65;font-size:11px">移除</span></div>`).join('');
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
  const v = obsVaults[+it.dataset.i]; if(!v) return;
  obsVaults.splice(+it.dataset.i,1);
  closeVaultMenu();
  if(obsVaults.length){ reimportAllVaults(); }
  else {
    setTasks(TASKS.filter(t=>t.src!=='obsidian'));
    setObsState({connected:false, vault:'', vaultPath:undefined, notes:0, count:0});
    render(); scheduleSave();
  }
  showToast(`已移除「${v.name}」`);
});
$('#obsFile').addEventListener('change', e=>{
  if(e.target.files && e.target.files.length) importFiles(e.target.files);
  e.target.value='';
});
loadObsPrefs();
export { demoImport, reimportAllVaults, connectVault, renderObsidianView, moveNote, hideNote, openObsHiddenMenu, closeObsHiddenMenu, openVaultMenu, closeVaultMenu };
