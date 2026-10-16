/* Return stock and fees are committed together through the administrator bridge. */
(function(root){
 'use strict';
 const S=root.JinjuStockCore||(typeof require==='function'?require('./product-stock-core.js'):null),RATE=3400;
 function add(data,input,id){
  const date=String(input.date||''),count=Number(input.count),memo=String(input.memo||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('반품일을 확인하세요.');
  if(!data.productStock||date<data.productStock.deductionStartDate)throw Error('기준 재고 이후의 반품일을 입력하세요.');
  if(!Number.isSafeInteger(count)||count<1||count>1000000)throw Error('반품 건수는 1 이상의 정수로 입력하세요.');
  if(memo.length>150||/[<>]/.test(memo))throw Error('메모는 꺾쇠 없이 150자 이내로 입력하세요.');
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||S.list(data.costs).some(c=>c.id===id))throw Error('반품 기록 식별자가 중복됐습니다.');
  const grouped=new Map(),products=S.list(data.productStock.products);
  for(const row of input.lines||[]){
   const p=products.find(p=>p.id===row.productId),quantity=Number(row.quantity);
   if(!p||!Number.isSafeInteger(quantity)||quantity<=0||quantity>1000000)throw Error('반품 품목과 1 이상의 박스 수량을 입력하세요.');
   const old=grouped.get(p.id);grouped.set(p.id,{productId:p.id,name:p.name,quantity:(old?.quantity||0)+quantity});
  }
  const lines=[...grouped.values()].sort((a,b)=>a.productId.localeCompare(b.productId)),boxes=lines.reduce((n,l)=>n+l.quantity,0);
  if(!lines.length||boxes>1000000)throw Error('반품 박스 수량을 확인하세요.');
  const signature=JSON.stringify([date,count,lines.map(l=>[l.productId,l.quantity]),memo]);
  if(S.list(data.costs).some(c=>c.kind==='return'&&c.signature===signature))throw Error('동일한 반품 내역이 이미 등록되어 있습니다. 반품 내역을 확인하세요.');
  const next=JSON.parse(JSON.stringify(data)),createdAt=Date.now();
  next.costs=S.list(next.costs);next.productStock.movements=S.list(next.productStock.movements);
  const desc=`반품 ${count}건 × 3,400원 · ${boxes}박스 (${lines.map(l=>l.name+' '+l.quantity+'박스').join(', ')})${memo?' · '+memo:''}`;
  next.costs.push({id,kind:'return',date,count,boxes,rate:RATE,amount:count*RATE,desc,memo,stockLines:lines,signature,createdAt});
  for(const line of lines)next.productStock.movements.push({id:id+'-'+line.productId,returnId:id,date,productId:line.productId,quantity:line.quantity,reason:desc,createdAt});
  next.lastModified=createdAt;return next;
 }
 function remove(data,id){
  const cost=S.list(data.costs).find(c=>c.id===id&&c.kind==='return');if(!cost)throw Error('반품 내역을 찾을 수 없습니다.');
  const next=JSON.parse(JSON.stringify(data));next.costs=S.list(next.costs).filter(c=>c.id!==id);
  next.productStock.movements=S.list(next.productStock.movements).filter(m=>m.returnId!==id);
  if(S.balances(next).some(p=>p.balance<0))throw Error('반품 재고가 이미 출고되어 취소하면 재고가 부족합니다. 관련 출고를 먼저 확인하세요.');
  next.lastModified=Date.now();return next;
 }
 const api={add,remove,RATE};if(typeof module==='object'&&module.exports){module.exports=api;return;}root.JinjuReturns=api;
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let allowed=false,busy=false;const nav=document.querySelector('nav'),tab=document.createElement('button');tab.type='button';tab.className='tab-btn py-2 px-1 whitespace-nowrap';tab.dataset.tab='returns';tab.textContent='반품 관리';tab.onclick=()=>switchTab('returns');nav.appendChild(tab);
 const panel=document.createElement('section');panel.id='tab-returns';panel.className='tab-panel hidden';panel.innerHTML=`<div class="card p-4 mb-6"><h2 class="text-lg font-bold">반품 등록</h2><p class="hint">반품비는 1건당 3,400원입니다. 선택한 제품의 BOX 재고를 늘리고 반품비를 함께 저장합니다. 보관 파렛트 수는 별도로 관리합니다.</p><p id="returnAccess"><a href="https://ts3pl-wms.onrender.com/manage/jinjubulgyosa" target="_blank" rel="noopener">관리자 화면에서 반품 등록 →</a></p><form id="returnForm" hidden><div class="stock-adjustment"><label>반품일<input id="returnDate" type="date" required></label><label>반품 건수<input id="returnCount" type="number" min="1" step="1" value="1" required></label><label>메모 · 선택<input id="returnMemo" maxlength="150"></label></div><div id="returnLines"></div><button type="button" id="returnAddLine" class="btn-ghost">+ 반품 품목 추가</button><p id="returnPreview" style="margin:16px 0;font-weight:700"></p><button type="button" id="returnSave" class="btn-primary" disabled>반품 재고·비용 반영</button></form><p id="returnMessage" role="status" aria-live="polite"></p></div><div class="card p-4"><h2 class="text-lg font-bold">반품 내역</h2><p class="hint">비용 정산과 통합정산·화주라운지의 추가비용에 포함됩니다.</p><div style="overflow:auto"><table style="width:100%"><thead><tr><th>반품일</th><th>반품 품목</th><th>박스</th><th>건수</th><th>단가</th><th>반품비</th><th>메모</th></tr></thead><tbody id="returnHistory"></tbody></table></div></div>`;nav.parentElement.appendChild(panel);
 const style=document.createElement('style');style.textContent='#returnForm[hidden]{display:none!important}#tab-returns button{padding:10px 16px;border-radius:10px}#returnLines .stock-adjustment{padding:12px;background:#f5f7fc;border-radius:12px}';document.head.appendChild(style);
 function row(){const line=document.createElement('div');line.className='stock-adjustment return-line';line.innerHTML='<label>반품 품목<select class="return-product" required></select></label><label>반품 BOX<input class="return-quantity" type="number" min="1" step="1" value="1" required></label><button type="button" class="return-remove btn-ghost">행 제거</button>';$('returnLines').appendChild(line);line.querySelector('.return-remove').onclick=()=>{line.remove();render();};line.oninput=preview;render();}
 function preview(){const count=Number($('returnCount').value)||0,boxes=[...panel.querySelectorAll('.return-quantity')].reduce((n,e)=>n+(Number(e.value)||0),0);$('returnPreview').textContent=`반품 ${boxes}박스 · ${count}건 × 3,400원 = ${won(count*RATE)} (공급가액)`;}
 function render(){
  for(const select of panel.querySelectorAll('.return-product')){const old=select.value;select.innerHTML='<option value="">제품 선택</option>'+S.list(state.productStock?.products).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');select.value=old;}
  $('returnSave').disabled=!allowed||busy||!root.JinjuStockSync?.ready();$('returnAddLine').disabled=busy;
  $('returnHistory').innerHTML=S.list(state.costs).filter(c=>c.kind==='return').sort((a,b)=>b.date.localeCompare(a.date)).map(c=>`<tr><td>${esc(c.date)}</td><td>${S.list(c.stockLines).map(l=>esc(l.name)+' '+l.quantity+'박스').join(', ')}</td><td>${c.boxes}</td><td>${c.count}건</td><td>${won(c.rate)}</td><td>${won(c.amount)}</td><td>${esc(c.memo)}</td></tr>`).join('')||'<tr><td colspan="7">등록된 반품이 없습니다.</td></tr>';preview();
 }
 async function commit(next,message){const previous={costs:state.costs,productStock:state.productStock};busy=true;state.costs=next.costs;state.productStock=next.productStock;render();try{queueSave();clearTimeout(saveTimer);if(!await persist())throw Error('서버 저장을 확인하지 못했습니다. 새로고침하여 반품 내역을 확인하세요.');$('returnMessage').textContent=message;renderAll();}catch(e){state.costs=previous.costs;state.productStock=previous.productStock;$('returnMessage').textContent=e.message;renderAll();}finally{busy=false;render();}}
 $('returnSave').onclick=async()=>{if(!allowed||busy||!root.JinjuStockSync?.ready()||!$('returnForm').reportValidity())return;let next;try{next=add(state,{date:$('returnDate').value,count:$('returnCount').value,memo:$('returnMemo').value,lines:[...panel.querySelectorAll('.return-line')].map(e=>({productId:e.querySelector('select').value,quantity:e.querySelector('input').value}))},crypto.randomUUID());}catch(e){$('returnMessage').textContent=e.message;return;}await commit(next,'반품 재고와 비용이 서버에 저장되었습니다.');};
 $('returnForm').onsubmit=e=>e.preventDefault();$('returnAddLine').onclick=row;$('returnCount').oninput=preview;
 const oldDelete=deleteCost;deleteCost=async function(id){if(!S.list(state.costs).some(c=>c.id===id&&c.kind==='return'))return oldDelete(id);if(!allowed||busy||!root.JinjuStockSync?.ready())return;let next;try{next=remove(state,id);}catch(e){alert(e.message);return;}if(!confirm('반품 내역을 취소하면 반품비와 해당 재고 증가가 함께 취소됩니다. 계속할까요?'))return;await commit(next,'반품 비용과 재고 증가가 함께 취소되었습니다.');};
 const baseRender=renderAll;renderAll=function(){baseRender();render();};$('returnDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());row();
 if(typeof portalBridge!=='undefined')portalBridge.session.then(session=>{allowed=session.key==='jinjubulgyosa'&&session.writable===true;$('returnForm').hidden=!allowed;$('returnAccess').hidden=allowed;render();}).catch(()=>{$('returnMessage').textContent='관리자 연결을 확인하세요.';});
})(typeof window==='object'?window:globalThis);
