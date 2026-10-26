/* Product creation is available in the authenticated administrator editor only. */
(() => {
 'use strict';const S=window.JinjuStockCore,$=id=>document.getElementById(id);let allowed=false,busy=false;
 const card=document.createElement('div');card.className='card p-4 mb-6';card.id='productAddCard';
 card.innerHTML=`<h2 class="text-lg font-bold">새 품목 추가</h2><p class="hint">제품 재고는 BOX 단위로 등록합니다. 등록한 품목은 택배 피킹·박스·파렛트 출고와 통합정산·화주라운지에 함께 연결됩니다.</p><p id="productAddAccess"><a class="btn-primary" href="https://ts3pl-wms.onrender.com/manage/jinjubulgyosa" target="_blank" rel="noopener">관리자 화면에서 품목 추가</a></p><form id="productAddForm" class="stock-adjustment" hidden><label>품목명<input id="productAddName" maxlength="100" required placeholder="새 제품명"></label><label>현재 BOX<input id="productAddQuantity" type="number" min="0" max="1000000" step="1" value="0" required></label><label>1 PLT당 BOX · 필수<input id="productAddCapacity" type="number" min="1" max="1000000" step="1" placeholder="보관 파렛트 환산 기준" required></label><label>피킹리스트 별칭 · 선택<input id="productAddAliases" maxlength="2000" placeholder="다른 표기명, 쉼표로 구분"></label><button id="productAddSave" class="btn-primary" type="button" disabled>품목 추가 저장</button></form><p class="hint">현재 BOX는 오늘의 재고 증가 이력으로 남깁니다. 보관 PLT는 박스 잔량에서 자동 환산됩니다. 입출고 작업비는 별도로 등록하세요.</p><p id="productAddMessage" role="status" aria-live="polite"></p>`;
 $('tab-stock').children[0].after(card);const style=document.createElement('style');style.textContent='#productAddForm[hidden]{display:none!important}#productAddAccess a{display:inline-block;padding:10px 16px;border-radius:10px;text-decoration:none}';document.head.appendChild(style);
 const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 function paint(){$('productAddSave').disabled=!allowed||busy||!window.JinjuStockSync?.ready()||!state.productStock;}
 const baseRender=renderAll;renderAll=function(){baseRender();paint();};
 async function save(e){
  e?.preventDefault();if(!allowed||busy||!window.JinjuStockSync?.ready())return;if(!$('productAddForm').reportValidity())return;
  const input={name:$('productAddName').value,quantity:$('productAddQuantity').value,boxesPerPallet:$('productAddCapacity').value,aliases:$('productAddAliases').value};let next;
  try{next=S.addProduct(state,input,crypto.randomUUID(),day());}catch(err){$('productAddMessage').textContent=err.message;return;}
  if(!confirm(`${input.name.trim()} · ${Number(input.quantity)} BOX\n새 품목을 등록하고 통합정산·화주라운지에 연결할까요?`))return;
  busy=true;paint();const previous=state.productStock;state.productStock=next.productStock;
  try{queueSave();clearTimeout(saveTimer);const ok=await persist();if(!ok)throw Error('저장을 확인하지 못했습니다. 새로고침하여 서버 재고를 확인한 뒤 다시 등록하세요.');$('productAddForm').reset();$('productAddMessage').textContent='품목이 저장되었습니다. 출고 제품 목록과 통합정산·화주라운지의 재고 조회에 반영됩니다.';renderAll();}
  catch(err){state.productStock=previous;$('productAddMessage').textContent=err.message;renderAll();}
  finally{busy=false;paint();}
 }
 $('productAddSave').onclick=save;$('productAddForm').onsubmit=save;
 async function start(){if(typeof portalBridge==='undefined')return;try{const session=await portalBridge.session;allowed=session.key==='jinjubulgyosa'&&session.writable===true;$('productAddForm').hidden=!allowed;$('productAddAccess').hidden=allowed;if(!allowed)$('productAddMessage').textContent='관리자 원본 저장 연결을 확인해 주세요.';paint();}catch{$('productAddMessage').textContent='관리자 로그인을 다시 확인해 주세요.';}}
 start();paint();
})();
