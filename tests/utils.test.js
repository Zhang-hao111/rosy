// utils.js 回归测试:esc 引号转义(属性注入防护)、fmtTs 相对日期分支、kindOf。
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtTs, kindOf, TODAY } from '../src/js/utils.js';

const DAY = 86400000;

test('esc 转义引号与 HTML 特殊字符(& 最先,避免二次转义)', ()=>{
  assert.equal(esc('a&b'), 'a&amp;b');
  assert.equal(esc('<img>'), '&lt;img&gt;');
  assert.equal(esc('say" onmouseover="x'), 'say&quot; onmouseover=&quot;x');
  assert.equal(esc("it's"), 'it&#39;s');
  assert.equal(esc('&lt;'), '&amp;lt;');
});

test('fmtTs 相对 today 的六类分支', ()=>{
  const today = new Date(2026, 9, 2).getTime();   // 2026-10-02(周五)
  assert.equal(fmtTs(today, null, today), '今天');
  assert.equal(fmtTs(today, '09:00', today), '今天 09:00');
  assert.equal(fmtTs(today - DAY, null, today), '昨天');
  assert.equal(fmtTs(today + DAY, null, today), '明天');
  assert.equal(fmtTs(today + 2*DAY, null, today), '后天');
  assert.equal(fmtTs(today + 3*DAY, null, today), '周一');   // 周内(<7 天)
  assert.equal(fmtTs(today + 8*DAY, null, today), '10月10日'); // 超出一周
  assert.equal(fmtTs(today - 2*DAY, null, today), '9月30日');
});

test('kindOf 基于 live TODAY 判定四类', ()=>{
  assert.equal(kindOf({due:null}), 'none');
  assert.equal(kindOf({due:{ts:TODAY}}), 'today');
  assert.equal(kindOf({due:{ts:TODAY - DAY}}), 'overdue');
  assert.equal(kindOf({due:{ts:TODAY + DAY}}), 'future');
});
