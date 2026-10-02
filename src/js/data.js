import { TASKS, state, obsHidden, toData } from './store.js';
import { kindOf } from './utils.js';
import { invoke } from './tauri.js';
import { viewDef } from './views.js';
let saveTimer = null;
function scheduleSave(){
  if(!invoke) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    invoke('save_data', {data: toData()}).catch(console.error);
  }, 400);
}
/* 立即落盘:清掉挂起的防抖,同步保存一次。关窗 flush(window-chrome.js)专用 */
function flushSave(){
  clearTimeout(saveTimer);
  if(!invoke) return Promise.resolve();
  return invoke('save_data', {data: toData()}).catch(console.error);
}
function saveObsPrefs(){ scheduleSave(); }
function noteHidden(name){ return obsHidden.includes(name); }
function allTasks(){ return TASKS.filter(t=>!(t.src==='obsidian' && noteHidden(t.srcNote))); }
function inView(t){
  const def = viewDef(state.view);
  return def ? def.match(t) : false;
}
function matchSearch(t){ return !state.search || t.title.toLowerCase().includes(state.search); }
function viewTasks(){ return allTasks().filter(t => inView(t) && matchSearch(t)); }
function sortKey(t){ return {overdue:0,today:1,future:2,none:3}[kindOf(t)]; }
function countFor(v){
  const def = viewDef(v);
  if(!def) return 0;
  return allTasks().filter(t=>!t.done && def.match(t)).length;
}
export { scheduleSave, flushSave, saveObsPrefs, allTasks, matchSearch, viewTasks, countFor };
