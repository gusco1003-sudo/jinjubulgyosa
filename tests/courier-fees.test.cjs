const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

const F=require('../courier-fees.js');
const C=require('../courier-import.js');
const L=require('../event-ledger.js');
for(const a of ['제주특별자치도 제주시 연삼로 10','제주도 서귀포시 10','제주시 중앙로 10','서귀포시 대정읍 10','제주 서귀포시 10','(63000) 제주특별자치도 제주시 10','63000 제주특별자치도제주시 10'])assert(F.isJeju(a),a);
for(const a of ['',null,'서울특별시 강남구 제주로 10','경기도 광주시 제주식당','제주시장','부산시 중앙로 10'])assert(!F.isJeju(a),a);
const parsed=C.parseSheets([{name:'피킹',rows:[['송장번호','받는분','주소','상품명','수량'],['12345678','A','제주특별자치도 제주시 연삼로 10','밀초',2],['12345678','A','제주특별자치도 제주시 연삼로 10','원백',1],['23456789','B','서울특별시 중구 청계천로 10','밀초',1]]}]);
assert.deepEqual(parsed.errors,[]);assert.equal(parsed.shipments.length,2);assert.equal(parsed.duplicateRows,1);
const event={id:'e',type:'out',method:'courier',date:'2026-11-24',count:2,courierShipments:parsed.shipments,stockLines:[{productId:'p',quantity:4}]};
assert.deepEqual(F.event(event),{count:2,jeju:1,unknown:0,base:6600,extra:3000,total:9600});
assert.equal(F.shipments([...parsed.shipments,parsed.shipments[0]]).total,9600);
assert.equal(C.splitNew(parsed.shipments,[event]).fresh.length,0);
const saved=JSON.stringify(event);assert.equal(F.event(event,4000).total,11000);assert.equal(JSON.stringify(event),saved);
const old=structuredClone(event);old.courierShipments[0].address='';
assert.equal(F.event(old).unknown,1);assert.equal(F.event(old).total,6600);C.enrich(parsed.shipments,[old]);assert.equal(F.event(old).total,9600);C.enrich(parsed.shipments,[old]);assert.equal(F.event(old).total,9600);assert.deepEqual(old.stockLines,event.stockLines);
assert.equal(F.event({count:3,jejuCount:2}).total,15900);assert.equal(F.event({count:3}).unknown,3);
const data={events:[{id:'manual',type:'out',method:'courier',date:'2026-11-24',count:3,jejuCount:1}],productStock:{deletedHistory:[]}};
const edited=L.edit(data,'manual',{date:'2026-11-24',time:'',memo:'',count:3,jejuCount:2,deductPlt:0,product:'택배'});
assert.equal(F.event(edited.events[0]).total,15900);
assert.throws(()=>L.edit(data,'manual',{date:'2026-11-24',count:3,jejuCount:4,deductPlt:0}),/제주/);
const deleted=L.remove(edited,'manual','archive');const restored=L.restore(deleted,'archive');assert.equal(F.event(restored.events[0]).total,15900);

