import { $ } from './utils.js';
import { state } from './store.js';
/* ================= 分栏拖拽调宽 ================= */
(function(){
  const divider = $('#sideDivider'), sb = document.querySelector('.sidebar');
  let dragging = false, startX = 0, startW = 0;
  divider.addEventListener('pointerdown', e=>{
    dragging = true; startX = e.clientX; startW = sb.getBoundingClientRect().width;
    divider.classList.add('active');
    document.body.style.userSelect = 'none';
    try{ divider.setPointerCapture(e.pointerId); }catch(err){}
  });
  divider.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const w = Math.max(190, Math.min(400, startW + e.clientX - startX));
    sb.style.width = w + 'px'; sb.style.minWidth = w + 'px';
  });
  const end = e=>{ if(!dragging) return; dragging=false; divider.classList.remove('active'); document.body.style.userSelect=''; };
  divider.addEventListener('pointerup', end);
  divider.addEventListener('pointercancel', end);
})();
/* 详情面板宽度拖拽 */
(function(){
  const divider = $('#detailDivider'), pane = $('#detailPane');
  let dragging=false, startX=0, startW=0;
  divider.addEventListener('pointerdown', e=>{
    dragging=true; startX=e.clientX; startW = state.detailW||300;
    divider.classList.add('active');
    pane.style.transition='none';
    document.body.style.userSelect='none';
    try{ divider.setPointerCapture(e.pointerId); }catch(err){}
  });
  divider.addEventListener('pointermove', e=>{
    if(!dragging) return;
    state.detailW = Math.max(260, Math.min(460, startW-(e.clientX-startX)));
    pane.style.width = state.detailW+'px';
  });
  const end = ()=>{ if(!dragging) return; dragging=false; divider.classList.remove('active'); pane.style.transition=''; document.body.style.userSelect=''; };
  divider.addEventListener('pointerup', end);
  divider.addEventListener('pointercancel', end);
})();
