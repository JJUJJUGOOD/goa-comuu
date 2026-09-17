import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {hashPassword,token} from './security.mjs';

export async function openDatabase(dataDir,adminPassword){
 await mkdir(dataDir,{recursive:true});await mkdir(join(dataDir,'uploads'),{recursive:true});
 const db=new DatabaseSync(join(dataDir,'community.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS galleries(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT NOT NULL,icon TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY AUTOINCREMENT,gallery_id INTEGER NOT NULL REFERENCES galleries(id),title TEXT NOT NULL,content TEXT NOT NULL,nickname TEXT NOT NULL,password_hash TEXT NOT NULL,category TEXT NOT NULL DEFAULT '잡담',image TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT,pinned INTEGER NOT NULL DEFAULT 0,views INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY AUTOINCREMENT,post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,nickname TEXT NOT NULL,content TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL COLLATE NOCASE UNIQUE,nickname TEXT NOT NULL COLLATE NOCASE UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','operator')),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),last_login TEXT);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,admin_until INTEGER NOT NULL DEFAULT 0,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS votes(post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,visitor TEXT NOT NULL,PRIMARY KEY(post_id,visitor));
 CREATE TABLE IF NOT EXISTS views(post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,visitor TEXT NOT NULL,PRIMARY KEY(post_id,visitor));
 CREATE INDEX IF NOT EXISTS idx_posts_gallery ON posts(gallery_id,id DESC);
 CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
 CREATE INDEX IF NOT EXISTS idx_users_status ON users(status,created_at DESC);
 `);
 const sessionColumns=db.prepare('PRAGMA table_info(sessions)').all().map(c=>c.name);
 if(!sessionColumns.includes('user_id'))db.exec('ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id)');
 for(const table of ['posts','comments'])if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='user_id'))db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id)`);
 if(!db.prepare('PRAGMA table_info(posts)').all().some(c=>c.name==='adult'))db.exec('ALTER TABLE posts ADD COLUMN adult INTEGER NOT NULL DEFAULT 0');
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='is_owner'))db.exec('ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0');
 if(!db.prepare('SELECT value FROM settings WHERE key=?').get('adminHash')){
  const password=adminPassword||token().slice(0,24);const hash=await hashPassword(password);
  const defaults={name:'고아 커뮤니티',tagline:'경주정보고, 여기서 모이자.',description:'학교 이야기부터 게임, 일상, 아무 말까지. 경주정보고 친구들의 자유로운 공간.',accent:'#334b8e',announcement:'우리만의 작은 커뮤니티에 오신 걸 환영해요. 닉네임만 정하고 첫 이야기를 남겨보세요!',popularThreshold:3,adminHash:hash};
  db.exec('BEGIN');try{
   const insert=db.prepare('INSERT INTO settings(key,value) VALUES(?,?)');for(const [k,v]of Object.entries(defaults))insert.run(k,JSON.stringify(v));
   const gallery=db.prepare('INSERT INTO galleries(name,description,icon,position) VALUES(?,?,?,?)');
   [['경주정보고 갤러리','학교 이야기부터 일상까지, 경주정보고 친구들의 공간.','🏫']].forEach((g,i)=>gallery.run(...g,i));
   const p=db.prepare('INSERT INTO posts(gallery_id,title,content,nickname,password_hash,category,pinned) VALUES(?,?,?,?,?,?,1)');
   p.run(1,'처음 오셨나요? 고아 커뮤니티 이용 가이드','고아 커뮤니티는 친구들과 편하게 이야기하는 공간입니다.\n\n1. 마음에 드는 갤러리를 고르세요.\n2. 닉네임과 글 비밀번호를 정하고 글을 남기세요.\n3. 재미있는 글에는 추천과 댓글을 남겨주세요.\n\n글 비밀번호는 수정·삭제할 때 필요합니다. 잊어버리면 관리자에게 요청해 주세요. 닉네임은 계정이 아니므로 같은 닉네임을 다른 사람이 사용할 수 있습니다.\n\n서로를 존중하고, 다른 사람의 개인정보는 올리지 말아 주세요.','운영자',hash,'정보');
   p.run(1,'우리 공간, 이렇게 바꿀 수 있어요','관리자 메뉴에서 사이트 이름, 소개, 메인 색상, 상단 알림을 바꿀 수 있어요.\n\n갤러리는 원하는 주제로 추가하고 이름을 수정할 수 있습니다. 내용이 없는 갤러리는 삭제할 수 있어요. 관리자는 게시글을 공지로 지정하거나 부적절한 글·댓글을 삭제할 수 있습니다.\n\n현재 보이는 안내 두 개는 시작을 돕는 운영 공지입니다. 마음에 맞게 수정하거나 삭제하세요.','운영자',hash,'정보');
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');db.close();throw e;}
  await writeFile(join(dataDir,'owner-access.txt'),`고아 커뮤니티 관리자\n\n관리자 비밀번호: ${password}\n\n사이트 오른쪽 위 관리 메뉴에서 로그인하세요.\n이 파일과 data 폴더를 친구에게 공유하지 마세요.\n관리 화면에서 비밀번호를 바꾸면 이 초기 비밀번호는 사용할 수 없습니다.\n`,{mode:0o600});
 }
 if(!db.prepare('SELECT id FROM users WHERE is_owner=1').get()){
  let username='community_admin';while(db.prepare('SELECT id FROM users WHERE username=?').get(username))username='admin_'+token().slice(0,12);
  let nickname='사이트관리자';while(db.prepare('SELECT id FROM users WHERE nickname=?').get(nickname))nickname='관리자_'+token().slice(0,6);
  const hash=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='adminHash'").get().value);
  db.prepare("INSERT INTO users(username,nickname,password_hash,role,is_owner) VALUES(?,?,?,'operator',1)").run(username,nickname,hash);
  db.prepare('UPDATE sessions SET admin_until=0').run();
  await writeFile(join(dataDir,'admin-account.txt'),`관리자 전용 아이디: ${username}\n비밀번호: 현재 관리자 비밀번호를 사용하세요. 최초 비밀번호는 owner-access.txt에 있습니다.\n이 파일은 공유하지 마세요.\n`,{mode:0o600});
 }
 // These IDs are the two original system notices, never reused (AUTOINCREMENT).
 // They are managed only through an authenticated administrator session.
 db.prepare("UPDATE posts SET password_hash='' WHERE id IN (1,2) AND nickname='운영자'").run();
 db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());return db;
}
export function settings(db){return Object.fromEntries(db.prepare("SELECT key,value FROM settings WHERE key<>'adminHash'").all().map(r=>[r.key,JSON.parse(r.value)]));}

