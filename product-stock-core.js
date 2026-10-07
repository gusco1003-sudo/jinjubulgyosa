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
  const api={key,list,balances,resolve,item,plan,stockShipments};if(typeof module==='object'&&module.exports)module.exports=api;else root.JinjuStockCore=api;
})(typeof window==='object'?window:globalThis);
