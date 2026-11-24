/* Jinju event ledger. Only a confirmed administrator commit changes the source. */
(function(root){
 'use strict';
 const list=v=>Array.isArray(v)?v.filter(Boolean):Object.values(v||{}),copy=v=>JSON.parse(JSON.stringify(v));
 const dateOK=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 function number(v,label,min=1,integer=true){const n=Number(v);if(String(v??'').trim()===''||!Number.isFinite(n)||n<min||n>1000000||(integer&&!Number.isInteger(n)))throw Error(label+' 수량 또는 금액을 확인하세요.');return n;}
 function one(data,id){const a=list(data.events).filter(e=>id&&e.id===id);if(a.length!==1)throw Error('해당 내역을 식별할 수 없습니다. 다시 불러오세요.');return a[0];}
 function plain(v){const s=String(v??'').trim();if(s.length>2000||/[<>]/.test(s))throw Error('품목·메모는 꺾쇠 없이 2,000자 이내로 입력하세요.');return s;}
 // Compare daily balances. An unrelated historical shortage must not prevent a correction.
 function checkStock(old,next){
  const inv=old.productStock;if(!inv)return;
  const products=new Map(list(inv.products).map(p=>[p.id,p]));
  function ledger(d){const days=new Map();function add(date,id,q){if(date<inv.deductionStartDate)return;const m=days.get(date)||new Map();m.set(id,(m.get(id)||0)+q);days.set(date,m);}
   for(const m of list(d.productStock.movements))add(m.date,m.productId,Number(m.quantity));
   for(const e of list(d.events))for(const l of list(e.stockLines))add(e.date,l.productId,-Number(l.quantity));
   return days;}
  const a=ledger(old),b=ledger(next),dates=[...new Set([...a.keys(),...b.keys()])].sort();
  for(const [id,p] of products){let x=Number(p.opening||0),y=x;for(const date of dates){x+=a.get(date)?.get(id)||0;y+=b.get(date)?.get(id)||0;if(y<Math.min(0,x))throw Error(date+' '+p.name+' 재고가 부족합니다.');}}
 }
 function edit(data,id,patch){
  const next=copy(data),e=one(next,id),old=one(data,id),date=patch.date;
  if(!dateOK(date)||!/^($|([01]\d|2[0-3]):[0-5]\d)$/.test(patch.time||''))throw Error('날짜와 시간을 확인하세요.');
  const start=data.productStock?.deductionStartDate;if(start&&(e.date<start)!==(date<start))throw Error('제품 기준 재고를 넘겨 날짜를 변경할 수 없습니다.');
  if(e.date!==date){e.dateHistory=list(e.dateHistory);e.dateHistory.push({from:e.date,to:date,changedAt:Date.now()});}
  e.date=date;e.time=patch.time||'';e.memo=plain(patch.memo);
  const linked=list(e.stockLines),shipments=list(e.courierShipments);
  if(!linked.length)e.product=plain(patch.product)||'상품';
  if(e.type==='in'){if(!['20ft','40ft'].includes(patch.containerSize))throw Error('컨테이너 종류를 확인하세요.');e.containerSize=patch.containerSize;e.qty=number(patch.qty,'입고 PLT');}
  else if(e.type==='out'){
   if(['general','korean'].includes(e.method)){if(!['general','korean'].includes(patch.method))throw Error('출고 유형을 확인하세요.');e.method=patch.method;e.qty=number(patch.qty,'출고 PLT',0.1,false);}
   if(['box','courier'].includes(e.method)){e.deductPlt=number(patch.deductPlt,'차감 PLT',0,false);if(e.method==='box')e.boxRate=number(patch.boxRate,'박스 단가',0);}
   if(linked.length&&e.method!=='courier'){
    const products=new Map(list(data.productStock?.products).map(p=>[p.id,p])),seen=new Set();
    if(!patch.lines?.length)throw Error('출고 제품 한 개 이상을 입력하세요.');
    e.stockLines=patch.lines.map(l=>{if(!products.has(l.productId)||seen.has(l.productId))throw Error('출고 품목을 선택하고 중복된 행은 합쳐 주세요.');seen.add(l.productId);return {productId:l.productId,quantity:number(l.quantity,'제품 BOX')};});
    e.product=e.stockLines.map(l=>products.get(l.productId).name+' '+l.quantity+'BOX').join(', ');
   }
   if(e.method==='box')e.count=linked.length?e.stockLines.reduce((a,l)=>a+l.quantity,0):number(patch.count,'출고 BOX');
   if(e.method==='courier'&&!shipments.length&&!linked.length)e.count=number(patch.count,'택배 건수');
   if(e.method==='courier'&&!shipments.length&&patch.jejuCount!==undefined){e.jejuCount=number(patch.jejuCount,'제주 건수',0);if(e.jejuCount>e.count)throw Error('제주 건수는 전체 택배 건수 이하여야 합니다.');}
  }
  if(JSON.stringify(old)===JSON.stringify(e))throw Error('변경된 내용이 없습니다.');
  checkStock(data,next);return next;
 }
 function remove(data,id,archiveId){const next=copy(data),e=one(next,id);
  if(!next.productStock)throw Error('제품 재고를 먼저 불러오세요.');
  next.events=list(next.events).filter(r=>r.id!==id);
  const a=list(next.productStock.deletedHistory);a.push({id:archiveId,type:'event',sourceId:id,date:e.date,label:(e.type==='in'?'입고':'출고')+' · '+(e.product||'상품'),deletedAt:Date.now(),events:[e]});next.productStock.deletedHistory=a;
  checkStock(data,next);return next;}
 function restore(data,id){const next=copy(data),a=list(next.productStock?.deletedHistory).find(a=>a.id===id&&a.type==='event'),e=list(a?.events)[0];if(!e)throw Error('복원할 내역이 없습니다.');
  if(list(next.events).some(r=>r.id===e.id))throw Error('동일한 내역이 이미 있습니다.');
  const norm=t=>String(t||'').replace(/[\s-]/g,''),tracks=new Set(list(next.events).flatMap(r=>list(r.courierShipments).map(s=>norm(s.tracking))));
  if(list(e.courierShipments).some(s=>tracks.has(norm(s.tracking))))throw Error('동일한 송장이 다시 등록되어 있습니다.');
  next.events=[...list(next.events),e];next.productStock.deletedHistory=list(next.productStock.deletedHistory).filter(r=>r.id!==id);checkStock(data,next);return next;}
 const api={edit,remove,restore};if(typeof module==='object'&&module.exports){module.exports=api;return;}
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const body=$('allEventsBody'),card=body.closest('.card'),box=document.createElement('div'),archive=document.createElement('details');
 box.id='eventLedgerEditor';box.hidden=true;box.className='card p-4 mb-3';card.insertBefore(box,card.querySelector('.overflow-x-auto'));card.appendChild(archive);
 const info=document.createElement('p');info.setAttribute('role','status');card.insertBefore(info,box);
 const access=document.createElement('a');access.href='https://ts3pl-wms.onrender.com/manage/jinjubulgyosa';access.textContent='관리자 화면에서 입출고 수정·삭제 →';card.insertBefore(access,info);
 let allowed=false,busy=false,active=null;
 const ready=()=>allowed&&!busy&&window.JinjuStockSync.ready();
 const btn=(label,attr,disabled=false)=>'<button type="button" class="btn-ghost px-3 py-2 text-xs font-bold" '+attr+(disabled?' disabled':'')+'>'+label+'</button>';
 const hosted=typeof portalBridge!=='undefined';
 const requested=hosted?new URLSearchParams(location.search):null;
 let dispatched=false;
 function handleRequested(){if(dispatched||!ready()||!requested?.has('ledgerAction'))return;dispatched=true;switchTab('events');const action=requested.get('ledgerAction');if(['edit','remove'].includes(action))open(action,requested.get('ledgerId'));}
 const jump=(action,id,label)=>'<a class="btn-ghost px-3 py-2 text-xs font-bold" href="https://ts3pl-wms.onrender.com/admin?ledgerAction='+action+'&amp;ledgerId='+encodeURIComponent(id)+'">'+label+'</a>';
 function actions(id){return hosted?btn('수정','data-event-edit="'+esc(id)+'"',!ready())+' '+btn('삭제','data-event-remove="'+esc(id)+'"',!ready()):jump('edit',id,'수정')+' '+jump('remove',id,'삭제');}
 const recent=$('recentEventsBody');recent.closest('table').querySelector('thead tr').insertAdjacentHTML('beforeend','<th class="no-print">관리</th>');
 function paint(){access.hidden=allowed;archive.innerHTML='<summary>삭제한 입출고 내역 · 복원</summary>'+list(state.productStock?.deletedHistory).filter(a=>a.type==='event').map(a=>'<p>'+esc(a.date)+' · '+esc(a.label)+' '+btn('복원','data-restore="'+esc(a.id)+'"',!ready())+'</p>').join('');if(!archive.querySelector('p'))archive.insertAdjacentHTML('beforeend','<p>삭제한 입출고 내역이 없습니다.</p>');}
 const prevTable=renderEventsTable;renderEventsTable=function(){prevTable();paint();handleRequested();};
 eventRowHtml=function(e,manage){return '<tr><td><span class="'+(e.type==='in'?'badge-in':'badge-out')+'">'+(e.type==='in'?'입고':'출고')+'</span></td><td>'+esc(e.date)+' '+esc(e.time)+'</td><td>'+esc(e.product)+'</td><td>'+esc(eventTypeLabel(e))+'</td><td>'+esc(eventQtyLabel(e))+'</td><td>'+esc(won(eventFee(e)))+'</td><td>'+esc(e.memo)+'</td>'+'<td class="no-print">'+actions(e.id)+'</td>'+'</tr>';};
 function close(){box.hidden=true;box.replaceChildren();active=null;}
 const field=(name,label,value,type='text',extra='')=>'<label>'+label+' <input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
 const opts=(arr,val)=>arr.map(([k,n])=>'<option value="'+esc(k)+'" '+(k===val?'selected':'')+'>'+esc(n)+'</option>').join('');
 function line(l={}){return '<div data-line><select aria-label="출고 제품">'+opts([['','제품 선택'],...list(state.productStock?.products).map(p=>[p.id,p.name])],l.productId||'')+'</select> '+field('lineqty','BOX',l.quantity??1,'number','min="1" step="1"')+' '+btn('행 제거','data-drop')+'</div>';}
 function open(action,id){if(!ready())return;try{const e=action==='restore'?list(list(state.productStock.deletedHistory).find(a=>a.id===id)?.events)[0]:one(state,id);if(!e)throw Error('내역을 다시 불러오세요.');
  active={action,id,version:JSON.stringify(state)};info.textContent='';box.hidden=false;
  let html='<strong>'+esc(e.date)+' · '+esc(eventTypeLabel(e))+' · '+esc(e.product)+' — '+({edit:'수정',remove:'삭제',restore:'복원'}[action])+'</strong>';
  if(action==='edit'){html+='<div style="display:flex;flex-wrap:wrap;gap:12px;margin:14px 0">'+field('date','일자',e.date,'date')+field('time','시간',e.time,'time')+field('memo','메모',e.memo);
   const lines=list(e.stockLines);if(!lines.length)html+=field('product','품목',e.product);
   if(e.type==='in')html+='<label>컨테이너 <select name="containerSize">'+opts([['20ft','20FT'],['40ft','40FT']],e.containerSize||'20ft')+'</select></label>'+field('qty','입고 PLT',e.qty,'number','min="1"');
   if(['general','korean'].includes(e.method))html+='<label>유형 <select name="method">'+opts([['general','일반파렛트'],['korean','한국파렛트']],e.method)+'</select></label>'+field('qty','출고 PLT',e.qty,'number','min="0.1" step="0.1"');
   if(['box','courier'].includes(e.method))html+=field('deductPlt','차감 PLT',e.deductPlt||0,'number','min="0" step="any"');
   if(e.method==='box')html+=field('boxRate','박스당 단가',boxRate(e),'number','min="0"');
   if(e.method==='courier'&&(list(e.courierShipments).length||lines.length))html+='<span>피킹 등록 '+esc(e.count)+'건 · 송장과 연결된 건수·품목은 유지됩니다.</span>';
   else if(['box','courier'].includes(e.method)&&!lines.length)html+=field('count',e.method==='box'?'BOX':'택배 건수',e.count,'number','min="1"');
   if(e.method==='courier'&&!list(e.courierShipments).length)html+=field('jejuCount','제주 건수 (전체에 포함)',e.jejuCount??0,'number','min="0" step="1"');
   html+='</div>';if(lines.length&&e.method!=='courier')html+='<div id="eventEditLines">'+lines.map(line).join('')+'</div>'+btn('품목 추가','data-add');
  }else{html+='<p>'+esc(eventQtyLabel(e))+' · 작업비 '+esc(won(eventFee(e)))+' · '+esc(e.memo)+'</p>';
   const details=list(e.stockLines).map(l=>(list(state.productStock?.products).find(p=>p.id===l.productId)?.name||l.productId)+' '+l.quantity+' BOX').join(', ');if(details)html+='<p>연결 제품: '+esc(details)+'</p>';
   html+='<p>이 등록 건 전체의 재고 차감·송장 조회·작업비가 함께 '+(action==='remove'?'취소':'복원')+'됩니다. 별도 등록한 제품 입고·기타비용은 유지됩니다.</p>';}
  box.innerHTML=html+'<p data-error role="status"></p>'+btn(action==='edit'?'수정 저장':action==='remove'?'삭제 저장':'복원 저장','data-apply')+' '+btn('취소','data-cancel');box.scrollIntoView({block:'center'});
 }catch(err){info.textContent=err.message;}}
 for(const table of [recent,body])table.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const edit=b.hasAttribute('data-event-edit');if(!edit&&!b.hasAttribute('data-event-remove'))return;switchTab('events');open(edit?'edit':'remove',edit?b.dataset.eventEdit:b.dataset.eventRemove);});
 archive.onclick=e=>{const b=e.target.closest('[data-restore]');if(b)open('restore',b.dataset.restore);};
 box.onclick=async e=>{const b=e.target.closest('button');if(!b||busy)return;if(b.hasAttribute('data-cancel'))return close();if(b.hasAttribute('data-add'))return $('eventEditLines').insertAdjacentHTML('beforeend',line());if(b.hasAttribute('data-drop'))return b.closest('[data-line]').remove();if(!b.hasAttribute('data-apply')||!ready()||!active)return;
  try{if(JSON.stringify(state)!==active.version)throw Error('자료가 바뀌었습니다. 취소한 뒤 최신 내역을 다시 열어 주세요.');
   const {action,id}=active;let next;
   if(action==='edit'){const p=Object.fromEntries([...box.querySelectorAll('[name]')].map(el=>[el.name,el.value]));p.lines=[...box.querySelectorAll('[data-line]')].map(r=>({productId:r.querySelector('select').value,quantity:r.querySelector('input').value}));next=edit(state,id,p);}else next=action==='remove'?remove(state,id,crypto.randomUUID()):restore(state,id);
   busy=true;b.disabled=true;await window.JinjuStockSync.commit(next);close();info.textContent=({edit:'수정',remove:'삭제',restore:'복원'}[action])+'한 입출고 내역을 저장했습니다.';
  }catch(err){box.querySelector('[data-error]').textContent=err.message;}finally{busy=false;b.disabled=false;renderAll();}};
 renderDashboardCurrentRows();renderEventsTable();function renderDashboardCurrentRows(){const events=list(state.events).slice().sort((a,b)=>(b.date+(b.time||'')).localeCompare(a.date+(a.time||''))).slice(0,8);if(events.length)recent.innerHTML=events.map(e=>eventRowHtml(e,false)).join('');}if(typeof portalBridge!=='undefined')portalBridge.session.then(s=>{allowed=s.key==='jinjubulgyosa'&&s.writable===true;renderDashboardCurrentRows();renderEventsTable();}).catch(()=>{});
})(typeof window==='object'?window:globalThis);
