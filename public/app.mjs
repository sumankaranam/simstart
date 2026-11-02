import {simulate,demoSeries,parseCSV,validateSeries} from './engine.mjs';
const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n),pct=n=>n===null?'N/A':(n*100).toFixed(2)+'%';
let series=demoSeries(),label='Synthetic market · not historical investment performance',sourceKind='demo',result=null,baseline=null,runConfig=null,runLabel='',loadVersion=0;
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=id=>Number($(id).value);
function config(){return {start:$('start').value,end:$('end').value,amount:number('amount'),step:number('step'),stepMonths:number('stepMonths'),strategy:$('strategy').value,schedule:$('schedule').value,dip:number('dip'),rise:number('rise'),sellPct:number('sellPct'),fee:number('fee'),exit:number('exit'),tax:$('tax').value};}
function showRules(){const s=$('strategy').value;$('scheduleControls').hidden=s!=='sip';$('dipControls').hidden=s==='sip';$('sellControls').hidden=s!=='cycle';$('dip').disabled=s==='sip';$('rise').disabled=$('sellPct').disabled=s!=='cycle';}
function dirty(){$('dirty').hidden=false;}
function chart(a,b){
  const W=Math.max(240,Math.round($('chart').getBoundingClientRect().width)),H=W<500?250:300,L=50,R=12,T=18,B=35,inner=W-L-R,height=H-T-B;
  const max=Math.max(...a.curve.map(p=>Math.max(p.value,p.invested)),...b.curve.map(p=>p.value))*1.08;
  const t0=Date.parse(a.start),span=Date.parse(a.end)-t0;
  const x=p=>L+(Date.parse(p.date)-t0)/span*inner,y=v=>T+height-v/max*height;
  const points=(arr,key)=>arr.map(p=>x(p).toFixed(2)+','+y(p[key]).toFixed(2)).join(' ');
  let grid='';for(let i=0;i<=4;i++){const v=max*i/4,yy=y(v);grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#edf0e9"/><text x="${L-12}" y="${yy+4}" text-anchor="end">${v>=1e7?(v/1e7).toFixed(1)+' Cr':v>=1e5?(v/1e5).toFixed(1)+' L':Math.round(v/1000)+' K'}</text>`;}
  const ticks=W<500?3:5;for(let i=0;i<ticks;i++){const index=Math.round(i*(a.curve.length-1)/(ticks-1)),p=a.curve[index];grid+=`<text x="${x(p)}" y="${H-7}" text-anchor="${i===0?'start':i===ticks-1?'end':'middle'}">${new Date(p.date).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})}</text>`;}
  $('chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9bc580" stop-opacity=".25"/><stop offset="1" stop-color="#9bc580" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${L},${T+height} ${points(a.curve,'value')} ${W-R},${T+height}" fill="url(#fill)"/><polyline points="${points(a.curve,'invested')}" fill="none" stroke="#aab2aa" stroke-width="1.5" stroke-dasharray="4 5"/><polyline points="${points(b.curve,'value')}" fill="none" stroke="#cb8657" stroke-width="2"/><polyline points="${points(a.curve,'value')}" fill="none" stroke="#246b4f" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  $('chart').setAttribute('aria-label',`Portfolio from ${a.start} to ${a.end}. Strategy value ${money(a.value)}; baseline ${money(b.value)}; contributions ${money(a.invested)}. Full comparison follows.`);
}
function render(){
  const r=result,b=baseline;
  $('resultSource').textContent=runLabel+(sourceKind==='demo'?' · DEMONSTRATION ONLY':'')+' · '+(runConfig.tax==='equity'?'Simplified equity-tax estimate':'Tax off');
  $('net').textContent=money(r.net);$('invested').textContent=money(r.invested);$('xirr').textContent=pct(r.xirr);
  $('gain').textContent=money(r.net-r.invested)+' net gain / loss';
  $('dateRange').textContent=r.start+' → '+r.end+' · '+r.observations.toLocaleString()+' observations';
  chart(r,b);
  const diff=r.net-b.net;$('verdict').innerHTML=`Your rule finishes <b>${money(Math.abs(diff))} ${diff>=0?'ahead of':'behind'}</b> the regular monthly SIP in this test.`;
  const rows=[['Liquidation value',money(r.net),money(b.net)],['XIRR',pct(r.xirr),pct(b.xirr)],['Max drawdown',pct(r.drawdown),pct(b.drawdown)],['Buy / sell orders',r.ledger.filter(x=>x.action!=='DEPOSIT').length,b.ledger.filter(x=>x.action!=='DEPOSIT').length],['Cash remaining',money(r.cash),money(b.cash)]];
  $('compare').innerHTML=rows.map(v=>'<tr>'+v.map((s,i)=>`<${i?'td':'td'}>${s}</td>`).join('')+'</tr>').join('');
  $('breakdown').innerHTML=[['Holdings value',money(r.value-r.cash)],['Uninvested cash',money(r.cash)],['Costs already paid',money(r.fees)],['Realised tax reserve',money(r.tax)],['Final sale cost estimate',money(r.exitFees)],['Final sale tax estimate',money(r.exitTax)]].map(v=>`<div class="row"><span>${v[0]}</span><b>${v[1]}</b></div>`).join('');
  $('tradeCount').textContent=r.ledger.length+' events · Full history in CSV export';
  $('trades').innerHTML=r.ledger.slice(-12).reverse().map(t=>`<tr><td>${t.date}</td><td><span class="tag ${t.action.toLowerCase()}">${t.action}</span></td><td>${t.price.toFixed(2)}</td><td>${money(t.amount)}</td><td>${safe(t.reason)}</td></tr>`).join('');
}
function run(event){event?.preventDefault();$('error').textContent='';try{
  if(!series||sourceKind!==$('source').value)throw Error('Load a dataset for the selected source before running.');
  const c=config();if(!c.start||!c.end||c.start>=c.end)throw Error('Choose an end date after the start date.');
  const r=simulate(series,c),b=simulate(series,c,true);result=r;baseline=b;runConfig=c;runLabel=label;render();$('dirty').hidden=true;if(event&&matchMedia('(max-width:800px)').matches){$('results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});$('results').focus({preventScroll:true});}
}catch(e){$('error').textContent=e.message;}}
function download(name,content){const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function csvCell(v){let s=String(v??'');if(/^[=+@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('The data provider returned '+r.status+'. Please try again or import a CSV.');return r.json();}
function useData(rows,name,kind){series=validateSeries(rows);label=name;sourceKind=kind;$('start').value=series[0].date<'2019-01-01'?'2019-01-01':series[0].date;$('end').value=series.at(-1).date;$('dataStatus').textContent=name+' · '+series.length.toLocaleString()+' observations · '+series[0].date+' to '+series.at(-1).date;$('tax').value='none';dirty();}
$('config').addEventListener('submit',run);$('config').addEventListener('input',dirty);$('strategy').addEventListener('change',showRules);
$('source').addEventListener('change',()=>{
  loadVersion++;const s=$('source').value;$('mfControls').hidden=s!=='mf';$('csvControls').hidden=s!=='csv';$('error').textContent='';series=null;
  if(s==='demo'){series=demoSeries();sourceKind='demo';label='Synthetic market · not historical investment performance';$('dataStatus').textContent='Synthetic prices, not a real fund or index.';$('start').value='2020-01-01';$('end').value='2026-10-30';}
  else $('dataStatus').textContent='No data loaded. '+(s==='mf'?'Find a scheme and load its history.':'Choose a CSV file.');dirty();
});
$('search').addEventListener('click',async()=>{const q=$('query').value.trim();if(q.length<3){$('error').textContent='Enter at least three characters to search.';return;}const version=++loadVersion;$('search').disabled=true;$('error').textContent='';try{const data=await json('/api/search?q='+encodeURIComponent(q));if(version!==loadVersion)return;if(!Array.isArray(data))throw Error('Unexpected search response. Please use a CSV.');$('funds').replaceChildren();for(const f of data.slice(0,100)){const o=document.createElement('option');o.value=String(f.schemeCode);o.textContent=f.schemeName;$('funds').append(o);}if(!data.length){const o=document.createElement('option');o.value='';o.textContent='No matching schemes';$('funds').append(o);}$('dataStatus').textContent=data.length+' schemes found'+(data.length>100?' · Showing first 100; narrow your search':'')+'. Select a growth option and load history.';}catch(e){$('error').textContent='Search failed: '+e.message;}finally{$('search').disabled=false;}});
$('query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('search').click();}});
$('funds').addEventListener('change',()=>{loadVersion++;series=null;$('dataStatus').textContent='Selection changed. Load the selected history.';dirty();});
$('loadFund').addEventListener('click',async()=>{const code=$('funds').value;if(!/^\d+$/.test(code)){$('error').textContent='Search for and select a scheme first.';return;}const version=++loadVersion;$('loadFund').disabled=true;$('error').textContent='';try{const data=await json('/api/fund/'+code);if(version!==loadVersion)return;if(!data.data?.length)throw Error('No NAV history available for this scheme.');const name=data.meta?.scheme_name||$('funds').selectedOptions[0].textContent;if(/IDCW|dividend/i.test(name))throw Error('Distribution-paying schemes are not supported yet. Choose a growth option.');useData(data.data.map(r=>({date:r.date.split('-').reverse().join('-'),price:Number(r.nav)})),name+' · MFapi.in · scheme '+code+(data.storage?.mode==='database'?' · Stored history':' · Live lookup')+(data.storage?.stale?' · STALE: refresh failed or data is old':''),'mf');run();}catch(e){$('error').textContent='Could not load history: '+e.message;}finally{$('loadFund').disabled=false;}});
$('file').addEventListener('change',async()=>{const f=$('file').files[0];if(!f)return;const version=++loadVersion;try{if(f.size>3000000)throw Error('CSV file must be smaller than 3 MB.');const text=await f.text();if(version!==loadVersion)return;useData(parseCSV(text),'Imported: '+f.name,'csv');run();}catch(e){series=null;$('error').textContent=e.message;}});
$('sample').addEventListener('click',()=>download('sip-lab-synthetic-example.csv','date,price\n'+demoSeries().map(r=>r.date+','+r.price).join('\n')));
$('export').addEventListener('click',()=>{if(!result)return;const header=['date','action','reason','price','units','amount','tax_reserve','fee','cash_after','source','configuration'];const rows=result.ledger.map(t=>[t.date,t.action,t.reason,t.price,t.units,t.amount,t.tax,t.fee,t.cash,runLabel,JSON.stringify(runConfig)]);download('sip-lab-trades.csv',[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'));});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{$('strategy').value=b.dataset.preset;showRules();dirty();$('workspace').scrollIntoView({behavior:'smooth'});run();}));
showRules();run();
let chartWidth=0;new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width!==chartWidth){chartWidth=width;if(result&&baseline)chart(result,baseline);}}).observe($('chart'));
async function loadLibrary(){
  try{
    const catalogue=await json('/api/catalogue');
    $('library').replaceChildren(new Option('Choose a stored fund',''));
    for(const fund of catalogue.funds)$('library').append(new Option(fund.name,fund.code));
    $('libraryStatus').textContent=catalogue.funds.length+' funds stored · refreshed daily · examples, not recommendations';
    $('library').addEventListener('change',()=>{
      const code=$('library').value;if(!code)return;
      const f=catalogue.funds.find(f=>f.code===code);
      $('funds').replaceChildren(new Option(f.name,code));$('funds').value=code;
      $('loadFund').click();
    });
  }catch{ $('library').replaceChildren(new Option('Library temporarily unavailable',''));$('libraryStatus').textContent='You can still search live funds or import a CSV.'; }
}
loadLibrary();

