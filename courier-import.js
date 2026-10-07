/* Picking-list import with recipient name and short delivery address. */
(function (root) {
  'use strict';
  const Stock = root.JinjuStockCore || (typeof require==='function' ? require('./product-stock-core.js') : null);
  const normalize = v => String(v ?? '').trim().replace(/[\s-]/g, '').toUpperCase();
  const heading = v => normalize(v).replace(/[()_]/g, '');
  const aliases = ['운송장번호', '송장번호', '택배송장번호', '운송장', '송장', 'TRACKINGNUMBER'];
  function shortAddress(value) {
    const text=String(value??'').replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();
    const road=text.match(/^(.+?(?:로|길)\s*\d+(?:-\d+)?)(?=\s|$|,)/);
    return (road ? road[1] : text.split(' ').slice(0,4).join(' ')).slice(0,120);
  }
  function enrich(shipments, events) {
    let changed=0;
    const incoming=new Map(shipments.map(s=>[normalize(s.tracking),s]));
    for(const e of events) if(e.type==='out' && e.method==='courier') for(const s of e.courierShipments||[]) {
      const next=incoming.get(normalize(s.tracking)); if(!next) continue;
      let touched=false;
      for(const key of ['recipient','address']) if(next[key] && s[key]!==next[key]) {s[key]=next[key];touched=true;}
      if(touched) changed++;
    }
    return changed;
  }
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s + 'T00:00:00Z').toISOString().slice(0,10) === s;
  function parseSheets(sheets) {
    const found = new Map(), errors = []; let duplicateRows = 0, sheetCount = 0;
    for (const sheet of sheets) {
      const rows = sheet.rows;
      const hi = rows.findIndex(r => r.some(v => aliases.includes(heading(v))));
      if (hi < 0) continue;
      sheetCount++;
      const cols = rows[hi].map(heading), ti = cols.findIndex(v => aliases.includes(v));
      const pi = cols.findIndex(v => ['품목명','상품명','품명','제품명','제품','상품'].includes(v));
      const qi = ['박스수량','BOX수량','박스수','출고박스','출고수량','수량'].map(h=>cols.indexOf(h)).find(i=>i>=0) ?? -1;
      const ni = cols.findIndex(v => ['받는분','받는분성명','받는분이름','수취인','수취인명','수령인','수령인명','받는사람','받는사람이름','수하인명'].includes(v));
      const ai = cols.findIndex(v => ['받는분주소','수취인주소','수령인주소','받는사람주소','배송지주소','배송주소','주소','수하인주소'].includes(v));
      for (let i = hi + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row.some(v => String(v ?? '').trim())) continue;
        if (aliases.includes(heading(row[ti]))) continue;
        if (/^(합계|총계|TOTAL)$/i.test(String(row[0] ?? '').trim())) continue;
        const raw = row[ti], tracking = normalize(raw);
        if (!/^[A-Z0-9]{6,40}$/.test(tracking) || (typeof raw === 'number' && !Number.isSafeInteger(raw))) {
          errors.push(`${sheet.name} ${i+1}행: 송장번호가 없거나 올바르지 않습니다.`); continue;
        }
        const product = pi < 0 ? '' : String(row[pi] ?? '').trim().slice(0,300);
        const stockItem = Stock.item(product,qi<0?'':row[qi]);
        const recipient=ni<0?'':String(row[ni]??'').trim().slice(0,80), address=ai<0?'':shortAddress(row[ai]);
        if (found.has(tracking)) {
          duplicateRows++;
          const old = found.get(tracking);
          if(recipient && old.recipient && recipient!==old.recipient || address && old.address && address!==old.address) errors.push(`${sheet.name} ${i+1}행: 같은 송장의 수취인 정보가 서로 다릅니다.`);
          if(!old.recipient) old.recipient=recipient;if(!old.address) old.address=address;
          if (product && !old.products.includes(product)) old.products.push(product);
          old.items.push(stockItem);
        } else found.set(tracking, {tracking, recipient, address, products: product ? [product] : [], items:[stockItem]});
      }
    }
    if (!sheetCount) errors.push('운송장번호 또는 송장번호 열을 찾지 못했습니다.');
    const shipments = [...found.values()].map(s => ({tracking:s.tracking, recipient:s.recipient, address:s.address, product:s.products.join(' / ').slice(0,600),items:s.items}));
    if (!shipments.length && !errors.length) errors.push('등록할 송장번호가 없습니다.');
    return {shipments, duplicateRows, errors};
  }
  function splitNew(shipments, events, ignoreId) {
    const existing = new Set(events.filter(e => e.id !== ignoreId && e.type === 'out' && e.method === 'courier').flatMap(e => (e.courierShipments || []).map(s => normalize(s.tracking))));
    return {fresh:shipments.filter(s => !existing.has(s.tracking)), duplicates:shipments.filter(s => existing.has(s.tracking))};
  }
  function query(events, from, to, term) {
    const needle = normalize(term), result = [];
    for (const e of events) {
      if (e.type !== 'out' || e.method !== 'courier') continue;
      // Tracking search deliberately covers the complete history.
      if (!needle && ((from && e.date < from) || (to && e.date > to))) continue;
      if (e.courierShipments?.length) {
        for (const s of e.courierShipments) if (!needle || [s.tracking,s.recipient,s.address].some(v=>normalize(v).includes(needle))) result.push({event:e, tracking:s.tracking, recipient:s.recipient, address:s.address, product:s.product, count:1});
      } else if (!needle) result.push({event:e, tracking:'', product:e.product, count:Number(e.count)||0});
    }
    return result.sort((a,b) => b.event.date.localeCompare(a.event.date) || a.tracking.localeCompare(b.tracking));
  }
  const api = {normalize, validDate, parseSheets, splitNew, query, shortAddress, enrich};
  if (typeof module !== 'undefined' && module.exports) {module.exports = api; return;}
  root.JinjuCourier = api;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let draft = null, ready = false, busy = false, fileVersion = 0;
  let stockSelections = {};
  const baseLoad = loadData;
  loadData = async function () { ready = false; try { ready = await baseLoad() !== false; } finally { renderCourier(); } };
  const baseRender = renderAll;
  renderAll = function () { baseRender(); renderCourier(); };
  function rate() { return Number(state.settings.outboundFee.courier ?? 3300); }
  function message(text, error=false) { $('courierMessage').textContent = text; $('courierMessage').style.color = error ? '#b42318' : '#0D7377'; }
  function manualMatches() { return (state.events || []).filter(e => e.type === 'out' && e.method === 'courier' && e.date === $('courierShipDate').value && !e.courierShipments?.length); }
  function targets() {
    const select = $('courierTarget'), old = select.value, matches = manualMatches();
    select.innerHTML = (matches.length ? '<option value="">기존 정산 연결 또는 신규 추가를 선택하세요</option>' : '') + '<option value="new">새 택배 정산 추가 (중복 송장 정보 보완)</option><option value="info">기존 송장 수취인 정보만 보완 (추가 청구 없음)</option>' + matches.map((e,i) => `<option value="manual:${i}">기존 ${Number(e.count)||0}건 정산에 송장만 연결 · ${esc(e.product)}</option>`).join('');
    if ([...select.options].some(o=>o.value===old)) select.value=old;
    else select.value=matches.length ? '' : 'new';
  }
  function preview() {
    if (!draft) { $('courierPreview').textContent='파일을 선택하면 등록할 송장과 금액을 확인할 수 있습니다.'; $('courierCommit').disabled=true; return; }
    const value=$('courierTarget').value, target=value.startsWith('manual:') ? manualMatches()[Number(value.slice(7))] : null;
    const parts=splitNew(draft.shipments,state.events||[],target?.id);
    const linking=!!target, errors=[...draft.errors];
    if (linking && (parts.duplicates.length || draft.shipments.length !== Number(target.count))) errors.push('기존 건수와 송장 수가 일치하고 다른 정산과 중복되지 않아야 연결할 수 있습니다.');
    const infoOnly=value==='info';
    const stockShipments=Stock.stockShipments(state,target,linking?draft.shipments:parts.fresh,infoOnly);
    const stockPlan=stockShipments.length ? Stock.plan(state,stockShipments,$('courierShipDate').value,stockSelections) : {lines:[],errors:[]};
    errors.push(...stockPlan.errors);
    const count=linking ? draft.shipments.length : infoOnly ? 0 : parts.fresh.length;
    $('courierPreview').innerHTML=`<p><strong>송장 ${draft.shipments.length}건</strong> · 같은 송장 추가 ${draft.duplicateRows}행 · 이미 등록 ${parts.duplicates.length}건</p><p>${linking?'기존 정산에 송장 연결 (추가 청구 0원)':infoOnly?'기존 송장의 이름·간단 주소만 보완합니다. 추가 청구 0원.':`신규 ${count}건 × ${won(rate())} = <strong>${won(count*rate())}</strong> (공급가액)`}</p>${errors.map(e=>`<p style="color:#b42318">${esc(e)}</p>`).join('')}<div style="max-height:210px;overflow:auto;margin-top:10px"><table><thead><tr><th>송장번호</th><th>받는 분</th><th>간단 주소</th><th>품목</th><th>처리</th></tr></thead><tbody>${draft.shipments.map(s=>`<tr><td>${esc(s.tracking)}</td><td>${esc(s.recipient||"미등록")}</td><td style="white-space:normal;min-width:180px">${esc(s.address||"미등록")}</td><td style="white-space:normal">${esc(s.product)}</td><td>${parts.duplicates.some(d=>d.tracking===s.tracking)?'정보 보완 · 추가 청구 없음':linking?'기존 연결':infoOnly?'신규 제외':'신규'}</td></tr>`).join('')}</tbody></table></div>`;
    $('courierCommit').disabled=!ready || busy || !value || errors.length>0 || (!count && !parts.duplicates.some(s=>s.recipient||s.address)) || !validDate($('courierShipDate').value);
    if(state.productStock && stockShipments.length && $('courierShipDate').value<state.productStock.deductionStartDate){
      $('courierPreview').insertAdjacentHTML('beforeend',`<p class="hint">${esc(state.productStock.baselineDate)}까지의 출고는 기준 재고에 포함되어 있습니다. 제품 재고를 다시 차감하지 않습니다. ${esc(state.productStock.deductionStartDate)} 출고분부터 자동 차감합니다.</p>`);
    } else if(state.productStock && stockShipments.length){
      const mapping=[...new Map(stockShipments.flatMap(s=>s.items||[]).map(i=>[Stock.key(i.product),i.product])).entries()];
      $('courierPreview').insertAdjacentHTML('beforeend',`<h3 style="font-weight:700;margin:18px 0 8px">제품별 박스 차감 확인</h3><p class="hint">품명과 박스 수량을 확인하세요. 수량 오류는 원본 파일에서 수정한 후 다시 올려주세요.</p><div class="stock-mapping">${mapping.map(([k,name])=>{const match=Stock.resolve(state.productStock,name,stockSelections);return `<label>${esc(name||'품명 없음')}<select data-stock-name="${esc(k)}"><option value="">재고 제품 선택</option>${Stock.list(state.productStock.products).map(p=>`<option value="${esc(p.id)}" ${p.id===match?.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`;}).join('')}</div><div style="overflow:auto"><table><thead><tr><th>제품</th><th>현재 BOX</th><th>차감 BOX</th><th>남은 BOX</th></tr></thead><tbody>${stockPlan.lines.map(l=>`<tr><td>${esc(l.name)}</td><td>${l.before}</td><td>${l.quantity}</td><td>${l.after}</td></tr>`).join('')}</tbody></table></div>`);
    } else if(target && state.productStock && Stock.list(state.productStock.baselineEventIds).includes(target.id)) {
      $('courierPreview').insertAdjacentHTML('beforeend','<p class="hint">기준 재고 등록 전에 있던 출고입니다. 송장 정보만 연결하며 제품 재고를 다시 차감하지 않습니다.</p>');
    }
  }
  function renderCourier() {
    if (!$('courierResults')) return;
    const from=$('courierFrom').value, to=$('courierTo').value, term=$('courierSearch').value;
    if (!term && from && to && from>to) { $('courierResults').textContent='조회 시작일이 종료일보다 늦습니다.'; return; }
    const rows=query(state.events||[],from,to,term), daily=new Map();
    rows.forEach(r=>daily.set(r.event.date,(daily.get(r.event.date)||0)+r.count));
    const count=rows.reduce((n,r)=>n+r.count,0);
    $('courierSummary').textContent=`${term?'송장 검색 · 전체 기간':'선택 기간'}: ${count.toLocaleString()}건 · 택배비 ${won(count*rate())} (공급가액) · 적용 단가 ${won(rate())}/건`;
    $('courierDaily').innerHTML=[...daily].map(([d,n])=>`<button type="button" class="btn-ghost" data-day="${d}" style="padding:8px 12px;margin:4px">${d} · ${n}건 · ${won(n*rate())}</button>`).join('');
    $('courierResults').innerHTML=rows.length ? `<table><thead><tr><th>발송일</th><th>송장번호</th><th>받는 분</th><th>간단 주소</th><th>품목</th><th>택배 건수</th><th>택배비</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.event.date)}</td><td>${esc(r.tracking||'미등록 (수동 정산)')}</td><td>${esc(r.recipient||'미등록')}</td><td style="white-space:normal;min-width:180px">${esc(r.address||'미등록')}</td><td style="white-space:normal;min-width:180px">${esc(r.product)}</td><td>${r.count}건</td><td>${won(r.count*rate())}</td></tr>`).join('')}</tbody></table>` : '<p style="padding:16px">조회되는 택배 출고가 없습니다.</p>';
    preview();
  }
  let xlsxPromise;
  function excelLibrary() {
    if(root.XLSX) return Promise.resolve(root.XLSX);
    if(!xlsxPromise) xlsxPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script'); script.src='./xlsx.full.min.js';
      script.onload=()=>resolve(root.XLSX); script.onerror=()=>{xlsxPromise=null;script.remove();reject(new Error('엑셀 읽기 기능을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.'));};document.head.appendChild(script);
    });
    return xlsxPromise;
  }
  async function readFile() {
    const token=++fileVersion, file=$('courierFile').files[0]; draft=null; stockSelections={}; preview();
    if (!file) return;
    try {
      if(file.size>10*1024*1024) throw new Error('10MB 이하의 파일을 선택해주세요.');
      if(!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('엑셀(.xlsx, .xls) 또는 CSV 파일을 선택해주세요.');
      message('피킹리스트를 확인하고 있습니다.');
      const XLSX=await excelLibrary(), bytes=await file.arrayBuffer();
      const wb=XLSX.read(bytes,{type:'array',cellText:true});
      const parsed=parseSheets(wb.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false})})));
      if(token!==fileVersion) return;
      draft=parsed; targets(); preview(); message('발송일과 등록 방식을 확인한 뒤 정산에 반영하세요.');
    } catch(e) { if(token===fileVersion) message(e.message,true); }
  }
  async function commit() {
    if(!ready || !root.JinjuStockSync.ready() || busy || !draft || $('courierCommit').disabled) return;
    const date=$('courierShipDate').value, selection=$('courierTarget').value;
    const target=selection.startsWith('manual:')?manualMatches()[Number(selection.slice(7))]:null;
    const parts=splitNew(draft.shipments,state.events||[],target?.id);
    if(!validDate(date)||draft.errors.length||!selection) return;
    if(target && (parts.duplicates.length||draft.shipments.length!==Number(target.count))) {preview();return;}
    const infoOnly=selection==='info';
    const shipments=target?draft.shipments:infoOnly?[]:parts.fresh;
    const stockShipments=Stock.stockShipments(state,target,shipments,infoOnly);
    const stockPlan=stockShipments.length?Stock.plan(state,stockShipments,date,stockSelections):{lines:[],errors:[]};
    if(stockPlan.errors.length){preview();return;}
    if(!shipments.length && !parts.duplicates.some(s=>s.recipient||s.address)) {preview();return;}
    const label=target ? `${date} 기존 ${target.count}건 정산에 송장만 연결합니다. 추가 청구는 없습니다.` : `${date} 신규 택배 ${shipments.length}건, 추가 청구 ${won(shipments.length*rate())}. 기존 송장 ${parts.duplicates.length}건의 이름·간단 주소를 보완합니다. 기존 발송일과 비용은 유지됩니다.`;
    if(!confirm(label+'\n'+(stockPlan.lines.length?stockPlan.lines.map(l=>`${l.name}: ${l.quantity} BOX 차감 → ${l.after} BOX`).join('\n'):'제품 재고 추가 차감 없음')+'\n발송일·제품·수량을 확인하셨나요?')) return;
    busy=true;
    try {
      const stockLines=stockPlan.lines.map(l=>({productId:l.productId,quantity:l.quantity}));
      if(target){target.courierShipments=shipments;if(stockLines.length)target.stockLines=stockLines;}
      else if(shipments.length) state.events.push({id:'courier-'+crypto.randomUUID(),type:'out',method:'courier',date,time:'',product:'택배 피킹리스트',qty:0,deductPlt:0,count:shipments.length,memo:'피킹리스트 송장별 정산',courierShipments:shipments,stockLines});
      enrich(parts.duplicates,state.events);
      queueSave(); clearTimeout(saveTimer);
      draft=null; $('courierFile').value=''; $('courierFrom').value=shipments.length?date:''; $('courierTo').value=shipments.length?date:''; $('courierSearch').value='';
      renderAll();
      const saved=await persist();
      message(saved?'제품별 재고·택배 정산이 서버에 함께 저장되었습니다.':'서버 저장에 실패했습니다. 새로고침 전에 저장 오류를 확인해 주세요. 현재 화면 수량은 아직 서버에 반영되지 않았습니다.',!saved);
    } catch(e) { message('저장 상태를 확인해주세요: '+e.message,true); }
    finally {busy=false; targets(); preview();}
  }
  const nav=document.querySelector('nav');
  const tab=document.createElement('button'); tab.type='button';tab.className='tab-btn py-2 px-1 whitespace-nowrap';tab.dataset.tab='courier';tab.textContent='택배 피킹·송장조회';tab.onclick=()=>{switchTab('courier');targets();renderCourier();};nav.appendChild(tab);
  const panel=document.createElement('section'); panel.id='tab-courier';panel.className='tab-panel hidden';
  panel.innerHTML=`<div class="card p-4 mb-6"><h2 class="text-lg font-bold">택배 피킹리스트 등록</h2><p class="hint">송장번호 1개를 택배 1건으로 계산합니다. 발송일을 직접 확인해주세요. 같은 송장은 중복 정산하지 않고 이름·간단 주소를 보완합니다.</p><div style="display:flex;gap:14px;flex-wrap:wrap;margin:16px 0"><label>발송일<br><input id="courierShipDate" type="date"></label><label>피킹리스트 파일<br><input id="courierFile" type="file" accept=".xlsx,.xls,.csv"></label></div><label style="display:block">등록 방식<br><select id="courierTarget" style="width:100%;margin:6px 0 12px"></select></label><div id="courierPreview" style="background:#f3f8f8;padding:14px;border-radius:10px"></div><button id="courierCommit" type="button" class="btn-primary" style="padding:10px 18px;margin-top:14px;border-radius:8px" disabled>제품 재고·정산 반영</button><p id="courierMessage" role="status" style="margin-top:12px"></p><p class="hint">신규 송장의 제품별 BOX를 차감합니다. 박스 수량은 피킹리스트 수량 열을 사용합니다. 파렛트 수는 별도로 관리합니다. 수취인 정보가 없는 기존 송장은 같은 파일을 다시 올려 정보만 보완할 수 있습니다. 주소는 도로명·번지까지만 간단히 표시합니다. 수동 정산은 기존 정산에 송장만 연결하세요.</p></div><div class="card p-4"><h2 class="text-lg font-bold">날짜별 택배 출고 · 송장 조회</h2><div style="display:flex;flex-wrap:wrap;gap:12px;margin:16px 0"><label>조회 시작일<br><input id="courierFrom" type="date"></label><label>조회 종료일<br><input id="courierTo" type="date"></label><label>송장·받는 분 검색<br><input id="courierSearch" type="search" placeholder="송장번호, 이름, 간단 주소"></label><button type="button" id="courierAll" class="btn-ghost" style="padding:8px 14px">전체 기간</button></div><p class="hint">송장번호·이름·주소로 전체 발송 이력을 찾습니다. 하이픈과 공백은 무시합니다.</p><p id="courierSummary" style="font-weight:700;margin:14px 0"></p><div id="courierDaily"></div><div id="courierResults" style="overflow:auto;max-height:560px"></div></div>`;
  nav.parentElement.appendChild(panel);
  const style=document.createElement('style');style.textContent='#tab-courier button:disabled{opacity:.45;cursor:not-allowed}#tab-courier input[type=file]{max-width:100%}';document.head.appendChild(style);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  $('courierShipDate').value=today;$('courierFrom').value=today.slice(0,8)+'01';$('courierTo').value=today;
  $('courierFile').onchange=readFile;$('courierShipDate').onchange=()=>{targets();preview();};$('courierTarget').onchange=preview;$('courierCommit').onclick=commit;
  $('courierPreview').onchange=e=>{const k=e.target.dataset.stockName;if(k!==undefined){stockSelections[k]=e.target.value;preview();}};
  ['courierFrom','courierTo','courierSearch'].forEach(id=>$(id).oninput=renderCourier);
  $('courierAll').onclick=()=>{$('courierFrom').value='';$('courierTo').value='';$('courierSearch').value='';renderCourier();};
  $('courierDaily').onclick=e=>{const day=e.target.closest('[data-day]')?.dataset.day;if(day){$('courierFrom').value=day;$('courierTo').value=day;$('courierSearch').value='';renderCourier();}};
  targets(); renderCourier();
})(typeof window !== 'undefined' ? window : globalThis);
