import {OWNER,adminState,updateSettings} from './admin.mjs';
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';
import {Tournament} from './core.mjs';
import {Payouts,solanaAdapter} from './payouts.mjs';
const env=process.env,port=Number(env.PORT||8787),origin=env.PUBLIC_ORIGIN||`http://localhost:${port}`;
const allowedOrigins=new Set([origin,...(env.RAILWAY_PUBLIC_DOMAIN?['https://'+env.RAILWAY_PUBLIC_DOMAIN]:[])]);
const owner=env.ADMIN_WALLET||OWNER;
const t=new Tournament(env.DATABASE_PATH||'tournament.sqlite');
const secret=env.SCORE_VERIFIER_SECRET||'';
if(secret&&secret.length<32)throw new Error('Use a strong verifier secret of at least 32 characters');
const enabled=env.PAYOUTS_ENABLED==='true';
if(enabled&&(!secret||env.SCORE_VERIFIER_READY!=='true'))throw new Error('Trusted score verifier must be operational before enabling payouts');
const adapter=enabled?await solanaAdapter({...env,TREASURY_WALLET:env.TREASURY_WALLET||owner}):null;
const dailyCap=Number(env.DAILY_PAYOUT_CAP_LAMPORTS||2736000000);
if(!Number.isSafeInteger(dailyCap)||dailyCap<0)throw new Error('Invalid daily payout cap');
const payouts=new Payouts(t,adapter,{enabled,dailyCap});
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
const rates=new Map();
const timer=setInterval(()=>{payouts.tick().catch(()=>console.error('Tournament settlement unavailable'));for(const[k,v]of rates)if(v.expires<Date.now())rates.delete(k);},1000);
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>8192)throw new Error('Request too large');}return data;}
function user(req){const bearer=req.headers.authorization?.replace(/^Bearer /,'');const session=bearer&&t.one('SELECT wallet FROM sessions WHERE hash=? AND expires>?',hash(bearer),Date.now());if(!session)throw new Error('Connect and verify your wallet first');return session.wallet;}
function admin(req){
  const token=req.headers.authorization?.replace(/^Bearer /,'');
  if(user(req)!==owner||!token||!t.one('SELECT hash FROM admin_sessions WHERE hash=? AND expires>?',hash(token),Date.now()))throw new Error('Developer wallet authorization required. Sign in again.');
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin),path=url.pathname;
    if(path==='/dev'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});
      res.end(await readFile(new URL('./dev.html',import.meta.url)));return;
    }
    if(path==='/api/tournament/admin-info'&&req.method==='GET'){reply(res,200,{owner});return;}
    if(!path.startsWith('/api/tournament')){
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      let file=resolve(root,'.'+decodeURIComponent(path));if(file!==root&&!file.startsWith(root+sep))throw new Error('Invalid path');
      if((await stat(file)).isDirectory())file=resolve(file,'index.html');
      const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);return;
    }
    const ip=req.socket.remoteAddress||'unknown',r=rates.get(ip)||{count:0,expires:Date.now()+60000};r.count++;rates.set(ip,r);
    if(r.count>240){reply(res,429,{error:'Too many requests; wait a minute'});return;}
    if(req.method==='GET'&&path==='/api/tournament/board'){reply(res,200,{...t.board(),notice:enabled?`${env.SOLANA_CLUSTER.toUpperCase()} — only independently verified scores qualify. Payments are marked paid after finalization.`:'TEST MODE — no SOL payments are active. Scores are provisional until independently verified. Treasury and verifier setup required.'});return;}
    if(path==='/api/tournament/admin'&&req.method==='GET'){
      admin(req);reply(res,200,{...adminState(t),paymentsEnabled:enabled,treasury:env.TREASURY_WALLET||owner});return;
    }
    if(req.method!=='POST'){reply(res,404,{error:'Not found'});return;}
    const raw=await body(req);
    if(path==='/api/tournament/verify'){
      const timestamp=req.headers['x-verifier-time'],signature=req.headers['x-verifier-signature'];
      if(!secret||!timestamp||!signature||Math.abs(Date.now()-Number(timestamp))>30000||!/^\d+$/.test(timestamp))throw new Error('Verifier authorization required');
      const expected=createHmac('sha256',secret).update(timestamp+'.'+raw).digest(),actual=Buffer.from(signature,'hex');
      if(actual.length!==expected.length||!timingSafeEqual(expected,actual))throw new Error('Invalid verifier signature');
      reply(res,200,t.verify(JSON.parse(raw)));return;
    }
    if(!allowedOrigins.has(req.headers.origin))throw new Error('Invalid request origin');
    const data=JSON.parse(raw);
    if(path==='/api/tournament/admin'){
      admin(req);t.tick();updateSettings(t,data,owner);reply(res,200,{...adminState(t),paymentsEnabled:enabled,treasury:env.TREASURY_WALLET||owner});return;
    }
    if(path==='/api/tournament/challenge'){
      if(data.admin===true&&data.wallet!==owner)throw new Error('Only the developer wallet may administer rewards');
      const publicKey=new PublicKey(data.wallet);if(!PublicKey.isOnCurve(publicKey.toBytes()))throw new Error('Use a signing wallet');
      const id=randomUUID(),expires=Date.now()+120000,message=`${data.admin===true?'Developer administration: authorize budget and prize changes for 10 minutes':'PokeSurvivor tournament sign-in'}\nOrigin: ${req.headers.origin}\nWallet: ${publicKey.toBase58()}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nThis signature only signs in. It does not authorize a transfer.`;
      t.exec('INSERT INTO challenges VALUES(?,?,?,?)',id,publicKey.toBase58(),message,expires);reply(res,200,{id,message});return;
    }
    if(path==='/api/tournament/auth'){
      const c=t.one('SELECT * FROM challenges WHERE id=? AND expires>?',data.id,Date.now());
      if(!c||!nacl.sign.detached.verify(Buffer.from(c.message),Buffer.from(data.signature,'base64'),bs58.decode(c.wallet)))throw new Error('Wallet signature invalid or expired');
      const token=randomBytes(32).toString('hex');t.atomic(()=>{t.exec('DELETE FROM challenges WHERE id=?',c.id);t.exec('INSERT INTO sessions VALUES(?,?,?)',hash(token),c.wallet,Date.now()+86400000);if(c.wallet===owner&&c.message.startsWith('Developer administration:'))t.exec('INSERT INTO admin_sessions VALUES(?,?)',hash(token),Date.now()+600000);});reply(res,200,{token});return;
    }
    const wallet=user(req);
    if(path==='/api/tournament/runs'){reply(res,200,t.start(wallet,data.name));return;}
    if(path==='/api/tournament/heartbeat'){reply(res,200,t.heartbeat(wallet,data));return;}
    reply(res,404,{error:'Not found'});
  }catch(e){if(!res.headersSent)reply(res,e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'Not found':String(e.message).slice(0,180)});else res.end();}
});
server.listen(port,()=>console.log(`Tournament server: ${origin} | payments ${enabled?'enabled':'disabled'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{t.db.close();process.exit(0);});});
