import { TASKS, state, obsState, obsVaults, obsOrder, obsExpanded, obsHidden } from './store.js';
import { bodyDark, kindOf } from './utils.js';
import { invoke } from './tauri.js';
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
  const v = state.view;
  if(v==='today')   return t.due && kindOf(t)!=='future';
  if(v==='calendar')return true;
  if(v==='obsidian')return t.src==='obsidian';
  return t.listId === v;
}
function matchSearch(t){ return !state.search || t.title.toLowerCase().includes(state.search); }
function viewTasks(){ return allTasks().filter(t => inView(t) && matchSearch(t)); }
function sortKey(t){ return {overdue:0,today:1,future:2,none:3}[kindOf(t)]; }
function countFor(v){
  return allTasks().filter(t=>{
    if(t.done) return false;
    if(v==='obsidian') return t.src==='obsidian';
    if(v==='today') return t.due && kindOf(t)!=='future';
    return t.listId===v;
  }).length;
}
export { scheduleSave, loadObsPrefs, saveObsPrefs, allTasks, matchSearch, viewTasks, countFor };
