import { $, bodyDark } from './utils.js';
import { invoke } from './tauri.js';
import { state, obsVaults, obsMenuOpen, vaultMenuOpen, hydrate, setObsVaults } from './store.js';
import { scheduleSave } from './data.js';
import { reimportAllVaults, connectVault, openObsHiddenMenu, closeObsHiddenMenu, openVaultMenu, closeVaultMenu } from './obsidian.js';
import { listenCmds, processCmd } from './cmd-channel.js';
import { closeListMenu, listMenuOpen } from './quickadd.js';
import { closePicker } from './picker.js';
import './task-actions.js';   // 副作用模块:任务交互监听(勾选/删除/撤销/拖拽改期/详情面板)
import { batchCloseFn } from './batch.js';
import './split-drag.js';      // 副作用模块:两条分栏拖拽
import './window-chrome.js';   // 副作用模块:红绿灯/尺寸记忆(Tauri 下生效)
import { showToast } from './toast.js';
import { render } from './render.js';
$('#smartNav').addEventListener('click', e=>{
  const item = e.target.closest('.nav-item'); if(!item) return;
  state.view = item.dataset.view; state.selected = null; closePicker(); render();
});
/* 顶栏:重新导入 + 「已屏蔽 N 篇」管理入口 */
$('#obsReimportBtn').addEventListener('click', ()=>{
  (async ()=>{
    if(!invoke){ $('#obsFile').click(); return; }                 // 浏览器预览
    const p = await invoke('pick_vault'); if(p) connectVault(p); else showToast('已取消选择');
  })();
});
$('#viewSub').addEventListener('click', e=>{
  const m = e.target.closest('#obsHiddenMgr');
  if(m) openObsHiddenMenu(m);
  const vm = e.target.closest('#vaultMgr');
  if(vm) openVaultMenu(vm);
});
document.addEventListener('click', e=>{
  const pk = $('#picker'), m = $('#listMenu');
  if(!pk.classList.contains('hidden') && !pk.contains(e.target)) closePicker();
  if(listMenuOpen() && !m.contains(e.target)) closeListMenu();
  const hm = $('#obsHiddenMenu');
  if(obsMenuOpen && !hm.contains(e.target) && !e.target.closest('#obsHiddenMgr')) closeObsHiddenMenu();
  const vm = $('#vaultMenu');
  if(vaultMenuOpen && !vm.contains(e.target) && !e.target.closest('#vaultMgr')) closeVaultMenu();
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    if(!$('#batchModal').classList.contains('hidden')){ batchCloseFn(); return; }
    if(obsMenuOpen){ closeObsHiddenMenu(); return; }
    if(vaultMenuOpen){ closeVaultMenu(); return; }
    if(listMenuOpen()){ closeListMenu(); return; }
    if(!$('#picker').classList.contains('hidden')){ closePicker(); return; }
    if(state.selected!==null){ state.selected=null; render(); }
    return;
  }
  const ae = document.activeElement;
  if(ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable)) return;
  if(e.key==='n' || e.key==='N'){ e.preventDefault(); $('#quickInput').focus(); }
  else if(e.key==='/'){ e.preventDefault(); $('#searchInput').focus(); }
});

/* 搜索 */
$('#searchInput').addEventListener('input', e=>{
  state.search = e.target.value.trim().toLowerCase();
  render();
});

/* 主题 */
$('#themeBtn').addEventListener('click', ()=>{
  document.body.classList.toggle('dark');
  const dark = bodyDark();
  $('#themeLabel').textContent = dark ? '切换浅色模式' : '切换深色模式';
  $('#themeIcon').innerHTML = dark
    ? '<circle cx="8" cy="8" r="3.2"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2"/>'
    : '<path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z"/>';
  scheduleSave();
});
/* ================= 启动:恢复本地数据 =================
   schema 细节全部在 store.hydrate;这里只管编排与主题 DOM。 */
(async function init(){
  let restored = false;
  if(invoke){
    try{
      const r = hydrate(await invoke('load_data'));
      restored = r.restored;
      if(r.theme==='dark'){
        document.body.classList.add('dark');
        $('#themeLabel').textContent = '切换浅色模式';
        $('#themeIcon').innerHTML = '<circle cx="8" cy="8" r="3.2"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2"/>';
      }
    }catch(err){ console.error('恢复数据失败', err); }
  }
  render();
  if(restored && obsVaults.length && invoke){
    // 自动重连：重读所有库并重新监听；已失效的库自动移出列表
    reimportAllVaults({silent:true}).then(res=>{
      if(res.failed.length){
        setObsVaults(obsVaults.filter(v=>!res.failed.includes(v)));
        showToast(`「${res.failed.map(f=>f.name).join('」「')}」已不可访问，已移除`);
        reimportAllVaults({silent:true});
      }
    });
  }
  if(invoke){
    listenCmds();
    processCmd();   // 应用启动时补处理离线期间积压的弹窗命令
  }
  if(!restored) scheduleSave();
})();
