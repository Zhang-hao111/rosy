// store.js schema 收口的回归测试:hydrate↔toData 往返、v1 平铺迁移、来源三级迁移、uid 护栏。
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, toData, T } from '../src/js/store.js';

/* 合成 v1 平铺 fixture(替代原含个人信息的示例数据,结构等价:obsVaults/obsState/tasks 平铺顶层) */
const V1_FIXTURE = {
  calMode:'month', completedOpen:true, theme:'light', quickList:'study',
  obsExpanded:{'学习计划':false}, obsHidden:[], obsOrder:['学习计划'],
  obsState:{connected:true, count:1, notes:1, vault:'演示库', vaultPath:'/home/demo/vault'},
  obsVaults:[{name:'演示库', path:'/home/demo/vault'}],
  tasks:[
    {id:17, listId:null, title:'示例外部任务', notes:'', done:false, doneAt:0, due:null,
     subtasks:[], created:1790648677915, src:'obsidian', srcNote:'演示库/学习计划',
     srcLine:'- [ ] 示例外部任务', srcPath:'/home/demo/vault/学习计划.md', srcVault:'/home/demo/vault'},
    {id:1, listId:'study', title:'示例手动任务', notes:'', done:true, doneAt:1790701806189,
     due:{time:'09:00', ts:1791820800000}, subtasks:[], created:1790700557702},
    {id:2, listId:'life', title:'示例生活任务', notes:'', done:false, doneAt:0, due:null,
     subtasks:[], created:1790696957702},
  ],
  v:1,
};

test('空/损坏输入返回 restored:false', ()=>{
  assert.deepEqual(hydrate(null), {restored:false});
  assert.deepEqual(hydrate({}), {restored:false});
  assert.deepEqual(hydrate({v:2, prefs:{}}), {restored:false});   // 无 tasks 数组
});

test('v1 平铺布局(合成 fixture)迁移为 v2', ()=>{
  const v1 = V1_FIXTURE;
  const r = hydrate(v1);
  assert.equal(r.restored, true);
  assert.equal(r.theme, 'light');
  const out = toData();
  assert.equal(out.v, 2);
  assert.equal(out.tasks.length, v1.tasks.length);   // tasks 顶层原样保留(GNOME 扩展依赖)
  // 旧 obsVaults → obsSources 补 kind:'vault'
  assert.equal(out.prefs.obsSources.length, 1);
  assert.equal(out.prefs.obsSources[0].kind, 'vault');
  assert.equal(out.prefs.obsSources[0].path, v1.obsVaults[0].path);
  // 其余偏好平铺迁移
  assert.equal(out.prefs.theme, 'light');
  assert.equal(out.prefs.completedOpen, true);
  assert.equal(out.prefs.calMode, 'month');
});

test('更旧的单库布局(obsState.vaultPath)兜底迁移', ()=>{
  const r = hydrate({v:1, tasks:[], obsState:{connected:true, vault:'V', vaultPath:'/home/x/v'}});
  assert.equal(r.restored, true);
  assert.deepEqual(toData().prefs.obsSources, [{name:'V', path:'/home/x/v', kind:'vault'}]);
});

test('obsSources 优先于 obsVaults(两者都在时不重复)', ()=>{
  hydrate({v:1, tasks:[], obsSources:[{name:'A', path:'/a', kind:'note'}],
           obsVaults:[{name:'B', path:'/b'}]});
  assert.deepEqual(toData().prefs.obsSources, [{name:'A', path:'/a', kind:'note'}]);
});

test('obsSources 中缺 path 的脏条目被过滤', ()=>{
  hydrate({v:2, tasks:[], prefs:{obsSources:[{name:'ok', path:'/p', kind:'note'}, {name:'bad', path:''}, null]}});
  assert.deepEqual(toData().prefs.obsSources, [{name:'ok', path:'/p', kind:'note'}]);
});

test('uid 恢复只统计手动任务(<1e9),外部任务 id 不占空间', ()=>{
  hydrate({v:2, tasks:[{id:5, title:'a'}, {id:1000000005, title:'ext'}], prefs:{}});
  const nt = T({title:'新任务'});
  assert.equal(nt.id, 6);
});

test('v2 往返恒等:hydrate→toData→hydrate→toData 稳定', ()=>{
  const src = {v:2, tasks:[{id:1, title:'t', done:false, doneAt:0, due:{ts:1, time:null}, subtasks:[], created:1}],
    prefs:{obsSources:[{name:'N', path:'/n', kind:'note'}], obsState:{connected:true, vault:'N', notes:1, count:1},
           obsOrder:['N'], obsExpanded:{N:true}, obsHidden:[], theme:'dark', completedOpen:false,
           quickList:'life', calMode:'week'}};
  hydrate(src);
  const a = toData();
  hydrate(a);
  assert.deepEqual(toData(), a);
});

test('obsIds 身份台账:正常往返、缺失重置为空、脏数据防御', ()=>{
  const led = {'/n.md': {'- [ ] a': 1000000001}};
  hydrate({v:2, tasks:[], obsIds: led, prefs:{}});
  assert.deepEqual(toData().obsIds, led);                       // 往返保留
  hydrate({v:2, tasks:[], prefs:{}});                            // 老文件无 obsIds
  assert.deepEqual(toData().obsIds, {});                         // 重置为空(不残留上一测试的状态)
  hydrate({v:2, tasks:[], obsIds: 'garbage', prefs:{}});
  assert.deepEqual(toData().obsIds, {});                         // 脏数据防御
  hydrate({v:2, tasks:[], obsIds: [['a']], prefs:{}});
  assert.deepEqual(toData().obsIds, {});                         // 数组同样拒绝
});
