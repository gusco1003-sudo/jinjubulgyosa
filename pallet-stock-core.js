/* Shared Jinju daily storage calculation. Source records are never rewritten. */
(function(root){
 'use strict';
 const list=v=>Array.isArray(v)?v.filter(Boolean):Object.values(v||{});
 const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 const next=d=>new Date(Date.parse(d+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 function delta(e){return e.type==='in'?Number(e.qty||0):e.method==='courier'||e.method==='box'?-Number(e.deductPlt||0):-Number(e.qty||0);}
 function equivalent(products,balances){
  let total=0;
  for(const p of products){const q=balances[p.id]||0,c=Number(p.boxesPerPallet);
   if(!Number.isSafeInteger(q)||q<0)throw Error(p.name+': 날짜별 박스 재고를 확인하세요.');
   if(q&&(!Number.isSafeInteger(c)||c<=0))throw Error(p.name+': 1 PLT당 BOX 기준을 입력하세요.');
   if(q)total+=q/c;
  }
  // Round only after combining mixed pallets. Avoid binary noise at integers.
  return {equivalent:total,pallets:Math.ceil(total-1e-9)};
 }
 function calculate(data,from,to,asOf){
  if(!valid(from)||!valid(to)||!valid(asOf))throw Error('정산 날짜를 확인하세요.');
  to=to<asOf?to:asOf;
  const events=list(data.events),inv=data.productStock,products=list(inv?.products),hasProducts=!!inv&&valid(inv.baselineDate)&&valid(inv.deductionStartDate);
  const startCandidates=events.filter(e=>valid(e.date)).map(e=>e.date);
  if(hasProducts)startCandidates.push(inv.baselineDate);
  const start=startCandidates.sort()[0];
  if(!start||from>to||start>to)return {total:0,plDays:0,segments:[],days:[],current:0,products:[]};
  const ins={},outs={},changes={},balances={};
  for(const e of events){if(!valid(e.date))continue;const n=delta(e);if(!Number.isFinite(n))throw Error('파렛트 입출고 수량을 확인하세요.');const dest=n>0?ins:outs;dest[e.date]=(dest[e.date]||0)+n;}
  if(hasProducts){
   for(const p of products){if(!p.id||Object.hasOwn(balances,p.id))throw Error('제품 식별자를 확인하세요.');balances[p.id]=Number(p.opening||0);}
   function add(date,id,q){if(!valid(date)||!Object.hasOwn(balances,id)||!Number.isSafeInteger(q))throw Error('제품별 재고 이력을 확인하세요.');if(date<inv.deductionStartDate)return;const d=changes[date]||(changes[date]={});d[id]=(d[id]||0)+q;}
   for(const m of list(inv.movements))add(m.date,m.productId,Number(m.quantity));
   for(const e of events)for(const l of list(e.stockLines))add(e.date,l.productId,-Number(l.quantity));
  }
  const days=[],segments=[];let ledger=0,current=0,rate=Number(data.settings?.storageFee??900),finalEquivalent=0;
  if(!Number.isFinite(rate)||rate<0)throw Error('보관료 단가를 확인하세요.');
  for(let day=start;day<=to;day=next(day)){
   ledger=Math.max(0,ledger+(ins[day]||0));const legacy=ledger;ledger=Math.max(0,ledger+(outs[day]||0));
   if(hasProducts&&day>=inv.deductionStartDate)for(const [id,q] of Object.entries(changes[day]||{}))balances[id]+=q;
   let qty=legacy,basis='ledger';current=ledger;
   if(hasProducts&&day>=inv.deductionStartDate){const r=equivalent(products,balances);qty=r.pallets;current=r.pallets;finalEquivalent=r.equivalent;basis='boxes';}
   if(day<from)continue;
   const row={date:day,qty,legacy,rate,amount:qty*rate,basis};days.push(row);
   const last=segments[segments.length-1];
   if(last&&last.balance===qty&&last.basis===basis){last.end=day;last.days++;last.fee+=row.amount;}
   else segments.push({start:day,end:day,balance:qty,days:1,fee:row.amount,rate,basis});
  }
  return {total:days.reduce((n,d)=>n+d.amount,0),plDays:days.reduce((n,d)=>n+d.qty,0),segments,days,current,equivalent:finalEquivalent,effectiveDate:hasProducts?inv.deductionStartDate:null,products:products.map(p=>({...p,balance:balances[p.id]}))};
 }
 const api={calculate,equivalent};if(typeof module==='object'&&module.exports)module.exports=api;else root.JinjuPalletCore=api;
})(typeof window==='object'?window:globalThis);
