import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Keypair,Transaction,SystemInstruction} from '@solana/web3.js';
import {Tournament,PERIOD} from '../core.mjs';
import {Payouts,solanaAdapter} from '../payouts.mjs';
import {readiness} from '../readiness.mjs';

test('three-winner round builds a valid signed transaction and cannot pay twice (simulated RPC)',async()=>{
 const treasury=Keypair.generate(),players=Array.from({length:3},()=>Keypair.generate().publicKey.toBase58());
 let now=PERIOD*100,final=false,sends=0;const t=new Tournament(':memory:',()=>now);
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;const q=JSON.parse(raw);let result;
  switch(q.method){
   case 'getGenesisHash':result='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';break;
   case 'getLatestBlockhash':result={context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}};break;
   case 'getFeeForMessage':result={context:{slot:1},value:5000};break;
   case 'getBalance':result={context:{slot:1},value:1000000000};break;
   case 'getSignatureStatuses':result={context:{slot:1},value:[final?{slot:1,confirmations:null,err:null,confirmationStatus:'finalized'}:null]};break;
   case 'getBlockHeight':result=1;break;
   case 'sendTransaction':{
    sends++;const tx=Transaction.from(Buffer.from(q.params[0],'base64'));assert.equal(tx.verifySignatures(),true);
    assert.equal(tx.feePayer.toBase58(),treasury.publicKey.toBase58());assert.equal(tx.instructions.length,3);
    const transfers=tx.instructions.map(i=>SystemInstruction.decodeTransfer(i));
    assert.deepEqual(transfers.map(x=>x.toPubkey.toBase58()),players.slice().reverse());
    assert.deepEqual(transfers.map(x=>Number(x.lamports)),[10000000,6000000,3000000]);
    assert.ok(transfers.every(x=>x.fromPubkey.equals(treasury.publicKey)));
    result=t.one('SELECT signature FROM payouts WHERE round=100').signature;break;
   }
   default:throw Error('Unexpected RPC '+q.method);
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(let i=0;i<3;i++){
   const run=t.start(players[i],'Test '+i);now+=10000;
   const observation=t.heartbeat(players[i],{id:run.id,time:10,kills:i+1,end:true});
   // Fixture only: no claim that these synthetic scores prove gameplay.
   t.verify({...observation,wallet:players[i]});
  }
  now=PERIOD*101;
  const adapter=await solanaAdapter({SOLANA_CLUSTER:'devnet',SOLANA_RPC_URL:'http://127.0.0.1:'+server.address().port,TREASURY_WALLET:treasury.publicKey.toBase58(),SOLANA_PRIVATE_KEY:JSON.stringify([...treasury.secretKey])});
  await new Payouts(t,adapter,{enabled:true}).tick();assert.equal(sends,1);assert.equal(t.board().entries.length,0);
  assert.equal(t.one('SELECT amount FROM payouts WHERE round=100').amount,19000000);
  final=true;const restartedWorker=new Payouts(t,adapter,{enabled:true});await restartedWorker.tick();await restartedWorker.tick();
  assert.equal(t.one('SELECT status FROM payouts WHERE round=100').status,'paid');assert.equal(sends,1);
 }finally{t.db.close();await new Promise(resolve=>server.close(resolve));}
});
test('readiness recognizes completed self-transfer without claiming gameplay or real payouts ready',()=>{
 const r=readiness({SOLANA_CLUSTER:'devnet'},'owner',{status:'finalized',signature:'test-signature'});
 assert.equal(r.devnetTransfer.status,'finalized');assert.equal(r.realPaymentsReady,false);assert.equal(r.gameplayVerification,'not implemented');assert.match(r.message,/self-transfer confirmed/);
});
