import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';

test('persistent community API and authorization boundaries', async () => {
 const dir=await mkdtemp(join(tmpdir(),'moa-test-'));
 let app=await createApp({dataDir:dir,adminPassword:'test-owner-password-42',rateLimit:10000});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 let base=`http://127.0.0.1:${app.server.address().port}`;
 let cookie='';
 async function api(path,method='GET',body,extra={}){
   const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie,...extra},body:body===undefined?undefined:JSON.stringify(body)});
   const cookies=r.headers.getSetCookie(); if(cookies.length) cookie=cookies.map(c=>c.split(';')[0]).join('; ');
   return {status:r.status,body:await r.json()};
 }
 try {
   let boot=(await api('/api/bootstrap')).body;
   assert.equal(boot.isAdmin,false); assert.equal(boot.settings.name,'고아 커뮤니티'); assert.equal(boot.galleries[0].name,'경주정보고 갤러리'); assert.ok(boot.galleries.length===1);
   const gallery=boot.galleries[0].id;
   assert.equal((await api('/api/admin/settings','PUT',{name:'hacked'})).status,401);
   assert.equal((await api('/api/posts','POST',{galleryId:gallery,title:'x',content:'x',nickname:'x',password:'abcd'},{origin:'https://evil.example'})).status,403);
   assert.equal((await api('/api/posts','POST',{galleryId:gallery,title:' ',content:'x',nickname:'x',password:'abcd'})).status,400);
   assert.equal((await api('/api/posts','POST',{galleryId:gallery,title:'운영자 사칭',content:'x',nickname:'운영자',password:'abcd'})).status,400);
   assert.equal((await api('/api/posts','POST',{galleryId:gallery,title:'공지 사칭',content:'x',nickname:'테스터',password:'abcd',pinned:true})).status,403);
   const payload={galleryId:gallery,title:'친구들 첫 모임',content:'토요일 점심 만나자 <script>alert(1)</script>',nickname:'테스터',password:'post-secret',category:'잡담'};
   const created=await api('/api/posts','POST',payload);
   assert.equal(created.status,201); const id=created.body.id;
   assert.equal((await api(`/api/posts?q=${encodeURIComponent('첫 모임')}`)).body.total,1);
   const detail=(await api(`/api/posts/${id}`)).body;
   assert.equal(detail.post.content,payload.content); assert.equal(detail.post.password_hash,undefined);
   assert.equal((await api(`/api/posts/${id}`,'PATCH',{password:'wrong',title:'bad',content:'bad'})).status,403);
   assert.equal((await api(`/api/posts/${id}`,'PATCH',{password:'post-secret',title:'수정한 모임',content:'일요일에 보자',category:'잡담'})).status,200);
   const comment=await api(`/api/posts/${id}/comments`,'POST',{nickname:'친구',content:'좋아요',password:'reply-secret'});
   assert.equal(comment.status,201);
   assert.equal((await api(`/api/comments/${comment.body.id}`,'DELETE',{password:'wrong'})).status,403);
   assert.equal((await api(`/api/posts/${id}/vote`,'POST',{})).body.votes,1);
   assert.equal((await api(`/api/posts/${id}/vote`,'POST',{})).status,409);
   assert.equal((await api('/api/admin/login','POST',{username:'community_admin',password:'wrong'})).status,401);
   assert.equal((await api('/api/admin/login','POST',{username:'community_admin',password:'test-owner-password-42'})).status,200);
   const notice=await api('/api/posts','POST',{galleryId:gallery,title:'관리자 공지',content:'관리자만 작성할 수 있는 공지입니다.',nickname:'운영자',password:'notice-secret',pinned:true,category:'정보'});
   assert.equal(notice.status,201);
   assert.equal((await api(`/api/posts/${notice.body.id}`)).body.post.pinned,1);
   assert.equal((await api('/api/admin/settings','PUT',{...boot.settings,name:'우리 모임',accent:'#345678'})).status,200);
   const newGallery=await api('/api/admin/galleries','POST',{name:'농구',description:'농구 친구',icon:'🏀'});
   assert.equal(newGallery.status,201);
   assert.equal((await api(`/api/admin/galleries/${newGallery.body.id}`,'PATCH',{name:'농구 모임',description:'코트에서 만나자',icon:'🏀'})).status,200);
   assert.equal((await api(`/api/admin/galleries/${gallery}`,'DELETE',{})).status,409);
   assert.equal((await api(`/api/admin/galleries/${newGallery.body.id}`,'DELETE',{})).status,200);
   assert.equal((await api(`/api/posts/${id}`,'PATCH',{pinned:true})).status,200);
   await new Promise(r=>app.server.close(r)); app.db.close();
   app=await createApp({dataDir:dir,adminPassword:'different-ignored-password',rateLimit:10000});
   await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;
   cookie=''; boot=(await api('/api/bootstrap')).body;
   assert.equal(boot.settings.name,'우리 모임');
   const persisted=(await api(`/api/posts/${id}`)).body;
   assert.equal(persisted.post.title,'수정한 모임'); assert.equal(persisted.comments.length,1);assert.equal(persisted.post.pinned,1);
   assert.equal((await api(`/api/posts/${id}`,'DELETE',{password:'wrong'})).status,403);
   assert.equal((await api(`/api/comments/${comment.body.id}`,'DELETE',{password:'reply-secret'})).status,200);
   assert.equal((await api(`/api/posts/${id}`,'DELETE',{password:'post-secret'})).status,200);
   assert.equal((await api(`/api/posts/${id}`)).status,404);
 } finally {await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{recursive:true,force:true});}
});

