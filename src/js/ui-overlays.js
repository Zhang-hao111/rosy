/* Escape 浮层注册制:后开先关。新增浮层 = open 时 overlayOpened + 注册一次 {isOpen, close},
   main.js 的 keydown 只调 closeTopOverlay(),不再维护硬编码优先级链。
   栈里允许残留已关闭的 id(外部点击关闭路径不通知本模块),isOpen() 为假时自动跳过。 */
const stack = [];          // 后开在尾
const registry = new Map();
export function registerOverlay(id, {isOpen, close}){
  registry.set(id, {isOpen, close});
}
export function overlayOpened(id){
  const i = stack.indexOf(id);
  if(i>=0) stack.splice(i,1);
  stack.push(id);
}
export function closeTopOverlay(){
  while(stack.length){
    const id = stack.pop();
    const o = registry.get(id);
    if(o && o.isOpen()){ o.close(); return true; }
  }
  return false;
}
