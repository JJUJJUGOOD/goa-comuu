import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

test('회원가입과 일반 로그인 세션을 제공하고 운영자 닉네임을 보호한다', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'moa-auth-'));
 const app=await createApp({dataDir:dir,adminPassword:'auth-admin-secret',rateLimit:10000});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});const set=r.headers.getSetCookie();if(set.length)cookie=set.map(x=>x.split(';')[0]).join('; ');let json={};try{json=await r.json();}catch{}return {status:r.status,body:json};}
 try{
  assert.equal((await api('/api/auth/signup','POST',{username:'hana_1',nickname:'하나',password:'member-secret-123',passwordConfirm:'member-secret-123'})).status,201);
  let boot=(await api('/api/bootstrap')).body;assert.equal(boot.user.username,'hana_1');assert.equal(boot.user.nickname,'하나');assert.equal(boot.user.role,'user');
  assert.equal((await api('/api/auth/signup','POST',{username:'hana_1',nickname:'다른이',password:'member-secret-123',passwordConfirm:'member-secret-123'})).status,409);
  assert.equal((await api('/api/auth/signup','POST',{username:'other_1',nickname:'하나',password:'member-secret-123',passwordConfirm:'member-secret-123'})).status,409);
  await api('/api/auth/logout','POST');
  assert.equal((await api('/api/auth/login','POST',{username:'hana_1',password:'wrong-password'})).status,401);
  assert.equal((await api('/api/auth/login','POST',{username:'hana_1',password:'member-secret-123'})).status,200);
  assert.equal((await api('/api/auth/me')).body.user.nickname,'하나');
  assert.equal((await api('/api/posts','POST',{galleryId:1,title:'회원 글',content:'로그인 회원 글',nickname:'다른닉',password:'ignored-pass'})).status,201);
  await api('/api/auth/logout','POST');
  assert.equal((await api('/api/posts','POST',{galleryId:1,title:'운영자 사칭',content:'차단되어야 함',nickname:'운영자',password:'guest-pass'})).status,400);
  assert.equal((await api('/api/auth/signup','POST',{username:'operator_1',nickname:'운영자',password:'member-secret-123',passwordConfirm:'member-secret-123'})).status,400);
  const second=await api('/api/auth/signup','POST',{username:'min_2',nickname:'민',password:'member-secret-123',passwordConfirm:'member-secret-123'});assert.equal(second.status,201);
  const userId=second.body.user.id;app.db.prepare('UPDATE users SET status=? WHERE id=?').run('blocked',userId);
  assert.equal((await api('/api/auth/logout','POST')).status,200);
  assert.equal((await api('/api/auth/login','POST',{username:'min_2',password:'member-secret-123'})).status,403);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{recursive:true,force:true});}
});
