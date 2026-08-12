const $=id=>document.getElementById(id),N=id=>Number($(id).value)||0;
const money=x=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(x||0),pct=x=>(x*100).toFixed(2)+'%';
const ids=['price','dep','rate','fee','icr','stress','legal','survey','broker','spv','refurb','nr','acct','service','ins','lic','mgmt','void','maint','rent'];
function calc(){const p=N('price'),dep=p*N('dep')/100,loan=p-dep,rate=N('rate')/100,stress=N('stress')/100,icr=N('icr'),arr=loan*N('fee')/100;
const bands=[[125000,.05],[125000,.07],[675000,.10],[575000,.15],[Infinity,.17]];let rem=p,sdlt=0;
for(const [w,r] of bands){const x=Math.min(rem,w);if(x>0){sdlt+=x*r;rem-=x}if(rem<=0)break}
const non=p*($('nr').value==='yes'?.02:0),totalSdlt=sdlt+non,cash=dep+totalSdlt+N('legal')+N('survey')+N('broker')+N('spv')+arr,investment=cash+N('refurb');
const monthly=loan*rate/12,stressMonthly=loan*stress/12,minMonthly=loan*stress/icr/12,minAnnual=minMonthly*12,rent=N('rent');
const management=rent*N('mgmt')/100,voids=rent*N('void')/100,maint=rent*N('maint')/100,costs=loan*rate+N('ins')+N('acct')+N('service')+N('lic')+management+voids+maint,net=rent-costs;
return{p,dep,loan,rate,icr,arr,totalSdlt,cash,investment,monthly,stressMonthly,minMonthly,minAnnual,rent,management,voids,maint,costs,net,gross:rent/p,netYield:net/p,coc:net/investment,pass:rent>=minAnnual}}
function render(){const c=calc();$('hp').textContent=money(c.p);$('hi').textContent=money(c.investment);$('hicr').textContent=c.icr.toFixed(2)+'x';$('status').textContent=c.pass?'ICR PASS':'ICR FAIL';$('status').className=c.pass?'pass':'fail';
const m=[['Loan amount',money(c.loan)],['LTV',pct(c.loan/c.p)],['Monthly pay-rate interest',money(c.monthly)],['Monthly stress interest',money(c.stressMonthly)],['Minimum monthly rent',money(c.minMonthly)],['Minimum annual rent',money(c.minAnnual)],['Required rental yield',pct(c.minAnnual/c.p)]];
$('mortGrid').innerHTML=m.map(x=>`<div class="card metric"><small>${x[0]}</small><b>${x[1]}</b></div>`).join('');
const rows=[['Actual annual rent',money(c.rent)],['Mortgage interest',money(c.loan*c.rate)],['Insurance',money(N('ins'))],['Accountancy',money(N('acct'))],['Ground rent / service charge',money(N('service'))],['HMO licensing',money(N('lic'))],['Management fees',money(c.management)],['Void allowance',money(c.voids)],['Maintenance reserve',money(c.maint)],['Total annual costs',money(c.costs)],['Net annual cash flow',money(c.net)]];
$('cashTable').innerHTML=rows.map((x,i)=>`<div class="row ${i>8?'total':''}"><span>${x[0]}</span><span>${x[1]}</span></div>`).join('');
const s=[['Purchase price',money(c.p)],['Deposit',money(c.dep)],['Mortgage',money(c.loan)],['Arrangement fee',money(c.arr)],['SDLT',money(c.totalSdlt)],['Legal fees',money(N('legal'))],['Survey / valuation',money(N('survey'))],['Broker fee',money(N('broker'))],['SPV formation',money(N('spv'))],['Refurbishment',money(N('refurb'))],['Cash to complete',money(c.cash)],['Total initial investment',money(c.investment)],['Minimum annual rent',money(c.minAnnual)],['Expected annual rent',money(c.rent)],['ICR result',c.pass?'PASS':'FAIL'],['Gross yield',pct(c.gross)],['Net yield',pct(c.netYield)],['Cash-on-cash return',pct(c.coc)]];
$('summaryTable').innerHTML=s.map((x,i)=>`<div class="row ${[10,11,14].includes(i)?'total':''}"><span>${x[0]}</span><span>${x[1]}</span></div>`).join('');
localStorage.setItem('spvInputs',JSON.stringify(Object.fromEntries(ids.map(id=>[id,$(id).value]))))}
ids.forEach(id=>$(id).addEventListener('input',render));ids.forEach(id=>$(id).addEventListener('change',render));
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.t).classList.add('active')});
function report(){const c=calc();return`SPV PROPERTY INVESTMENT REPORT

Purchase price: ${money(c.p)}
Deposit: ${money(c.dep)}
Mortgage: ${money(c.loan)}
LTV: ${pct(c.loan/c.p)}
SDLT: ${money(c.totalSdlt)}
Arrangement fee: ${money(c.arr)}
Legal fees: ${money(N('legal'))}
Survey/valuation: ${money(N('survey'))}
Broker fee: ${money(N('broker'))}
SPV formation: ${money(N('spv'))}
Refurbishment: ${money(N('refurb'))}
Cash to complete: ${money(c.cash)}
Total initial investment: ${money(c.investment)}

Pay-rate monthly interest: ${money(c.monthly)}
Stress monthly interest: ${money(c.stressMonthly)}
Minimum monthly rent: ${money(c.minMonthly)}
Minimum annual rent: ${money(c.minAnnual)}
Expected annual rent: ${money(c.rent)}
ICR: ${c.icr.toFixed(2)}x — ${c.pass?'PASS':'FAIL'}

Gross yield: ${pct(c.gross)}
Net yield: ${pct(c.netYield)}
Net annual cash flow: ${money(c.net)}
Cash-on-cash return: ${pct(c.coc)}`}
}
$('share').onclick=async()=>{const text=report();if(navigator.share){try{await navigator.share({title:'SPV Property Investment Report',text})}catch(e){}}else{await navigator.clipboard.writeText(text);toast('Report copied')}}
$('pdf').onclick=()=>{const w=window.open('','_blank');if(!w){toast('Allow pop-ups for PDF');return}w.document.write('<html><head><title>SPV Property Report</title><style>body{font-family:Arial;padding:35px;line-height:1.55;white-space:pre-wrap}</style></head><body><h1>SPV Property Investment Report</h1>'+report().replace(/</g,'&lt;')+'</body></html>');w.document.close();setTimeout(()=>w.print(),300)};
$('csv').onclick=()=>{const c=calc(),rows=[['Metric','Value'],['Purchase price',c.p],['Deposit',c.dep],['Mortgage',c.loan],['LTV',c.loan/c.p],['SDLT',c.totalSdlt],['Arrangement fee',c.arr],['Legal fees',N('legal')],['Survey',N('survey')],['Broker fee',N('broker')],['SPV formation',N('spv')],['Refurbishment',N('refurb')],['Cash to complete',c.cash],['Total initial investment',c.investment],['Minimum annual rent',c.minAnnual],['Expected annual rent',c.rent],['ICR result',c.pass?'PASS':'FAIL'],['Gross yield',c.gross],['Net yield',c.netYield],['Net annual cash flow',c.net],['Cash-on-cash return',c.coc]],csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='SPV-Property-Calculation.csv';a.click()};
function toast(t){const x=$('toast');x.textContent=t;x.className='show';setTimeout(()=>x.className='',2200)}
try{const s=JSON.parse(localStorage.getItem('spvInputs')||'null');if(s)ids.forEach(id=>{if(s[id]!==undefined)$(id).value=s[id]})}catch(e){}
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js'));render();