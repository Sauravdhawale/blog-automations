// Offline API integration harness: real route modules and SQLite, simulated trusted identity and R2.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import * as zod from 'zod';
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
class Statement{
 constructor(query,args=[]){this.query=query;this.args=args}
 bind(...args){return new Statement(this.query,args)}
 async first(){return sql.prepare(this.query).get(...this.args)||null}
 async all(){return {results:sql.prepare(this.query).all(...this.args)}}
 async run(){const r=sql.prepare(this.query).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}}}
}
const objects=new Map();
export const testEnv={DB:{prepare:q=>new Statement(q),async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}},BUCKET:{async put(key,bytes,options){objects.set(key,{bytes:Uint8Array.from(bytes),options})},async get(key){const o=objects.get(key);if(!o)return null;return {body:o.bytes,arrayBuffer:async()=>o.bytes.buffer}},async delete(key){objects.delete(key)}},CREDENTIAL_ENCRYPTION_KEY:'offline-test-only-not-for-deployment-32-bytes'};
let activeIdentity=null;
const context=vm.createContext({console,crypto,TextEncoder,TextDecoder,URL,Request,Response,Headers,Blob,File,FormData,AbortSignal,fetch,btoa,atob,setTimeout,clearTimeout,Intl});
const cache=new Map();
function synthetic(name,values){const m=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context,identifier:name});cache.set(name,m);return m}
synthetic('cloudflare:workers',{env:testEnv});
synthetic('zod',zod);
synthetic('@/app/chatgpt-auth',{getChatGPTUser:async()=>activeIdentity});
async function moduleFor(spec,parent=path.resolve('app/api/studio/route.ts')){
 if(cache.has(spec))return cache.get(spec);
 let file=spec.startsWith('@/')?path.resolve(spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(parent),spec):spec;
 if(!path.extname(file))file+='.ts';
 if(cache.has(file))return cache.get(file);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const m=new vm.SourceTextModule(code,{context,identifier:file,importModuleDynamically:async(s)=>{const d=await moduleFor(s,file);if(d.status==='unlinked')await d.link(linker);if(d.status==='linked')await d.evaluate();return d}});cache.set(file,m);
 return m;
}
async function linker(spec,parent){return moduleFor(spec,parent.identifier)}
const modules={};for(const [route,file]of Object.entries({'/api/studio':'app/api/studio/route.ts','/api/cron':'app/api/cron/route.ts','/api/media':'app/api/media/route.ts'})){const m=await moduleFor(path.resolve(file));if(m.status==='unlinked')await m.link(linker);if(m.status==='linked')await m.evaluate();modules[route]=m.namespace}
export async function dispatch(url,options={}){const request=new Request(url,options);const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');activeIdentity=id&&email?{userId:id,email,displayName:email}:null;const handler=modules[new URL(url).pathname]?.[request.method];if(!handler)return new Response('Not found',{status:404});return handler(request)}
