import {loadSigner} from './signer.mjs';
export function readiness(env,owner){
 const treasury=env.TREASURY_WALLET||owner;
 let signer='missing';
 if(env.SOLANA_PRIVATE_KEY||env.SOLANA_KEYPAIR_FILE){
  try{const key=loadSigner({...env,TREASURY_WALLET:treasury});signer='configured';key.secretKey.fill(0);}catch{signer='invalid';}
 }
 return {treasury,signer,cluster:env.SOLANA_CLUSTER||'not configured',rpcConfigured:Boolean(env.SOLANA_RPC_URL),
  gameplayVerification:'not implemented',realPaymentsReady:false,
  message:'Automatic real-money rewards are blocked: authoritative gameplay verification and a complete devnet payment test are still required. Configuring a signer alone does not enable payments.'};
}
