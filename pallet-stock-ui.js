/* Read-only audit: legacy pallet movements versus reconstructed daily box stock. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const init=()=>{
 const nav=document.querySelector('nav'),tab=document.createElement('button');tab.type='button';tab.className='tab-btn py-2 px-1 whitespace-nowrap';tab.dataset.tab='pallets';tab.textContent='보관 파렛트';tab.onclick=()=>switchTab('pallets');nav.appendChild(tab);
 const panel=document.createElement('section');panel.id='tab-pallets';panel.className='tab-panel hidden';panel.innerHTML=`<div class="card p-4 mb-6"><h2 class="text-lg font-bold">보관 파렛트 자동 계산</h2><p class="hint">품목별 남은 BOX ÷ 등록된 1 PLT당 BOX를 모두 더하고, 마지막에 한 번 올림합니다. 혼적 잔량을 합산하며 상품을 출고하면 당일 보관료에도 반영됩니다.</p><p id="palletRule" class="hint"></p><div id="palletSummary" class="product-stock-stats"></div><div style="overflow:auto"><table style="width:100%"><thead><tr><th>제품</th><th>현재 BOX</th><th>1 PLT당 BOX</th><th>환산 PLT</th></tr></thead><tbody id="palletProducts"></tbody></table></div></div><div class="card p-4"><h2 class="text-lg font-bold">과거 보관료 재계산</h2><label>조회 월 <input id="palletMonth" type="month"></label><p id="palletMonthSummary" role="status"></p><p class="hint">원장 PLT는 기존 입출고 기록만으로 계산한 값입니다. 재계산 PLT는 해당 날짜의 입출고를 모두 반영한 박스 잔량 기준입니다. 제품 재고 기준일 이전은 원장을 유지합니다.</p><div style="overflow:auto;max-height:600px"><table style="width:100%"><thead><tr><th>날짜</th><th>원장 PLT</th><th>재계산 PLT</th><th>보관료</th><th>차액</th></tr></thead><tbody id="palletDays"></tbody></table></div><p id="palletError" role="alert"></p></div>`;
 nav.parentElement.appendChild(panel);$('palletMonth').value=todayStr().slice(0,7);$('palletMonth').max=todayStr().slice(0,7);
 function render(){
  if(!state.productStock)return;
  try{
   const now=todayStr(),current=JinjuPalletCore.calculate(state,now,now,now),month=$('palletMonth').value||now.slice(0,7);
   const end=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10),r=JinjuPalletCore.calculate(state,month+'-01',end,now),old=r.days.reduce((n,d)=>n+d.legacy*d.rate,0);
   $('palletRule').textContent=`${current.effectiveDate}부터 제품 이력으로 재계산 · 이전 날짜는 기존 원장 유지 · 등록된 박스 적재 기준을 사용한 혼적 환산 수량`;
   $('palletSummary').innerHTML=`<div>현재 보관<strong>${current.current} PLT</strong></div><div>품목별 환산 합계<strong>${current.equivalent.toFixed(3)} PLT</strong></div><div>현재 잔량 기준 1일 보관료<strong>${won(current.current*state.settings.storageFee)}</strong></div>`;
   $('palletProducts').innerHTML=current.products.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.balance}</td><td>${p.boxesPerPallet||'—'}</td><td>${p.balance?(p.balance/p.boxesPerPallet).toFixed(3):'0.000'}</td></tr>`).join('');
   $('palletMonthSummary').textContent=`${month} 오늘까지 · 기존 ${won(old)} → 재계산 ${won(r.total)} · 차액 ${won(r.total-old)} (부가세 별도)`;
   $('palletDays').innerHTML=r.days.map(d=>`<tr><td>${d.date}</td><td>${d.legacy}</td><td>${d.qty}${d.basis==='ledger'?' (원장)':''}</td><td>${won(d.amount)}</td><td>${won(d.amount-d.legacy*d.rate)}</td></tr>`).join('')||'<tr><td colspan="5">조회할 보관 기록이 없습니다.</td></tr>';
   $('palletError').textContent='';
  }catch(e){$('palletError').textContent=e.message;}
 }
 $('palletMonth').onchange=render;const base=renderAll;renderAll=function(){base();render();};render();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
