/* Set the official contract address here only after it is announced.
 * An empty value renders an honest placeholder and disables copying. */
G.Community = (() => {
  const CONTRACT_ADDRESS = '';
  const card = document.createElement('aside');
  card.className='community-card';card.setAttribute('aria-label','Community and contract');
  card.innerHTML='<a class="community-twitter" href="https://x.com/PokeSurvivorSol" target="_blank" rel="noopener noreferrer"><b>𝕏</b> Follow @PokeSurvivorSol <span aria-hidden="true">↗</span></a><div class="community-contract"><span class="community-label">CONTRACT ADDRESS (CA)</span><code></code><button type="button" disabled>Copy CA</button><span class="community-copy-status" role="status"></span></div>';
  const value=card.querySelector('code'),copy=card.querySelector('button'),status=card.querySelector('[role="status"]');
  value.textContent=CONTRACT_ADDRESS||'Soon';copy.disabled=!CONTRACT_ADDRESS;copy.hidden=!CONTRACT_ADDRESS;
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(CONTRACT_ADDRESS);status.textContent='Copied!';}catch{status.textContent='Select the address above to copy it.';}};
  document.body.appendChild(card);
  const sync=()=>{
    const login=document.getElementById('scr-login'),menu=document.getElementById('scr-menu');
    const active=[login,menu].find(el=>el&&!el.classList.contains('hidden'));
    card.hidden=!active;
    // A side panel on desktop; inside the scrolling screen on smaller displays.
    const parent=active===menu?menu.querySelector('.menu-left'):(matchMedia('(max-width: 1200px)').matches?login?.querySelector('.box'):document.body);
    card.classList.toggle('community-inline',parent!==document.body);
    if(parent&&card.parentElement!==parent)parent.appendChild(card);
  };
  for(const id of ['scr-login','scr-menu']){const el=document.getElementById(id);if(el)new MutationObserver(sync).observe(el,{attributes:true,attributeFilter:['class']});}
  addEventListener('resize',sync);sync();
  const content=document.createElement('div');content.id='site-content';
  const move=node=>{if(node.nodeType===1&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)&&node!==content&&node.id!=='contract-banner')content.appendChild(node);};
  [...document.body.children].forEach(move);document.body.appendChild(content);
  const banner=document.createElement('aside');banner.id='contract-banner';banner.setAttribute('aria-label','Contract announcement');
  banner.innerHTML='<span>CA</span><code></code><button type="button">Copy CA</button><span class="ca-feedback" role="status"></span>';
  banner.querySelector('code').textContent=CONTRACT_ADDRESS||'Soon';
  banner.querySelector('button').disabled=!CONTRACT_ADDRESS;
  banner.querySelector('button').hidden=!CONTRACT_ADDRESS;
  banner.querySelector('button').onclick=async()=>{const feedback=banner.querySelector('[role="status"]');try{await navigator.clipboard.writeText(CONTRACT_ADDRESS);feedback.textContent='Copied!';setTimeout(()=>feedback.textContent='',2000);}catch{feedback.textContent='Select CA to copy';}};
  document.body.appendChild(banner);
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(move))).observe(document.body,{childList:true});
  dispatchEvent(new Event('resize'));
  return {contractAddress:CONTRACT_ADDRESS};
})();
