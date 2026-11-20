/** Run after npm ci && npm run build; requires existing Postman CLI >=1.70.
 * Uses a Next production build over HTTP with local Postman upstream fixtures.
 * All credentials/data are synthetic; no cloud reports or production calls.
 */
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, symlink, writeFile, readFile, cp, rm} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash, createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
const root=process.cwd();
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const dirty=!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
const output=process.env.FINANCE_VALIDATION_OUTPUT || await mkdtemp(path.join(tmpdir(),'finance-api-results-'));
await mkdir(output,{recursive:true});
const sandbox=await mkdtemp(path.join(tmpdir(),'finance-api-http-'));
await cp(path.join(root,'.next'),path.join(sandbox,'.next'),{recursive:true,filter: p=>!p.startsWith(path.join(root,'.next/cache'))});
for(const n of ['node_modules','package.json','next.config.ts']) await symlink(path.join(root,n),path.join(sandbox,n));
const port=4620, base=`http://127.0.0.1:${port}`, upstream='http://127.0.0.1:4619/sources';
const token='synthetic_finance_http_key_'.padEnd(48,'x'), other='synthetic_other_client_key_'.padEnd(48,'y');
const secret='synthetic_session_signing_secret_only';
const client=(id,key,scopes=['cult:finance:kpi:read'])=>({id,sha256:createHash('sha256').update(key).digest('hex'),scopes});
const valid=[client('legacy-test',other),client('finance-http-test',token)];
const payload=JSON.stringify({email:'synthetic@example.invalid',expires:Date.parse('2028-01-01')});
const cookie=Buffer.from(JSON.stringify({payload,signature:createHmac('sha256',secret).update(payload).digest('hex')})).toString('base64');
const headers={Authorization:`Bearer ${token}`}, session={Cookie:`session=${cookie}`};
const period='startDate=2026-10-01&endDate=2026-11-30', api='/api/second-brain/kpi';
let app, log, simulation, simulationLog, simulationError, serial=0;
const results=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function stop(){if(app){app.kill('SIGTERM');await Promise.race([new Promise(r=>app.once('exit',r)),delay(5000)]);if(app.exitCode===null)app.kill('SIGKILL');app=null;log.end();}}
async function start(config,mode='ok',now='2026-11-17T12:00:00Z'){
  await stop();
  const env={...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',AUTH_SECRET:secret,RESEND_API_KEY:'re_synthetic_only',
    PLANFACT_API_URL:`${upstream}/${mode}`,PLANFACT_API_KEY:'synthetic-blaster',PLANFACT_API_KEY_CULT:'synthetic-cult',
    AMOCRM_BASE_URL:`${upstream}/${mode}`,AMOCRM_ACCESS_TOKEN:'synthetic-amo',AMOCRM_PIPELINE_ID:'10647114',AMOCRM_PIPELINE_ID_CULT:'7917842',AMOCRM_ACT_DATE_FIELD_ID:'1253977',
    CRON_SECRET:'synthetic-cron-secret',TZ:'Europe/Moscow',FINANCE_TEST_NOW:now,
    NODE_OPTIONS:`--require=${path.join(root,'tests/fixtures/finance-clock.cjs')}`};
  delete env.SECOND_BRAIN_API_CLIENTS;
  if(config!==undefined)env.SECOND_BRAIN_API_CLIENTS=typeof config==='string'?config:JSON.stringify(config);
  log=createWriteStream(path.join(output,`app-${++serial}-${mode}.log`));
  app=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start',sandbox,'-p',String(port),'-H','127.0.0.1'],{cwd:sandbox,env,stdio:['ignore','pipe','pipe']});
  app.stdout.pipe(log,{end:false});app.stderr.pipe(log,{end:false});
  for(let i=0;i<100;i++){
    if(app.exitCode!==null)throw new Error('App failed to start; see log');
    try{const r=await fetch(base+'/login');if(r.status===200)return;}catch{}
    await delay(100);
  }
  throw new Error('App readiness timeout');
}
function request(name,url,status,{method='GET',auth=headers,checks=[]}={}){
  const scripts=[`pm.test(${JSON.stringify(name+' status')},()=>pm.response.to.have.status(${status}));`,...checks];
  return {name,request:{method,header:Object.entries(auth).map(([key,value])=>({key,value})),url:base+url},event:[{listen:'test',script:{type:'text/javascript',exec:scripts}}]};
}
const noStore=`pm.test('private no-store',()=>pm.expect(pm.response.headers.get('Cache-Control')).to.include('private, no-store'));`;
async function run(name,items){
 const file=path.join(output,`${name}.postman_collection.json`);
 await writeFile(file,JSON.stringify({info:{name,schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},item:items},null,2));
 const out=createWriteStream(path.join(output,`${name}.log`));
 const child=spawn('postman',['collection','run',file,'--no-report-events','--ignore-redirects','--timeout-request','15000'],{stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(out);child.stderr.pipe(out,{end:false});
 const code=await new Promise(r=>child.once('exit',r));out.end();
 const result={name,requests:items.length,exitCode:code};results.push(result);console.log(JSON.stringify(result));
 assert.equal(code,0,`Postman ${name} failed; see ${name}.log`);
}
try{
 for(const p of [4619,port])await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(p,'127.0.0.1',()=>probe.close(resolve));});
 simulationLog=createWriteStream(path.join(output,'simulation.ndjson'));
 simulationError=createWriteStream(path.join(output,'simulation.err'));
 simulation=spawn('postman',['simulation','run','postman/simulations/finance-api.sim.yaml','--port','4619','--no-history','--output','ndjson'],{cwd:root,stdio:['ignore','pipe','pipe']});
 simulation.stdout.pipe(simulationLog,{end:false});simulation.stderr.pipe(simulationError,{end:false});
 let ready=false;
 for(let i=0;i<100;i++){
  if(simulation.exitCode!==null)throw new Error('Simulation failed to start');
  try{const r=await fetch(upstream+'/ok/api/v1/projects');if(r.status===200){ready=true;break;}}catch{}
  await delay(100);
 }
 assert(ready,'Simulation readiness timeout');
 await start(valid);
 const cashflow='/api/second-brain/cashflow';
 const graph='/api/cashflow?entity=cult';
 const cashflowSnapshot=path.join(sandbox,'data/snapshots/cashflow-cult.json');
 const cashflowAllow=`pm.test('cashflow Allow',()=>pm.expect(pm.response.headers.get('Allow')).to.eql('GET, OPTIONS'));`;
 const emptyBody=`pm.test('empty body',()=>pm.expect(pm.response.text()).to.eql(''));`;
 await run('cashflow-methods',[
  request('Cashflow OPTIONS',cashflow,204,{method:'OPTIONS',auth:{},checks:[cashflowAllow,emptyBody]}),
  request('Cashflow HEAD requires credential',cashflow,401,{method:'HEAD',auth:{},checks:[noStore,emptyBody]}),
  request('Cashflow HEAD rejected',cashflow,405,{method:'HEAD',checks:[cashflowAllow,noStore,emptyBody]}),
 ]);
 await run('cashflow-missing-snapshot',[
  request('Cashflow live read',cashflow,200,{checks:[noStore]}),
 ]);
 await assert.rejects(readFile(cashflowSnapshot),{code:'ENOENT'},'Machine GET must not create a snapshot');
 await run('cashflow-graph-snapshot',[
  request('Ordinary graph live read',graph,200,{auth:session}),
  request('Ordinary graph reads its saved snapshot',graph+'&snapshot=1',200,{auth:session,checks:[
   `pm.test('saved graph snapshot',()=>pm.expect(pm.response.json().snapshot).to.eql(true));`,
  ]}),
 ]);
 const graphSnapshot=JSON.parse(await readFile(cashflowSnapshot,'utf8'));
 assert.equal(graphSnapshot.payload.currentBalance,5000);
 const existing=JSON.stringify({...graphSnapshot,payload:{...graphSnapshot.payload,currentBalance:4242}});
 await writeFile(cashflowSnapshot,existing);
 await run('cashflow-existing-snapshot',[
  request('Cashflow still reads live data',cashflow,200,{checks:[
   `pm.test('live balance',()=>pm.expect(pm.response.json().data.currentBalance).to.eql(5000));`,
  ]}),
 ]);
 assert.equal(await readFile(cashflowSnapshot,'utf8'),existing,'Machine GET must not overwrite the shared snapshot');
 await run('cashflow-cron-snapshot',[
  request('Cron can still refresh the graph snapshot',graph,200,{auth:{Authorization:'Bearer synthetic-cron-secret'}}),
 ]);
 assert.deepEqual(JSON.parse(await readFile(cashflowSnapshot,'utf8')),graphSnapshot);
 results.push({name:'cashflow-snapshot-policy',passed:true});

 await run('access-and-parity',[
  request('No key',api+'?'+period,401,{auth:{},checks:[noStore]}),
  request('Cookie only',api+'?'+period,401,{auth:session}),
  request('Cron key',api+'?'+period,401,{auth:{Authorization:'Bearer synthetic-cron-secret'}}),
  request('Unknown valid-format key',api+'?'+period,401,{auth:{Authorization:'Bearer '+ 'z'.repeat(48)}}),
  request('Malformed Bearer',api+'?'+period,401,{auth:{Authorization:'bearer '+token}}),
  request('Legacy client retained',api+'?'+period,200,{auth:{Authorization:'Bearer '+other}}),
  request('Ordinary Cult KPI',`/api/kpi?entity=cult&${period}`,200,{auth:session,checks:[
   `const j=pm.response.json();delete j.syncedAt;pm.collectionVariables.set('baseline',JSON.stringify(j));`,
   `pm.test('closed/current money basis',()=>{const j=pm.response.json();pm.expect(j.monthly[0].factProfit).to.eql(500);pm.expect(j.monthly[1].factProfit).to.eql(800);pm.expect(j.monthly[1].budgetProfit).to.eql(1300);});`,
  ]}),
  request('Financial client parity',api+'?'+period,200,{checks:[noStore,
   `pm.test('same real Cult handler payload',()=>{const j=pm.response.json();pm.expect(j.entity).to.eql('cult');pm.expect(j.source).to.eql('finance-dashboard');pm.expect(j.period).to.eql({start:'2026-10-01',end:'2026-11-30'});const data=j.data;delete data.syncedAt;pm.expect(data).to.deep.eql(JSON.parse(pm.collectionVariables.get('baseline')));});`,
   `pm.collectionVariables.set('freezeSeed',JSON.stringify(pm.response.json().data));`,
  ]}),
  ...['POST','PUT','PATCH','DELETE'].map(method=>request('No '+method,api+'?'+period,405,{method})),
  request('HEAD requires credential',api+'?'+period,401,{method:'HEAD',auth:{}}),
  request('HEAD authorized',api+'?'+period,200,{method:'HEAD',checks:[`pm.test('empty HEAD',()=>pm.expect(pm.response.text()).to.eql(''));`,noStore]}),
  request('OPTIONS',api,204,{method:'OPTIONS',auth:{},checks:[`pm.test('only read methods allowed',()=>{const a=pm.response.headers.get('Allow');pm.expect(a).to.include('GET');pm.expect(a).to.not.include('POST');});`]}),
  request('Trailing slash canonical redirect',api+'/?'+period,308),
  ...['/api/kpi?entity=blaster&'+period,'/api/cashflow?entity=blaster','/api/companies','/api/notes?month=2026-10','/api/second-brain/kpi/other','/api/second-brain/kpi-extra'].map(p=>request('Key not a session '+p,p,307)),
  request('Key cannot write notes','/api/notes',307,{method:'POST'}),
  request('Dashboard page','/',200,{auth:session}),
  request('Login page','/login',200,{auth:{}}),
  request('Existing health session','/api/health',200,{auth:session}),
  request('Blaster KPI session','/api/kpi?entity=blaster&'+period,200,{auth:session}),
  request('Companies session','/api/companies',200,{auth:session}),
  request('Notes read session','/api/notes?entity=cult&month=2026-10',200,{auth:session}),
  request('Existing cashflow session','/api/cashflow?entity=cult',200,{auth:session}),
  request('Original cron credential still works','/api/kpi?entity=cult&'+period,200,{auth:{Authorization:'Bearer synthetic-cron-secret'}}),
 ]);
 const bad=[
  '', 'startDate=2026-10-01','endDate=2026-10-31',
  period+'&entity=blaster',period+'&entity=cult',period+'&snapshot=1',period+'&other=1',
  period+'&startDate=2026-01-01',period+'&endDate=2026-11-30',
  'startDate=2026-02-30&endDate=2026-03-01','startDate=2025-02-29&endDate=2025-03-01',
  'startDate=2026-10-02&endDate=2026-10-01','startDate=2025-01-01&endDate=2026-01-03',
  'startDate=1999-12-31&endDate=2000-01-01','startDate=2100-01-01&endDate=2100-01-01',
 ];
 await run('date-boundaries',[
  ...bad.map((p,i)=>request('Rejected period '+i,api+'?'+p,400,{checks:[noStore]})),
  ...['startDate=2026-10-01&endDate=2026-10-01','startDate=2024-02-29&endDate=2024-03-01','startDate=2025-01-01&endDate=2026-01-02'].map((p,i)=>request('Valid boundary '+i,api+'?'+p,200)),
  request('Partial days keep monthly financial semantics',api+'?startDate=2026-10-15&endDate=2026-10-16',200,{checks:[`pm.test('whole-month KPI retained',()=>{const d=pm.response.json().data;pm.expect(d.monthly).to.have.length(1);pm.expect(d.monthly[0].factProfit).to.eql(500);});`]}),
 ]);
 const snapFile=path.join(sandbox,'data/snapshots/kpi-cult-2026-10-01-2026-11-30.json');
 const snapshot=JSON.parse(await readFile(snapFile,'utf8'));
 assert.equal(snapshot.snapshotAt,'2026-11-17T12:00:00.000Z');
 assert.equal(snapshot.payload.monthly[0].factProfit,500);
 assert.equal(await readFile(path.join(sandbox,'data/notes.json'),'utf8').catch(()=>null),null,'Machine key must not create notes');
 results.push({name:'isolated-snapshot-write-and-no-notes',passed:true});
 // Every malformed client list must fail closed before the token is considered.
 for(const [name,config,status] of [
  ['missing',undefined,503],['invalid-json','bad',503],['empty',[],503],
  ['duplicate-id',[client('same',token),client('same',other)],503],
  ['duplicate-hash',[client('a',token),client('b',token)],503],
  ['unknown-scope',[client('a',token,['all'])],503],
  ['uppercase-hash',[{...client('a',token),sha256:client('a',token).sha256.toUpperCase()}],503],
  ['invalid-client',[...valid,{id:'broken',sha256:'x',scopes:[]}],503],
  ['no-scope',[client('a',token,[])],403],
 ]){await start(config);await run('configuration-'+name,[request(name,api+'?'+period,status,{checks:[noStore]})]);}
 for(const [mode,status,checks] of [
  ['pf-error',502,[`pm.test('neutral upstream error',()=>pm.expect(pm.response.json()).to.deep.eql({error:'Dashboard data unavailable'}));`]],
  ['amo-error',200,[`pm.test('partial degradation stays visible',()=>{const d=pm.response.json().data;pm.expect(d.sources.amocrm).to.not.eql('ok');pm.expect(d.projectsCount).to.eql(0);});`]],
  ['missing-budget',200,[`pm.test('missing budget stays visible',()=>pm.expect(pm.response.json().data.sources.budget).to.be.a('string'));`]],
  ['amo-rate',200,[`pm.test('429 retry recovers',()=>pm.expect(pm.response.json().data.sources.amocrm).to.eql('ok'));`]],
 ]){await start(valid,mode);await run(mode,[request(mode,api+'?'+period,status,{checks:[noStore,...checks]})]);}
 // Old, exact-period snapshot used only in its freeze window; never overwritten.
 const frozen={...snapshot,payload:{...snapshot.payload,revenue:4242}};
 await writeFile(snapFile,JSON.stringify(frozen));
 await start(valid,'ok','2026-11-18T12:00:00Z');
 await run('freeze',[
  request('Matching pre-freeze snapshot',api+'?'+period,200,{checks:[`pm.test('frozen money with live metadata',()=>{const d=pm.response.json().data;pm.expect(d.planFactFrozen).to.eql(true);pm.expect(d.revenue).to.eql(4242);pm.expect(d.sources.planfact).to.eql('frozen');pm.expect(d.planFactAsOf).to.include('17.11');});`]}),
  request('No matching snapshot',api+'?startDate=2026-09-15&endDate=2026-09-16',200,{checks:[`pm.test('no snapshot retains existing live behavior',()=>{const d=pm.response.json().data;pm.expect(d.planFactFrozen).to.eql(undefined);pm.expect(d.sources.planfact).to.eql('ok');});`]}),
 ]);
 assert.deepEqual(JSON.parse(await readFile(snapFile,'utf8')),frozen,'Freeze must not overwrite snapshot');
 assert.equal(await readFile(path.join(sandbox,'data/snapshots/kpi-cult-2026-09-15-2026-09-16.json'),'utf8').catch(()=>null),null);
 results.push({name:'freeze-snapshot-not-overwritten',passed:true});
 await start(valid,'pf-error','2026-11-18T12:00:00Z');
 await run('freeze-source-failure',[request('Freeze still needs live PlanFact',api+'?'+period,502)]);
 const events=(await readFile(path.join(output,'simulation.ndjson'),'utf8')).trim().split('\n').map(l=>JSON.parse(l));
 const calls=events.filter(e=>e.event==='request');
 assert(calls.some(e=>e.path.includes('/api/v1/businessmetrics/paymentstructure')),'Real PlanFact HTTP path must run');
 assert(calls.some(e=>e.path.includes('/api/v4/leads')&&e.statusCode===429),'429 recovery must exercise an actual upstream 429');
 assert(calls.some(e=>e.path.includes('/api/v4/leads')&&e.statusCode===401),'Degraded 200 must exercise an actual upstream error');
 results.push({name:'upstream-requests-observed',requests:calls.length,passed:true});
 console.log('HTTP validation passed');
} finally {
 await stop();
 if(simulation){simulation.kill('SIGINT');await Promise.race([new Promise(r=>simulation.once('exit',r)),delay(5000)]);if(simulation.exitCode===null)simulation.kill('SIGKILL');simulationLog.end();simulationError.end();}
 await writeFile(path.join(output,'http-results.json'),JSON.stringify({sourceSha,dirty,sandbox,results},null,2));
 if(!process.env.FINANCE_KEEP_TEST_SANDBOX)await rm(sandbox,{recursive:true,force:true});
}
