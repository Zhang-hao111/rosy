#!/usr/bin/env node
// 结构约束执法器(HANDOFF「前端架构约束」的机器化;本地 npm run check 与 CI 共用)
// 1) render/data/quickadd/batch 禁止 view 字符串比较(视图判断只准 views.js 的 viewDef())
// 2) src/js 每个模块必须从 main.js 可达(副作用模块漏挂载 = 监听全死)
// 3) obs* 偏好的原地变异只允许出现在白名单文件(整体重赋值走 store setter 的纪律)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const jsDir = join(dirname(fileURLToPath(import.meta.url)), 'src', 'js');
let fail = 0;
const die = msg => { console.error('✗ ' + msg); fail++; };

/* 1) 视图字符串比较禁令(HANDOFF 原文范围:render/data/quickadd/batch) */
const VIEW_BAN = ['render.js', 'data.js', 'quickadd.js', 'batch.js'];
for(const f of VIEW_BAN){
  readFileSync(join(jsDir, f), 'utf8').split('\n').forEach((l, i)=>{
    if(/\bview\s*===?/.test(l)) die(`${f}:${i+1} 禁止 view 字符串比较,改走 viewDef(): ${l.trim()}`);
  });
}

/* 2) 模块可达性:从 main.js 沿 import 边遍历,孤儿子文件 = 副作用监听没人挂载 */
const files = readdirSync(jsDir).filter(f=>f.endsWith('.js'));
const graph = new Map(files.map(f=>[f, []]));
for(const f of files){
  const src = readFileSync(join(jsDir, f), 'utf8');
  for(const m of src.matchAll(/(?:from\s+|import\s+)['"]\.\/([^'"]+)['"]/g)){
    if(graph.has(m[1])) graph.get(f).push(m[1]);
  }
}
const seen = new Set(['main.js']);
const queue = ['main.js'];
while(queue.length){
  const f = queue.pop();
  for(const dep of graph.get(f) || []) if(!seen.has(dep)){ seen.add(dep); queue.push(dep); }
}
for(const f of files) if(!seen.has(f)) die(`孤儿模块 ${f}: 未从 main.js 可达(副作用模块必须在 main.js 显式 import)`);

/* 3) obs* 偏好原地变异白名单(push/splice/下标赋值;读取与 setter 不限) */
const MUT = /(obsOrder|obsExpanded|obsHidden|obsSources|obsIds)(\.(push|splice|pop|shift|unshift|sort|reverse)\b|\[[^\]]*\]\s*=(?!=))/;
const MUT_OK = new Set(['store.js', 'obsidian-sync.js', 'task-events.js', 'sidebar.js']);
for(const f of files){
  if(MUT_OK.has(f)) continue;
  readFileSync(join(jsDir, f), 'utf8').split('\n').forEach((l, i)=>{
    if(MUT.test(l)) die(`${f}:${i+1} obs* 偏好原地变异须收敛到 store/obsidian-sync(或白名单): ${l.trim()}`);
  });
}

/* 4) 命名导入可解析:每个 import { x } from './f.js' 的 x 必须是 f.js 的导出。
   静态导入缺名导出会让整个模块图在求值期崩溃(2026-10-02 拆分时真实发生过,
   node --check 与可达性检查都拦不住,故单列一项)。 */
const exports = new Map(files.map(f=>[f, new Set()]));
for(const f of files){
  const src = readFileSync(join(jsDir, f), 'utf8');
  for(const m of src.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) exports.get(f).add(m[1]);
  for(const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for(const name of m[1].split(',')){
      const n = name.trim().split(/\s+as\s+/).pop();
      if(n) exports.get(f).add(n);
    }
}
for(const f of files){
  const src = readFileSync(join(jsDir, f), 'utf8');
  for(const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/([^'"]+)['"]/g)){
    const target = m[2];
    if(!exports.has(target)) continue;   // 非本地图(如 tauri 包)或路径错误已由可达性检查覆盖
    for(const name of m[1].split(',')){
      const n = name.trim().split(/\s+as\s+/)[0];
      if(n && !exports.get(target).has(n)) die(`${f}: 从 ${target} 导入的 '${n}' 不是其导出(模块求值会整体崩溃)`);
    }
  }
}

console.log(fail ? `check 失败:${fail} 处违规` : 'check 通过:视图比较 / 模块可达性 / 偏好变异纪律 / 导入导出匹配 ✓');
process.exit(fail ? 1 : 0);
