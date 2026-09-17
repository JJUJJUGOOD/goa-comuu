import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

test('database viewer is administrator-only, paginated, and excludes all credentials',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'goa-viewer-'));const app=await createApp({dataDir:dir,adminPassword:'viewer-admin-secret'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();await rm(dir,{recursive:true,force:true});});
 assert.equal((await fetch(base+'/api/admin/database')).status,401);
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'community_admin',password:'viewer-admin-secret'})});const cookie=login.headers.getSetCookie()[0].split(';')[0];
 const get=path=>fetch(base+path,{headers:{cookie}});
 const response=await get('/api/admin/database?table=posts');assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.total,2);assert.equal(data.rows[0].id,2);assert.equal(data.tables.find(x=>x.name==='posts').count,2);assert.ok(data.columns.includes('content'));
 assert.equal(JSON.stringify(data).includes('password_hash'),false);
 const settings=await(await get('/api/admin/database?table=settings')).json();assert.equal(settings.rows.some(x=>x.key==='adminHash'),false);
 for(const table of ['sessions','votes','posts;DROP TABLE posts','__proto__'])assert.equal((await get('/api/admin/database?table='+encodeURIComponent(table))).status,400);
 assert.equal((await fetch(base+'/api/admin/database',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'})).status,404);
 const insert=app.db.prepare('INSERT INTO posts(gallery_id,title,content,nickname,password_hash,category) VALUES(1,?,?,?,?,?)');
 for(let i=0;i<53;i++)insert.run('페이지 '+i,'내용','테스트','not-a-real-hash','잡담');
 const second=await(await get('/api/admin/database?table=posts&page=2')).json();assert.equal(second.total,55);assert.equal(second.rows.length,5);assert.equal(second.rows[0].id,5);assert.equal(second.rows[4].id,1);
 const high=await(await get('/api/admin/database?table=posts&page=9999')).json();assert.equal(high.page,2);
});
