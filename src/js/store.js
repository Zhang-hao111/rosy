import { TODAY, mkday, _now } from './utils.js';
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
let obsVaults = [];   // 已连接的笔记库 [{name, path}]
const OBS_COLOR = '#7f6df2';
function listColorOf(t){
  if(t.listId){ const l = LISTS.find(x=>x.id===t.listId); if(l) return l.color; }
  return t.src==='obsidian' ? OBS_COLOR : 'var(--text-3)';
}
export { TASKS, state, obsState, obsVaults, obsOrder, obsExpanded, obsHidden, obsMenuOpen, vaultMenuOpen, LISTS, OBS_COLOR, listColorOf, T };
let obsMenuOpen = false;
let vaultMenuOpen = false;

/* import 进来的 let 绑定只读:重赋值一律走这些 setter;读与原地变异(.splice/属性改)保持原样 */
export function setTasks(v){ TASKS = v; }
export function setUid(v){ uid = v; }
export function setObsState(v){ obsState = v; }
export function setObsVaults(v){ obsVaults = v; }
export function setObsOrder(v){ obsOrder = v; }
export function setObsExpanded(v){ obsExpanded = v; }
export function setObsHidden(v){ obsHidden = v; }
export function setObsMenuOpen(v){ obsMenuOpen = v; }
export function setVaultMenuOpen(v){ vaultMenuOpen = v; }
