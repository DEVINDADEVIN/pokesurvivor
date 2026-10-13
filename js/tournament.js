/* Practice works offline. Ranked play requires the separately deployed server.
 * Browser counters are provisional and NEVER authorize a payment. */
G.Tournament = (() => {
  const PERIOD = 600000, PRIZES = [10000000, 6000000, 3000000];
  const KEY = 'pse.tournament.practice.v1';
  let board = { round: Math.floor(Date.now()/PERIOD), entries: [], history: [] };
  try { const saved=JSON.parse(localStorage.getItem(KEY)); if(saved && Array.isArray(saved.entries) && Array.isArray(saved.history)) board=saved; } catch {}
  let run=null, panel=null, remote=null, token=null, wallet=null, serverRun=null, offset=0;
  let lastSend=0, pending=false, queued=null, lastRead=0, message='';
  const now=()=>Date.now()+offset;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const score=(seconds,kills)=>Math.floor(seconds)+kills*10;
  const order=(a,b)=>b.score-a.score || b.seconds-a.seconds || a.achievedAt-b.achievedAt || a.id.localeCompare(b.id);
  const short=s=>s?s.slice(0,5)+'…'+s.slice(-4):'';
  function save(){try{localStorage.setItem(KEY,JSON.stringify(board));}catch{message='Practice storage is unavailable; results last only this session.';}}
  function rollover(){
    const id=Math.floor(now()/PERIOD);
    if(id===board.round)return;
    if(board.entries.length)board.history.unshift({round:board.round,entries:board.entries.slice().sort(order).slice(0,3)});
    board={round:id,entries:[],history:board.history.slice(0,20)};
    if(run){run.baseTime=run.time;run.baseKills=run.kills;}
    save();
  }
  function record(){
    if(!run)return;
    const seconds=Math.max(0,Math.floor(run.time-run.baseTime)),kills=Math.max(0,run.kills-run.baseKills);
    if(!seconds&&!kills)return;
    const entry={id:run.player,name:run.name,seconds,kills,score:score(seconds,kills),achievedAt:now()};
    const old=board.entries.find(e=>e.id===entry.id);
    if(!old||order(entry,old)<0){board.entries=board.entries.filter(e=>e.id!==entry.id);board.entries.push(entry);board.entries.sort(order);save();}
  }
  async function api(path,body){
    const res=await fetch('/api/tournament'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000),cache:'no-store'});
    if(!(res.headers.get('content-type')||'').includes('application/json'))throw new Error('Tournament server is not connected. Practice mode remains available.');
    const value=await res.json(); if(!res.ok)throw new Error(value.error||'Tournament service unavailable');return value;
  }
  async function refresh(){
    lastRead=Date.now();
    try{const value=await api('/board');remote=value;offset=value.serverTime-Date.now();}
    catch{remote=null;offset=0;}
    render();
  }
  async function connect(){
    try{
      const provider=window.phantom?.solana||window.solana;
      if(!provider?.connect||!provider?.signMessage)throw new Error('Open this game in a browser with a Solana wallet that supports message signing.');
      if(!remote)throw new Error('Wallet connection opens when the tournament server is deployed. No SOL payments are active.');
      const result=await provider.connect(),address=result.publicKey.toString();
      const challenge=await api('/challenge',{wallet:address});
      const signed=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8');
      const signature=btoa(String.fromCharCode(...signed.signature));
      const auth=await api('/auth',{id:challenge.id,signature});token=auth.token;wallet=address;serverRun=null;
      message='Wallet verified. Start a new solo run to enter the provisional board.';
    }catch(e){message=e.message;}render();
  }
  function start(coop){
    run=null;serverRun=null;
    if(coop)return;
    rollover();
    run={id:crypto.randomUUID(),player:G.DB.guest?'guest':String(G.DB.user||G.DB.save?.name||'Player'),name:String(G.DB.user||G.DB.save?.name||'Guest'),time:0,kills:0,baseTime:0,baseKills:0};
    if(token&&remote){const id=run.id;api('/runs',{name:run.name}).then(r=>{if(run?.id===id)serverRun=r.id;}).catch(e=>{message=e.message;});}
  }
  function sample(time,kills){
    if(!run)return;
    // Rollover BEFORE applying the next observation, never carry an old run's total.
    rollover();run.time=time;run.kills=kills;
    if(Date.now()-lastSend>2000){record();lastSend=Date.now();send(false);}
  }
  function send(end){
    if(!serverRun||!run)return;
    const body={id:serverRun,time:run.time,kills:run.kills,end};
    if(pending){if(!queued?.end)queued=body;return;}sendBody(body);
  }
  async function sendBody(body){
    pending=true;
    try{await api('/heartbeat',body);}catch(e){message=e.message;}finally{pending=false;const next=queued;queued=null;if(next)sendBody(next);}
  }
  function finish(time,kills){sample(time,kills);record();send(true);run=null;serverRun=null;}
  function mount(){
    if(panel)return;
    panel=document.createElement('section');panel.id='tournament';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','SOL Tournament');
    panel.innerHTML=`<div class="tr-wrap"><header><div><span class="tr-kicker">POKÉSURVIVOR · TOURNAMENT</span><h1>Survive. Defeat. Climb.</h1></div><button id="tr-close" aria-label="Close tournament">Close</button></header><div class="tr-top"><div><b id="tr-round"></b><p class="tr-muted">Next round starts in</p><div id="tr-clock" class="tr-clock"></div></div><div class="tr-muted">10-minute rounds<br>1 point / second<br>10 points / elimination</div></div><div class="tr-podium">${PRIZES.map((p,i)=>`<div class="tr-card"><span>${['1ST PLACE','2ND PLACE','3RD PLACE'][i]}</span><strong>${p/1e9} SOL</strong><small>Configured prize</small></div>`).join('')}</div><div id="tr-status" class="tr-notice" role="status"></div><div class="tr-actions"><button id="tr-wallet">Connect wallet</button><button id="tr-refresh">Refresh board</button></div><p id="tr-message" role="status"></p><h2 id="tr-heading">Practice leaderboard</h2><div id="tr-board" class="tr-scroll"></div><details><summary>Round rules</summary><p>Your best solo run segment counts in each round. Active survival seconds + 10 × eliminations = score. Pauses and upgrade selection do not add survival time. A new round resets the segment without ending your game. Ties: longer survival, then earlier achievement, then stable player ID. One prize per verified wallet per round. Co-op does not qualify.</p><p>Server results remain provisional until validated by a trusted game verifier. Unverified results never receive SOL. If fewer than three players qualify, only occupied places receive prizes. No entry fee.</p></details><h2>Previous rounds</h2><div id="tr-history"></div></div>`;
    document.body.appendChild(panel);
    panel.querySelector('#tr-close').onclick=()=>{panel.hidden=true;document.querySelector('[data-go="rank"]')?.focus();};
    panel.querySelector('#tr-wallet').onclick=connect;panel.querySelector('#tr-refresh').onclick=refresh;
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();panel.querySelector('#tr-close').click();}if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button,summary,a[href]')].filter(n=>!n.disabled);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  }
  function rows(entries){return entries.length?`<table><thead><tr><th>Rank</th><th>Player</th><th>Score</th><th>Survival</th><th>Kills</th><th>Status</th></tr></thead><tbody>${entries.map((e,i)=>`<tr><td>#${i+1}</td><td>${esc(e.name||short(e.wallet)||'Player')}</td><td>${e.score}</td><td>${Math.floor(e.seconds/60)}:${String(e.seconds%60).padStart(2,'0')}</td><td>${e.kills}</td><td>${esc(e.status||'Practice')}</td></tr>`).join('')}</tbody></table>`:'<div class="tr-empty">No scores yet. Start a solo run to set the first score.</div>';}
  function render(){
    if(!panel||panel.hidden)return;rollover();
    const $=s=>panel.querySelector(s),round=remote?.round??board.round;
    const remain=Math.max(0,Math.ceil(((round+1)*PERIOD-now())/1000));
    $('#tr-round').textContent='ROUND '+round.toLocaleString('en-US');$('#tr-clock').textContent=Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0');
    panel.querySelectorAll('.tr-podium strong').forEach((el,i)=>{el.textContent=(remote?.prizes||PRIZES)[i]/1e9+' SOL';});
    $('#tr-status').textContent=remote?remote.notice:'PRACTICE MODE — scores are stored on this device only. Prizes shown are planned amounts; no SOL is paid. The tournament server and payout wallet are not connected.';
    $('#tr-wallet').disabled=!remote;$('#tr-wallet').textContent=wallet?'Wallet: '+short(wallet):'Connect wallet';$('#tr-message').textContent=message;
    $('#tr-heading').textContent=remote?'Tournament leaderboard · provisional scores':'Practice leaderboard · this device';
    $('#tr-board').innerHTML=rows(remote?.entries||board.entries);
    const history=remote?.history||board.history;
    $('#tr-history').innerHTML=history.length?history.map(h=>`<div class="tr-history"><b>Round ${h.round}</b> · ${remote?esc(h.status||'closed'):'Practice — no payments'}${rows(h.entries||[])}${h.signature?`<p>Transaction: ${esc(h.signature)}</p>`:''}</div>`).join(''):'<p class="tr-muted">Completed rounds will appear here. No payouts have been made.</p>';
  }
  function open(){mount();panel.hidden=false;render();panel.querySelector('#tr-close').focus();refresh();}
  setInterval(()=>{rollover();if(run&&Date.now()-lastSend>2000){lastSend=Date.now();send(false);}if(panel&&!panel.hidden){render();if(Date.now()-lastRead>10000)refresh();}},1000);
  return {open,start,sample,finish};
})();
