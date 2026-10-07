(() => {
  'use strict';const A=JinjuAuth,$=id=>document.getElementById(id);let issuing=false;
  function message(text,error=false){$('message').textContent=text;$('message').className='notice'+(error?' error':'');}
  async function list(){
    $('accountList').replaceChildren();
    const records=await A.json('jinjuAccess');
    const entries=Object.entries(records||{}).sort(([,a],[,b])=>(b.createdAt||0)-(a.createdAt||0));
    if(!entries.length){const p=document.createElement('p');p.className='empty';p.textContent='아직 발급된 계정이 없습니다.';$('accountList').append(p);}
    for(const [uid,r]of entries){
      const item=document.createElement('article');item.className='account-row';const title=document.createElement('strong');title.textContent=r.username;const desc=document.createElement('p');desc.className='help';desc.textContent=(r.label||'조회 계정')+' · '+(r.active?'사용 중':'중지됨');const button=document.createElement('button');button.className=r.active?'danger':'secondary';button.textContent=r.active?'조회 권한 중지':'조회 권한 다시 허용';
      button.onclick=async()=>{if(!confirm(`${r.username} 계정의 조회 권한을 ${r.active?'중지':'다시 허용'}할까요?`))return;button.disabled=true;try{await A.json('jinjuAccess/'+uid+'/active',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(!r.active)});await list();message('조회 권한이 변경되었습니다.');}catch(e){message(A.explain(e),true);button.disabled=false;}};
      item.append(title,desc,button);$('accountList').append(item);
    }
  }
  $('google').onclick=async()=>{try{await A.google();}catch(e){message(A.explain(e),true);}};
  $('logout').onclick=()=>A.logout();$('reload').onclick=()=>list().catch(e=>message(A.explain(e),true));
  $('copyLink').onclick=async()=>{try{await navigator.clipboard.writeText($('viewerLink').value);message('조회 링크를 복사했습니다.');}catch{message('링크 입력란을 선택해 복사해 주세요.');}};
  $('issueForm').onsubmit=async e=>{e.preventDefault();if(issuing)return;const pw=$('newPassword').value;if(pw!==$('confirmPassword').value){message('비밀번호 확인이 일치하지 않습니다.',true);return;}issuing=true;$('issueButton').disabled=true;try{const id=await A.create($('newId').value,pw,$('label').value);$('newPassword').value='';$('confirmPassword').value='';$('newId').value='';message(id+' 계정을 발급했습니다. 정한 비밀번호와 조회 링크를 대표님께 전달해 주세요.');await list();}catch(error){message(A.explain(error),true);}finally{issuing=false;$('issueButton').disabled=false;}};
  A.auth.onAuthStateChanged(async user=>{const admin=A.owner(user);$('manage').hidden=!admin;$('signIn').hidden=admin;$('logout').hidden=!user;$('accountList').replaceChildren();$('newPassword').value='';$('confirmPassword').value='';if(admin){message('관리자 인증 완료 · 진주불교사 조회 계정을 발급할 수 있습니다.');try{await list();}catch(e){message(A.explain(e),true);}}else message('등록된 관리자 Google 계정으로 로그인해 주세요.');});
})();
