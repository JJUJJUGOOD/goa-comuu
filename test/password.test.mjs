import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
test('passwords preserve whitespace and old admin credentials cannot edit system notices',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'goa-password-'));const app=await createApp({dataDir:dir,adminPassword:'initial-admin-1234'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{recursive:true,force:true});});
 const api=async(path,method,data)=>{const r=await fetch(base+'/api'+path,{method,headers:{'content-type':'application/json',cookie},body:JSON.stringify(data)});if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie()[0].split(';')[0];return r;};
 const p=await api('/posts','POST',{galleryId:1,title:'공백 비밀번호',content:'본문',nickname:'닉',password:' secret '});const id=(await p.json()).id;
 assert.equal((await api('/posts/'+id,'DELETE',{password:' secret '})).status,200);
 await api('/admin/login','POST',{username:'community_admin',password:'initial-admin-1234'});
 await api('/admin/password','PUT',{currentPassword:'initial-admin-1234',newPassword:' new-admin-secret '});
 await api('/admin/logout','POST',{});
 assert.equal((await api('/posts/1','PATCH',{title:'변조',content:'변조',password:'initial-admin-1234'})).status,403);
 assert.equal((await api('/admin/login','POST',{username:'community_admin',password:' new-admin-secret '})).status,200);
});
