// 视图注册表:视图知识的唯一来源(成员判定/导航标记/快捷添加行为标志)。
// 只依赖 utils/store,不 import 渲染器或数据模块,保证不引入循环。
// 新增视图:在此注册一条 def;smart/list 类零改动,全新渲染类型需在渲染注册表(RENDERERS)加一行。
import { kindOf } from './utils.js';
import { LISTS } from './store.js';

const ICON = {
  today: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1"/></svg>',
  calendar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.2" width="11" height="10.3" rx="2"/><path d="M2.5 6.4h11M5.2 1.8v2.4M10.8 1.8v2.4"/></svg>',
  obsidian: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 1.8H4.6A1.4 1.4 0 0 0 3.2 3.2v9.6a1.4 1.4 0 0 0 1.4 1.4h6.8a1.4 1.4 0 0 0 1.4-1.4V4z"/><path d="M10.4 1.8v2.6H13"/></svg>',
};

/* match: 视图成员判定(含已完成任务);导航计数 = !done && match(t)。
   badge: 侧栏导航计数徽标;accent: 计数>0 时导航项高亮(仅今天)。
   pill: 快速添加栏显示清单胶囊(智能视图里选归属清单);calTarget: 新任务日期默认取日历选中日;
   quickAdd:false: 该视图无快速添加栏;reimportBtn: 内容区右上角「添加笔记库」按钮;
   nav:false: 不进侧栏导航(今天=启动默认页,日历由迷你月历进入;学习/生活从清单进度区进入)。 */
const VIEWS = [
  { id:'today',    title:'今天', kind:'smart',    icon:ICON.today,    color:'#ec5f9b', nav:false,
    match:t=>t.due && kindOf(t)!=='future', badge:true, accent:true, pill:true },
  { id:'calendar', title:'日历', kind:'calendar', icon:ICON.calendar, color:'#c07ae0', nav:false,
    match:()=>true, badge:false, pill:true, calTarget:true },
  { id:'obsidian', title:'Obsidian', kind:'obsidian', icon:ICON.obsidian, color:'#7f6df2',
    match:t=>t.src==='obsidian', badge:true, pill:false, quickAdd:false, reimportBtn:true },
  ...LISTS.map(l=>({ id:l.id, title:l.name, kind:'list', match:t=>t.listId===l.id })),
];

function viewDef(id){ return VIEWS.find(v=>v.id===id); }

/* 侧栏导航标记(逐字节复刻原静态 HTML 的结构与缩进;由 sidebar.js 注入;nav:false 的视图不出现在导航) */
function navHTML(){
  return VIEWS.filter(d=>d.icon && d.nav!==false).map(d=>
`
      <div class="nav-item" data-view="${d.id}">
        <span class="ico" style="background:${d.color}">${d.icon}</span>
        <span class="nm">${d.title}</span><span class="cnt"${d.badge?` data-count="${d.id}"`:''}></span>
      </div>`).join('') + `
    `;
}

export { VIEWS, viewDef, navHTML };
