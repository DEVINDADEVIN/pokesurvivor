import {Keypair} from '@solana/web3.js';
import bs58 from 'bs58';
import {readFileSync} from 'node:fs';
// Only generic errors escape this module: never echo secret input or parser errors.
export function loadSigner(env){
  const inline=env.SOLANA_PRIVATE_KEY, file=env.SOLANA_KEYPAIR_FILE;
  if(Boolean(inline)===Boolean(file))throw new Error('Configure exactly one server signing secret');
  let bytes;
  try {
    const raw=(inline||readFileSync(file,'utf8')).trim();
    if(raw.startsWith('[')){
      const values=JSON.parse(raw);
      if(!Array.isArray(values)||values.length!==64||values.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error();
      bytes=Uint8Array.from(values);
    }else bytes=bs58.decode(raw);
    if(bytes.length!==64)throw Error();
    const key=Keypair.fromSecretKey(Uint8Array.from(bytes));
    if(!env.TREASURY_WALLET||key.publicKey.toBase58()!==env.TREASURY_WALLET)throw Error();
    return key;
  }catch{throw new Error('Invalid signing secret or treasury public address mismatch');}
  finally{bytes?.fill(0);}
}
