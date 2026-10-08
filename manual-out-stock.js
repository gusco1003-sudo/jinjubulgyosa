/* Product deductions are stored on the same outbound event as the fee and pallet movement. */
(() => {
  'use strict';
  const S=window.JinjuStockCore,$=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const box=document.createElement('div');box.id='manualStockBox';box.className='col-span-2';
  box.innerHTML=`<div style="background:#f3f5ff;border:1px solid #dde3fa;border-radius:12px;padding:12px"><strong>출고 제품 · 박스 수량</strong><p class="hint">실제로 나가는 제품과 BOX 수량을 입력하세요. 여러 제품은 행을 추가하세요. 박스출고는 아래 수량 합계로 비용을 계산합니다.</p><div id="manualStockRows"></div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"><button id="manualStockAdd" type="button" class="btn-ghost px-3 py-2 rounded-lg text-xs">제품 추가</button><button id="manualStockEstimate" type="button" class="btn-ghost px-3 py-2 rounded-lg text-xs">적재 기준으로 박스 수 계산</button></div><p id="manualStockCapacity" class="hint"></p><div id="manualStockPreview" class="hint" aria-live="polite"></div></div>`;
  $('outBoxWrap').after(box);
  const notice=document.createElement('p');notice.id='manualStockNotice';notice.className='hint col-span-2';box.after(notice);
  const style=document.createElement('style');style.textContent='.manual-stock-row{display:grid;grid-template-columns:minmax(0,1fr) 90px auto;gap:8px;margin-top:10px;align-items:end}.manual-stock-row label{display:flex;flex-direction:column;gap:4px}.manual-stock-row select,.manual-stock-row input{width:100%;min-width:0}.manual-stock-row button{padding:8px}@media(max-width:480px){.manual-stock-row{grid-template-columns:minmax(0,1fr) 75px auto}}';document.head.appendChild(style);
  function rows(){return [...$('manualStockRows').children].map(r=>({productId:r.querySelector('select').value,quantity:r.querySelector('input').value}));}
  function managed(){return ['box','korean','general'].includes($('outMethod').value);}
  function active(){return managed()&&(!state.productStock||($('outDate').value||todayStr())>=state.productStock.deductionStartDate);}
  function addRow(value={productId:'',quantity:''}){
    const row=document.createElement('div');row.className='manual-stock-row';
    row.innerHTML='<label>제품<select aria-label="출고 제품"><option value="">제품 선택</option></select></label><label>BOX 수량<input type="number" min="1" step="1" aria-label="제품 출고 BOX 수량"></label><button type="button" aria-label="출고 제품 행 삭제">삭제</button>';
    $('manualStockRows').appendChild(row);fillSelect(row.querySelector('select'),value.productId);row.querySelector('input').value=value.quantity;
  }
  function fillSelect(select,id){select.innerHTML='<option value="">제품 선택</option>'+S.balances(state).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${p.balance} BOX</option>`).join('');select.value=id;}
  function refresh(){
    box.classList.toggle('hidden',!active());$('outProduct').closest('label').classList.toggle('hidden',active());$('outBoxCount').readOnly=active()&&$('outMethod').value==='box';
    $('manualStockEstimate').hidden=$('outMethod').value==='box';
    $('manualStockNotice').textContent=managed()&&!active()?'기준 재고에 포함된 과거 날짜입니다. 제품 BOX는 다시 차감하지 않습니다.':'';
    if(!active())return;
    const values=rows(),total=values.reduce((n,r)=>n+(Number(r.quantity)||0),0),plan=S.manualPlan(state,values);
    if($('outMethod').value==='box'){$('outBoxCount').value=total||'';updateOutFeePreview();}
    const first=S.list(state.productStock?.products).find(p=>p.id===values[0]?.productId);
    $('manualStockCapacity').textContent=$('outMethod').value==='box'?'박스출고로 파렛트까지 비워지는 경우에만 차감 PLT를 입력하세요.':`파렛트 출고는 PLT와 제품 BOX를 함께 차감합니다.${first?.boxesPerPallet?' '+first.name+' 기준: 1 PLT = '+first.boxesPerPallet+' BOX.':''} 혼합·부분 파렛트는 실제 BOX를 직접 입력하세요.`;
    $('manualStockPreview').innerHTML=plan.errors.map(e=>`<div style="color:#b42318">${esc(e)}</div>`).join('')+plan.lines.map(l=>`<div>${esc(l.name)}: ${l.before} − ${l.quantity} = <strong>${l.after} BOX</strong></div>`).join('');
  }
  function clear(){ $('manualStockRows').replaceChildren();addRow();refresh(); }
  function prepare(ev){
    if(!window.JinjuStockSync.ready()){alert('서버 자료를 먼저 불러와 주세요.');return false;}
    if(!JinjuCourier.validDate(ev.date)){alert('출고 날짜를 확인해 주세요.');return false;}
    const pallets=ev.method==='box'?Number(ev.deductPlt||0):Number(ev.qty);
    if(!Number.isFinite(pallets)||pallets<0||pallets>currentStock()){alert('차감할 파렛트가 현재 보관 파렛트 수보다 많거나 올바르지 않습니다.');return false;}
    if(state.productStock&&ev.date<state.productStock.deductionStartDate)return true;
    const plan=S.manualPlan(state,rows());if(plan.errors.length){alert(plan.errors.join('\n'));return false;}
    const sum=plan.lines.reduce((n,l)=>n+l.quantity,0);
    if(ev.method==='box'&&ev.count!==sum){alert('박스 합계와 제품별 출고 수량을 확인해 주세요.');return false;}
    if(!confirm(`${ev.date} ${ev.method==='box'?'박스':'파렛트'} 출고\n${plan.lines.map(l=>`${l.name}: ${l.quantity} BOX 차감 → ${l.after} BOX`).join('\n')}\n파렛트 차감: ${pallets} PLT\n출고비: ${won(eventFee(ev))}\n재고와 정산에 함께 반영할까요?`))return false;
    ev.stockLines=plan.lines.map(({productId,quantity})=>({productId,quantity}));ev.product=plan.lines.map(l=>l.name+' '+l.quantity+'BOX').join(', ');return true;
  }
  $('manualStockAdd').onclick=()=>{addRow();refresh();};
  $('manualStockRows').oninput=refresh;$('manualStockRows').onchange=refresh;
  $('manualStockRows').onclick=e=>{const button=e.target.closest('button');if(!button)return;button.closest('.manual-stock-row').remove();if(!rows().length)addRow();refresh();};
  $('manualStockEstimate').onclick=()=>{
    const values=rows(),p=S.list(state.productStock?.products).find(p=>p.id===values[0]?.productId),q=Number($('outQty').value),amount=q*Number(p?.boxesPerPallet);
    if(values.length!==1||!p||!Number.isFinite(q)||q<=0||!Number.isSafeInteger(amount)||amount<=0){alert('한 제품을 선택하고 PLT 수량을 입력하세요. 혼합 파렛트는 제품별 실제 BOX를 입력하세요.');return;}
    $('manualStockRows').querySelector('input').value=amount;refresh();
  };
  const baseToggle=toggleOutFields;toggleOutFields=function(){baseToggle();refresh();};
  $('outDate').addEventListener('change',refresh);
  $('outQty').addEventListener('input',refresh);
  const baseRender=renderAll;renderAll=function(){baseRender();for(const row of $('manualStockRows').children){const select=row.querySelector('select');fillSelect(select,select.value);}refresh();};
  window.JinjuManualStock={prepare,clear};addRow();refresh();
})();
