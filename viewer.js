(() => {
  'use strict';const $=id=>document.getElementById(id),A=window.JinjuAuth,M=window.JinjuMetrics;
  if(!A||!M){$('authError').textContent='로그인 서비스를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.';$('loginButton').disabled=true;return;}
  let model=null,busy=false,generation=0;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=x=>Math.round(x).toLocaleString('ko-KR');const won=x=>num(x)+'원';
  function clear(){model=null;generation++;$('dataArea').hidden=true;$('dashboard').hidden=true;$('login').hidden=false;for(const id of ['dispatchList','dailyRows','stockRows','costRows'])$(id).replaceChildren();}
  function status(message,error=false){$('status').textContent=message;$('status').className='notice'+(error?' error':'');$('status').hidden=!message;}
  function dispatch(){
    if(!model)return;const query=$('shipmentSearch').value.trim().toLowerCase();let html='';
    for(const e of model.dispatches){
      const rows=M.arr(e.courierShipments),label=e.method==='courier'?'택배 발송':e.method==='box'?'박스 출고':'파렛트 출고';
      if(e.method==='courier'&&rows.length){
        for(const r of rows){if(query&&![r.tracking,r.recipient,r.address,r.product].join(' ').toLowerCase().includes(query))continue;html+=`<article class="shipment"><header><strong>${esc(r.recipient||'받는 분 미등록')}</strong><span class="tag">택배 발송</span></header><p>송장 ${esc(r.tracking||'미등록')}</p><p>${esc(r.address||'주소 미등록')}</p>${r.product?`<p>${esc(r.product)}</p>`:''}</article>`;}
      }
      const unlisted=e.method==='courier'?Math.max(0,(Number(e.count)||0)-rows.length):0;
      if((!rows.length||unlisted)&&(!query||String(e.product||'').toLowerCase().includes(query))){const count=e.method==='courier'?(unlisted||e.count):e.method==='box'?e.count:e.qty;html+=`<article class="shipment"><header><strong>${esc(e.product||label)}</strong><span class="tag">${label}</span></header><p>${esc(count||0)} ${e.method==='courier'?'건':e.method==='box'?'박스':'PLT'}${e.method==='courier'?' · 송장 상세 미등록':''}</p></article>`;}
    }
    $('dispatchList').innerHTML=html||`<div class="empty">${query?'검색 결과가 없습니다.':'오늘 등록된 출고가 없습니다.'}</div>`;
  }
  function render(data){
    model=M.calculate(data);const m=model,t=m.today,a=m.month;
    $('todayLabel').textContent=m.date.replaceAll('-','.');$('stock').innerHTML=num(m.stock)+'<small>PLT</small>';
    $('courierCount').innerHTML=num(t.courierCount)+'<small>건</small>';$('dispatchSub').textContent=`박스 ${num(t.boxCount)}개 · 파렛트 ${num(t.palletCount)} PLT`;
    $('todayCost').innerHTML=num(t.subtotal)+'<small>원</small>';$('monthCost').innerHTML=num(a.subtotal)+'<small>원</small>';
    $('todayVat').textContent='부가세 포함 '+won(t.total);$('monthRange').textContent=m.from+' ~ '+m.date;
    $('dispatchCounts').innerHTML=[['택배',t.courierCount,'건'],['박스 출고',t.boxCount,'박스'],['파렛트 출고',t.palletCount,'PLT']].map(([l,v,u])=>`<div><span>${l}</span><b>${num(v)}</b><small>${u}</small></div>`).join('');
    $('costRows').innerHTML=[['inbound','입고 하차비'],['courier','택배비'],['box','박스 출고비'],['pallet','파렛트 출고비'],['storage','보관료'],['other','기타비용'],['subtotal','공급가액 합계'],['vat','부가세'],['total','부가세 포함 합계']].map(([k,l])=>`<div class="cost-row ${k==='total'||k==='subtotal'?'emphasis':k==='vat'?'vat':''}"><span>${l}</span><span>${won(t[k])}</span><span>${won(a[k])}</span></div>`).join('');
    $('costNote').textContent=`보관료는 입고일과 출고일을 포함하며, 현재 설정 단가 ${won(Number(m.settings.storageFee)||0)}/PLT·일을 적용합니다. 월 누적은 이번 달 1일부터 오늘까지의 등록 자료 기준이며, 월말 확정 청구액과 다를 수 있습니다.`;
    $('dailyRows').innerHTML=m.days.map(d=>`<tr><td data-label="날짜">${d.date}${d.date===m.date?' · 오늘':''}</td><td data-label="택배" class="number">${num(d.courierCount)}건 / ${won(d.courier)}</td><td data-label="박스" class="number">${num(d.boxCount)}박스 / ${won(d.box)}</td><td data-label="보관료" class="number">${won(d.storage)}</td><td data-label="입출고·기타" class="number">${won(d.inbound+d.pallet+d.other)}</td><td data-label="합계" class="number">${won(d.subtotal)}</td></tr>`).join('');
    $('stockRows').innerHTML=m.stockEvents.filter(e=>M.delta(e)!==0).slice(0,30).map(e=>`<tr><td>${esc(e.date)}</td><td>${e.type==='in'?'입고':'출고'}</td><td>${esc(e.product||'상품')}</td><td class="number">${M.delta(e)>0?'+':''}${M.delta(e)} PLT</td></tr>`).join('')||'<tr><td colspan="4">등록된 재고 내역이 없습니다.</td></tr>';
    $('updated').textContent='마지막 확인 '+new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'});$('dataArea').hidden=false;dispatch();
  }
  async function refresh(){if(busy||!A.auth.currentUser)return;busy=true;$('refresh').disabled=true;const token=generation;status('최신 자료를 확인하고 있습니다.');try{const data=await A.json('jinjubulgyosa');if(token!==generation)return;if(!data?.settings)throw Error('등록된 물류 자료가 없습니다. 관리자에게 확인해 주세요.');render(data);status('');}catch(e){if(token!==generation)return;if(e.status===401||e.status===403){clear();$('authError').textContent=A.explain(e);await A.logout();}else{status('새로고침 실패: '+A.explain(e)+(model?' 아래는 마지막으로 확인한 자료입니다.':''),true);}}finally{busy=false;$('refresh').disabled=false;}}
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginButton').disabled=true;$('authError').textContent='';try{await A.login($('username').value,$('password').value);$('password').value='';}catch(error){$('authError').textContent=A.explain(error);}finally{$('loginButton').disabled=false;}});
  $('logout').onclick=async()=>{clear();await A.logout();};$('refresh').onclick=refresh;$('shipmentSearch').addEventListener('input',dispatch);
  A.auth.onAuthStateChanged(async user=>{clear();if(user){$('login').hidden=true;$('dashboard').hidden=false;await refresh();}});
  setInterval(()=>{if(!document.hidden)refresh();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
