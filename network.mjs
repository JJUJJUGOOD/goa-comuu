import {isIP} from 'node:net';

export function clientIP(req,trustProxy){
 const remote=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
 // The bundled tunnel connects to the loopback-only Node server.
 const forwarded=trustProxy&&['127.0.0.1','::1'].includes(remote)?req.headers['cf-connecting-ip']:null;
 const value=typeof forwarded==='string'&&isIP(forwarded)?forwarded:remote;
 return isIP(value)?value.toLowerCase():null;
}
export function ipDisplay(ip){
 if(!ip)return null;
 if(isIP(ip)===4)return ip.split('.').slice(0,2).map(n=>n.padStart(3,'0')).join('.');
 if(isIP(ip)===6){
  const [left,right]=ip.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];
  const parts=right===undefined?a:[...a,...Array(Math.max(0,8-a.length-b.length)).fill('0'),...b];
  return parts.map(part=>part.padStart(4,'0')).join('').slice(0,6);
 }
 return null;
}
export function publicAuthor(row){
 const {author_ip,...visible}=row;
 return {...visible,ip_display:row.user_id?null:ipDisplay(author_ip)};
}
