import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {loadSigner} from '../signer.mjs';
test('signer accepts supported formats and requires exact treasury identity',()=>{
 const key=Keypair.generate(),address=key.publicKey.toBase58();
 for(const secret of [bs58.encode(key.secretKey),JSON.stringify([...key.secretKey])]){
  const loaded=loadSigner({SOLANA_PRIVATE_KEY:secret,TREASURY_WALLET:address});
  assert.equal(loaded.publicKey.toBase58(),address);
  const message=new TextEncoder().encode('signer self-test');
  assert.ok(nacl.sign.detached.verify(message,nacl.sign.detached(message,loaded.secretKey),key.publicKey.toBytes()));
  assert.throws(()=>loadSigner({SOLANA_PRIVATE_KEY:secret,TREASURY_WALLET:Keypair.generate().publicKey.toBase58()}),/mismatch/);
 }
});
test('signer rejects ambiguous, malformed and truncated secrets without disclosure',()=>{
 assert.throws(()=>loadSigner({}),/exactly one/);
 assert.throws(()=>loadSigner({SOLANA_PRIVATE_KEY:'secret',SOLANA_KEYPAIR_FILE:'file'}),/exactly one/);
 for(const value of ['sensitive-invalid-secret',JSON.stringify(Array(64).fill(256)),JSON.stringify(Array(32).fill(1))]){
  assert.throws(()=>loadSigner({SOLANA_PRIVATE_KEY:value}),e=>!e.message.includes(value)&&e.message==='Invalid signing secret or treasury public address mismatch');
 }
});
