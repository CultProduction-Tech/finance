// Local-only fixture from the client's consumed types, not a provider contract.
// Postman mock handlers are CommonJS, including in ESM projects.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {createHash} = require('node:crypto');
// Process-local counters model transient GET retries, not provider records.
const retryCounts = new Map();
const categories = [
  {operationCategoryId:1,parentOperationCategoryId:null,operationCategoryType:'Income',accountCategoryType:'Income',title:'Synthetic income'},
  {operationCategoryId:2,parentOperationCategoryId:null,operationCategoryType:'Outcome',title:'Synthetic outcome'},
  {operationCategoryId:3,parentOperationCategoryId:2,operationCategoryType:'Outcome',outcomeClassification:'DirectVariable',title:'Synthetic variable'},
  {operationCategoryId:4,parentOperationCategoryId:2,operationCategoryType:'Outcome',outcomeClassification:'IndirectFixed',title:'Synthetic fixed'},
];
const budgets = [
  {budgetId:'1096dbba-739b-4476-bf89-7d3d2ef380dc',title:'0 Бюджет 2026'},
  {budgetId:'0f804f90-a37a-4a66-672e-08def2085a4b',title:'03 Бюджет 2026'},
  {budgetId:'eba63c20-9e4d-49e6-bcc7-129047c71ef0',title:'Бюджет 26'},
  {budgetId:'f1afbd5f-2c6a-4e68-6a02-08dee664cf0f',title:'03 Бюджет 26'},
].map(b=>({...b,budgetStatus:'Active',budgetMethod:'Bdr',startDate:'2026-01-01',endDate:'2026-12-31'}));
http.createServer((req,res)=>{
  const u = new URL(req.url,'http://fixture');
  const [,mode,...parts] = u.pathname.split('/');
  const path = '/'+parts.join('/');
  const send = (code,body)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if (req.method!=='GET') return send(501,{error:'Fixture models reads only'});
  if (path.startsWith('/api/v4/')) {
    if (mode==='amo-error') return send(401,{error:'Synthetic upstream private detail'});
    if (mode==='amo-rate') {
      const key='finance-sources:'+createHash('sha256').update(req.url).digest('hex');
      const count=(retryCounts.get(key)||0)+1;
      retryCounts.set(key,count);
      if(count===1) return send(429,{error:'Synthetic rate limit'});
    }
    if(path==='/api/v4/leads') return send(200,{_embedded:{leads:[]},_page:1,_links:{}});
  }
  if (mode==='pf-error') return send(500,{error:'Synthetic upstream private detail'});
  const pf = data => send(200,{data,isSuccess:true,errorCode:null,errorMessage:null});
  if(path==='/api/v1/operationcategories') return pf({items:categories});
  if(path==='/api/v1/projects') return pf({items:[
    {projectId:101,title:'Synthetic included'},
    {projectId:1538920,title:'Synthetic excluded'},
    {projectId:102,projectGroup:{projectGroupId:230027},title:'Synthetic excluded group'},
  ]});
  if(path==='/api/v1/budgets') return pf({items:mode==='missing-budget'?[]:budgets});
  if(path.startsWith('/api/v1/budgets/')) {
    const b=budgets.find(b=>path.endsWith('/'+b.budgetId));
    if(!b) return send(501,{error:'Unmodelled budget'});
    const items=Array.from({length:12},(_,i)=>[1,3,4].map((id,j)=>({
      date:`2026-${String(i+1).padStart(2,'0')}-01`,operationCategoryId:id,value:[2000,400,300][j],
    }))).flat();
    return pf({...b,versions:[{info:{items}}]});
  }
  if(path==='/api/v1/businessmetrics/paymentstructure') {
    const values=[[1,1000,1500],[2,500,700]];
    return pf({items:values.map(([operationCategoryId,factValue,planValue])=>({operationCategoryId,factValue,planValue,
      details:operationCategoryId===1?[{operationCategoryId:1,factValue:1000,planValue:1500}]:[
        {operationCategoryId:3,factValue:300,planValue:400},{operationCategoryId:4,factValue:200,planValue:300},
      ],
    }))});
  }
  if(path==='/api/v1/businessmetrics/accountbalance') return pf({total:5000,items:[]});
  if(path==='/api/v1/operations') return pf({items:[],total:0});
  if(path==='/api/v1/businessmetrics/cashflow') return pf({incomePlanValue:0,outcomePlanValue:0,items:[]});
  if(path==='/api/v1/companies') return pf({items:[{companyId:1,title:'Synthetic company'}]});
  return send(501,{error:'Unmodelled fixture path'});
}).listen(process.env.PORT,'127.0.0.1');
