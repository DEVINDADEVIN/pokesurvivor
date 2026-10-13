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
  const key=Keypair.generate(),wallet=key.publicKey.toBase58();
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:origin,DATABASE_PATH:join(dir,'db.sqlite'),ADMIN_WALLET:wallet,PAYOUTS_ENABLED:'false',SCORE_VERIFIER_SECRET:''},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code));});});
    const call=async(path,data,token,originHeader=origin)=>{const r=await fetch(origin+'/api/tournament'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Origin:originHeader,...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,data:await r.json()};};

    assert.equal((await call('/challenge',{wallet},null,'https://evil.invalid')).status,400);
    const c=(await call('/challenge',{wallet})).data;
    const proof={id:c.id,signature:Buffer.from(nacl.sign.detached(Buffer.from(c.message),key.secretKey)).toString('base64')};
    const auth=await call('/auth',proof);assert.equal(auth.status,200);assert.ok(auth.data.token);
    assert.equal((await call('/auth',proof)).status,400);
    assert.equal((await call('/runs',{name:'Test'})).status,400);
    assert.equal((await call('/runs',{name:'Test'},auth.data.token)).status,200);
    assert.equal((await call('/verify',{round:1,wallet,hash:'forged'})).status,400);
    assert.equal((await call('/admin',null,auth.data.token)).status,400);
    assert.equal((await call('/challenge',{wallet:Keypair.generate().publicKey.toBase58(),admin:true})).status,400);
    const ac=(await call('/challenge',{wallet,admin:true})).data;
    const aa=await call('/auth',{id:ac.id,signature:Buffer.from(nacl.sign.detached(Buffer.from(ac.message),key.secretKey)).toString('base64')});
    assert.equal((await call('/admin/readiness',null,auth.data.token)).status,400);
    const setup=await call('/admin/readiness',null,aa.data.token);assert.equal(setup.data.realPaymentsReady,false);assert.equal(setup.data.gameplayVerification,'not implemented');
    const initial=await call('/admin',null,aa.data.token);assert.equal(initial.data.budget,400000000);
    const update={revision:initial.data.revision,budget:500000000,prizes:[12000000,6000000,3000000]};
    assert.equal((await call('/admin',update,auth.data.token)).status,400);
    assert.equal((await call('/admin',update,aa.data.token,'https://evil.invalid')).status,400);
    assert.equal((await call('/admin',update,aa.data.token)).status,200);
    assert.equal((await call('/admin',update,aa.data.token)).status,400);
    assert.equal((await fetch(origin+'/dev')).status,200);
    const board=await call('/board');assert.match(board.data.notice,/no SOL payments/);
    assert.equal((await fetch(origin+'/.env')).status,404);
  }finally{const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;rmSync(dir,{recursive:true});}
});
