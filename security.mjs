import {randomBytes,scrypt as scryptCb,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCb);
export const token=()=>randomBytes(32).toString('hex');
export function fail(status,message){throw Object.assign(new Error(message),{status});}
export function text(value,name,max,min=1){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(400,`${name}: ${min}~${max}자로 입력해 주세요.`);return value.trim();}
export function passwordValue(value,min=4){if(typeof value!=='string'||value.length<min||value.length>128||!value.trim())fail(400,`비밀번호는 ${min}~128자로 입력해 주세요.`);return value;}
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${(await scrypt(password,salt,64)).toString('hex')}`;}
export async function verifyPassword(password,stored){if(typeof password!=='string'||password.length>128||!stored)return false;const [salt,hash]=stored.split(':');const got=await scrypt(password,salt,64);return hash?.length===128&&timingSafeEqual(got,Buffer.from(hash,'hex'));}
export async function body(req){let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>6*1024*1024)fail(413,'첨부파일을 포함해 6MB 이하로 작성해 주세요.');chunks.push(chunk);}try{const parsed=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'잘못된 요청입니다.');return parsed;}catch{fail(400,'잘못된 JSON 요청입니다.');}}
