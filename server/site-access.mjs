import {createHash} from 'node:crypto';

// Only an explicit public setting reopens the game.
export const privateSite=process.env.SITE_ACCESS!=='public';
const cookieName='__Host-pse_owner';
export const ownerCookie=(token,maxAge=600)=>`${cookieName}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
export function ownerSession(req,t,owner){
  const bearer=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  for(const token of new Set([bearer,cookie])){
    if(!token||!/^[a-f0-9]{64}$/.test(token))continue;
    const hash=createHash('sha256').update(token).digest('hex'),now=Date.now();
    if(t.one('SELECT s.hash FROM sessions s JOIN admin_sessions a ON a.hash=s.hash WHERE s.hash=? AND s.wallet=? AND s.expires>? AND a.expires>?',hash,owner,now,now))return hash;
  }
  return null;
}
export const privatePage=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PokéSurvivor — Private</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#091220;color:#f2f4fb;font:18px system-ui}main{max-width:480px;padding:32px;text-align:center}p{color:#acb8cd;line-height:1.6}a{color:#bca4ff}</style><main><h1>PokéSurvivor is private</h1><p>Public access is currently closed.</p><a href="/dev">Owner sign-in</a></main><script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});</script></html>`;
// Replace the former offline cache so returning visitors receive the access gate.
export const privateWorker=`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('pse-'))await caches.delete(k);await self.clients.claim();})()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).origin===self.location.origin)e.respondWith(fetch(e.request));});`;
