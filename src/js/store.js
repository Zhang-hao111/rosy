import { TODAY, mkday, _now, bodyDark } from './utils.js';
let uid = 1;
const LISTS = [
  {id:'study', name:'学习', color:'#9d6bce'},
  {id:'life',  name:'生活', color:'#ff9372'},
];
const due  = (n, time=null) => ({ts: mkday(n), time});
const sub  = (t, ok=false) => ({title:t, done:ok});

let seq = 0;
const T = o => Object.assign({
  id:uid++, listId:'study', notes:'', done:false, doneAt:0, due:null, subtasks:[]
}, o, {created: Date.now() - (seq++)*3600e3});

let TASKS = [
  T({title:'高数期中考试', listId:'study', due:due(13,'09:00'),
     notes:'覆盖第 1–5 章，带好计算器和学生卡。'}),
  T({title:'完成 Rust 练习题', listId:'study', due:due(2),
     subtasks:[sub('所有权',1),sub('生命周期',1),sub('trait 与泛型')]}),
  T({title:'读完《认知觉醒》第 6 章', listId:'study', due:due(1),
     notes:'摘录三句触动自己的话，做成读书卡片。'}),
  T({title:'英语单词打卡', listId:'study', due:due(0)}),
  T({title:'看设计系统讲座回放', listId:'study', due:due(4)}),
  T({title:'图书馆还书', listId:'study', due:due(6)}),
  T({title:'提交实验报告', listId:'study', due:due(-1)}),
  T({title:'预约牙医复诊', listId:'life', due:due(-3)}),
  T({title:'跑步 5 公里', listId:'life', due:due(0), done:true, doneAt:Date.now()-2*3600e3}),
  T({title:'给妈妈打电话', listId:'life', due:due(0), done:true, doneAt:Date.now()-4*3600e3}),
  T({title:'取快递', listId:'life', due:due(0)}),
  T({title:'缴纳物业费', listId:'life', due:due(3)}),
  T({title:'十一出行计划', listId:'life', due:due(4)}),
  T({title:'周末大扫除', listId:'life', due:due(5)}),
  T({title:'体检报告复查', listId:'life', due:due(9)}),
  T({title:'整理照片备份', listId:'life'}),
];
const state = {
  view:'today', selected:null, completedOpen:false, search:'',
  calY:_now.getFullYear(), calM:_now.getMonth(), calSel:TODAY, calMode:'month',
  quickDate:null, quickTime:'', quickList:'study',
  detailW:300,
  pickCtx:null, pickTaskId:null, pickY:_now.getFullYear(), pickM:_now.getMonth(),
};
let obsState = { connected:false, vault:'', notes:0 };
/* Obsidian 笔记级偏好：展开/顺序/屏蔽（随任务数据一起持久化） */
let obsOrder = [], obsExpanded = {}, obsHidden = [];
let obsSources = [];   // 已连接来源 [{name, path, kind}]  kind: 'note'(单个.md) | 'vault'(文件夹)
let obsIds = {};       // 外部任务身份台账 { "<笔记绝对路径>": { "<行原文>": id } }
                       // 只在「我们自己回写行」与「reimport 解析」两个点更新(obsidian-parse/sync)
let addMenuOpen = false;   // 「添加」下拉菜单(笔记/库)
const OBS_COLOR = '#7f6df2';
function listColorOf(t){
  if(t.listId){ const l = LISTS.find(x=>x.id===t.listId); if(l) return l.color; }
  return t.src==='obsidian' ? OBS_COLOR : 'var(--text-3)';
}
export { TASKS, state, obsState, obsSources, obsOrder, obsExpanded, obsHidden, obsIds, obsMenuOpen, vaultMenuOpen, addMenuOpen, LISTS, OBS_COLOR, listColorOf, T, toData, hydrate };
let obsMenuOpen = false;
let vaultMenuOpen = false;

/* import 进来的 let 绑定只读:重赋值一律走这些 setter;读与原地变异(.splice/属性改)保持原样 */
export function setTasks(v){ TASKS = v; }
export function setUid(v){ uid = v; }
export function setObsState(v){ obsState = v; }
export function setObsSources(v){ obsSources = v; }
export function setObsIds(v){ obsIds = (v && typeof v==='object' && !Array.isArray(v)) ? v : {}; }
export function setObsOrder(v){ obsOrder = v; }
export function setObsExpanded(v){ obsExpanded = v; }
export function setObsHidden(v){ obsHidden = v; }
export function setObsMenuOpen(v){ obsMenuOpen = v; }
export function setVaultMenuOpen(v){ vaultMenuOpen = v; }
export function setAddMenuOpen(v){ addMenuOpen = v; }

/* ================= 数据 schema 唯一收口 =================
   v2 布局:{ v:2, tasks:[...], prefs:{...} }。
   tasks 必须保持顶层——GNOME 顶栏扩展直接读 data.json 的 tasks 数组;
   其余均为可重建的偏好,收进 prefs。序列化(toData)与反序列化(hydrate)
   都在本文件:今后加/改字段只动这里,不再有 snapshot/init 两头手写清单。 */
function toData(){
  return { v:2, tasks:TASKS, obsIds,
    prefs:{ obsSources, obsState, obsOrder, obsExpanded, obsHidden,
            theme: bodyDark()?'dark':'light', completedOpen: state.completedOpen,
            quickList: state.quickList, calMode: state.calMode } };
}
/* 识别 v1(全部平铺)与 v2(prefs 嵌套)两种落盘布局,统一灌入当前状态。
   返回 {restored, theme}:theme 交给调用方做 DOM 切换(store 不碰 DOM)。 */
function hydrate(saved){
  if(!saved || !Array.isArray(saved.tasks)) return {restored:false};
  setTasks(saved.tasks);
  // uid 只从手动任务(<1e9)恢复:外部任务 id 为内容派生(≥1e9,obsidian-parse.js),不占手动 uid 空间
  setUid(TASKS.reduce((m,t)=>{ const id=+t.id||0; return id<1e9 ? Math.max(m,id) : m; },0)+1);
  const p = (saved.v>=2 && saved.prefs) ? saved.prefs : saved;
  if(p.obsState)                         setObsState(p.obsState);
  if(Array.isArray(p.obsOrder))          setObsOrder(p.obsOrder);
  if(p.obsExpanded)                      setObsExpanded(p.obsExpanded);
  if(Array.isArray(p.obsHidden))         setObsHidden(p.obsHidden);
  // 来源列表:新键 obsSources(kind: note|vault);旧 obsVaults(无 kind)映射为 vault 条目
  if(Array.isArray(p.obsSources))        setObsSources(p.obsSources.filter(v=>v&&v.path));
  else if(Array.isArray(p.obsVaults))    setObsSources(p.obsVaults.filter(v=>v&&v.path).map(v=>({name:v.name, path:v.path, kind:'vault'})));
  else if(p.obsState && p.obsState.vaultPath) setObsSources([{name: p.obsState.vault||'笔记库', path: p.obsState.vaultPath, kind:'vault'}]);   // 旧单库数据迁移
  // 身份台账:缺失/脏数据一律重置为空(首次 reimport 自动重建,老数据零迁移)
  setObsIds(saved.obsIds && typeof saved.obsIds==='object' ? saved.obsIds : {});
  if(typeof p.completedOpen==='boolean') state.completedOpen = p.completedOpen;
  if(p.quickList && LISTS.some(l=>l.id===p.quickList)) state.quickList = p.quickList;
  if(p.calMode==='week'||p.calMode==='month')         state.calMode   = p.calMode;
  return {restored:true, theme: p.theme};
}
