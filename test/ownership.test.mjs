import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

test('회원 소유권·닉네임·19 표시를 서버에서 검증한다',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'moa-owner-'));const app=await createApp({dataDir:dir,adminPassword:'owner-secret-123',rateLimit:10000});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 function client(){let cookie='';return async(path,method='GET',data)=>{const r=await fetch(base+'/api'+path,{method,headers:{cookie,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};};}
 const a=client(),b=client(),guest=client(),admin=client();
 try{
  const one=await a('/auth/signup','POST',{username:'writer_a',nickname:'작성자',password:'member-pass-123'});
  await b('/auth/signup','POST',{username:'writer_b',nickname:'다른회원',password:'member-pass-123'});
  const p=await a('/posts','POST',{galleryId:1,title:'회원글',content:'본문',nickname:'조작이름',user_id:999,password:'known-password',adult:true});assert.equal(p.status,201);
  let view=await a('/posts/'+p.id);assert.equal(view.post.nickname,'작성자');assert.equal(view.post.user_id,one.user.id);assert.equal(view.post.adult,1);
  assert.equal((await guest('/posts')).posts.find(row=>row.id===p.id).adult,1);
  assert.equal((await guest('/posts?sort=popular')).posts.some(row=>row.id===p.id),false);
  app.db.prepare("UPDATE settings SET value='1' WHERE key='popularThreshold'").run();
  await b('/posts/'+p.id+'/vote','POST',{});
  assert.equal((await guest('/posts?sort=popular')).posts.some(row=>row.id===p.id),true);
  assert.equal((await guest('/posts','POST',{galleryId:1,title:'사칭',content:'본문',nickname:'작성자',password:'guest-secret'})).status,400);
  assert.equal((await b('/posts/'+p.id,'PATCH',{title:'공격',content:'공격',password:'known-password',user_id:one.user.id})).status,403);
  assert.equal((await guest('/posts/'+p.id,'DELETE',{password:'known-password'})).status,403);
  assert.equal((await a('/posts/'+p.id,'PATCH',{title:'수정',content:'새본문',adult:false,nickname:'조작'})).status,200);
  view=await a('/posts/'+p.id);assert.equal(view.post.nickname,'작성자');assert.equal(view.post.adult,0);
  const c=await a('/posts/'+p.id+'/comments','POST',{content:'회원 댓글',nickname:'조작'});assert.equal(c.status,201);
  assert.equal((await b('/comments/'+c.id,'DELETE',{})).status,403);assert.equal((await a('/comments/'+c.id,'DELETE',{})).status,200);
  const g=await guest('/posts','POST',{galleryId:1,title:'비회원글',content:'내용',nickname:'손님',password:'guest-secret'});assert.equal(g.status,201);
  assert.equal((await guest('/posts/'+g.id,'DELETE',{})).status,403);assert.equal((await guest('/posts/'+g.id,'DELETE',{password:'wrong'})).status,403);
  assert.equal((await guest('/posts/'+g.id,'DELETE',{password:'guest-secret'})).status,200);
  assert.equal((await admin('/admin/login','POST',{password:'owner-secret-123'})).status,401);
  assert.equal((await admin('/admin/login','POST',{username:'community_admin',password:'owner-secret-123'})).status,200);
  assert.equal((await admin('/bootstrap')).user.username,'community_admin');
  assert.equal((await a('/posts/'+p.id,'DELETE',{})).status,200);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{recursive:true,force:true});}
});
