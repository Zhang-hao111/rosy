

/* Tauri API 单点:全部 window.__TAURI__ 访问收口在此;浏览器预览(invoke=null)自动降级 */
export const TAURI = !!(window.__TAURI__ && window.__TAURI__.core);
export const invoke = TAURI ? window.__TAURI__.core.invoke : null;
export async function tauriListen(event, handler){
  const { listen } = window.__TAURI__.event;
  return listen(event, handler);
}
export function getCurrentWindow(){ return window.__TAURI__.window.getCurrentWindow(); }
export function logicalSizeCtor(){
  return (window.__TAURI__.dpi && window.__TAURI__.dpi.LogicalSize) || window.__TAURI__.window.LogicalSize;
}
