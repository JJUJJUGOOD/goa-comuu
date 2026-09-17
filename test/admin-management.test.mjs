import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

test('운영자는 회원 상태·권한과 허용된 DB 필드를 관리한다', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'moa-admin-'));const app=await createApp({dataDir:dir,adminPassword:'admin-management-secret',rateLimit:10000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 async function api(path,method='GET',body,jar={get(){return cookie;},set(v){cookie=v;}}){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie:jar.get()},body:body===undefined?undefined:JSON.stringify(body)});const set=r.headers.getSetCookie();if(set.length)jar.set(set.map(x=>x.split(';')[0]).join('; '));let json={};try{json=await r.json();}catch{}return {status:r.status,body:json};}
 try{
  const signup=await api('/api/auth/signup','POST',{username:'member_1',nickname:'회원1',password:'member-secret-123',passwordConfirm:'member-secret-123'});assert.equal(signup.status,201);const userId=signup.body.user.id;
  await api('/api/auth/logout','POST');
  assert.equal((await api('/api/admin/users')).status,401);
  assert.equal((await api('/api/admin/login','POST',{password:'admin-management-secret'})).status,200);
  const users=await api('/api/admin/users');assert.equal(users.status,200);assert.ok(users.body.users.some(u=>u.id===userId&&u.nickname==='회원1'));assert.equal(users.body.users.some(u=>Object.hasOwn(u,'password_hash')),false);
  assert.equal((await api(`/api/admin/users/${userId}`,'PATCH',{status:'blocked'})).status,200);
  const loginJar={value:''};const loginApi=(path,method='GET',body)=>api(path,method,body,{get(){return loginJar.value;},set(v){loginJar.value=v;}});
  assert.equal((await loginApi('/api/auth/login','POST',{username:'member_1',password:'member-secret-123'})).status,403);
  assert.equal((await api(`/api/admin/users/${userId}`,'PATCH',{status:'active',role:'operator',nickname:'운영자'})).status,200);
  assert.equal((await loginApi('/api/auth/login','POST',{username:'member_1',password:'member-secret-123'})).status,200);
  assert.equal((await loginApi('/api/bootstrap')).body.isAdmin,true);
  assert.equal((await api(`/api/admin/users/${userId}`,'PATCH',{role:'owner'})).status,400);
  const post=await api('/api/posts','POST',{galleryId:1,title:'DB 편집 전',content:'내용',nickname:'회원2',password:'post-secret'});assert.equal(post.status,201);
  const dbUsers=await api('/api/admin/database?table=users');assert.equal(dbUsers.status,200);assert.equal(dbUsers.body.rows.some(u=>Object.hasOwn(u,'password_hash')),false);
  const edit=await api(`/api/admin/database/posts/${post.body.id}`,'PATCH',{title:'DB에서 수정한 제목',category:'정보'});assert.equal(edit.status,200);
  assert.equal((await api(`/api/posts/${post.body.id}`)).body.post.title,'DB에서 수정한 제목');
  assert.equal((await api(`/api/admin/database/posts/${post.body.id}`,'PATCH',{password_hash:'leak'})).status,400);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{recursive:true,force:true});}
});
