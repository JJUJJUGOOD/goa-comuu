import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

test('separate recommendations and dislikes persist, reject duplicates and do not promote disliked posts', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'moa-reactions-'));
 let app,base,cookie='';
 const start=async()=>{app=await createApp({dataDir:dir,adminPassword:'test-reactions-password',rateLimit:10000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;};
 const stop=async()=>{await new Promise(r=>app.server.close(r));app.db.close();};
 const api=async(path,method='GET',body)=>{const res=await fetch(base+'/api'+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});if(res.headers.getSetCookie().length)cookie=res.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');return {status:res.status,data:await res.json()};};
 try{
  await start();await api('/bootstrap');
  const created=await api('/posts','POST',{galleryId:1,title:'반응 테스트',content:'개념과 비추',nickname:'테스터',password:'post-password'});
  assert.equal(created.status,201);const id=created.data.id;
  // Existing recommendations must survive adding the new reaction.
  assert.equal((await api(`/posts/${id}/vote`,'POST',{})).data.votes,1);
  const down=await api(`/posts/${id}/downvote`,'POST',{});
  assert.equal(down.status,200);assert.equal(down.data.downvotes,1);
  assert.equal((await api(`/posts/${id}/downvote`,'POST',{})).status,409);
  assert.equal((await api(`/posts/${id}/vote`,'POST',{})).status,409);
  const visitorCookie=cookie;
  for(let i=0;i<2;i++){cookie='';await api('/bootstrap');assert.equal((await api(`/posts/${id}/downvote`,'POST',{})).status,200);}
  const listed=(await api('/posts')).data.posts.find(p=>p.id===id);
  assert.equal(listed.votes,1);assert.equal(listed.downvotes,3);
  assert.equal((await api('/posts?sort=popular')).data.posts.some(p=>p.id===id),false);
  await stop();await start();cookie=visitorCookie;
  const detail=(await api(`/posts/${id}`)).data;
  assert.equal(detail.post.votes,1);assert.equal(detail.post.downvotes,3);
  assert.equal(detail.voted,true);assert.equal(detail.downvoted,true);
  assert.equal((await api(`/posts/${id}/downvote`,'POST',{})).status,409);
  assert.equal((await api('/posts/999999/downvote','POST',{})).status,404);
  assert.equal((await api(`/posts/${id}`,'DELETE',{password:'post-password'})).status,200);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM downvotes WHERE post_id=?').get(id).n,0);
 }finally{if(app?.server.listening)await stop();await rm(dir,{recursive:true,force:true});}
});
