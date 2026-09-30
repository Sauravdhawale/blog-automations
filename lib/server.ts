import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export const db = () => { if (!env.DB)
    throw new Error('Database is not configured.'); return env.DB; };
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const all = async (sql: string, ...args: any[]) => (await db().prepare(sql).bind(...args).all()).results as any[];
export const one = async (sql: string, ...args: any[]) => db().prepare(sql).bind(...args).first() as Promise<any>;
export const run = (sql: string, ...args: any[]) => db().prepare(sql).bind(...args).run();
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function deny(message = 'You do not have permission for this action.') { throw new HttpError(403, message); }
export async function currentUser() { const identity = await getChatGPTUser(); if (!identity)
    throw new HttpError(401, 'Sign in with ChatGPT to continue.'); const email = identity.email.toLowerCase(); let user = await one('SELECT * FROM users WHERE identity = ?', identity.userId); if (!user) {
    await run('INSERT OR IGNORE INTO users (id,email,name,role,active,identity,created) SELECT ?,?,?,?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM users)', uid(), email, identity.displayName, 'Admin', identity.userId, now());
    user = await one('SELECT * FROM users WHERE identity = ?', identity.userId);
    if (!user) {
        await run('UPDATE users SET identity = ? WHERE email = ? AND identity IS NULL AND active = 1', identity.userId, email);
        user = await one('SELECT * FROM users WHERE identity = ?', identity.userId);
    }
} if (!user || !user.active)
    deny('Your account has not been invited, or access is disabled. Ask your administrator.'); return user; }
export async function siteAccess(user: any, id: string) { const site = await one('SELECT * FROM sites WHERE id = ?', id); if (!site)
    throw new HttpError(404, 'Website not found.'); if (user.role !== 'Admin' && !await one('SELECT id FROM memberships WHERE site_id = ? AND user_id = ?', id, user.id))
    deny(); return site; }
export function role(user: any, allowed: string[]) { if (!allowed.includes(user.role))
    deny(); }
export async function event(user: any, action: string, siteId: string | null = null, articleId: string | null = null, detail = '') { await run('INSERT INTO events (id,site_id,article_id,actor,action,detail,created) VALUES (?,?,?,?,?,?,?)', uid(), siteId, articleId, user.name, action, detail, now()); }
export function safeSite(site: any) { const { credential, username, ...s } = site; return { ...s, username: username || '', hasCredential: !!credential, categories: JSON.parse(s.categories || '[]'), authors: JSON.parse(s.authors || '[]'), posts: JSON.parse(s.posts || '[]') }; }
function runtimeSecret(key: string) { return (env as unknown as Record<string, string>)[key]; }
async function key() { const secret = runtimeSecret('CREDENTIAL_ENCRYPTION_KEY'); if (!secret)
    throw new HttpError(503, 'Credential encryption is not configured. Contact the administrator.'); return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
export async function encrypt(value: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const b = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(value))); return btoa(String.fromCharCode(...iv, ...b)); }
export async function decrypt(value: string) { const b = Uint8Array.from(atob(value), c => c.charCodeAt(0)); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await key(), b.slice(12))); }
export function validateUrl(input: string) { let u: URL; try {
    u = new URL(input);
}
catch {
    throw new HttpError(400, 'Enter a valid HTTPS website URL.');
} ; if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || /\.(local|internal|localhost|test|invalid)$/.test(u.hostname) || u.search || u.hash)
    throw new HttpError(400, 'Use a public HTTPS domain without credentials, ports, queries, or fragments.'); return u.origin + u.pathname.replace(/\/$/, ''); }
function publicIP(ip: string) { if (ip.includes(':')) {
    const s = ip.toLowerCase();
    return !(/^(::|fc|fd|fe[89ab]|ff|2001:db8)/.test(s));
} const [a, b] = ip.split('.').map(Number); return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19))); }
async function verifyHost(host: string) { const records = await Promise.all(['A', 'AAAA'].map(async (type) => { const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) }); if (!r.ok)
    throw new HttpError(502, 'Could not verify website DNS.'); const d = await r.json() as any; return (d.Answer || []).filter((a: any) => a.type === 1 || a.type === 28).map((a: any) => a.data); })); const ips = records.flat(); if (!ips.length || ips.some(ip => !publicIP(ip)))
    throw new HttpError(400, 'Website must resolve to public internet addresses.'); }
export async function wp(site: any, path: string, options: RequestInit = {}) { const base = validateUrl(site.url); await verifyHost(new URL(base).hostname); if (!site.credential)
    throw new HttpError(400, 'Connect WordPress with an Application Password first.'); const headers = new Headers(options.headers); headers.set('Authorization', 'Basic ' + btoa(site.username + ':' + await decrypt(site.credential))); if (typeof options.body === 'string')
    headers.set('Content-Type', 'application/json'); const r = await fetch(base + '/wp-json/wp/v2/' + path, { ...options, headers, redirect: 'error', signal: AbortSignal.timeout(25000) }); let d: any; try {
    d = await r.json();
}
catch {
    throw new HttpError(502, 'WordPress returned an invalid response. Check REST API access.');
} ; if (!r.ok)
    throw new HttpError(r.status === 401 || r.status === 403 ? 400 : 502, d.message || 'WordPress request failed.'); return d; }
export function guardOrigin(request: Request) { const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin)
    deny('Cross-origin request rejected.'); if (request.headers.get('sec-fetch-site') === 'cross-site')
    deny('Cross-site request rejected.'); }
export function responseError(e: unknown) { if (!(e instanceof HttpError))
    console.error('Studio request failed', e instanceof Error ? e.message : 'unknown'); return Response.json({ error: e instanceof HttpError ? e.message : 'Unable to complete this request. Please try again.' }, { status: e instanceof HttpError ? e.status : 500, headers: { 'Cache-Control': 'no-store' } }); }
export { runtimeSecret };
