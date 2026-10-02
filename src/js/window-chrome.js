import { TAURI, getCurrentWindow, logicalSizeCtor } from './tauri.js';
import { $ } from './utils.js';
import { flushSave } from './data.js';
/* ================= 窗口控制 ================= */
if(TAURI){
  const win = getCurrentWindow();
  const LogicalSize = logicalSizeCtor();

  $('#tlClose').addEventListener('click', ()=>{ markClose(); win.close(); });
  $('#tlMin').addEventListener('click', ()=>win.minimize());
  $('#tlMax').addEventListener('click', ()=>win.toggleMaximize());
  // 不以最大化启动：有的窗口管理器会把无边框窗口撑得很大
  win.unmaximize().catch(()=>{});
  // 尺寸记忆：启动恢复上次大小（无记录用默认=最小尺寸），调整后 400ms 防抖保存
  let size = {w: 960, h: 620};
  try{
    const s = JSON.parse(localStorage.getItem('winSize') || 'null');
    if(s && Number.isFinite(s.w) && Number.isFinite(s.h) && s.w >= 800 && s.h >= 500) size = s;
  }catch(e){}
  if(LogicalSize) win.setSize(new LogicalSize(size.w, size.h)).catch(()=>{});
  win.center().catch(()=>{});
  let rsT, closing = false;
  let lastNormal = {w: size.w, h: size.h};   // 只认验证过的常规尺寸，未验证前=启动恢复值
  const persist = s=>{ try{ localStorage.setItem('winSize', JSON.stringify(s)); }catch(e){} };
  window.addEventListener('resize', ()=>{
    if(closing) return;
    const w = window.innerWidth, h = window.innerHeight;
    if(w < 800 || h < 500) return;           // 销毁期假事件：webview 被压扁（阈值放宽到远低于最小尺寸，最小大小本身要能记录）
    clearTimeout(rsT);
    rsT = setTimeout(()=>{
      // 最大化状态不记录（避免把铺满尺寸当常规大小）
      win.isMaximized().then(m=>{ if(!m){ lastNormal = {w, h}; persist(lastNormal); } }).catch(()=>{});
    }, 400);
  });
  // 关闭瞬间（任意路径：红绿灯/Alt+F4/dock）按最后常规尺寸落盘，拦截销毁期假事件
  const markClose = ()=>{ if(closing) return; closing = true; clearTimeout(rsT); persist(lastNormal); };
  /* 关窗 flush:close-requested 拦截所有关闭路径,先把挂起的 400ms 防抖保存落盘再销毁,
     勾选后立刻关窗不再丢数据(destroy 需 capabilities 的 allow-destroy) */
  win.onCloseRequested(async (e)=>{
    e.preventDefault();
    try{ await flushSave(); }catch(err){}
    markClose();
    win.destroy();
  });
  window.addEventListener('beforeunload', markClose);
  window.addEventListener('pagehide', markClose);
}else{
  // 浏览器预览兜底:尽力而为地 flush(无 invoke 时 flushSave 本身就是 no-op)
  window.addEventListener('beforeunload', ()=>{ flushSave(); });
}
