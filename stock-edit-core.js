(function(root){
 'use strict';
 const S=root.JinjuStockCore||(typeof require==='function'?require('./product-stock-core.js'):null);
 const P=root.JinjuPalletCore||(typeof require==='function'?require('./pallet-stock-core.js'):null);
 const copy=v=>JSON.parse(JSON.stringify(v)),list=S.list;
 function validate(data,today){
  if(!data.productStock)throw Error('제품 재고를 먼저 불러오세요.');
  for(const p of S.balances(data))if(p.balance<0)throw Error(p.name+': 삭제하거나 복원하면 재고가 음수가 됩니다. 연결된 출고를 먼저 확인하세요.');
  const end=[today,...list(data.events).map(e=>e.date),...list(data.productStock.movements).map(m=>m.date)].sort().at(-1);
  P.calculate(data,data.productStock.baselineDate,end,end);
  return data;
 }
 function setQuantity(data,productId,value,today,id){
  const p=S.balances(data).find(p=>p.id===productId),q=Number(value);
  if(!p)throw Error('제품을 찾을 수 없습니다.');
  if(String(value).trim()===''||!Number.isSafeInteger(q)||q<0||q>1000000)throw Error('현재 BOX는 0~1,000,000 사이의 정수로 입력하세요.');
  if(today<data.productStock.deductionStartDate)throw Error('재고 기준일 이후에 수정할 수 있습니다.');
  if(q===p.balance)throw Error('현재 재고와 같은 수량입니다.');
  const next=copy(data);next.productStock.movements=list(next.productStock.movements);
  if(next.productStock.movements.some(m=>m.id===id))throw Error('중복 저장 요청입니다.');
  next.productStock.movements.push({id,date:today,productId,quantity:q-p.balance,reason:`재고 수정 · ${p.balance} → ${q} BOX`,kind:'quantity-edit',before:p.balance,after:q,createdAt:Date.now()});
  return validate(next,today);
 }
 function records(data){
  const result=[];
  for(const e of list(data.events))for(const l of list(e.stockLines))result.push({type:'event',id:e.id,date:e.date,productId:l.productId,quantity:-Number(l.quantity),kind:e.method==='courier'?'택배 출고':e.method==='box'?'박스 출고':'파렛트 출고',reason:e.product||e.memo||'출고'});
  for(const m of list(data.productStock?.movements))result.push({...m,type:m.returnId?'return':'movement',id:m.returnId||m.id,kind:m.returnId?'반품':m.kind==='quantity-edit'?'재고 수정':m.quantity>0?'입고·증가':'출고·감소'});
  return result;
 }
 function remove(data,type,id,today,archiveId){
  const next=copy(data),archive={id:archiveId,type,sourceId:id,deletedAt:Date.now(),events:[],movements:[],costs:[]};
  if(!id)throw Error('내역 식별자가 없습니다.');
  if(type==='event'){
   archive.events=list(next.events).filter(e=>e.id===id);
   next.events=list(next.events).filter(e=>e.id!==id);
  }else if(type==='return'){
   archive.costs=list(next.costs).filter(c=>c.id===id&&c.kind==='return');
   archive.movements=list(next.productStock.movements).filter(m=>m.returnId===id);
   next.costs=list(next.costs).filter(c=>!archive.costs.some(a=>a.id===c.id));
   next.productStock.movements=list(next.productStock.movements).filter(m=>m.returnId!==id);
  }else if(type==='movement'){
   archive.movements=list(next.productStock.movements).filter(m=>m.id===id&&!m.returnId);
   next.productStock.movements=list(next.productStock.movements).filter(m=>!archive.movements.some(a=>a.id===m.id));
  }else throw Error('삭제할 내역 종류를 확인하세요.');
  if(!archive.events.length&&!archive.movements.length)throw Error('내역이 이미 삭제되었거나 변경되었습니다.');
  archive.date=(archive.events[0]||archive.movements[0]).date;
  archive.label=type==='event'?(archive.events[0].product||'출고'):type==='return'?'반품':archive.movements[0].reason||'재고 변동';
  next.productStock.deletedHistory=list(next.productStock.deletedHistory);
  if(next.productStock.deletedHistory.some(a=>a.id===archiveId))throw Error('중복 삭제 요청입니다.');
  next.productStock.deletedHistory.push(archive);
  return validate(next,today);
 }
 function restore(data,id,today){
  const next=copy(data),a=list(next.productStock?.deletedHistory).find(a=>a.id===id);
  if(!a)throw Error('복원할 내역을 찾을 수 없습니다.');
  const normalize=v=>String(v||'').replace(/[\s-]/g,'');
  const tracking=new Set(list(next.events).flatMap(e=>list(e.courierShipments).map(s=>normalize(s.tracking))));
  if(list(a.events).some(e=>list(e.courierShipments).some(s=>tracking.has(normalize(s.tracking)))))throw Error('같은 송장이 다시 등록되어 있습니다. 중복 출고를 확인한 뒤 복원하세요.');
  for(const [owner,key,values] of [[next,'events',a.events],[next,'costs',a.costs],[next.productStock,'movements',a.movements]]){
   owner[key]=list(owner[key]);for(const v of list(values)){if(owner[key].some(r=>r.id===v.id))throw Error('이미 같은 내역이 있습니다.');owner[key].push(v);}
  }
  next.productStock.deletedHistory=list(next.productStock.deletedHistory).filter(a=>a.id!==id);
  return validate(next,today);
 }
 const api={setQuantity,records,remove,restore,validate};if(typeof module==='object'&&module.exports)module.exports=api;else root.JinjuStockEdit=api;
})(typeof window==='object'?window:globalThis);
