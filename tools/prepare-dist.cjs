// Package only this edition's public files. Development/server configuration stays private.
const fs = require('fs'), path = require('path');
const root=path.resolve(__dirname,'..'), dist=path.join(root,'dist');
fs.mkdirSync(dist,{recursive:true});
for(const name of ['assets','css','en','index.html','sw.js','manifest.webmanifest','version.json','favicon.ico','404.html','robots.txt','LICENSE','CREDITS.md']) {
 fs.cpSync(path.join(root,name),path.join(dist,name),{recursive:true});
}
fs.mkdirSync(path.join(dist,'js'),{recursive:true});
fs.copyFileSync(path.join(root,'js/app.min.js'),path.join(dist,'js/app.min.js'));
const index=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head><base href="../">');
fs.writeFileSync(path.join(dist,'en/index.html'),index);
fs.writeFileSync(path.join(root,'en/index.html'),index);
const routes=['','en/guide/','en/pokedex/','en/legendaries/','en/shinies/','en/types/','en/moves/','en/items/','en/achievements/','en/news/'];
const origin='https://pokesurvivor-english-edition.smebi.chatgpt.site';
const sitemap='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+routes.map(r=>`<url><loc>${origin}/${r}</loc></url>`).join('')+'</urlset>';
fs.writeFileSync(path.join(dist,'sitemap.xml'),sitemap);
fs.writeFileSync(path.join(root,'sitemap.xml'),sitemap);
console.log('English-only static distribution ready.');
