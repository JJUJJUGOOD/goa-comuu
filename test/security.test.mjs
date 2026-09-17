import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server.mjs';

async function fixture(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'goa-security-'));
 const app=await createApp({dataDir:dir,adminPassword:'owner-password-test-123',...options});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{force:true,recursive:true});});
 const api=async(path,method='GET',data,headers={})=>{const res=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie,...headers},body:data===undefined?undefined:JSON.stringify(data)});if(res.headers.getSetCookie().length)cookie=res.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');return res;};
 return {app,api,dir,base};
}
test('attachment accepts PNG, rejects disguised files, and never serves secrets',async t=>{
 const {api}=await fixture(t);const data={galleryId:1,title:'사진',content:'테스트 사진',nickname:'테스트',password:'abcd',category:'잡담'};
 assert.equal((await api('/api/posts','POST',{...data,image:'data:image/png;base64,PHNjcmlwdD4='})).status,400);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
 const created=await api('/api/posts','POST',{...data,image:'data:image/png;base64,'+png});assert.equal(created.status,201);const {id}=await created.json();
 const detail=await(await api('/api/posts/'+id)).json();assert.match(detail.post.image,/^\/uploads\/[a-f0-9]+\.png$/);
 const image=await api(detail.post.image);assert.equal(image.status,200);assert.ok(image.headers.get('content-type').startsWith('image/png'));
 for(const path of ['/data/community.sqlite','/data/owner-access.txt','/server.mjs','/api/admin/backup'])assert.notEqual((await api(path)).status,200);
 const raw=await api('/api/posts','POST',data,{'sec-fetch-site':'cross-site'});assert.equal(raw.status,403);
 assert.equal((await api('/api/posts','POST',data,{'content-type':'text/plain'})).status,415);
 assert.equal((await api('/api/posts/'+id,'DELETE',{password:'abcd'})).status,200);assert.equal((await api(detail.post.image)).status,404);
});
test('admin backup includes durable data and password change invalidates other sessions',async t=>{
 const {api,base}=await fixture(t);
 await api('/api/admin/login','POST',{password:'owner-password-test-123'});
 const old=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'owner-password-test-123'})});const oldCookie=old.headers.getSetCookie()[0].split(';')[0];
 const backup=await api('/api/admin/backup');assert.equal(backup.status,200);assert.equal(Buffer.from(await backup.arrayBuffer()).toString('ascii',0,15),'SQLite format 3');
 assert.equal((await api('/api/admin/password','PUT',{currentPassword:'wrong',newPassword:'changed-secret-123'})).status,403);
 assert.equal((await api('/api/admin/password','PUT',{currentPassword:'owner-password-test-123',newPassword:'changed-secret-123'})).status,200);
 const stale=await fetch(base+'/api/admin/backup',{headers:{cookie:oldCookie}});assert.equal(stale.status,401);
 await api('/api/admin/logout','POST',{});
 assert.equal((await api('/api/admin/login','POST',{password:'owner-password-test-123'})).status,401);
 assert.equal((await api('/api/admin/login','POST',{password:'changed-secret-123'})).status,200);
});
test('rate limit applies to repeated writes without leaking password hashes',async t=>{
 const {api}=await fixture(t,{rateLimit:2});
 const data={galleryId:1,title:'테스트',content:'내용',nickname:'닉',password:'abcd'};
 assert.equal((await api('/api/posts','POST',data)).status,201);
 assert.equal((await api('/api/posts','POST',data)).status,201);
 assert.equal((await api('/api/posts','POST',data)).status,429);
 const res=await api('/api/posts');const text=await res.text();assert.equal(text.includes('password_hash'),false);assert.equal(text.includes('adminHash'),false);
});
