import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Keypair} from '@solana/web3.js';
import {solanaAdapter} from '../payouts.mjs';
test('RPC identity accepts complete devnet hash and rejects wrong or truncated hashes before signing',async()=>{
 let genesis='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
 const server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const request=JSON.parse(raw);assert.equal(request.method,'getGenesisHash');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result:genesis}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const key=Keypair.generate();const env={SOLANA_CLUSTER:'devnet',SOLANA_RPC_URL:'http://127.0.0.1:'+server.address().port,TREASURY_WALLET:key.publicKey.toBase58(),SOLANA_PRIVATE_KEY:JSON.stringify([...key.secretKey])};
 try{
  assert.equal(typeof (await solanaAdapter(env)).prepare,'function');
  genesis='EtWTRABZaYq6iMfeYKouRu166VU2xqa1';await assert.rejects(solanaAdapter(env),/RPC cluster/);
  genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';await assert.rejects(solanaAdapter(env),/RPC cluster/);
  await assert.rejects(solanaAdapter({...env,SOLANA_CLUSTER:'mainnet-beta'}),/Mainnet payouts are disabled/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
