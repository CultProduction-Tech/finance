import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cashflowRead } from '../src/lib/second-brain-cashflow.mjs';
const token='synthetic_cashflow_key_not_real_'.padEnd(48,'x');
const config=JSON.stringify([{id:'test',sha256:createHash('sha256').update(token).digest('hex'),scopes:['cult:finance:kpi:read']}]);
const request=(query='',headers={Authorization:'Bearer '+token})=>new Request('https://finance.test/api/second-brain/cashflow'+query,{headers});

test('scoped reader gets native graph including freeze freshness, fixed Cult only',async()=>{
  const data={currentBalance:12,points:[{date:'2026-11-20',balance:12,type:'fact'},{date:'2026-11-21',balance:-5,type:'plan'}],planFactFrozen:true,planFactAsOf:'saved-date',syncedAt:'2026-11-20T00:00:00Z'};
  const response=await cashflowRead(request(),config,async entity=>{
    assert.equal(entity,'cult');
    return Response.json(data);
  });
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const body=await response.json();assert.equal(body.entity,'cult');assert.equal(body.report,'cashflow');assert.deepEqual(body.data,data);
});
test('missing/wrong/cookie/cron keys cannot invoke graph loader',async()=>{
  for(const headers of [{},{Cookie:'session=abc'},{Authorization:'Bearer invalid'},{Authorization:'Bearer synthetic-cron'}]){
    const r=await cashflowRead(request('',headers),config,async()=>{throw new Error('must not load');});
    assert.equal(r.status,401);
  }
});
test('override, duplicate and arbitrary query params denied before loader',async()=>{
  for(const query of ['?entity=blaster','?entity=cult','?snapshot=1','?startDate=2026-01-01','?entity=cult&entity=blaster']){
    const r=await cashflowRead(request(query),config,async()=>{throw new Error('must not load');});
    assert.equal(r.status,400);
  }
});
test('upstream errors never leak body or become zero cash',async()=>{
  const r=await cashflowRead(request(),config,async()=>Response.json({secret:'never return'},{status:500}));
  assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'Dashboard data unavailable'});
});
