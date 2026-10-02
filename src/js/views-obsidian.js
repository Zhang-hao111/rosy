// Obsidian 视图与来源管理 UI:renderObsidianView + 「添加 / 已屏蔽 / 已连接」三个弹窗菜单。
// 生成器只带 data-* 钩子;列表点击由 #taskScroll 委托(task-events.js)分发,菜单点击在本文件。
// 数据操作(移除/重导入)在 obsidian-sync.js,本文件只做展示与入口。
import { $, esc } from './utils.js';
import { obsState, obsSources, obsOrder, obsExpanded, obsHidden,
         obsMenuOpen, vaultMenuOpen, addMenuOpen,
         setObsOrder, setObsMenuOpen, setVaultMenuOpen, setAddMenuOpen } from './store.js';
import { invoke } from './tauri.js';
import { allTasks, matchSearch, saveObsPrefs } from './data.js';
import { rowHTML } from './rows.js';
import { showToast } from './toast.js';
import { connectNotes, connectVault, removeSource, unhideNote } from './obsidian-sync.js';
import { positionMenu } from './ui-menu.js';
import { registerOverlay, overlayOpened } from './ui-overlays.js';

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
/* ---- 「已屏蔽」菜单 ---- */
function openObsHiddenMenu(anchor){
  const m = $('#obsHiddenMenu');
  m.innerHTML = `<div class="mi-title">已屏蔽的笔记 · 点击恢复</div>` +
    obsHidden.map(n=>`<div class="menu-item" data-note="${esc(n)}">📝 ${esc(n)}</div>`).join('');
  m.classList.remove('hidden');
  setObsMenuOpen(true);
  positionMenu(m, anchor, {width:260, mode:'clamp', edge:0});
  overlayOpened('obsHiddenMenu');
}
function closeObsHiddenMenu(){ $('#obsHiddenMenu').classList.add('hidden'); setObsMenuOpen(false); }
$('#obsHiddenMenu').addEventListener('click', e=>{
  const it = e.target.closest('.menu-item'); if(!it) return;
  unhideNote(it.dataset.note);
  showToast(`已恢复「${it.dataset.note}」`);
});
/* ---- 「已连接」菜单(来源管理入口) ---- */
function openVaultMenu(anchor){
  const m = $('#vaultMenu');
  m.innerHTML = `<div class="mi-title">已连接的笔记 / 笔记库 · 点击移除</div>` +
    obsSources.map((v,i)=>`<div class="menu-item" data-i="${i}"><span style="flex:none">${v.kind==='note'?'📝':'📁'}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.name)}</span><span style="opacity:.65;font-size:11px">移除</span></div>`).join('');
  m.classList.remove('hidden');
  setVaultMenuOpen(true);
  positionMenu(m, anchor, {width:300, mode:'clamp', edge:0});
  overlayOpened('vaultMenu');
}
function closeVaultMenu(){ $('#vaultMenu').classList.add('hidden'); setVaultMenuOpen(false); }
$('#vaultMenu').addEventListener('click', e=>{
  const it = e.target.closest('.menu-item'); if(!it) return;
  if(!obsSources[+it.dataset.i]) return;
  closeVaultMenu();
  removeSource(+it.dataset.i);
});
/* ---- 「添加」下拉:笔记(可多选)/ 整个笔记库 ---- */
function openAddSourceMenu(anchor){
  const m = $('#addSourceMenu');
  m.innerHTML = `<div class="menu-item" data-addkind="note">📝 添加笔记…<span style="margin-left:auto;opacity:.6;font-size:11px">可多选</span></div>` +
    `<div class="menu-item" data-addkind="vault">📁 添加笔记库…</div>`;
  m.classList.remove('hidden');
  setAddMenuOpen(true);
  positionMenu(m, anchor, {width:220, mode:'clamp', edge:0, bottomReserve:0});
  overlayOpened('addSourceMenu');
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
registerOverlay('obsHiddenMenu', {isOpen:()=>obsMenuOpen, close:closeObsHiddenMenu});
registerOverlay('vaultMenu',     {isOpen:()=>vaultMenuOpen, close:closeVaultMenu});
registerOverlay('addSourceMenu', {isOpen:()=>addMenuOpen, close:closeAddSourceMenu});
export { renderObsidianView, openObsHiddenMenu, closeObsHiddenMenu, openVaultMenu, closeVaultMenu, openAddSourceMenu, closeAddSourceMenu };
