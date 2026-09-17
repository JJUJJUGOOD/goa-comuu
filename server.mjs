import http from 'node:http';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {backup} from 'node:sqlite';
import {openDatabase,settings} from './db.mjs';
import {token,fail,text,passwordValue,hashPassword,verifyPassword,body} from './security.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const categories=['잡담','정보','질문','후기','모집'];
const columns=`p.id,p.gallery_id,p.title,p.content,p.nickname,p.category,p.image,p.created_at,p.updated_at,p.pinned,p.views,g.name AS gallery_name,g.icon AS gallery_icon,(SELECT count(*) FROM comments WHERE post_id=p.id) AS comment_count,(SELECT count(*) FROM votes WHERE post_id=p.id) AS votes`;
const from=' FROM posts p JOIN galleries g ON g.id=p.gallery_id';
const publicUser=row=>row?{id:row.id,username:row.username,nickname:row.nickname,role:row.role}:null;
const usernameValue=value=>{if(typeof value!=='string')fail(400,'아이디는 영문, 숫자, 밑줄로 4~24자 입력해 주세요.');const v=value.trim().toLowerCase();if(!/^[a-z0-9_]{4,24}$/.test(v))fail(400,'아이디는 영문, 숫자, 밑줄로 4~24자 입력해 주세요.');return v;};

export async function createApp({dataDir=process.env.DATA_DIR||join(root,'data'),adminPassword=process.env.ADMIN_PASSWORD,rateLimit=100,trustProxy=process.env.TRUST_PROXY==='1'}={}){
 const db=await openDatabase(dataDir,adminPassword);const rates=new Map();
 function limited(key,limit){const now=Date.now();let item=rates.get(key);if(!item||item.until<now){item={count:0,until:now+60000};rates.set(key,item);}if(++item.count>limit)fail(429,'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');if(rates.size>20000)for(const [k,v]of rates)if(v.until<now)rates.delete(k);}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method;
   if(!path.startsWith('/api/')){
    if(method!=='GET'&&method!=='HEAD')fail(405,'지원하지 않는 요청입니다.');
    const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
    let file,mime;
    if(files[path]){file=join(root,'public',files[path]);mime=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/html';}
    else if(/^\/uploads\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(path)){file=join(dataDir,'uploads',path.split('/').at(-1));mime=path.endsWith('.jpg')?'image/jpeg':path.endsWith('.png')?'image/png':'image/webp';}
    else fail(404,'페이지를 찾을 수 없습니다.');
    let data;try{data=await readFile(file);}catch{fail(404,'파일을 찾을 수 없습니다.');}
    res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':path.startsWith('/uploads/')?'public, max-age=86400':'no-cache'});res.end(method==='HEAD'?undefined:data);return;
   }
   const ip=trustProxy?req.headers['cf-connecting-ip']||req.socket.remoteAddress:req.socket.remoteAddress;
   limited('all:'+ip,600);
   if(!['GET','HEAD'].includes(method)){
    if(req.headers['sec-fetch-site']==='cross-site')fail(403,'다른 사이트의 요청은 허용하지 않습니다.');
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{fail(403,'올바르지 않은 출처입니다.');}if(origin.host!==req.headers.host)fail(403,'다른 사이트의 요청은 허용하지 않습니다.');}
    if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON 요청이 필요합니다.');limited('write:'+ip,rateLimit);
   }
   let sid=/(?:^|;\s*)moa_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
   let session=sid?db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(sid,Date.now()):null;
   const cookie=(id)=>res.setHeader('Set-Cookie',`moa_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${trustProxy&&req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);
   if(!session){sid=token();session={id:sid,admin_until:0,user_id:null};db.prepare('INSERT INTO sessions(id,expires,user_id) VALUES(?,?,NULL)').run(sid,Date.now()+30*86400000);cookie(sid);}
   let user=session.user_id?db.prepare('SELECT id,username,nickname,role,status,created_at,last_login FROM users WHERE id=?').get(session.user_id):null;
   if(user&&user.status!=='active'){db.prepare('UPDATE sessions SET user_id=NULL,admin_until=0 WHERE id=?').run(sid);user=null;session.user_id=null;session.admin_until=0;}
   const isAdmin=session.admin_until>Date.now();const admin=()=>{if(!isAdmin)fail(401,'관리자 로그인이 필요합니다.');};
   const data=['POST','PUT','PATCH','DELETE'].includes(method)?await body(req):{};
   const getPost=id=>{const p=db.prepare('SELECT * FROM posts WHERE id=?').get(id);if(!p)fail(404,'게시글을 찾을 수 없습니다.');return p;};
   const owner=async row=>{if(!isAdmin&&!await verifyPassword(data.password,row.password_hash))fail(403,'비밀번호가 올바르지 않습니다.');};
   const category=v=>{if(!categories.includes(v))fail(400,'올바른 말머리를 선택해 주세요.');return v;};
   const galleries=()=>db.prepare('SELECT g.*,(SELECT count(*) FROM posts WHERE gallery_id=g.id) AS post_count FROM galleries g ORDER BY position,id').all();
   if(path==='/api/health'&&method==='GET')return send(200,{ok:true});
   if(path==='/api/bootstrap'&&method==='GET')return send(200,{settings:settings(db),galleries:galleries(),categories,isAdmin,user:publicUser(user),stats:db.prepare("SELECT (SELECT count(*) FROM posts) AS posts,(SELECT count(*) FROM comments) AS comments,(SELECT count(*) FROM posts WHERE date(created_at)=date('now')) AS today").get()});
   if(path==='/api/auth/me'&&method==='GET')return send(200,{user:publicUser(user)});
   if(path==='/api/auth/signup'&&method==='POST'){
    limited('signup:'+ip,5);const username=usernameValue(data.username),nickname=text(data.nickname,'닉네임',20),password=passwordValue(data.password,8);
    if(nickname==='운영자')fail(400,'운영자 닉네임은 사용할 수 없습니다.');if(data.passwordConfirm!==undefined&&data.passwordConfirm!==data.password)fail(400,'비밀번호 확인이 일치하지 않습니다.');
    let result;try{result=db.prepare('INSERT INTO users(username,nickname,password_hash) VALUES(?,?,?)').run(username,nickname,await hashPassword(password));}catch(e){if(String(e.message).includes('UNIQUE'))fail(409,'이미 사용 중인 아이디 또는 닉네임입니다.');throw e;}
    const row=db.prepare('SELECT id,username,nickname,role,status,created_at,last_login FROM users WHERE id=?').get(Number(result.lastInsertRowid));const newId=token();db.prepare('INSERT INTO sessions(id,expires,user_id) VALUES(?,?,?)').run(newId,Date.now()+30*86400000,row.id);db.prepare('DELETE FROM sessions WHERE id=?').run(sid);cookie(newId);return send(201,{user:publicUser(row)});
   }
   if(path==='/api/auth/login'&&method==='POST'){
    limited('auth-login:'+ip,10);const username=usernameValue(data.username),row=db.prepare('SELECT * FROM users WHERE username=?').get(username);if(!row||!await verifyPassword(data.password,row.password_hash))fail(401,'아이디 또는 비밀번호가 올바르지 않습니다.');if(row.status!=='active')fail(403,'차단된 계정입니다. 운영자에게 문의해 주세요.');
    db.prepare("UPDATE users SET last_login=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(row.id);const newId=token(),adminUntil=row.role==='operator'?Date.now()+8*3600000:0;db.prepare('INSERT INTO sessions(id,expires,user_id,admin_until) VALUES(?,?,?,?)').run(newId,Date.now()+30*86400000,row.id,adminUntil);db.prepare('DELETE FROM sessions WHERE id=?').run(sid);cookie(newId);return send(200,{user:publicUser({...row,last_login:new Date().toISOString()})});
   }
   if(path==='/api/auth/logout'&&method==='POST'){db.prepare('UPDATE sessions SET user_id=NULL,admin_until=0 WHERE id=?').run(sid);return send(200,{ok:true});}
   if(path==='/api/posts'&&method==='GET'){
    const clauses=[],params=[];const gallery=url.searchParams.get('gallery');if(gallery){clauses.push('p.gallery_id=?');params.push(Number(gallery)||0);}
    const q=(url.searchParams.get('q')||'').trim().slice(0,100);if(q){clauses.push("(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')");const escaped='%'+q.replace(/[\\%_]/g,'\\$&')+'%';params.push(escaped,escaped);}
    const cat=url.searchParams.get('category');if(cat){clauses.push('p.category=?');params.push(cat);}
    const sort=url.searchParams.get('sort');if(sort==='popular'){clauses.push('(SELECT count(*) FROM votes WHERE post_id=p.id)>=?');params.push(settings(db).popularThreshold);}
    if(sort==='notice')clauses.push('p.pinned=1');const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const total=db.prepare('SELECT count(*) AS n'+from+where).get(...params).n;const pages=Math.max(1,Math.ceil(total/15));const page=Math.min(pages,Math.max(1,Number.parseInt(url.searchParams.get('page'))||1));
    const posts=db.prepare('SELECT '+columns.replace('p.content,','')+from+where+' ORDER BY p.pinned DESC,'+(sort==='popular'?'votes DESC,':'')+'p.id DESC LIMIT 15 OFFSET ?').all(...params,(page-1)*15);
    return send(200,{posts,total,page,pages});
   }
   if(path==='/api/posts'&&method==='POST'){
    const galleryId=Number(data.galleryId);if(!db.prepare('SELECT id FROM galleries WHERE id=?').get(galleryId||0))fail(400,'갤러리를 선택해 주세요.');
    const title=text(data.title,'제목',100),content=text(data.content,'내용',20000),nickname=text(data.nickname,'닉네임',20),cat=category(data.category||'잡담');
    if(!isAdmin&&nickname==='운영자')fail(400,'운영자 닉네임은 관리자만 사용할 수 있습니다.');
    if(data.pinned!==undefined&&!isAdmin)fail(403,'공지글은 관리자만 작성할 수 있습니다.');
    const password=isAdmin&&(!data.password||typeof data.password!=='string'||!data.password.trim())?'':passwordValue(data.password);
    const pinned=isAdmin&&['1',1,true,'true','on'].includes(data.pinned)?1:0;
    let img=null;if(data.image){
     if(typeof data.image!=='string')fail(400,'올바른 이미지를 선택해 주세요.');const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data.image);if(!match)fail(400,'PNG, JPG, WebP 이미지만 첨부할 수 있습니다.');
     const bytes=Buffer.from(match[2],'base64');if(bytes.length>4*1024*1024)fail(413,'이미지는 4MB 이하여야 합니다.');
     const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
     if(!valid)fail(400,'올바른 이미지 파일이 아닙니다.');img=token()+'.'+(match[1]==='jpeg'?'jpg':match[1]);await writeFile(join(dataDir,'uploads',img),bytes);
    }
    const hash=password?await hashPassword(password):'';const result=db.prepare('INSERT INTO posts(gallery_id,title,content,nickname,password_hash,category,image,pinned) VALUES(?,?,?,?,?,?,?,?)').run(galleryId,title,content,nickname,hash,cat,img?'/uploads/'+img:null,pinned);
    return send(201,{id:Number(result.lastInsertRowid)});
   }
   let match=/^\/api\/posts\/(\d+)$/.exec(path);
   if(match){const id=Number(match[1]);const post=getPost(id);
    if(method==='GET'){
     if(db.prepare('INSERT OR IGNORE INTO views(post_id,visitor) VALUES(?,?)').run(id,sid).changes)db.prepare('UPDATE posts SET views=views+1 WHERE id=?').run(id);
     return send(200,{post:db.prepare('SELECT '+columns+from+' WHERE p.id=?').get(id),comments:db.prepare('SELECT id,nickname,content,created_at FROM comments WHERE post_id=? ORDER BY id').all(id),voted:!!db.prepare('SELECT 1 FROM votes WHERE post_id=? AND visitor=?').get(id,sid)});
    }
    if(method==='PATCH'){await owner(post);if(data.pinned!==undefined){admin();db.prepare('UPDATE posts SET pinned=? WHERE id=?').run(data.pinned?1:0,id);}else{db.prepare("UPDATE posts SET title=?,content=?,category=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(text(data.title,'제목',100),text(data.content,'내용',20000),category(data.category||post.category),id);}return send(200,{ok:true});}
    if(method==='DELETE'){await owner(post);db.prepare('DELETE FROM posts WHERE id=?').run(id);if(post.image)await unlink(join(dataDir,'uploads',post.image.split('/').at(-1))).catch(()=>{});return send(200,{ok:true});}
   }
   match=/^\/api\/posts\/(\d+)\/(comments|vote)$/.exec(path);
   if(match&&method==='POST'){const id=Number(match[1]);getPost(id);
    if(match[2]==='vote'){const result=db.prepare('INSERT OR IGNORE INTO votes(post_id,visitor) VALUES(?,?)').run(id,sid);if(!result.changes)fail(409,'이미 추천한 글입니다.');return send(200,{votes:db.prepare('SELECT count(*) AS n FROM votes WHERE post_id=?').get(id).n});}
    const nickname=text(data.nickname,'닉네임',20),content=text(data.content,'댓글',2000),password=passwordValue(data.password);const hash=await hashPassword(password);
    const result=db.prepare('INSERT INTO comments(post_id,nickname,content,password_hash) VALUES(?,?,?,?)').run(id,nickname,content,hash);return send(201,{id:Number(result.lastInsertRowid)});
   }
   match=/^\/api\/comments\/(\d+)$/.exec(path);if(match&&method==='DELETE'){const c=db.prepare('SELECT * FROM comments WHERE id=?').get(Number(match[1]));if(!c)fail(404,'댓글을 찾을 수 없습니다.');await owner(c);db.prepare('DELETE FROM comments WHERE id=?').run(c.id);return send(200,{ok:true});}
   if(path==='/api/admin/login'&&method==='POST'){
    limited('login:'+ip,10);const hash=JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('adminHash').value);if(!await verifyPassword(data.password,hash))fail(401,'관리자 비밀번호가 올바르지 않습니다.');
    const newId=token();db.prepare('INSERT INTO sessions(id,expires,admin_until) VALUES(?,?,?)').run(newId,Date.now()+30*86400000,Date.now()+8*3600000);db.prepare('DELETE FROM sessions WHERE id=?').run(sid);cookie(newId);return send(200,{ok:true});
   }
   if(path==='/api/admin/logout'&&method==='POST'){db.prepare('UPDATE sessions SET admin_until=0 WHERE id=?').run(sid);return send(200,{ok:true});}
   if(path.startsWith('/api/admin/')){admin();
    if(path==='/api/admin/users'&&method==='GET')return send(200,{users:db.prepare('SELECT id,username,nickname,role,status,created_at,last_login FROM users ORDER BY id DESC').all().map(publicUserRow=>({...publicUserRow}))});
    const userMatch=/^\/api\/admin\/users\/(\d+)$/.exec(path);if(userMatch&&method==='PATCH'){
     const id=Number(userMatch[1]),row=db.prepare('SELECT id,username,nickname,role,status,created_at,last_login FROM users WHERE id=?').get(id);if(!row)fail(404,'회원을 찾을 수 없습니다.');
     const nickname=data.nickname===undefined?row.nickname:text(data.nickname,'닉네임',20),role=data.role===undefined?row.role:data.role,status=data.status===undefined?row.status:data.status;
     if(!['user','operator'].includes(role))fail(400,'올바른 권한을 선택해 주세요.');if(!['active','blocked'].includes(status))fail(400,'올바른 회원 상태를 선택해 주세요.');if(nickname==='운영자'&&role!=='operator')fail(400,'운영자 닉네임은 운영자 권한에서만 사용할 수 있습니다.');
     try{db.prepare('UPDATE users SET nickname=?,role=?,status=? WHERE id=?').run(nickname,role,status,id);}catch(e){if(String(e.message).includes('UNIQUE'))fail(409,'이미 사용 중인 닉네임입니다.');throw e;}
     if(status==='blocked')db.prepare('UPDATE sessions SET user_id=NULL,admin_until=0 WHERE user_id=?').run(id);
     return send(200,{user:publicUser(db.prepare('SELECT id,username,nickname,role,status,created_at,last_login FROM users WHERE id=?').get(id))});
    }
    if(path==='/api/admin/database'&&method==='GET'){
     const tables=[
      {name:'posts',label:'게시글',columns:['id','gallery_id','title','content','nickname','category','image','created_at','updated_at','pinned','views'],order:'id DESC'},
      {name:'comments',label:'댓글',columns:['id','post_id','nickname','content','created_at'],order:'id DESC'},
      {name:'galleries',label:'갤러리',columns:['id','name','description','icon','position'],order:'id'},
      {name:'settings',label:'사이트 설정',columns:['key','value'],order:'key',where:" WHERE key<>'adminHash'"},
      {name:'users',label:'회원',columns:['id','username','nickname','role','status','created_at','last_login'],order:'id DESC'}
     ];
     const table=tables.find(t=>t.name===(url.searchParams.get('table')||'posts'));if(!table)fail(400,'확인할 수 없는 테이블입니다.');
     const counts=tables.map(t=>({name:t.name,label:t.label,count:db.prepare('SELECT count(*) AS n FROM '+t.name+(t.where||'')).get().n}));
     const total=counts.find(t=>t.name===table.name).count,pages=Math.max(1,Math.ceil(total/50)),page=Math.min(pages,Math.max(1,Number.parseInt(url.searchParams.get('page'))||1));
     const rows=db.prepare('SELECT '+table.columns.join(',')+' FROM '+table.name+(table.where||'')+' ORDER BY '+table.order+' LIMIT 50 OFFSET ?').all((page-1)*50);
     return send(200,{table:table.name,label:table.label,columns:table.columns,rows,tables:counts,total,page,pages});
    }
    const databaseMatch=/^\/api\/admin\/database\/(posts|comments|galleries|settings)\/([^/]+)$/.exec(path);if(databaseMatch&&method==='PATCH'){
     const table=databaseMatch[1],id=decodeURIComponent(databaseMatch[2]);
     const allowedFields={posts:['title','content','nickname','category','pinned'],comments:['nickname','content'],galleries:['name','description','icon','position'],settings:['value']}[table];if(Object.keys(data).some(key=>!allowedFields.includes(key)))fail(400,'수정할 수 없는 필드가 포함되어 있습니다.');
     if(table==='posts'){
      const row=db.prepare('SELECT * FROM posts WHERE id=?').get(Number(id));if(!row)fail(404,'게시글을 찾을 수 없습니다.');
      const title=data.title===undefined?row.title:text(data.title,'제목',100),content=data.content===undefined?row.content:text(data.content,'내용',20000),nickname=data.nickname===undefined?row.nickname:text(data.nickname,'닉네임',20),cat=data.category===undefined?row.category:category(data.category),pinned=data.pinned===undefined?row.pinned:(data.pinned?1:0);
      db.prepare('UPDATE posts SET title=?,content=?,nickname=?,category=?,pinned=?,updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?').run(title,content,nickname,cat,pinned,Number(id));return send(200,{ok:true});
     }
     if(table==='comments'){
      const row=db.prepare('SELECT * FROM comments WHERE id=?').get(Number(id));if(!row)fail(404,'댓글을 찾을 수 없습니다.');
      const nickname=data.nickname===undefined?row.nickname:text(data.nickname,'닉네임',20),content=data.content===undefined?row.content:text(data.content,'댓글',2000);db.prepare('UPDATE comments SET nickname=?,content=? WHERE id=?').run(nickname,content,Number(id));return send(200,{ok:true});
     }
     if(table==='galleries'){
      const row=db.prepare('SELECT * FROM galleries WHERE id=?').get(Number(id));if(!row)fail(404,'갤러리를 찾을 수 없습니다.');
      const name=data.name===undefined?row.name:text(data.name,'갤러리 이름',30),description=data.description===undefined?row.description:text(data.description,'소개',120,0),icon=data.icon===undefined?row.icon:text(data.icon,'아이콘',8),position=data.position===undefined?row.position:Number(data.position);if(!Number.isInteger(position)||position<0||position>999)fail(400,'정렬순서는 0~999 사이여야 합니다.');db.prepare('UPDATE galleries SET name=?,description=?,icon=?,position=? WHERE id=?').run(name,description,icon,position,Number(id));return send(200,{ok:true});
     }
     const allowedSettings=['name','tagline','description','announcement','accent','popularThreshold'];if(!allowedSettings.includes(id))fail(400,'수정할 수 없는 설정입니다.');let value=data.value;if(value===undefined)fail(400,'설정값을 입력해 주세요.');if(id==='name')value=text(String(value),'사이트 이름',24);if(id==='tagline')value=text(String(value),'짧은 소개',70,0);if(id==='description')value=text(String(value),'설명',300,0);if(id==='announcement')value=text(String(value),'공지',200,0);if(id==='accent'){value=text(String(value),'색상',7);if(!/^#[0-9a-f]{6}$/i.test(value))fail(400,'올바른 색상을 입력해 주세요.');}if(id==='popularThreshold'){value=Number(value);if(!Number.isInteger(value)||value<1||value>100)fail(400,'인기글 기준은 1~100 사이여야 합니다.');}db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(value),id);return send(200,{ok:true});
    }
    if(path==='/api/admin/settings'&&method==='PUT'){
     const next={name:text(data.name,'사이트 이름',24),tagline:text(data.tagline,'짧은 소개',70,0),description:text(data.description,'설명',300,0),announcement:text(data.announcement,'공지',200,0),accent:text(data.accent,'색상',7),popularThreshold:Number(data.popularThreshold)};
     if(!/^#[0-9a-f]{6}$/i.test(next.accent))fail(400,'올바른 색상을 선택해 주세요.');if(!Number.isInteger(next.popularThreshold)||next.popularThreshold<1||next.popularThreshold>100)fail(400,'인기글 기준은 1~100 사이여야 합니다.');
     db.exec('BEGIN');try{const s=db.prepare('UPDATE settings SET value=? WHERE key=?');for(const[k,v]of Object.entries(next))s.run(JSON.stringify(v),k);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(200,{settings:next});
    }
    if(path==='/api/admin/password'&&method==='PUT'){
     const old=JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('adminHash').value);if(!await verifyPassword(data.currentPassword,old))fail(403,'현재 비밀번호가 올바르지 않습니다.');const fresh=passwordValue(data.newPassword,12);
     db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(await hashPassword(fresh)),'adminHash');db.prepare('UPDATE sessions SET admin_until=0 WHERE id<>?').run(sid);return send(200,{ok:true});
    }
    if(path==='/api/admin/backup'&&method==='GET'){const dest=join(dataDir,'backup-'+token()+'.sqlite');try{await backup(db,dest);const bytes=await readFile(dest);res.writeHead(200,{'Content-Type':'application/vnd.sqlite3','Content-Disposition':'attachment; filename="moa-backup.sqlite"','Cache-Control':'no-store'});res.end(bytes);}finally{await unlink(dest).catch(()=>{});}return;}
    if(path==='/api/admin/galleries'&&method==='POST'){if(galleries().length>=30)fail(400,'갤러리는 최대 30개까지 만들 수 있습니다.');const r=db.prepare('INSERT INTO galleries(name,description,icon,position) VALUES(?,?,?,?)').run(text(data.name,'갤러리 이름',30),text(data.description,'소개',120,0),text(data.icon||'💬','아이콘',8),galleries().length);return send(201,{id:Number(r.lastInsertRowid)});}
    match=/^\/api\/admin\/galleries\/(\d+)$/.exec(path);if(match){const id=Number(match[1]);if(!db.prepare('SELECT id FROM galleries WHERE id=?').get(id))fail(404,'갤러리를 찾을 수 없습니다.');
     if(method==='PATCH'){db.prepare('UPDATE galleries SET name=?,description=?,icon=? WHERE id=?').run(text(data.name,'이름',30),text(data.description,'소개',120,0),text(data.icon||'💬','아이콘',8),id);return send(200,{ok:true});}
     if(method==='DELETE'){if(galleries().length===1)fail(409,'갤러리는 하나 이상 있어야 합니다.');if(db.prepare('SELECT 1 FROM posts WHERE gallery_id=?').get(id))fail(409,'게시글이 있는 갤러리는 삭제할 수 없습니다. 글을 먼저 정리해 주세요.');db.prepare('DELETE FROM galleries WHERE id=?').run(id);return send(200,{ok:true});}
    }
   }
   fail(404,'요청한 기능을 찾을 수 없습니다.');
  }catch(e){if(!res.headersSent){if(!e.status)console.error(e);send(e.status||500,{error:e.status?e.message:'처리 중 오류가 생겼습니다. 다시 시도해 주세요.'});}else res.end();}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,db};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const app=await createApp();const port=Number(process.env.PORT)||3000;
 app.server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Moa community running at http://127.0.0.1:${port}`));
 const stop=()=>app.server.close(()=>{app.db.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
}

