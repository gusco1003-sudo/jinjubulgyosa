(() => {
  'use strict';
  const S=window.JinjuStockCore,$=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nav=document.querySelector('nav'),tab=document.createElement('button');
  tab.type='button';tab.className='tab-btn py-2 px-1 whitespace-nowrap';tab.dataset.tab='stock';tab.textContent='제품별 재고';tab.onclick=()=>switchTab('stock');nav.appendChild(tab);
  const panel=document.createElement('section');panel.id='tab-stock';panel.className='tab-panel hidden';
  panel.innerHTML=`<div class="card p-4 mb-6"><div class="product-stock-heading"><div><h2 class="text-lg font-bold">제품별 재고</h2><p id="productStockBasis" class="hint"></p></div><button type="button" id="goPicking" class="btn-primary">피킹리스트 등록</button></div><div id="productStockStats" class="product-stock-stats"></div><p class="hint">제품 수량은 BOX 단위입니다. 혼합 파렛트가 있으므로 박스 차감으로 보관 파렛트 수가 자동 변경되지는 않습니다.</p><label class="stock-search">제품 찾기 <input id="productStockSearch" type="search" placeholder="제품명 입력"></label><div style="overflow:auto"><table><thead><tr><th>제품명</th><th>기준 BOX</th><th>입고·조정 BOX</th><th>출고 BOX</th><th>현재 BOX</th><th>기준 파렛트</th></tr></thead><tbody id="productStockRows"></tbody></table></div></div><div class="card p-4 mb-6"><h2 class="text-lg font-bold">제품 재고 입고·조정</h2><p class="hint">추가 입고와 실사 차이를 BOX로 등록합니다. 박스·파렛트 출고는 입출고 관리에서 등록하면 자동 차감됩니다. 이곳에서는 제품 재고만 반영됩니다. 작업비와 파렛트 입출고는 기존 입출고 관리에서 등록하세요.</p><form id="stockAdjustmentForm" class="stock-adjustment"><label>일자<input id="stockMoveDate" type="date" required></label><label>제품<select id="stockMoveProduct" required></select></label><label>구분<select id="stockMoveKind"><option value="in">입고·증가</option><option value="out">출고·감소</option></select></label><label>박스 수량<input id="stockMoveQuantity" type="number" min="1" step="1" required></label><label>사유<input id="stockMoveReason" maxlength="150" placeholder="추가 입고 / 실사 조정" required></label><button id="stockMoveSave" type="submit" class="btn-primary">재고 반영</button></form><p id="stockMoveMessage" role="status"></p></div><div class="card p-4"><h2 class="text-lg font-bold">제품별 재고 변동</h2><p class="hint">기준 재고 이후의 출고와 입고·조정 이력입니다. 잘못된 조정은 반대 수량으로 사유를 적어 등록하세요.</p><div style="overflow:auto;max-height:500px"><table><thead><tr><th>일자</th><th>제품</th><th>구분</th><th>BOX 증감</th><th>사유</th></tr></thead><tbody id="productStockHistory"></tbody></table></div></div>`;
  nav.parentElement.appendChild(panel);
  const style=document.createElement('style');style.textContent=`.product-stock-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.product-stock-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.product-stock-stats>div{border:1px solid #dce5fa;border-radius:16px;padding:18px;background:linear-gradient(120deg,#eef4ff,#f4fffb)}.product-stock-stats strong{display:block;font-size:28px;color:#2447a4}.stock-adjustment,.stock-mapping{display:flex;flex-wrap:wrap;gap:14px;margin:16px 0;align-items:end}.stock-adjustment label,.stock-mapping label{display:flex;flex-direction:column;gap:6px;max-width:100%}.stock-search{display:block;margin:18px 0}.stock-mapping select{max-width:100%}#tab-stock button{padding:10px 18px;border-radius:10px}#tab-stock button:disabled{opacity:.45}#productStockRows td:nth-child(5){font-weight:800;color:#2447a4}#tab-stock table{width:100%}@media(max-width:600px){.product-stock-stats{grid-template-columns:1fr}.product-stock-heading{align-items:start;flex-direction:column}.stock-adjustment label,.stock-adjustment input,.stock-adjustment select{width:100%}}`;document.head.appendChild(style);
  let saving=false;
  function render(){
    const inventory=state.productStock,select=$('stockMoveProduct'),old=select.value;
    if(!inventory){$('productStockBasis').textContent='제품별 기준 재고를 준비하고 있습니다.';$('stockMoveSave').disabled=true;return;}
    const all=S.balances(state),term=S.key($('productStockSearch').value),rows=all.filter(p=>[p.name,...S.list(p.aliases)].some(n=>S.key(n).includes(term)));
    $('productStockBasis').textContent=`${inventory.baselineDate} 출고까지 반영한 기준 재고 · ${inventory.deductionStartDate} 출고분부터 제품 재고 자동 차감`;
    $('productStockStats').innerHTML=`<div>현재 제품 재고<strong>${all.reduce((n,p)=>n+p.balance,0).toLocaleString()} BOX</strong></div><div>관리 제품<strong>${all.length}종</strong></div><div>현재 보관 파렛트<strong>${currentStock()} PLT</strong></div>`;
    $('productStockRows').innerHTML=rows.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.opening}</td><td>${p.adjustment>0?'+':''}${p.adjustment}</td><td>${p.outgoing}</td><td>${p.balance}</td><td>${p.referencePallets??'—'}</td></tr>`).join('')||'<tr><td colspan="6">일치하는 제품이 없습니다.</td></tr>';
    select.innerHTML=all.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${p.balance} BOX</option>`).join('');if(all.some(p=>p.id===old))select.value=old;
    const byId=new Map(all.map(p=>[p.id,p])),history=[];
    for(const e of S.list(state.events))for(const l of S.list(e.stockLines))history.push({date:e.date,productId:l.productId,quantity:-l.quantity,kind:e.method==='box'?'박스 출고':e.method==='courier'?'택배 출고':'파렛트 출고',reason:e.method==='courier'?'택배 송장 '+(e.count||0)+'건':eventQtyLabel(e)});
    for(const m of S.list(inventory.movements))history.push({...m,kind:m.quantity>0?'입고·증가':'출고·감소'});
    $('productStockHistory').innerHTML=history.filter(m=>rows.some(p=>p.id===m.productId)).sort((a,b)=>b.date.localeCompare(a.date)).map(m=>`<tr><td>${esc(m.date)}</td><td>${esc(byId.get(m.productId)?.name)}</td><td>${m.kind}</td><td>${m.quantity>0?'+':''}${m.quantity}</td><td>${esc(m.reason)}</td></tr>`).join('')||'<tr><td colspan="5">기준 재고 이후의 변동이 없습니다.</td></tr>';
    $('stockMoveSave').disabled=saving||!window.JinjuStockSync.ready();
  }
  const baseRender=renderAll;renderAll=function(){baseRender();render();};
  $('productStockSearch').oninput=render;
  $('goPicking').onclick=()=>{switchTab('courier');$('courierFile').focus();};
  $('stockMoveDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  $('stockAdjustmentForm').onsubmit=async e=>{
    e.preventDefault();if(saving||!window.JinjuStockSync.ready()||!state.productStock)return;
    const p=S.balances(state).find(p=>p.id===$('stockMoveProduct').value),q=Number($('stockMoveQuantity').value),date=$('stockMoveDate').value,reason=$('stockMoveReason').value.trim(),quantity=$('stockMoveKind').value==='in'?q:-q;
    if(!p||!Number.isSafeInteger(q)||q<=0||!JinjuCourier.validDate(date)||!reason){alert('제품, 날짜, 정수 박스 수량, 사유를 확인해 주세요.');return;}
    if(date<state.productStock.deductionStartDate){alert('기준 재고에 이미 반영된 날짜입니다. '+state.productStock.deductionStartDate+' 이후의 변동을 등록하세요.');return;}
    if(p.balance+quantity<0){alert('재고가 부족합니다. 현재 '+p.balance+' BOX입니다.');return;}
    if(!confirm(`${date} ${p.name}: ${p.balance} → ${p.balance+quantity} BOX\n사유: ${reason}\n재고에 반영할까요?`))return;
    saving=true;state.productStock.movements=S.list(state.productStock.movements);state.productStock.movements.push({id:crypto.randomUUID(),date,productId:p.id,quantity,reason,createdAt:Date.now()});queueSave();clearTimeout(saveTimer);renderAll();
    const ok=await persist();$('stockMoveMessage').textContent=ok?'제품 재고가 서버에 저장되었습니다.':'서버에 저장되지 않았습니다. 상단의 저장 오류를 확인해 주세요.';$('stockMoveQuantity').value='';$('stockMoveReason').value='';saving=false;render();
  };
  const baseDelete=deleteEvent;deleteEvent=function(id){const e=state.events.find(e=>e.id===id);if(S.list(e?.stockLines).length&&!confirm('이 출고를 삭제하면 연결된 제품의 박스 재고도 복원됩니다. 계속할까요?'))return;baseDelete(id);};
  const baseReset=resetAllData;resetAllData=function(){if(state.productStock&&!confirm('입출고 전체 초기화 시 출고 차감 이력이 삭제되어 제품 수량이 복원됩니다. 기준 재고와 별도 입고·조정 이력은 유지됩니다. 계속할까요?'))return;baseReset();};
  render();
})();
