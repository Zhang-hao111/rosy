import { invoke, tauriListen } from './tauri.js';
import { TASKS } from './store.js';
import { render } from './render.js';
import { scheduleSave } from './data.js';
import { showToast } from './toast.js';
/* ---- 弹窗命令通道（todo-panel 扩展写 cmd.json；期望态映射，重放安全） ---- */
async function processCmd(){
  if(!invoke) return;
  try{
    const cmd = await invoke('read_cmd');
    if(!cmd) return;
    const map = cmd.done || {};
    let changed = false;
    for(const [idStr, val] of Object.entries(map)){
      const t = TASKS.find(x=>x.id === +idStr);
      if(t && t.done !== !!val){
        t.done = !!val;
        t.doneAt = t.done ? Date.now() : 0;
        changed = true;
      }
    }
    await invoke('ack_cmd', {expected: cmd});   // 内容比对后删:ack 前若有新命令写入则保留,待下轮处理
    if(changed){ render(); scheduleSave(); showToast('已从弹窗同步'); }
  }catch(e){ console.error('处理弹窗命令失败', e); }
}
async function listenCmds(){
  if(!invoke) return;
  try{
    
    await tauriListen('cmd-received', processCmd);
  }catch(e){ console.error('注册命令监听失败', e); }
}
export { processCmd, listenCmds };
