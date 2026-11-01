export const dayMs = 86400000;
const date = s => new Date(s+'T00:00:00Z');
const iso = d => d.toISOString().slice(0,10);
export function validateSeries(rows) {
  if(!Array.isArray(rows)||rows.length<2) throw Error('At least two dated prices are required.');
  const seen=new Set();
  const result=rows.map(r=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(date(r.date).getTime())||iso(date(r.date))!==r.date||!Number.isFinite(+r.price)||+r.price<=0) throw Error('Every row needs a valid YYYY-MM-DD date and a positive price.');
    if(seen.has(r.date)) throw Error('Duplicate date: '+r.date); seen.add(r.date);
    return {date:r.date,price:+r.price};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  return result;
}
export function parseCSV(text) {
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(lines.length>25001) throw Error('Please import at most 25,000 daily rows.');
  const header=lines.shift().toLowerCase().split(',').map(s=>s.trim());
  const di=header.indexOf('date'),pi=header.findIndex(s=>['price','nav','close'].includes(s));
  if(di<0||pi<0) throw Error('CSV headers must include date and price (or nav/close). Use YYYY-MM-DD dates.');
  return validateSeries(lines.filter(s=>s.trim()).map(s=>{const v=s.split(',').map(x=>x.trim());return {date:v[di],price:Number(v[pi])};}));
}
export function scheduleDates(rows,kind) {
  const groups=new Map(); rows.forEach(r=>{const k=r.date.slice(0,7); if(!groups.has(k)) groups.set(k,[]);groups.get(k).push(r);});
  const selected=new Set();
  for(const [month,rs] of groups) {
    if(kind==='daily') {rs.forEach(r=>selected.add(r.date));continue;}
    if(kind==='first') {selected.add(rs[0].date);continue;}
    let target=date(month+'-01');
    if(kind==='monday') target.setUTCDate(1+(8-target.getUTCDay())%7);
    if(kind==='friday') {target=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0));target.setUTCDate(target.getUTCDate()-(target.getUTCDay()+2)%7);}
    const next=rows.find(r=>r.date>=iso(target)); if(next) selected.add(next.date);
  }
  return selected;
}
export function xirr(flows) {
  if(!flows.some(f=>f.amount<0)||!flows.some(f=>f.amount>0)) return null;
  const t0=date(flows[0].date).getTime();
  const npv=r=>flows.reduce((s,f)=>s+f.amount/Math.pow(1+r,(date(f.date)-t0)/dayMs/365.25),0);
  let lo=-0.9999,hi=1;
  while(npv(lo)*npv(hi)>0&&hi<1e6) hi=hi*2+1;
  if(npv(lo)*npv(hi)>0) return null;
  for(let i=0;i<160;i++){const mid=(lo+hi)/2;if(npv(lo)*npv(mid)>0)lo=mid;else hi=mid;}
  return (lo+hi)/2;
}
// Equity-only provisional tax reserve. Positive gains, FIFO, annual allowance.
// No loss set-off, surcharge, other holdings, grandfathering or tax payment timing.
export function taxForLot(gain,bought,sold,allowance,mode='equity') {
  if(mode!=='equity'||gain<=0) return 0;
  const d=date(sold), anniversary=date(bought);anniversary.setUTCFullYear(anniversary.getUTCFullYear()+1);
  const long=d>anniversary, newer=sold>='2024-07-23';
  if(!long) return gain*(newer?.20:.15)*1.04;
  const fy=d.getUTCFullYear()-(d.getUTCMonth()<3?1:0);
  const limit=fy>=2024?125000:100000, used=allowance[fy]||0;
  const taxable=Math.max(0,used+gain-limit)-Math.max(0,used-limit);
  allowance[fy]=used+gain;
  return taxable*(newer?.125:.10)*1.04;
}
export function simulate(input,cfg,benchmark=false) {
  const all=validateSeries(input),rows=all.filter(r=>r.date>=cfg.start&&r.date<=cfg.end);
  if(rows.length<2) throw Error('This date range needs at least two price observations.');
  if(cfg.tax==='equity'&&rows[0].date<'2019-01-01')throw Error('Equity tax estimates support purchases from 2019 onward; choose tax off for earlier periods.');
  if(!Number.isFinite(cfg.amount)||cfg.amount<=0||!Number.isFinite(cfg.step)||cfg.step<0||cfg.step>100||!Number.isInteger(cfg.stepMonths)||cfg.stepMonths<1)throw Error('Check the contribution and step-up settings.');
  for(const k of ['fee','exit','dip','rise','sellPct'])if(!Number.isFinite(cfg[k])||cfg[k]<0||cfg[k]>100)throw Error('Percentages must be between 0 and 100.');
  const scheduled=scheduleDates(rows,cfg.schedule),groups={};rows.forEach(r=>{const m=r.date.slice(0,7);groups[m]=(groups[m]||0)+1;});
  const origin=date(cfg.start);let cash=0,units=0,invested=0,fees=0,tax=0,month='',budget=0,tw=1,peak=1,drawdown=0,priorValue=0;
  const lots=[],ledger=[],curve=[],flows=[],allowance={};
  function buy(amount,r,reason){
    const spend=Math.min(cash,amount);if(spend<.01)return;
    const fee=spend*cfg.fee/100,quantity=(spend-fee)/r.price;
    if(quantity<=0)return;
    cash-=spend;units+=quantity;fees+=fee;lots.push({date:r.date,units:quantity,cost:spend/quantity});
    ledger.push({date:r.date,action:'BUY',reason,price:r.price,units:quantity,amount:spend,tax:0,fee,cash});
  }
  function sell(fraction,r){
    let needed=units*fraction,quantity=needed,gross=needed*r.price,saleTax=0;
    const fee=gross*(cfg.fee+cfg.exit)/100,netPerUnit=r.price*(1-(cfg.fee+cfg.exit)/100);
    for(const lot of lots){const q=Math.min(lot.units,needed);if(q<=0)continue;saleTax+=taxForLot(q*(netPerUnit-lot.cost),lot.date,r.date,allowance,cfg.tax);lot.units-=q;needed-=q;if(needed<1e-9)break;}
    units-=quantity;cash+=gross-fee-saleTax;tax+=saleTax;fees+=fee;
    ledger.push({date:r.date,action:'SELL',reason:'Prior observation rose ≥ '+cfg.rise+'%',price:r.price,units:quantity,amount:gross,tax:saleTax,fee,cash});
  }
  if(cfg.fee+cfg.exit>=100)throw Error('Combined transaction and exit costs must be less than 100%.');
  for(let i=0;i<rows.length;i++){
    const r=rows[i],d=date(r.date);let deposit=0;
    if(r.date.slice(0,7)!==month){
      month=r.date.slice(0,7);const elapsed=(d.getUTCFullYear()-origin.getUTCFullYear())*12+d.getUTCMonth()-origin.getUTCMonth();
      budget=cfg.amount*Math.pow(1+cfg.step/100,Math.floor(elapsed/cfg.stepMonths));
      if(!Number.isFinite(budget)||budget>1e12)throw Error('Step-ups exceed the supported contribution limit.');
      deposit=budget;cash+=deposit;invested+=deposit;flows.push({date:r.date,amount:-deposit});
      ledger.push({date:r.date,action:'DEPOSIT',reason:'Monthly budget',price:r.price,units:0,amount:deposit,tax:0,fee:0,cash});
    }
    // Only completed observations before today's execution are used for a signal.
    const change=i>=2?(rows[i-1].price/rows[i-2].price-1)*100:null;
    if(benchmark){if(deposit)buy(cash,r,'Baseline: first available observation');}
    else {
      if(cfg.strategy==='cycle'&&change!==null&&change>=cfg.rise&&units>0)sell(cfg.sellPct/100,r);
      if(cfg.strategy==='sip'&&scheduled.has(r.date))buy(cfg.schedule==='daily'?budget/groups[month]:cash,r,'Scheduled SIP');
      if(['dip','cycle'].includes(cfg.strategy)&&change!==null&&change<=-cfg.dip)buy(cash,r,'Prior observation fell ≥ '+cfg.dip+'%');
    }
    const value=cash+units*r.price;
    if(priorValue>0)tw*=Math.max(0,(value-deposit)/priorValue);
    peak=Math.max(peak,tw);drawdown=Math.min(drawdown,tw/peak-1);priorValue=value;
    curve.push({date:r.date,value,invested,cash,units});
  }
  const last=rows.at(-1),value=cash+units*last.price;
  const finalAllowance={...allowance};let exitTax=0;
  for(const lot of lots)if(lot.units>0)exitTax+=taxForLot(lot.units*(last.price*(1-(cfg.fee+cfg.exit)/100)-lot.cost),lot.date,last.date,finalAllowance,cfg.tax);
  const exitFees=units*last.price*(cfg.fee+cfg.exit)/100,net=value-exitTax-exitFees;
  return {curve,ledger,invested,value,net,cash,units,fees,tax,exitTax,exitFees,drawdown,xirr:xirr([...flows,{date:last.date,amount:net}]),start:rows[0].date,end:last.date,observations:rows.length};
}
export function demoSeries(){
  let p=100,seed=42;const rows=[];const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let d=date('2019-01-01');iso(d)<='2026-10-30';d.setUTCDate(d.getUTCDate()+1)){
    if([0,6].includes(d.getUTCDay()))continue;
    let change=.00045+(rand()-.5)*.026;
    if(iso(d)>='2020-02-20'&&iso(d)<='2020-03-23')change-=.015;
    if(iso(d)>='2020-04-01'&&iso(d)<='2020-06-01')change+=.005;
    p*=1+change;rows.push({date:iso(d),price:+p.toFixed(4)});
  }return rows;
}
