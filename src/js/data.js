import { TASKS, state, obsState, obsVaults, obsOrder, obsExpanded, obsHidden } from './store.js';
import { bodyDark, kindOf } from './utils.js';
import { invoke } from './tauri.js';
import { viewDef } from './views.js';
let saveTimer = null;
function snapshot(){
  return { v:1, tasks:TASKS, obsState, obsOrder, obsExpanded, obsHidden,
           theme: bodyDark()?'dark':'light', completedOpen: state.completedOpen,
           quickList: state.quickList, calMode: state.calMode, obsVaults };
}
function scheduleSave(){
  if(!invoke) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    invoke('save_data', {data: snapshot()}).catch(console.error);
  }, 400);
}
function loadObsPrefs(){}
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
export { scheduleSave, loadObsPrefs, saveObsPrefs, allTasks, matchSearch, viewTasks, countFor };
