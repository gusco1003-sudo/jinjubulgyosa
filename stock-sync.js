/* Existing Firebase path and access rules are unchanged. Conditional saves prevent stale overwrites. */
(() => {
  'use strict';let tag=null,loaded=false,dirty=false,chain=Promise.resolve();
  const url=FIREBASE_BASE+'/'+DATA_PATH+'.json';
  const controls=document.createElement('div');controls.className='hint no-print';controls.style.cssText='padding:10px 16px;background:#fff8e7;border-radius:10px;margin:10px 0;';controls.hidden=true;document.querySelector('header').after(controls);
  function warning(text){controls.textContent=text;controls.hidden=!text;}
  loadData=async function(){
    try{setSyncStatus('loading');const res=await fetch(url,{cache:'no-store',headers:{'X-Firebase-ETag':'true'},signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('서버 조회 실패 (HTTP '+res.status+')');const data=await res.json();if(!data?.settings)throw Error('서버 자료를 확인할 수 없습니다.');const nextTag=res.headers.get('ETag');if(!nextTag)throw Error('서버 저장 버전을 확인할 수 없습니다.');state=Object.assign(state,data);state.events=state.events||[];state.costs=state.costs||[];state.settings.outboundFee=Object.assign({korean:0,general:0,courier:3300,box:400},state.settings.outboundFee);tag=nextTag;loaded=true;dirty=false;lastFirebaseError='';localStorage.setItem(LOCAL_KEY,JSON.stringify(state));warning('');renderAll();setSyncStatus('ok');return true;}
    catch(e){loaded=false;lastFirebaseError=e.message;setSyncStatus('error');warning('서버 자료를 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요. 연결 전에는 새 자료를 저장하지 않습니다.');return false;}
  };
  queueSave=function(){if(!loaded){warning('서버 자료를 먼저 불러와 주세요. 변경 내용은 저장되지 않았습니다.');return;}state.lastModified=Date.now();dirty=true;localStorage.setItem(LOCAL_KEY,JSON.stringify(state));updateLastSavedLabel();clearTimeout(saveTimer);saveTimer=setTimeout(persist,600);};
  persist=function(){const payload=JSON.stringify(state);const save=async()=>{try{if(!loaded||!tag)throw Error('서버 자료를 불러온 후 저장해 주세요.');setSyncStatus('loading');const res=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','if-match':tag,'X-Firebase-ETag':'true'},body:payload,signal:AbortSignal.timeout(15000)});if(res.status===412){loaded=false;throw Error('다른 창에서 자료가 변경되었습니다. 현재 입력 내용을 확인하고 새로고침 후 다시 등록해 주세요. 덮어쓰지 않았습니다.');}if(!res.ok)throw Error('서버 저장 실패 (HTTP '+res.status+')');tag=res.headers.get('ETag');if(payload===JSON.stringify(state))dirty=false;lastFirebaseError='';warning('');setSyncStatus('ok');return true;}catch(e){lastFirebaseError=e.message;warning(e.message+' 아직 서버에 저장되지 않은 작업이 있습니다.');setSyncStatus('error');return false;}};chain=chain.then(save,save);return chain;};
  manualSave=async function(){clearTimeout(saveTimer);if(!loaded){alert('서버 자료를 먼저 불러와 주세요.');return;}state.lastModified=Date.now();dirty=true;localStorage.setItem(LOCAL_KEY,JSON.stringify(state));const ok=await persist();alert(ok?'서버에 저장되었습니다.':'저장되지 않았습니다.\n'+lastFirebaseError);};
  let committing=false;
  async function commit(next){
    if(typeof portalBridge==='undefined')throw Error('관리자 화면에서 수정하세요.');
    const session=await portalBridge.session;
    if(session.key!=='jinjubulgyosa'||session.writable!==true)throw Error('관리자만 재고를 수정할 수 있습니다.');
    if(committing||!loaded||!tag)throw Error('서버 연결을 확인하고 새로고침한 뒤 다시 저장하세요.');
    if(dirty)throw Error('아직 저장되지 않은 다른 작업이 있습니다. 상단의 지금 저장을 완료한 뒤 다시 시도하세요.');
    const previous=state;committing=true;clearTimeout(saveTimer);
    const controls=[...document.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);
    for(const [el] of controls)el.disabled=true;
    try{
      state=next;state.lastModified=Date.now();dirty=true;
      if(!await persist())throw Error(lastFirebaseError||'서버 저장을 확인하지 못했습니다.');
      localStorage.setItem(LOCAL_KEY,JSON.stringify(state));updateLastSavedLabel();
    }catch(err){
      state=previous;dirty=false;loaded=false;tag=null;localStorage.setItem(LOCAL_KEY,JSON.stringify(previous));
      warning('저장을 확인하지 못해 화면을 이전 수량으로 되돌렸습니다. 새로고침하여 서버 재고를 확인하세요. '+err.message);
      throw Error('저장이 확인되지 않았습니다. 새로고침 후 서버 재고를 확인하고 다시 시도하세요. '+err.message);
    }finally{committing=false;for(const [el,disabled] of controls)el.disabled=disabled;}
  }
  window.JinjuStockSync={ready:()=>loaded&&!committing,dirty:()=>dirty,commit};
  for(const name of ['addEvent','deleteEvent','addCost','deleteCost','saveConfig','resetAllData']){const base=window[name];window[name]=function(...args){if(!loaded){alert('서버 자료를 먼저 불러와 주세요. 저장 충돌이 있었다면 새로고침 후 다시 등록하세요.');return;}return base.apply(this,args);};}
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
})();
