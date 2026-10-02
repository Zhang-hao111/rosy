/* 浮层定位唯一实现:5 处调用(清单菜单/日期浮层/添加/屏蔽/已连接菜单)共用一套数学。
   mode:'flip'  = 下方放不下翻到上方(listMenu/picker 原行为)
   mode:'clamp' = 不翻转,钳制在可视区内(obsidian 三菜单原行为)
   edge:右侧留白;bottomReserve:clamp 模式下方的保留高度 */
export function positionMenu(menu, anchor, {width=220, mode='flip', edge=16, pad=12, bottomReserve=160}={}){
  const r = anchor.getBoundingClientRect();
  const ph = menu.offsetHeight;
  const x = Math.min(r.left, window.innerWidth - width - edge);
  let y = r.bottom + 8, originY = 'top';
  if(mode==='flip'){
    if(y + ph > window.innerHeight - pad){ y = r.top - ph - 8; originY = 'bottom'; }
    y = Math.max(pad, y);
  } else {
    y = Math.max(pad, Math.min(y, window.innerHeight - bottomReserve));
  }
  menu.style.left = x+'px';
  menu.style.top = y+'px';
  menu.style.transformOrigin = `${r.left < window.innerWidth/2 ? 'left' : 'right'} ${originY}`;
}
