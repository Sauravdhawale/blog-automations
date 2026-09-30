import assert from 'node:assert/strict';
import {dispatch,testEnv} from './harness.mjs';
const fetch=process.env.STUDIO_TEST_URL?globalThis.fetch:dispatch;
const base=process.env.STUDIO_TEST_URL||'http://127.0.0.1:4173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Tests must use a disposable local preview.');
const admin='test-admin-'+Date.now();
const calls=[];
async function req(who,body,query=''){
 const headers=who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.org'}:{};
 if(body)headers['Content-Type']='application/json';
 const r=await fetch(base+'/api/studio'+query,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
 const d=await r.json();return {status:r.status,data:d};
}
const check=(name,test)=>{assert.ok(test,name);calls.push(name)};
let r=await req(null);check('anonymous API is denied',r.status===401);
r=await req(admin);check('first private visitor becomes administrator',r.status===200&&r.data.user.role==='Admin');const aid=r.data.user.id;
r=await req(admin,{action:'saveSite',data:{name:'Test Technology',url:'https://example.org',niche:'IT',instructions:'Use sources',image_rules:'No text'}});check('website can be saved',r.status===200);const sid=r.data.id;
r=await req(admin,{action:'saveSite',data:{name:'Second Site',url:'https://example.com'}});const sid2=r.data.id;
const writer='writer-'+Date.now();r=await req(admin,{action:'saveUser',data:{name:'Test Writer',email:writer+'@example.org',role:'Writer',site_ids:[sid],active:true}});check('writer invitation saved',r.status===200);const wid=r.data.id;
r=await req(writer);check('writer sees only assigned website',r.status===200&&r.data.sites.length===1&&r.data.sites[0].id===sid);
r=await req(writer,{action:'saveSite',data:{name:'Denied',url:'https://example.net'}});check('writer cannot manage websites',r.status===403);
let content='## Evidence and practical application\n\n'+Array.from({length:35},(_,i)=>`Example ${i+1} explains a distinct practical implementation detail for enterprise editorial planning.`).join('\n\n');
const a={site_id:sid,title:'A distinct evidence-based editorial planning guide',keyword:'editorial planning',content,meta_title:'Editorial planning guide',meta_description:'A practical guide to organizing evidence and planning a useful enterprise editorial calendar.',sources:'https://example.org/research',assignee:wid,reviewer:aid};
r=await req(writer,{action:'saveArticle',data:{...a,site_id:sid2}});check('cross-site writes are denied',r.status===403);
r=await req(writer,{action:'saveArticle',data:a});check('writer creates persisted draft',r.status===200);const articleId=r.data.id;
r=await req(writer,{action:'saveArticle',data:a});check('duplicate title is blocked',r.status===409);
r=await req(writer,{action:'transition',id:articleId,version:1,target:'Pending approval'});check('completed draft submits for review',r.status===200);
r=await req(writer,{action:'transition',id:articleId,version:1,target:'Approved'});check('writer cannot approve',r.status===403);
r=await req(admin,{action:'transition',id:articleId,version:1,target:'Approved'});check('reviewer can approve exact version',r.status===200);
r=await req(writer,{action:'saveArticle',id:articleId,data:{...a,version:1,content:content+'\n\nAn additional original closing observation.'}});check('approved article can be revised',r.status===200);
r=await req(writer);const saved=r.data.articles.find(a=>a.id===articleId);check('editing invalidates approval',saved.status==='Draft'&&saved.approved_version===null&&saved.version===2);
r=await req(writer,{action:'saveArticle',id:articleId,data:{...a,version:1}});check('stale revisions cannot overwrite',r.status===409);
r=await req(admin,{action:'publish',id:articleId,version:2,mode:'publish'});check('unapproved publication is blocked before WordPress',r.status===409);
r=await req(admin,{action:'saveSite',data:{name:'Unsafe',url:'https://127.0.0.1'}});check('private URL rejected',r.status===400);
r=await req(admin,{action:'saveSchedule',data:{site_id:sid,title:'Weekly technology briefing',time:'09:00',timezone:'Asia/Kolkata',days:'1,2,3,4,5',reviewer:aid,enabled:false}});check('schedule saved',r.status===200);const scheduleId=r.data.id;
r=await req(admin,{action:'runSchedule',id:scheduleId});check('manual schedule queues a brief',r.status===200&&!!r.data.id);
r=await req(admin);check('brief awaits actual ChatGPT work',r.data.articles.some(a=>a.id!==articleId&&a.status==='Awaiting ChatGPT'));
r=await req(writer,null,'?history='+articleId);check('revision history is available',r.status===200&&r.data.revisions.length===2);
const cron=await fetch(base+'/api/cron',{method:'POST'});check('cron rejects missing setup or credentials',[401,503].includes(cron.status));

if(!process.env.STUDIO_TEST_URL){
 testEnv.CRON_SECRET='test-cron-secret';
 r=await req(admin,{action:'saveSchedule',id:scheduleId,data:{site_id:sid,title:'Weekly technology briefing',time:'00:00',timezone:'Asia/Kolkata',days:'0,1,2,3,4,5,6',reviewer:aid,enabled:true}});
 const c1=await fetch(base+'/api/cron',{method:'POST',headers:{authorization:'Bearer test-cron-secret'}});const d1=await c1.json();
 const c2=await fetch(base+'/api/cron',{method:'POST',headers:{authorization:'Bearer test-cron-secret'}});const d2=await c2.json();
 check('cron deduplicates a schedule per local day',c1.status===200&&d1.runs[0].id&&d2.runs[0].skipped);
 r=await req(admin,{action:'saveSite',id:sid,data:{name:'Test Technology',url:'https://example.org',username:'editor',password:'test-only-password'}});
 check('WordPress credential encryption succeeds',r.status===200);
 r=await req(admin);check('stored credentials never returned',r.data.sites.find(s=>s.id===sid).hasCredential&&!JSON.stringify(r.data.sites).includes('test-only-password')&&!('credential' in r.data.sites[0]));
 const fd=new FormData();fd.set('site_id',sid);fd.set('alt','Test PNG');fd.set('file',new File([Uint8Array.from([137,80,78,71,13,10,26,10,0])],'test.png',{type:'image/png'}));
 const upload=await fetch(base+'/api/media',{method:'POST',headers:{'oai-authenticated-user-id':writer,'oai-authenticated-user-email':writer+'@example.org'},body:fd});check('assigned writer can upload image bytes',upload.status===200);
 const bad=new FormData();bad.set('site_id',sid);bad.set('file',new File(['<script>bad</script>'],'fake.png',{type:'image/png'}));
 const rejected=await fetch(base+'/api/media',{method:'POST',headers:{'oai-authenticated-user-id':writer,'oai-authenticated-user-email':writer+'@example.org'},body:bad});check('image MIME spoofing is rejected',rejected.status===400);
}
console.log(JSON.stringify({passed:calls.length,checks:calls},null,2));
