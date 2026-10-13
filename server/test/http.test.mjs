import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Keypair} from '@solana/web3.js';
import nacl from 'tweetnacl';
test('HTTP wallet proof, replay rejection, origin isolation and payment-disabled board',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pse-http-')),port=18787,origin=`http://localhost:${port}`;
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:origin,DATABASE_PATH:join(dir,'db.sqlite'),PAYOUTS_ENABLED:'false',SCORE_VERIFIER_SECRET:''},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code));});});
    const call=async(path,data,token,originHeader=origin)=>{const r=await fetch(origin+'/api/tournament'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Origin:originHeader,...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,data:await r.json()};};
    const key=Keypair.generate(),wallet=key.publicKey.toBase58();
    assert.equal((await call('/challenge',{wallet},null,'https://evil.invalid')).status,400);
    const c=(await call('/challenge',{wallet})).data;
    const proof={id:c.id,signature:Buffer.from(nacl.sign.detached(Buffer.from(c.message),key.secretKey)).toString('base64')};
    const auth=await call('/auth',proof);assert.equal(auth.status,200);assert.ok(auth.data.token);
    assert.equal((await call('/auth',proof)).status,400);
    assert.equal((await call('/runs',{name:'Test'})).status,400);
    assert.equal((await call('/runs',{name:'Test'},auth.data.token)).status,200);
    assert.equal((await call('/verify',{round:1,wallet,hash:'forged'})).status,400);
    const board=await call('/board');assert.match(board.data.notice,/no SOL payments/);
    assert.equal((await fetch(origin+'/.env')).status,404);
  }finally{const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;rmSync(dir,{recursive:true});}
});
