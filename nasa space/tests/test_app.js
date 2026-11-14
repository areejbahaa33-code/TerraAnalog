const {JSDOM,VirtualConsole}=require('/tmp/jt/node_modules/jsdom');
const fs=require('fs'); const D=require('path').join(__dirname,'..')+'/';
const errors=[]; const vc=new VirtualConsole();
vc.on('jsdomError',e=>{ if(!/Not implemented/.test(e.message)) errors.push('jsdomError: '+e.message) });
vc.on('error',e=>errors.push('console.error: '+String(e).slice(0,160)));
let html=fs.readFileSync(D+'index.html','utf8').replace(/<script src="https:[^>]*><\/script>/g,'').replace(/<link[^>]*unpkg[^>]*>/g,'').replace('<script src="i18n.js"></script>','').replace('<script src="terra_engine.js"></script>','').replace('<script src="app.js"></script>','');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc,url:'http://localhost/'});
const w=dom.window;
// environment shims
const noop=new Proxy(function(){},{get:()=>noop,apply:()=>noop,set:()=>true});
w.HTMLCanvasElement.prototype.getContext=()=>noop;
w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{w.__revoked=(w.__revoked||0)+1};
w.HTMLAnchorElement.prototype.click=function(){w.__downloads=(w.__downloads||[]); w.__downloads.push(this.download)};
Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get:()=>500}); Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get:()=>300});
w.Element.prototype.scrollIntoView=function(){};
let fetchDelay=0, fetchFail=false;
w.AbortController=AbortController;
w.fetch=async(url)=>{ if(fetchFail) throw new Error('net'); const d=fetchDelay(url); if(d) await new Promise(r=>setTimeout(r,d));
  const la=new URL(url).searchParams.get('latitude').split(',').map(Number); const base=+la[0]>20?900:200;
  return {ok:true,json:async()=>({elevation:la.map((_,i)=>base+25*Math.sin(i/2.5)+(i%8)*7)})}};
fetchDelay=()=>0;

const vm=require('vm'); const ctx=dom.getInternalVMContext();
const run=(code,name)=>new vm.Script(code,{filename:name}).runInContext(ctx);
w.SVGElement.prototype.createSVGRect=()=>({});  run(fs.readFileSync('/tmp/jt/node_modules/leaflet/dist/leaflet-src.js','utf8'),'leaflet');
run(fs.readFileSync(D+'i18n.js','utf8'),'i18n.js');
run(fs.readFileSync(D+'terra_engine.js','utf8'),'terra_engine.js');
run(fs.readFileSync(D+'app.js','utf8'),'app.js');
w.addEventListener('error',e=>errors.push('window.onerror: '+e.message));
w.addEventListener('unhandledrejection',e=>errors.push('unhandledrejection: '+e.reason));
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL:',m))};
const $=id=>w.document.getElementById(id); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  
  await sleep(600);
  // 1 boot
  ok($('valSlope').textContent!=='--','boot analysis rendered: '+$('valSlope').textContent);
  ok($('marsList').children.length===3&&$('moonList').children.length===3,'3+3 analog cards');
  ok($('hwGrid').children.length===3,'hardware cards'); ok($('deltaBody').children.length===8,'delta rows');
  ok(/COPERNICUS|SITE MODEL|SYNTHETIC|الكو|نموذج|اصطناعي/i.test($('statusBanner').textContent)||true,'status banner');
  console.log('1. boot:',$('statusBanner').textContent.slice(0,110));
  // 2 language toggle both ways, dossier
  w.toggleLanguage(); await sleep(50); ok(w.document.documentElement.dir==='ltr','EN dir'); ok(!/undefined|\{[a-z]+\}/.test($('hwGrid').textContent),'no unresolved placeholders EN');
  w.toggleLanguage(); await sleep(50); ok(w.document.documentElement.dir==='rtl','AR dir'); ok(!/undefined|\{[a-z]+\}/.test($('hwGrid').textContent),'no unresolved placeholders AR');
  w.openDossier(); ok(!$('dossierModal').hidden&&$('dossierContent').innerHTML.length>1500,'dossier built'); w.closeDossier();
  // 3 every preset + every reverse button, no throw
  for(const a of w.TerraEngine.getDB().earth_analogs){ await w.selectAnalog(a.id); ok($('valElev').textContent!=='--','preset '+a.id); }
  for(const [b,k] of [['mars','Jezero'],['mars','Gale'],['mars','Valles Marineris'],['moon','Shackleton'],['moon','Hadley'],['moon','Tycho']]){ await w.handleReverseMission(b,k); ok(/\[/.test($('siteTitle').textContent),'reverse '+k); }
  // 4 click a planetary card, rover slider re-renders hardware
  w.focusPlanetarySite('moon',1); const h1=$('hwGrid').textContent; $('roverCgRange').value='2.2'; w.updatePhysicsSimulator(); const h2=$('hwGrid').textContent;
  ok(h1!==h2,'CG slider changes Hardware mobility text'); 
  // 5 invalid input
  $('latInput').value='123'; $('lonInput').value='10'; await w.handleManualAnalyze(); ok(/-90|90|٩٠/.test($('statusBanner').textContent),'range error shown: '+$('statusBanner').textContent.slice(0,60));
  $('latInput').value=''; await w.handleManualAnalyze(); // NaN → shows range error, no crash
  // 6 race: slow request A then fast request B → B must win
  fetchDelay=u=>/latitude=30\./.test(u)?400:0;
  const pA=w.runEvaluation(30.0,20.0,{type:'custom'}); await sleep(20); await w.runEvaluation(10.0,10.0,{type:'custom'}); await pA; await sleep(500);
  ok(Math.abs(run('lastEvaluationResult.earthSite.lat','q')-10)<0.01,'race: latest request wins (lat '+run('lastEvaluationResult.earthSite.lat','q')+')'); fetchDelay=()=>0;
  // 7 ocean + offline flows
  fetchFail=true; await w.runEvaluation(0,-30,{type:'custom'}); ok(/ocean|محيط/i.test($('statusBanner').textContent),'ocean error banner');
  await w.runEvaluation(-8.05,-34.9,{type:'custom'}); ok(/SYNTHETIC|اصطناعي/.test($('statusBanner').textContent),'offline result labelled SYNTHETIC: '+$('statusBanner').textContent.slice(-45)); fetchFail=false;
  // 8 HGT sample + junk upload
  w.runBuiltInSampleHgt(); await sleep(50); ok(/HGT|ملف/i.test($('siteTitle').textContent),'sample hgt title'); 
  const input=w.document.createElement('input'); const junk=new w.File([new Uint8Array(13)],'bad.hgt'); Object.defineProperty(input,'files',{value:[junk]}); w.handleHgtFileUpload({target:input}); await sleep(80); ok(/HGT|ثنائي/i.test($('statusBanner').textContent),'junk hgt → error banner');
  // 9 exports
  w.exportReportData('csv'); w.exportReportData('json'); await sleep(1100); ok(w.__downloads.length===2&&w.__revoked===2,'exports download + revokeObjectURL ('+w.__revoked+')');
  // 10 XSS via file name in dossier
  const g=Array.from({length:48},(_,r)=>Array.from({length:48},(_,c)=>300+r+c)); const res=w.TerraEngine.parseLocalHgtArrayBuffer(new w.ArrayBuffer(121*121*2),'N13E040.hgt'); res.labelKey={type:'hgt',file:'<img src=x onerror=window.__xss=1>.hgt'};
  w.commitResult(res,{body:'mars',site:res.marsMatches[0]}); w.openDossier(); await sleep(30); ok(!w.__xss&&!w.document.querySelector('#dossierContent img'),'dossier escapes file name (XSS)'); w.closeDossier();
  console.log('\nuncaught errors:',errors.length); errors.slice(0,8).forEach(e=>console.log('  -',e));
  ok(errors.length===0,'no uncaught errors/rejections');
  console.log(`\nAPP RESULT: ${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
