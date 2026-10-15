(function(root){
  'use strict';
  const key=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s_()\-]/g,'');
  const list=v=>Array.isArray(v)?v.filter(Boolean):Object.values(v||{});
  function balances(data){
    const inventory=data.productStock;if(!inventory)return [];
    const rows=list(inventory.products).map(p=>({...p,incoming:0,outgoing:0,adjustment:0,balance:Number(p.opening)}));const byId=new Map(rows.map(r=>[r.id,r]));
    for(const move of list(inventory.movements)){const r=byId.get(move.productId);if(!r)throw Error('등록되지 않은 제품의 재고 이력이 있습니다.');const q=Number(move.quantity);if(!Number.isSafeInteger(q))throw Error('재고 이력 수량을 확인해 주세요.');r.adjustment+=q;r.balance+=q;}
    for(const e of list(data.events))for(const line of list(e.stockLines)){const r=byId.get(line.productId);if(!r)throw Error('출고 품목이 재고표에 없습니다.');const q=Number(line.quantity);if(!Number.isSafeInteger(q)||q<=0)throw Error('출고 수량을 확인해 주세요.');r.outgoing+=q;r.balance-=q;}
    return rows;
  }
  function resolve(inventory,product,selections={}){
    const k=key(product),chosen=selections[k];
    if(chosen)return list(inventory.products).find(p=>p.id===chosen)||null;
    const matches=list(inventory.products).filter(p=>[p.name,...list(p.aliases)].some(n=>key(n)===k));
    return matches.length===1?matches[0]:null;
  }
  function item(product,rawQuantity){
    let name=String(product??'').trim(),embedded=null;
    const match=name.match(/^(.*?)\s*\/\s*(\d+)\s*(?:개|박스|box)\s*$/i);
    if(match){name=match[1].trim();embedded=Number(match[2]);}
    const raw=String(rawQuantity??'').trim().replaceAll(',','');
    const q=raw===''?embedded:/^\d+(?:\.0+)?$/.test(raw)?Number(raw):NaN;
    return {product:name,quantity:q,error:!name?'품목명이 없습니다.':/\/\s*\d+\s*(개|박스|box)/i.test(name)?'한 행에 여러 품목이 있습니다. 제품별로 행을 나눠 주세요.':!Number.isSafeInteger(q)||q<=0?'박스 수량을 1 이상의 정수로 확인해 주세요.':embedded!==null&&raw!==''&&embedded!==q?'수량 열과 품목명에 적힌 수량이 다릅니다. 확인해 주세요.':''};
  }
  function plan(data,shipments,date,selections={}){
    const inventory=data.productStock,errors=[],lines=new Map();
    if(!inventory)return {lines:[],errors:['제품별 기준 재고가 아직 등록되지 않았습니다.']};
    if(date<(inventory.deductionStartDate||inventory.baselineDate))return {lines:[],errors:[]};
    const seen=new Set();
    for(const s of shipments){
      for(const i of list(s.items)){
        const p=resolve(inventory,i.product,selections);
        if(i.error){errors.push(`${s.tracking}: ${i.error}`);continue;}
        if(!Number.isSafeInteger(i.quantity)||i.quantity<=0){errors.push(`${s.tracking}: 박스 수량을 확인해 주세요.`);continue;}
        if(!p){errors.push(`${i.product||'품명 없음'}: 재고 제품을 선택해 주세요.`);continue;}
        const rowKey=s.tracking+'|'+p.id+'|'+i.quantity;
        if(seen.has(rowKey)){errors.push(`${s.tracking} / ${p.name}: 같은 제품·수량의 행이 반복됩니다. 중복 행을 확인해 주세요.`);continue;}
        seen.add(rowKey);const old=lines.get(p.id)||{productId:p.id,name:p.name,quantity:0};old.quantity+=i.quantity;lines.set(p.id,old);
      }
      if(!list(s.items).length)errors.push(`${s.tracking}: 제품별 수량 정보가 없습니다.`);
    }
    const stock=new Map(balances(data).map(p=>[p.id,p.balance]));
    for(const line of lines.values()){line.before=stock.get(line.productId);line.after=line.before-line.quantity;if(line.after<0)errors.push(`${line.name}: 재고 ${line.before}박스 / 요청 ${line.quantity}박스, 재고가 부족합니다.`);}
    return {lines:[...lines.values()],errors:[...new Set(errors)]};
  }
  function stockShipments(data,target,shipments,infoOnly){
    if(infoOnly)return [];
    if(target&&(list(data.productStock?.baselineEventIds).includes(target.id)||list(target.stockLines).length))return [];
    return shipments;
  }
  function manualPlan(data,rows){
    if(!data.productStock)return {lines:[],errors:['제품별 기준 재고를 먼저 불러와 주세요.']};
    const products=new Map(balances(data).map(p=>[p.id,p])),totals=new Map(),errors=[];
    if(!rows.length)errors.push('출고할 제품을 추가해 주세요.');
    rows.forEach((r,i)=>{const p=products.get(r.productId),q=Number(r.quantity);if(!p)errors.push(`${i+1}번째 제품을 선택해 주세요.`);if(!Number.isSafeInteger(q)||q<=0)errors.push(`${i+1}번째 제품의 BOX 수량을 양의 정수로 입력하세요.`);if(p&&Number.isSafeInteger(q)&&q>0)totals.set(p.id,(totals.get(p.id)||0)+q);});
    const lines=[...totals].map(([productId,quantity])=>{const p=products.get(productId);if(!Number.isSafeInteger(quantity)||quantity>p.balance)errors.push(`${p.name}: 현재 ${p.balance} BOX로 출고 수량이 재고보다 많습니다.`);return {productId,name:p.name,quantity,before:p.balance,after:p.balance-quantity};});
    return {lines,errors};
  }
  function addProduct(data,input,id,date,createdAt=Date.now()){
    if(!data?.productStock)throw Error('제품별 기준 재고를 먼저 불러와 주세요.');
    const name=String(input.name??'').trim(),quantity=Number(input.quantity),rawCapacity=String(input.boxesPerPallet??'').trim(),capacity=rawCapacity===''?null:Number(rawCapacity);
    if(!name||name.length>100||!key(name))throw Error('품목명은 1~100자로 입력하세요.');
    if(String(input.quantity??'').trim()===''||!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000)throw Error('현재 BOX는 0 이상 1,000,000 이하 정수로 입력하세요.');
    if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<1||capacity>1000000))throw Error('파렛트당 BOX는 1 이상의 정수로 입력하거나 비워두세요.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<data.productStock.deductionStartDate)throw Error('품목 등록일을 확인하세요.');
    const products=list(data.productStock.products),aliases=String(input.aliases??'').split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
    if(aliases.length>20||aliases.some(s=>s.length>100||!key(s)))throw Error('피킹리스트 별칭은 100자 이내로 최대 20개 입력하세요.');
    const names=[name,...aliases],normalized=names.map(key),existing=new Set(products.flatMap(p=>[p.name,...list(p.aliases)].map(key)));
    if(new Set(normalized).size!==normalized.length||normalized.some(n=>existing.has(n)))throw Error('이미 등록된 품목명 또는 별칭입니다. 기존 품목의 재고 입고·조정을 사용하세요.');
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||products.some(p=>p.id===id))throw Error('품목 식별자를 확인하세요.');
    const next=JSON.parse(JSON.stringify(data));next.productStock.products=list(next.productStock.products);
    next.productStock.products.push({id,name,aliases,opening:0,referencePallets:null,boxesPerPallet:capacity,createdAt,createdDate:date});
    if(quantity){next.productStock.movements=list(next.productStock.movements);next.productStock.movements.push({id:'initial-'+id,date,productId:id,quantity,reason:'신규 품목 등록 · 현재 재고',createdAt});}
    next.lastModified=createdAt;return next;
  }
  const api={key,list,balances,resolve,item,plan,stockShipments,manualPlan,addProduct};if(typeof module==='object'&&module.exports)module.exports=api;else root.JinjuStockCore=api;
})(typeof window==='object'?window:globalThis);
