/* Firebase public web configuration. Permissions are enforced by database.rules.json. */
(() => {
  'use strict';
  const config = {apiKey:'AIzaSyBvjM1aD-bmGTsG86-9_2H_HtQNwXdmpvw',authDomain:'ts3pl-982ef.firebaseapp.com',projectId:'ts3pl-982ef',appId:'1:863439274504:web:ea99901657e04c8d5a07bd'};
  const base = 'https://ts3pl-982ef-default-rtdb.firebaseio.com';
  const app = firebase.apps.find(a=>a.name==='jinju-portal') || firebase.initializeApp(config,'jinju-portal');
  const auth = app.auth();
  auth.languageCode = 'ko';
  const ready = new Promise(resolve=>{const stop=auth.onAuthStateChanged(u=>{stop();resolve(u);});});
  const owner = u => !!u && u.email==='gusco1003@gmail.com' && u.emailVerified && u.providerData.some(p=>p.providerId==='google.com');
  const username = value => {
    const id=String(value).trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9_-]{3,31}$/.test(id)) throw Error('아이디는 영문 소문자·숫자·밑줄·하이픈으로 4~32자 입력해 주세요.');
    return id;
  };
  async function request(path,options={}) {
    await ready;
    const u=auth.currentUser;
    if(!u) throw Error('로그인이 필요합니다.');
    // Never attach a token to an arbitrary URL.
    if(!/^(jinjubulgyosa|jinjuAccess)(\/[^?#.]*)?$/.test(path)) throw Error('허용되지 않은 경로입니다.');
    const token=await u.getIdToken();
    return fetch(`${base}/${path}.json?auth=${encodeURIComponent(token)}`,{...options,cache:'no-store',referrerPolicy:'no-referrer',signal:options.signal||AbortSignal.timeout(15000)});
  }
  async function json(path,options) {
    const res=await request(path,options); const data=await res.json();
    if(!res.ok) {const error=Error(res.status===401||res.status===403?'접근 권한이 없거나 계정이 중지되었습니다.':'서버 연결에 실패했습니다. 다시 시도해 주세요.');error.status=res.status;throw error;}
    return data;
  }
  function explain(e){
    const known={'auth/invalid-credential':'아이디 또는 비밀번호가 올바르지 않습니다.','auth/wrong-password':'아이디 또는 비밀번호가 올바르지 않습니다.','auth/user-not-found':'아이디 또는 비밀번호가 올바르지 않습니다.','auth/email-already-in-use':'이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.','auth/weak-password':'비밀번호를 더 길고 안전하게 입력해 주세요.','auth/too-many-requests':'요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.','auth/popup-blocked':'로그인 팝업을 허용한 뒤 다시 눌러 주세요.','auth/popup-closed-by-user':'로그인이 취소되었습니다.','auth/unauthorized-domain':'로그인 도메인 설정을 관리자에게 확인해 주세요.','auth/operation-not-allowed':'Firebase 로그인 설정이 아직 완료되지 않았습니다.','auth/network-request-failed':'인터넷 연결을 확인해 주세요.'};
    return known[e.code] || (e.code?'로그인 처리에 실패했습니다. 다시 시도해 주세요.':e.message);
  }
  async function google(){const p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});await auth.signInWithPopup(p);if(!owner(auth.currentUser)){await auth.signOut();throw Error('등록된 관리자 Google 계정으로 로그인해 주세요.');}}
  async function login(id,password){await auth.signInWithEmailAndPassword(username(id)+'@jinju.ts3pl.invalid',password);try{const role=await json('jinjuAccess/'+auth.currentUser.uid);if(!role?.active)throw Error('계정이 중지되었거나 조회 권한이 없습니다.');}catch(e){await auth.signOut();throw e;}}
  async function create(id,password,label){
    if(!owner(auth.currentUser)) throw Error('관리자만 계정을 발급할 수 있습니다.');
    id=username(id);
    if(password.length<10||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)) throw Error('비밀번호는 영문과 숫자를 포함해 10자 이상 입력해 주세요.');
    const secondary=firebase.initializeApp(config,'issue-'+crypto.randomUUID());
    let user;
    try {
      await secondary.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
      user=(await secondary.auth().createUserWithEmailAndPassword(id+'@jinju.ts3pl.invalid',password)).user;
      await json('jinjuAccess/'+user.uid,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:id,label:String(label||'진주불교사 대표님').slice(0,60),active:true,createdAt:Date.now()})});
      return id;
    } catch(e) {if(user)await user.delete().catch(()=>{});throw e;}
    finally {await secondary.auth().signOut().catch(()=>{});await secondary.delete();}
  }
  window.JinjuAuth={auth,ready,owner,request,json,google,login,create,explain,logout:()=>auth.signOut()};
})();
