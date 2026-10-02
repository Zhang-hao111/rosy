// obsidian-parse.js 回归测试:Markdown 任务行解析、勾选翻转往返、稳定派生 id、id 台账、行编辑变换。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseObsidianMarkdown, flipTaskLine, makeTaskId, resolveObsId, pruneLedger, editTaskLine } from '../src/js/obsidian-parse.js';

test('基础行:标题/完成态/无日期/listId 为 null', ()=>{
  const ts = parseObsidianMarkdown('计划', '- [ ] 买牛奶\n- [x] 已完成的事');
  assert.equal(ts.length, 2);
  assert.equal(ts[0].title, '买牛奶');
  assert.equal(ts[0].done, false);
  assert.equal(ts[0].due, null);
  assert.equal(ts[0].listId, null);
  assert.equal(ts[0].src, 'obsidian');
  assert.equal(ts[1].done, true);
});

test('来源元数据:单篇笔记 srcNote=纯文件名,库来源=库名/相对路径', ()=>{
  const note = parseObsidianMarkdown('今日', '- [ ] a', '/n/今日.md', null, '/n/今日.md');
  assert.equal(note[0].srcNote, '今日');
  assert.equal(note[0].srcVault, '/n/今日.md');
  const vault = parseObsidianMarkdown('学习/计划', '- [ ] a', '/v/学习/计划.md', 'MyVault', '/v');
  assert.equal(vault[0].srcNote, 'MyVault/学习/计划');
  assert.equal(vault[0].srcVault, '/v');
  assert.equal(vault[0].srcPath, '/v/学习/计划.md');
});

test('📅 日期与紧邻时间一起识别并剥离(标题干净,round-trip 闭环)', ()=>{
  const ts = parseObsidianMarkdown('n', '- [ ] 交作业 📅 2026-10-05 14:30');
  const expected = new Date(2026, 9, 5).getTime();
  assert.deepEqual(ts[0].due, {ts: expected, time: '14:30'});
  assert.equal(ts[0].title, '交作业');
});

test('有日期无时间:time=null,标题不受影响', ()=>{
  const ts = parseObsidianMarkdown('n', '- [ ] 交作业 📅 2026-10-05');
  assert.deepEqual(ts[0].due, {ts: new Date(2026,9,5).getTime(), time: null});
  assert.equal(ts[0].title, '交作业');
});

test('远离日期标记的时间是标题内容,不识别为 due.time', ()=>{
  const a = parseObsidianMarkdown('n', '- [ ] 14:00 开会提醒');
  assert.equal(a[0].due, null);
  assert.equal(a[0].title, '14:00 开会提醒');
  // 有日期标记但时间不在标记旁:时间留在标题,due.time=null(不再全行扫时间——防回写乒乓)
  const b = parseObsidianMarkdown('n', '- [ ] 开会 14:00 📅 2026-10-05');
  assert.equal(b[0].due.time, null);
  assert.equal(b[0].title, '开会 14:00');
});

test('@due() 与 [due::] 两种语法同样识别(含紧邻时间)', ()=>{
  for(const line of ['- [ ] 任务 @due(2026-10-05)', '- [ ] 任务 [due:: 2026-10-05]',
                     '- [ ] 任务 @due(2026-10-05 09:00)', '- [ ] 任务 [due:: 2026-10-05 09:00]']){
    const ts = parseObsidianMarkdown('n', line);
    assert.equal(ts[0].due.ts, new Date(2026,9,5).getTime(), line);
    assert.equal(ts[0].title, '任务', line);
  }
  assert.equal(parseObsidianMarkdown('n', '- [ ] 任务 @due(2026-10-05 09:00)')[0].due.time, '09:00');
  assert.equal(parseObsidianMarkdown('n', '- [ ] 任务 [due:: 2026-10-05 09:00]')[0].due.time, '09:00');
});

test('剥离后空标题的行丢弃;非任务行忽略;保留原始行文本', ()=>{
  const ts = parseObsidianMarkdown('n', '普通段落\n- [ ] 📅 2026-10-05\n- [ ] 真任务\n* [ ] 星号变体');
  assert.equal(ts.length, 2);
  assert.equal(ts[0].title, '真任务');
  assert.equal(ts[0].srcLine, '- [ ] 真任务');
  assert.equal(ts[1].title, '星号变体');
});

test('flipTaskLine:各变体都能翻转,取消勾选统一为 "- [ ]"', ()=>{
  for(const line of ['- [ ] a', '- [x] a', '* [ ] b', '  - [ ] 缩进', '+ [x] 加号', '- [] 挤在一起', '- [X] 大写']){
    const done = flipTaskLine(line, true);
    assert.match(done, /\[x\]/, line);                       // 勾选:统一小写 x
    const undone = flipTaskLine(done, false);
    assert.match(undone, /^\s*[-*+]\s+\[ \] /, line);        // 取消:统一 "- [ ] " 带空格
    assert.ok(undone.trim().endsWith(done.split(']')[1].trim()), line);   // 标题保留
  }
  assert.equal(flipTaskLine('- [ ] a', true), '- [x] a');
  assert.equal(flipTaskLine('- [x] a', false), '- [ ] a');
});

test('makeTaskId:确定性、隔离区间、重复行靠 dupIdx 区分', ()=>{
  assert.equal(makeTaskId('/p', '- [ ] a', 0), makeTaskId('/p', '- [ ] a', 0));
  assert.notEqual(makeTaskId('/p', '- [ ] a', 0), makeTaskId('/p', '- [ ] a', 1));
  assert.notEqual(makeTaskId('/p', '- [ ] a', 0), makeTaskId('/q', '- [ ] a', 0));
  const id = makeTaskId('/p', '- [ ] a', 0);
  assert.ok(id >= 1e9 && id < 1.9e9);
});

test('同一输入重复解析得到相同 id(重导入不洗牌)', ()=>{
  const text = '- [ ] 甲\n- [ ] 乙\n- [ ] 甲';
  const a = parseObsidianMarkdown('n', text, '/f.md', null, '/f.md');
  const b = parseObsidianMarkdown('n', text, '/f.md', null, '/f.md');
  assert.deepEqual(a.map(t=>t.id), b.map(t=>t.id));
  // 同文件重复行文本(两个"甲")id 必须不同
  assert.notEqual(a[0].id, a[2].id);
});

test('resolveObsId:台账命中稳定、miss 派生入账、路径区分身份', ()=>{
  const led = {};
  const id1 = resolveObsId('/a.md', '- [ ] x', led);
  assert.equal(resolveObsId('/a.md', '- [ ] x', led), id1);          // 命中:身份稳定
  assert.ok(Object.prototype.hasOwnProperty.call(led['/a.md'], '- [ ] x'));
  assert.notEqual(resolveObsId('/b.md', '- [ ] x', led), id1);       // 同行文本不同路径=不同任务
  assert.equal(led['/a.md']['- [ ] x'], id1);
});

test('pruneLedger:清掉本次未见到的行,保留见到的', ()=>{
  const led = { '/a.md': { '- [ ] 保留': 1, '- [ ] 旧行': 2 }, '/b.md': { '- [ ] b': 3 } };
  pruneLedger(led, '/a.md', ['- [ ] 保留']);
  assert.deepEqual(led['/a.md'], { '- [ ] 保留': 1 });
  assert.deepEqual(led['/b.md'], { '- [ ] b': 3 });   // 其它路径不动
  pruneLedger(led, '/不存在.md', []);                  // 无账路径 no-op
});

test('editTaskLine 标题:替换后日期标记原样保留,勾选态不动', ()=>{
  const out = editTaskLine('- [ ] 买牛奶 📅 2026-10-05 09:00', {title:'买脱脂牛奶'});
  assert.equal(out, '- [ ] 买脱脂牛奶 📅 2026-10-05 09:00');
  const done = editTaskLine('- [x] 交作业 @due(2026-10-05)', {title:'交数学作业'});
  assert.equal(done, '- [x] 交数学作业 @due(2026-10-05)');
  assert.equal(editTaskLine('- [ ] 买牛奶', {title:'买牛奶'}), null);   // 无变化 → null 跳过回写
});

test('editTaskLine 标题含 #tag:tag 属于标题文本,随替换更新', ()=>{
  // Rosy 展示的标题本就包含 #tag,编辑的是整个可见标题
  const out = editTaskLine('- [ ] 买牛奶 #errands', {title:'买脱脂牛奶 #errands'});
  assert.equal(out, '- [ ] 买脱脂牛奶 #errands');
});

test('editTaskLine 日期:无→有/改期/清除,标记统一为 📅 且置于行尾', ()=>{
  assert.equal(editTaskLine('- [ ] 交作业', {due:{ts:new Date(2026,9,5).getTime(), time:null}}),
               '- [ ] 交作业 📅 2026-10-05');
  assert.equal(editTaskLine('- [ ] 交作业 📅 2026-10-05', {due:{ts:new Date(2026,9,7).getTime(), time:'09:00'}}),
               '- [ ] 交作业 📅 2026-10-07 09:00');
  assert.equal(editTaskLine('- [ ] 交作业 [due:: 2026-10-05 09:00]', {due:{ts:new Date(2026,9,7).getTime(), time:null}}),
               '- [ ] 交作业 📅 2026-10-07');                       // 旧变体统一规范
  assert.equal(editTaskLine('- [ ] 交作业 📅 2026-10-05 09:00', {due:null}),
               '- [ ] 交作业');                                     // 清除=移除标记
});

test('editTaskLine 组合:改标题同时清日期;时间往返闭环', ()=>{
  const out = editTaskLine('- [ ] 交作业 📅 2026-10-05 09:00', {title:'交数学作业', due:null});
  assert.equal(out, '- [ ] 交数学作业');
  // 往返:回写后的行再解析,标题干净、时间正确(与 P1 时间剥离联合闭环)
  const withTime = editTaskLine('- [ ] 交作业', {due:{ts:new Date(2026,9,5).getTime(), time:'09:00'}});
  const reparsed = parseObsidianMarkdown('n', withTime)[0];
  assert.equal(reparsed.title, '交作业');
  assert.deepEqual(reparsed.due, {ts:new Date(2026,9,5).getTime(), time:'09:00'});
});

test('editTaskLine 边界:非任务行/空标题返回 null', ()=>{
  assert.equal(editTaskLine('普通段落', {title:'x'}), null);
  assert.equal(editTaskLine('- [ ] 📅 2026-10-05', {title:''}), null);   // 清成空标题拒绝
});
