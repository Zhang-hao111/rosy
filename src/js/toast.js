import { $ } from './utils.js';
function showToast(msg, onUndo){
  const t = $('#toast');
  $('#toastMsg').textContent = msg;
  const old = $('#toastUndo'), nu = old.cloneNode(true);
  old.replaceWith(nu);
  nu.onclick = ()=>{ hideToast(); if(onUndo) onUndo(); };
  t.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideToast, 5000);
}
function hideToast(){ clearTimeout(undoTimer); $('#toast').classList.remove('show'); }
export { showToast, hideToast };
let undoTimer = null;
