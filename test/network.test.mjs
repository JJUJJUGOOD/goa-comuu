import test from 'node:test';
import assert from 'node:assert/strict';
import {clientIP,ipDisplay,publicAuthor} from '../network.mjs';

test('IP는 신뢰하는 터널에서만 수용하고 공개 응답에는 일부만 제공한다',()=>{
 const req=(remote,forwarded)=>({socket:{remoteAddress:remote},headers:{'cf-connecting-ip':forwarded}});
 assert.equal(clientIP(req('::ffff:127.0.0.1','123.45.67.89'),true),'123.45.67.89');
 assert.equal(clientIP(req('192.0.2.10','123.45.67.89'),true),'192.0.2.10');
 assert.equal(clientIP(req('127.0.0.1','123.45.67.89'),false),'127.0.0.1');
 assert.equal(clientIP(req('127.0.0.1','<script>'),true),'127.0.0.1');
 assert.equal(ipDisplay('1.2.3.4'),'001.002');
 assert.equal(ipDisplay('2001:db8::1'),'20010d');
 assert.equal(ipDisplay(null),null);
 assert.deepEqual(publicAuthor({nickname:'회원',user_id:2,author_ip:'123.45.67.89'}),{nickname:'회원',user_id:2,ip_display:null});
});
