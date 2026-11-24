/* Jinju parcel pricing: one Jeju surcharge per unique waybill, never per item. */
(function(root){
 'use strict';
 const SURCHARGE=3000;
 const list=v=>Array.isArray(v)?v.filter(Boolean):Object.values(v||{}).filter(Boolean);
 const count=v=>Math.max(0,Math.floor(Number(v)||0));
 const tracking=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
 function isJeju(address){
  const s=String(address??'').trim().replace(/^(?:\(\d{5,6}\)|\d{5,6})\s*/,'');
  return /^(?:제주특별자치도|제주도|(?:제주|제주시|서귀포시)(?=\s|$))/.test(s);
 }
 function unique(shipments){const seen=new Set();return list(shipments).filter(s=>{const k=tracking(s.tracking);if(!k||seen.has(k))return false;seen.add(k);return true;});}
 function event(e,rate=3300){
  const n=count(e.count),ships=unique(e.courierShipments);
  const jeju=Math.min(n,ships.length?ships.filter(s=>isJeju(s.address)).length:count(e.jejuCount));
  const known=ships.filter(s=>String(s.address??'').trim()).length;
  const unknown=ships.length?Math.max(0,n-known):e.jejuCount==null?n:0;
  const base=n*Math.max(0,Number(rate)||0),extra=jeju*SURCHARGE;
  return {count:n,jeju,unknown,base,extra,total:base+extra};
 }
 function shipments(rows,rate=3300){const s=unique(rows);return event({count:s.length,courierShipments:s},rate);}
 const api={SURCHARGE,isJeju,unique,event,shipments};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JinjuCourierFees=api;
})(typeof window==='object'?window:globalThis);
