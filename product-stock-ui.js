(() => {
 'use strict';
 const S=window.JinjuStockCore,E=window.JinjuStockEdit,$=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 let allowed=false,saving=false,editing=null,pending=null;
 const nav=document.querySelector('nav'),tab=document.createElement('button');tab.type='button';tab.className='tab-btn py-2 px-1 whitespace-nowrap';tab.dataset.tab='stock';tab.textContent='제품별 재고';tab.onclick=()=>switchTab('stock');nav.appendChild(tab);
 const panel=document.createElement('section');panel.id='tab-stock';panel.className='tab-panel hidden';
 panel.innerHTML=`<div class="card p-4 mb-6"><div class="product-stock-heading"><div><h2 class="text-lg font-bold">제품별 재고</h2><p id="productStockBasis" class="hint"></p></div><button type="button" id="goPicking" class="btn-primary">피킹리스트 등록</button></div><div id="productStockStats" class="product-stock-stats"></div><p class="hint">현재 BOX 옆의 수정 버튼을 눌러 실제 수량을 입력하세요. 저장하면 오늘 재고와 보관 파렛트·보관료에 함께 반영됩니다. 출고 등록은 택배 피킹 또는 입출고 관리에서 하세요.</p><p id="stockEditAccess" class="hint"><a href="https://ts3pl-wms.onrender.com/manage/jinjubulgyosa" target="_blank" rel="noopener">관리자 화면에서 수정·삭제 →</a></p><p id="stockMoveMessage" role="status" aria-live="polite"></p><label class="stock-search">제품 찾기 <input id="productStockSearch" type="search" placeholder="제품명 입력"></label><div style="overflow:auto"><table><thead><tr><th>제품명</th><th>기준 BOX</th><th>입고·수정 BOX</th><th>출고 BOX</th><th>현재 BOX · 수정</th><th>1 PLT당 BOX</th></tr></thead><tbody id="productStockRows"></tbody></table></div></div><div class="card p-4"><h2 class="text-lg font-bold">제품별 재고 변동</h2><p class="hint">잘못된 내역은 삭제할 수 있으며 아래에서 복원할 수 있습니다. 출고·반품은 연결된 전체 품목과 비용을 함께 취소합니다.</p><div id="stockHistoryConfirm" hidden><p id="stockHistoryDescription"></p><p id="stockHistoryImpact" class="hint"></p><button id="stockHistoryApply" type="button" class="btn-primary">삭제 저장</button> <button id="stockHistoryCancel" type="button" class="btn-ghost">취소</button></div><p id="stockHistoryMessage" role="status" aria-live="polite"></p><div style="overflow:auto;max-height:500px"><table><thead><tr><th>일자</th><th>제품</th><th>구분</th><th>BOX 증감</th><th>사유</th><th>관리</th></tr></thead><tbody id="productStockHistory"></tbody></table></div><details style="margin-top:20px"><summary>삭제한 내역 · 복원</summary><div style="overflow:auto"><table><thead><tr><th>일자</th><th>내역</th><th>관리</th></tr></thead><tbody id="stockDeletedRows"></tbody></table></div></details></div>`;
 nav.parentElement.appendChild(panel);
 const style=document.createElement('style');style.textContent=`.product-stock-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.product-stock-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.product-stock-stats>div{border:1px solid #dce5fa;border-radius:16px;padding:18px;background:linear-gradient(120deg,#eef4ff,#f4fffb)}.product-stock-stats strong{display:block;font-size:28px;color:#2447a4}.stock-adjustment,.stock-mapping{display:flex;flex-wrap:wrap;gap:14px;margin:16px 0;align-items:end}.stock-adjustment label,.stock-mapping label{display:flex;flex-direction:column;gap:6px;max-width:100%}.stock-search{display:block;margin:18px 0}.stock-mapping select{max-width:100%}#tab-stock button{padding:8px 14px;border-radius:10px}#tab-stock button:disabled{opacity:.45;cursor:not-allowed}#productStockRows td:nth-child(5){font-weight:800;color:#2447a4;min-width:170px}#tab-stock table{width:100%}#stockEditQuantity{width:95px;margin-right:6px}#stockMoveMessage,#stockHistoryMessage{color:#2447a4;white-space:pre-line}#stockHistoryConfirm{padding:16px;background:#fff4e6;border:1px solid #f4ce94;border-radius:12px;margin:16px 0}#stockHistoryConfirm[hidden]{display:none!important}@media(max-width:600px){.product-stock-stats{grid-template-columns:1fr}.product-stock-heading{align-items:start;flex-direction:column}.stock-adjustment label,.stock-adjustment input,.stock-adjustment select{width:100%}}`;document.head.appendChild(style);
 function ready(){return allowed&&!saving&&window.JinjuStockSync.ready();}
 function message(id,text){$(id).textContent=text;}
 function render(){
  const inventory=state.productStock;if(!inventory){$('productStockBasis').textContent='제품별 기준 재고를 불러오는 중입니다.';return;}
  const all=S.balances(state),term=S.key($('productStockSearch').value),rows=all.filter(p=>[p.name,...S.list(p.aliases)].some(n=>S.key(n).includes(term))),byId=new Map(all.map(p=>[p.id,p]));
  $('productStockBasis').textContent=`${inventory.baselineDate} 출고까지 반영한 기준 재고 · ${inventory.deductionStartDate} 출고분부터 자동 차감`;
  $('stockEditAccess').hidden=allowed;
  $('productStockStats').innerHTML=`<div>현재 제품 재고<strong>${all.reduce((n,p)=>n+p.balance,0).toLocaleString()} BOX</strong></div><div>관리 제품<strong>${all.length}종</strong></div><div>현재 보관 파렛트<strong>${currentStock()} PLT</strong></div>`;
  const disabled=ready()?'':'disabled';
  $('productStockRows').innerHTML=rows.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.opening}</td><td>${p.adjustment>0?'+':''}${p.adjustment}</td><td>${p.outgoing}</td><td>${editing?.id===p.id?`<input id="stockEditQuantity" aria-label="${esc(p.name)} 현재 BOX" type="number" min="0" max="1000000" step="1" value="${esc(editing.value)}" ${disabled}><button type="button" data-save-stock ${disabled}>저장</button> <button type="button" data-cancel-stock ${saving?'disabled':''}>취소</button>`:`<strong>${p.balance}</strong> <button type="button" data-edit-stock="${esc(p.id)}" ${disabled}>수정</button>`}</td><td>${p.boxesPerPallet??'미등록'}</td></tr>`).join('')||'<tr><td colspan="6">일치하는 제품이 없습니다.</td></tr>';
  for(const b of panel.querySelectorAll('[data-edit-stock]'))b.onclick=()=>{if(!ready())return;const p=byId.get(b.dataset.editStock);editing={id:p.id,value:p.balance};message('stockMoveMessage','현재 박스 수를 입력하고 저장하세요.');render();$('stockEditQuantity').focus();};
  if($('stockEditQuantity')){$('stockEditQuantity').oninput=e=>{editing.value=e.target.value;};$('stockEditQuantity').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveQuantity();}if(e.key==='Escape'){editing=null;render();}};panel.querySelector('[data-save-stock]').onclick=saveQuantity;panel.querySelector('[data-cancel-stock]').onclick=()=>{editing=null;render();};}
  const history=E.records(state).filter(m=>rows.some(p=>p.id===m.productId)).sort((a,b)=>b.date.localeCompare(a.date));
  $('productStockHistory').innerHTML=history.map((m,i)=>`<tr><td>${esc(m.date)}</td><td>${esc(byId.get(m.productId)?.name)}</td><td>${esc(m.kind)}</td><td>${m.quantity>0?'+':''}${m.quantity}</td><td>${esc(m.reason)}</td><td><button type="button" data-history-delete="${i}" ${disabled}>삭제</button></td></tr>`).join('')||'<tr><td colspan="6">재고 변동 내역이 없습니다.</td></tr>';
  for(const b of panel.querySelectorAll('[data-history-delete]'))b.onclick=()=>prepareDelete(history[Number(b.dataset.historyDelete)]);
  const deleted=S.list(inventory.deletedHistory).sort((a,b)=>b.deletedAt-a.deletedAt);
  $('stockDeletedRows').innerHTML=deleted.map((a,i)=>`<tr><td>${esc(a.date)}</td><td>${esc(a.label)}</td><td><button type="button" data-history-restore="${i}" ${disabled}>복원</button></td></tr>`).join('')||'<tr><td colspan="3">삭제한 내역이 없습니다.</td></tr>';
  for(const b of panel.querySelectorAll('[data-history-restore]'))b.onclick=()=>prepareRestore(deleted[Number(b.dataset.historyRestore)]);
  $('stockHistoryApply').disabled=!ready();$('stockHistoryCancel').disabled=saving;
 }
 async function commit(next,where,success){
  if(!ready())return false;saving=true;render();
  try{await window.JinjuStockSync.commit(next);message(where,success);editing=null;pending=null;$('stockHistoryConfirm').hidden=true;return true;}
  catch(err){message(where,err.message);return false;}
  finally{saving=false;renderAll();}
 }
 async function saveQuantity(){
  if(!ready()||!editing)return;try{const next=E.setQuantity(state,editing.id,editing.value,day(),crypto.randomUUID());await commit(next,'stockMoveMessage','서버에 저장되었습니다. 재고와 보관료, 통합정산·화주라운지에 반영됩니다.');}catch(err){message('stockMoveMessage',err.message);}
 }
 function preview(next,label,action,operation){
  const before=S.balances(state),after=new Map(S.balances(next).map(p=>[p.id,p.balance]));
  const affected=before.filter(p=>p.balance!==after.get(p.id)).map(p=>`${p.name}: ${p.balance} → ${after.get(p.id)} BOX`);
  const from=state.productStock.baselineDate,today=day(),storage=JinjuPalletCore.calculate(next,from,today,today).total-JinjuPalletCore.calculate(state,from,today,today).total;
  const fees=data=>S.list(data.events).reduce((n,e)=>n+eventFee(e),0)+S.list(data.costs).reduce((n,c)=>n+Number(c.amount||0),0);
  const fee=fees(next)-fees(state);
  pending=operation;$('stockHistoryConfirm').hidden=false;$('stockHistoryDescription').textContent=label;
  $('stockHistoryImpact').textContent=affected.join(' / ')+` · 작업비 변화 ${fee.toLocaleString()}원 · 오늘까지 보관료 변화 ${storage.toLocaleString()}원 (부가세 별도). 출고·반품은 같은 등록 건의 전체 품목을 함께 처리합니다.`;
  $('stockHistoryApply').textContent=action;message('stockHistoryMessage','');$('stockHistoryConfirm').scrollIntoView({block:'center'});
 }
 function prepareDelete(m){if(!ready())return;try{const id=crypto.randomUUID(),next=E.remove(state,m.type,m.id,day(),id);preview(next,`${m.date} · ${m.kind} · ${m.reason} 내역을 삭제합니다.`,'삭제 저장',{type:'delete',record:m,id});}catch(err){message('stockHistoryMessage',err.message);}}
 function prepareRestore(a){if(!ready())return;try{const next=E.restore(state,a.id,day());preview(next,`${a.date} · ${a.label} 내역을 복원합니다.`,'복원 저장',{type:'restore',id:a.id});}catch(err){message('stockHistoryMessage',err.message);}}
 $('stockHistoryApply').onclick=async()=>{if(!ready()||!pending)return;try{const next=pending.type==='restore'?E.restore(state,pending.id,day()):E.remove(state,pending.record.type,pending.record.id,day(),pending.id);await commit(next,'stockHistoryMessage',pending.type==='restore'?'복원 후 재고와 정산을 서버에 저장했습니다.':'삭제 후 재고와 정산을 서버에 저장했습니다. 삭제한 내역에서 복원할 수 있습니다.');}catch(err){message('stockHistoryMessage',err.message);}};
 $('stockHistoryCancel').onclick=()=>{pending=null;$('stockHistoryConfirm').hidden=true;};
 const baseRender=renderAll;renderAll=function(){baseRender();render();};
 $('productStockSearch').oninput=render;$('goPicking').onclick=()=>{switchTab('courier');$('courierFile').focus();};
 async function start(){if(typeof portalBridge==='undefined')return;try{const session=await portalBridge.session;allowed=session.key==='jinjubulgyosa'&&session.writable===true;render();}catch{message('stockMoveMessage','관리자 로그인을 확인하세요.');}}
 start();render();
})();
