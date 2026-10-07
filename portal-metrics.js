(function(root){
  'use strict';
  const arr=v=>Array.isArray(v)?v.filter(Boolean):Object.values(v||{});
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const day=d=>new Date(d+'T00:00:00Z');
  const date=d=>d.toISOString().slice(0,10);
  const next=d=>date(new Date(day(d).getTime()+86400000));
  function today(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
  function delta(e){return e.type==='in'?n(e.qty):-(e.method==='box'||e.method==='courier'?n(e.deductPlt):n(e.qty));}
  function fee(e,s){if(e.type==='in')return n(s.containerFee?.[e.containerSize||'20ft']);if(e.method==='box')return n(e.count)*n(e.boxRate??s.outboundFee?.box??400);if(e.method==='courier')return n(e.count)*n(s.outboundFee?.courier);return n(e.qty)*n(s.outboundFee?.[e.method]);}
  function calculate(data,asOf=today()){
    const s=data.settings||{},events=arr(data.events).filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&e.date<=asOf),costs=arr(data.costs),from=asOf.slice(0,7)+'-01';
    const buckets={};const get=d=>buckets[d]||(buckets[d]={date:d,storage:0,inbound:0,courier:0,box:0,pallet:0,other:0,courierCount:0,boxCount:0,palletCount:0});
    const ins={},outs={};
    for(const e of events){const value=delta(e);if(value>0)ins[e.date]=(ins[e.date]||0)+value;else outs[e.date]=(outs[e.date]||0)+value;}
    let balance=0;
    const earliest=events.map(e=>e.date).sort()[0]||from;
    for(let d=earliest<from?earliest:from;d<=asOf;d=next(d)){
      balance=Math.max(0,balance+(ins[d]||0));
      if(d>=from)get(d).storage=balance*n(s.storageFee);
      balance=Math.max(0,balance+(outs[d]||0));
    }
    for(const e of events.filter(e=>e.date>=from)){
      const b=get(e.date),key=e.type==='in'?'inbound':e.method==='courier'?'courier':e.method==='box'?'box':'pallet';b[key]+=fee(e,s);
      if(e.type==='out'){if(e.method==='courier')b.courierCount+=n(e.count);else if(e.method==='box')b.boxCount+=n(e.count);else b.palletCount+=n(e.qty);}
    }
    for(const c of costs)if(c.date>=from&&c.date<=asOf)get(c.date).other+=n(c.amount);
    const days=Object.values(buckets).sort((a,b)=>b.date.localeCompare(a.date));
    const sum={storage:0,inbound:0,courier:0,box:0,pallet:0,other:0,courierCount:0,boxCount:0,palletCount:0};
    const finish=b=>{b.subtotal=b.storage+b.inbound+b.courier+b.box+b.pallet+b.other;b.vat=b.subtotal*n(s.vatRate??.1);b.total=b.subtotal+b.vat;return b;};
    for(const b of days){for(const k of Object.keys(sum))sum[k]+=b[k];finish(b);}
    const current=events.reduce((total,e)=>total+delta(e),0);
    return {date:asOf,from,stock:current,today:finish(get(asOf)),month:finish(sum),days,dispatches:events.filter(e=>e.date===asOf&&e.type==='out'),stockEvents:events.slice().sort((a,b)=>(b.date+(b.time||'')).localeCompare(a.date+(a.time||''))),settings:s};
  }
  const api={calculate,today,fee,delta,arr};if(typeof module==='object'&&module.exports)module.exports=api;else root.JinjuMetrics=api;
})(typeof window==='object'?window:globalThis);
