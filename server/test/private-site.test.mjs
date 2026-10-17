import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Keypair} from '@solana/web3.js';
import nacl from 'tweetnacl';

test('private site denies visitors and existing player sessions, allows signed owner, expires and revokes access',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pse-private-')),port=18789,origin=`http://localhost:${port}`;
  const key=Keypair.generate(),wallet=key.publicKey.toBase58();
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,SITE_ACCESS:'',PORT:String(port),PUBLIC_ORIGIN:origin,DATABASE_PATH:join(dir,'db.sqlite'),ADMIN_WALLET:wallet,PAYOUTS_ENABLED:'false',SCORE_VERIFIER_SECRET:''},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server startup timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code));});});
    const post=async(path,data,headers={})=>fetch(origin+'/api/tournament/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
    for(const path of ['/','/index.html','/en/','/js/app.min.js','/assets/branding/pokesurvivor-litwick-logo-v1.png','/api/tournament/board','/api/tournament/admin']){
      const r=await fetch(origin+path);assert.equal(r.status,403,path);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('x-robots-tag'),/noindex/);
    }
    assert.equal((await fetch(origin+'/',{method:'HEAD'})).status,403);
    assert.equal((await fetch(origin+'/healthz')).status,200);
    assert.equal((await fetch(origin+'/dev')).status,200);
    const sw=await fetch(origin+'/sw.js');assert.equal(sw.status,200);assert.match(await sw.text(),/caches.delete/);
    assert.equal((await post('challenge',{wallet:Keypair.generate().publicKey.toBase58(),admin:true})).status,403);
    async function signIn(admin){
      const c=await(await post('challenge',{wallet,admin})).json();
      return post('auth',{id:c.id,signature:Buffer.from(nacl.sign.detached(Buffer.from(c.message),key.secretKey)).toString('base64')});
    }
    const player=await(await signIn(false)).json();
    assert.equal((await fetch(origin+'/api/tournament/board',{headers:{Authorization:'Bearer '+player.token}})).status,403);
    let auth=await signIn(true);const token=(await auth.json()).token;
    const setCookie=auth.headers.get('set-cookie'),cookie=setCookie.split(';')[0];
    assert.match(setCookie,/Secure; HttpOnly; SameSite=Strict/);
    assert.equal((await fetch(origin+'/',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await fetch(origin+'/api/tournament/board',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await fetch(origin+'/api/tournament/board',{headers:{Cookie:cookie,Authorization:'Bearer '+player.token}})).status,200);
    assert.equal((await post('logout',{}, {Origin:'https://evil.invalid',Cookie:cookie})).status,400);
    assert.equal((await fetch(origin+'/',{headers:{Cookie:cookie}})).status,200);
    const locked=await post('logout',{}, {Cookie:cookie});assert.equal(locked.status,200);assert.match(locked.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal((await fetch(origin+'/',{headers:{Cookie:cookie}})).status,403);
    assert.equal((await fetch(origin+'/',{headers:{Authorization:'Bearer '+token}})).status,403);
    auth=await signIn(true);const expiring=auth.headers.get('set-cookie').split(';')[0];await auth.json();
    const db=new DatabaseSync(join(dir,'db.sqlite'));db.exec('UPDATE admin_sessions SET expires=0');db.close();
    assert.equal((await fetch(origin+'/',{headers:{Cookie:expiring}})).status,403);
  }finally{const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;rmSync(dir,{recursive:true});}
});
