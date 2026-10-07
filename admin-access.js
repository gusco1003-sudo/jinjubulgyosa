(() => {
  'use strict';const A=window.JinjuAuth;let lastUid=null;
  if(!A){document.getElementById('jinju-admin-gate').innerHTML='<div><h1>로그인 연결을 확인해 주세요.</h1><p>인증 서비스를 불러오지 못했습니다. 인터넷 연결을 확인한 후 새로고침해 주세요.</p><button onclick="location.reload()">다시 시도</button></div>';return;}
  document.getElementById('jinju-admin-gate')?.remove();
  // The gate also stays closed if the auth SDK or its network request fails.
  const gate=document.createElement('section');gate.id='jinju-admin-gate';gate.innerHTML='<div><b>TS3PL · 진주불교사</b><h1>관리자 로그인</h1><p>업무 자료를 조회하고 수정하려면 관리자 인증이 필요합니다.</p><button id="jinju-google-login">Google 계정으로 관리자 로그인</button><p id="jinju-auth-message" role="alert"></p><a href="./viewer.html">대표님 조회 화면으로 이동 →</a></div>';
  document.body.append(gate);
  const message=document.getElementById('jinju-auth-message');document.getElementById('jinju-google-login').onclick=async()=>{try{await A.google();location.reload();}catch(e){message.textContent=A.explain(e);}};
  A.auth.onAuthStateChanged(user=>{if(lastUid&&lastUid!==user?.uid){location.reload();return;}if(A.owner(user))lastUid=user.uid;else{document.documentElement.classList.remove('jinju-admin-ready');message.textContent=user?'이 계정은 업무관리 권한이 없습니다. 대표님 조회 화면을 이용해 주세요.':'';}});
  window.requireJinjuAdmin=async()=>{await A.ready;if(!A.owner(A.auth.currentUser))throw Error('관리자 로그인이 필요합니다.');return true;};
  window.openJinjuAdmin=()=>{document.documentElement.classList.add('jinju-admin-ready');};
  window.failJinjuAdmin=e=>{message.textContent=A.explain(e);};
  const bar=document.createElement('div');bar.id='jinju-access-bar';bar.innerHTML='<span>관리자 인증</span><a href="./accounts.html">대표님 계정 발급</a><a href="./viewer.html" target="_blank" rel="noopener">조회 화면</a><button id="jinju-signout">로그아웃</button>';document.body.prepend(bar);
  document.getElementById('jinju-signout').onclick=async()=>{if(!confirm('저장 상태를 확인한 후 로그아웃할까요?'))return;await A.logout();location.reload();};
})();
