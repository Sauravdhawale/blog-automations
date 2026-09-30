import { z } from 'zod';
import { all, one, run, db, uid, now, currentUser, siteAccess, role, event, safeSite, encrypt, validateUrl, wp, guardOrigin, responseError, HttpError, deny, runtimeSecret } from '@/lib/server';
import { quality, promptFor, slugify, toHtml, canEdit, roles } from '@/lib/editorial';
export const dynamic = 'force-dynamic';
const str = z.string().max(10000).default('');
const siteSchema = z.object({ name: z.string().min(2).max(100), url: z.string().max(500), niche: str, audience: str, instructions: str, image_rules: str, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#001639'), username: z.string().max(100).default(''), password: z.string().max(300).optional() });
const articleSchema = z.object({ site_id: z.string(), title: z.string().min(3).max(250), keyword: z.string().max(200).default(''), category: z.string().max(120).default(''), content: z.string().max(150000).default(''), meta_title: z.string().max(200).default(''), meta_description: z.string().max(500).default(''), slug: z.string().max(180).default(''), excerpt: z.string().max(2000).default(''), sources: str, instructions: str, assignee: z.string(), reviewer: z.string().nullable().default(null), asset_id: z.string().nullable().default(null), author_id: z.number().int().positive().nullable().default(null) });
const json = (v: any) => Response.json(v, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) { try {
    const user = await currentUser();
    const url = new URL(request.url);
    if (url.searchParams.has('history')) {
        const id = url.searchParams.get('history');
        const a = await one('SELECT * FROM articles WHERE id = ?', id);
        if (!a)
            throw new HttpError(404, 'Article not found.');
        await siteAccess(user, a.site_id);
        return json({ revisions: await all('SELECT * FROM revisions WHERE article_id = ? ORDER BY version DESC', id), events: await all('SELECT * FROM events WHERE article_id = ? ORDER BY created DESC', id) });
    }
    const sites = await all(user.role === 'Admin' ? 'SELECT * FROM sites ORDER BY created DESC' : 'SELECT s.* FROM sites s JOIN memberships m ON m.site_id = s.id WHERE m.user_id = ? ORDER BY s.created DESC', ...(user.role === 'Admin' ? [] : [user.id]));
    const ids = sites.map(s => s.id);
    const list = ids.length ? ids.map(() => '?').join(',') : 'NULL';
    const articles = await all(`SELECT * FROM articles WHERE site_id IN (${list}) ORDER BY updated DESC`, ...ids);
    const users = user.role === 'Admin' ? await all('SELECT id,email,name,role,active FROM users ORDER BY created') : await all(`SELECT DISTINCT u.id,u.name,u.role,u.active FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.site_id IN (${list})`, ...ids);
    const members = await all(`SELECT * FROM memberships WHERE site_id IN (${list})`, ...ids);
    return json({ user, sites: sites.map(safeSite), articles, users, memberships: members, assets: await all(`SELECT * FROM assets WHERE site_id IN (${list}) ORDER BY created DESC`, ...ids), schedules: await all(`SELECT * FROM schedules WHERE site_id IN (${list}) ORDER BY created DESC`, ...ids), events: await all(user.role === 'Admin' ? 'SELECT * FROM events ORDER BY created DESC LIMIT 80' : `SELECT * FROM events WHERE site_id IN (${list}) ORDER BY created DESC LIMIT 80`, ...(user.role === 'Admin' ? [] : ids)), capabilities: { chatgptGeneration: false, imageGeneration: false, cronConfigured: !!runtimeSecret('CRON_SECRET'), credentialEncryption: !!runtimeSecret('CREDENTIAL_ENCRYPTION_KEY') } });
}
catch (e) {
    return responseError(e);
} }
export async function POST(request: Request) {
    try {
        guardOrigin(request);
        if (Number(request.headers.get('content-length') || 0) > 200000)
            throw new HttpError(413, 'Request too large.');
        const user = await currentUser();
        let b: any;
        try {
            b = await request.json();
        }
        catch {
            throw new HttpError(400, 'Invalid JSON request.');
        }
        const action = b.action;
        if (action === 'saveSite') {
            role(user, ['Admin', 'Manager']);
            const s = siteSchema.parse(b.data);
            const url = validateUrl(s.url);
            const existing = b.id ? await siteAccess(user, b.id) : null;
            if (!existing && user.role !== 'Admin')
                deny();
            const id = existing?.id || uid();
            const credential = s.password ? await encrypt(s.password) : existing?.credential || null;
            const invalidated = !!existing && (url !== existing.url || s.username !== existing.username || !!s.password);
            const connection = invalidated ? 'Not connected' : existing?.connection || 'Not connected';
            await run(`INSERT INTO sites(id,name,url,niche,audience,instructions,image_rules,color,username,credential,connection,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,niche=excluded.niche,audience=excluded.audience,instructions=excluded.instructions,image_rules=excluded.image_rules,color=excluded.color,username=excluded.username,credential=excluded.credential,connection=excluded.connection`, id, s.name, url, s.niche, s.audience, s.instructions, s.image_rules, s.color, s.username, credential, connection, existing?.created || now());
            if (invalidated)
                await run("UPDATE sites SET categories='[]',authors='[]',posts='[]' WHERE id=?", id);
            await event(user, existing ? 'Updated website' : 'Added website', id, null, s.name);
            return json({ id });
        }
        if (action === 'disconnectSite') {
            role(user, ['Admin', 'Manager']);
            await siteAccess(user, b.id);
            await run("UPDATE sites SET credential=NULL,username='',connection='Not connected' WHERE id=?", b.id);
            await event(user, 'Disconnected WordPress', b.id);
            return json({ ok: true });
        }
        if (action === 'syncSite') {
            role(user, ['Admin', 'Manager']);
            const s = await siteAccess(user, b.id);
            try {
                const me = await wp(s, 'users/me?context=edit');
                if (!me.capabilities?.edit_posts)
                    throw new HttpError(400, 'This WordPress account needs permission to edit posts.');
                const [categories, authors, posts] = await Promise.all([wp(s, 'categories?per_page=100'), wp(s, 'users?per_page=100').catch(() => [{ id: me.id, name: me.name }]), wp(s, 'posts?per_page=100&_fields=id,title,link,slug')]);
                await run("UPDATE sites SET categories=?,authors=?,posts=?,connection='Connected' WHERE id=?", JSON.stringify(categories.map((c: any) => ({ id: c.id, name: c.name }))), JSON.stringify(authors.map((a: any) => ({ id: a.id, name: a.name }))), JSON.stringify(posts.map((p: any) => ({ id: p.id, title: p.title.rendered.replace(/<[^>]*>/g, ''), link: p.link, slug: p.slug }))), s.id);
                await event(user, 'Synced WordPress', s.id, null, `${posts.length} recent articles synced`);
                return json({ ok: true, canPublish: !!me.capabilities?.publish_posts, canUpload: !!me.capabilities?.upload_files });
            }
            catch (e) {
                await run("UPDATE sites SET connection='Connection failed' WHERE id=?", s.id);
                throw e;
            }
        }
        if (action === 'saveArticle') {
            const a = articleSchema.parse(b.data);
            const s = await siteAccess(user, a.site_id);
            const existing = b.id ? await one('SELECT * FROM articles WHERE id=?', b.id) : null;
            if (b.id && !existing)
                throw new HttpError(404, 'Article not found.');
            if (existing && b.data.version !== existing.version)
                throw new HttpError(409, 'This article has a newer revision. Reload before saving.');
            if (existing?.site_id && existing.site_id !== a.site_id)
                throw new HttpError(400, 'An article cannot move between websites.');
            if (existing && !canEdit(user.role, existing, user.id))
                deny();
            if (!existing)
                role(user, ['Admin', 'Manager', 'Writer']);
            if (existing && ['Published', 'Publishing', 'Publishing uncertain', 'Scheduled'].includes(existing.status))
                throw new HttpError(409, 'Published, scheduled, or publishing articles are locked. Create a new draft instead.');
            if (user.role === 'Writer' && a.assignee !== user.id)
                deny();
            await validateMember(a.assignee, a.site_id);
            if (a.reviewer)
                await validateMember(a.reviewer, a.site_id, ['Admin', 'Manager', 'Reviewer']);
            if (a.asset_id && !await one('SELECT id FROM assets WHERE id=? AND site_id=?', a.asset_id, a.site_id))
                throw new HttpError(400, 'Choose an image belonging to this website.');
            const id = existing?.id || uid();
            const version = (existing?.version || 0) + 1;
            const editToken = uid();
            const snapshot = promptFor(a, s);
            const slug = slugify(a.slug || a.title);
            const duplicate = await one('SELECT id,title FROM articles WHERE site_id=? AND (lower(title)=lower(?) OR slug=?) AND id!=?', a.site_id, a.title, slug, id);
            if (duplicate)
                throw new HttpError(409, 'A draft with this title or slug already exists. Choose a different topic or edit that draft.');
            if (JSON.parse(s.posts).some((p: any) => p.slug === slug))
                throw new HttpError(409, 'This slug already exists on WordPress. Choose a new angle and slug.');
            const statements = [db().prepare(`INSERT INTO articles(id,site_id,title,keyword,category,content,meta_title,meta_description,slug,excerpt,sources,instructions,snapshot,status,version,assignee,reviewer,asset_id,author_id,created,updated,edit_token) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,keyword=excluded.keyword,category=excluded.category,content=excluded.content,meta_title=excluded.meta_title,meta_description=excluded.meta_description,slug=excluded.slug,excerpt=excluded.excerpt,sources=excluded.sources,instructions=excluded.instructions,snapshot=excluded.snapshot,status='Draft',version=excluded.version,approved_version=NULL,assignee=excluded.assignee,reviewer=excluded.reviewer,asset_id=excluded.asset_id,author_id=excluded.author_id,updated=excluded.updated,edit_token=excluded.edit_token WHERE articles.version=? AND articles.status NOT IN ('Published','Publishing','Publishing uncertain','Scheduled')`).bind(id, a.site_id, a.title, a.keyword, a.category, a.content, a.meta_title, a.meta_description, slug, a.excerpt, a.sources, a.instructions, snapshot, 'Draft', version, a.assignee, a.reviewer, a.asset_id, a.author_id, existing?.created || now(), now(), editToken, existing?.version || 0), db().prepare('INSERT INTO revisions(id,article_id,version,data,actor,created) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM articles WHERE id=? AND edit_token=?)').bind(uid(), id, version, JSON.stringify({ ...a, snapshot, slug }), user.name, now(), id, editToken)];
            const saved = await db().batch(statements);
            if (!saved[0].meta.changes)
                throw new HttpError(409, 'The article changed while saving. Reload before continuing.');
            await event(user, existing ? 'Saved revision' : 'Created draft', a.site_id, id, a.title);
            return json({ id, version });
        }
        if (action === 'transition') {
            const a = await one('SELECT * FROM articles WHERE id=?', b.id);
            if (!a)
                throw new HttpError(404, 'Article not found.');
            await siteAccess(user, a.site_id);
            if (a.version !== b.version)
                throw new HttpError(409, 'This article changed. Reload it before continuing.');
            let status: string;
            let approved: number | null = null;
            if (b.target === 'Pending approval') {
                if (!canEdit(user.role, a, user.id))
                    deny();
                if (!['Draft', 'Changes requested', 'Awaiting ChatGPT'].includes(a.status))
                    throw new HttpError(409, 'This article cannot be submitted from its current state.');
                if (quality(a).some(q => !q.ok))
                    throw new HttpError(400, 'Complete all editorial checks before submitting.');
                if (!a.reviewer)
                    throw new HttpError(400, 'Assign a reviewer first.');
                status = 'Pending approval';
            }
            else if (['Approved', 'Changes requested', 'Rejected'].includes(b.target)) {
                role(user, ['Admin', 'Manager', 'Reviewer']);
                if (user.role === 'Reviewer' && a.reviewer !== user.id)
                    deny('This article is assigned to another reviewer.');
                if (a.status !== 'Pending approval')
                    throw new HttpError(409, 'This article is not awaiting approval.');
                if (b.target !== 'Approved' && !String(b.note || '').trim())
                    throw new HttpError(400, 'Add feedback for the writer.');
                status = b.target;
                approved = status === 'Approved' ? a.version : null;
            }
            else
                throw new HttpError(400, 'Invalid workflow action.');
            const result = await run('UPDATE articles SET status=?,approved_version=?,updated=? WHERE id=? AND version=? AND status=?', status, approved, now(), a.id, a.version, a.status);
            if (!result.meta.changes)
                throw new HttpError(409, 'Article changed. Reload before continuing.');
            await event(user, status, a.site_id, a.id, String(b.note || a.title).slice(0, 5000));
            return json({ ok: true });
        }
        if (action === 'comment') {
            const a = await one('SELECT * FROM articles WHERE id=?', b.id);
            if (!a)
                throw new HttpError(404, 'Article not found.');
            await siteAccess(user, a.site_id);
            const note = z.string().trim().min(1).max(5000).parse(b.note);
            await event(user, 'Comment', a.site_id, a.id, note);
            return json({ ok: true });
        }
        if (action === 'publish') {
            role(user, ['Admin', 'Manager', 'Publisher']);
            const a = await one('SELECT * FROM articles WHERE id=?', b.id);
            if (!a)
                throw new HttpError(404, 'Article not found.');
            const s = await siteAccess(user, a.site_id);
            if (a.status !== 'Approved' || a.approved_version !== a.version || a.version !== b.version)
                throw new HttpError(409, 'Approve the current article version before publishing.');
            const mode = z.enum(['publish', 'draft', 'future']).parse(b.mode);
            let publishAt: string | null = null;
            if (mode === 'future') {
                publishAt = z.string().datetime().parse(b.publishAt);
                if (Date.parse(publishAt) < Date.now() + 60000)
                    throw new HttpError(400, 'Choose a future publication time.');
            }
            const lock = await run("UPDATE articles SET status='Publishing' WHERE id=? AND status='Approved' AND version=? AND approved_version=?", a.id, a.version, a.version);
            if (!lock.meta.changes)
                throw new HttpError(409, 'Publishing is already in progress.');
            let externalStarted = false;
            try {
                const me = await wp(s, 'users/me?context=edit');
                if (mode !== 'draft' && !me.capabilities?.publish_posts)
                    throw new HttpError(400, 'WordPress account cannot publish posts.');
                const cat = JSON.parse(s.categories).find((c: any) => String(c.id) === a.category || c.name === a.category);
                let media: number | undefined;
                if (a.asset_id) {
                    if (!me.capabilities?.upload_files)
                        throw new HttpError(400, 'WordPress account cannot upload images.');
                    const asset = await one('SELECT * FROM assets WHERE id=? AND site_id=?', a.asset_id, s.id);
                    if (asset) {
                        const { env } = await import('cloudflare:workers');
                        const object = await env.BUCKET?.get(asset.id);
                        if (!object)
                            throw new HttpError(400, 'Featured image is missing.');
                        const bytes = await object.arrayBuffer();
                        const fd = new FormData();
                        fd.set('file', new Blob([bytes], { type: asset.mime }), asset.filename);
                        fd.set('alt_text', asset.alt);
                        const uploaded = await wp(s, 'media', { method: 'POST', body: fd });
                        media = uploaded.id;
                    }
                }
                const payload: any = { title: a.title, content: toHtml(a.content), excerpt: a.excerpt, slug: a.slug, status: mode };
                if (cat)
                    payload.categories = [cat.id];
                if (a.author_id)
                    payload.author = a.author_id;
                if (media)
                    payload.featured_media = media;
                if (publishAt)
                    payload.date_gmt = publishAt.replace(/Z$/, '');
                externalStarted = true;
                const post = await wp(s, a.wp_id ? 'posts/' + a.wp_id : 'posts', { method: 'POST', body: JSON.stringify(payload) });
                await run('UPDATE articles SET status=?,wp_id=?,wp_url=?,publish_at=?,updated=? WHERE id=?', mode === 'draft' ? 'Approved' : mode === 'future' ? 'Scheduled' : 'Published', post.id, post.link || '', publishAt, now(), a.id);
                await event(user, mode === 'draft' ? 'Saved WordPress draft' : mode === 'future' ? 'Scheduled publication' : 'Published article', s.id, a.id, a.title);
                return json({ id: post.id, url: post.link });
            }
            catch (e) {
                await run('UPDATE articles SET status=? WHERE id=?', externalStarted ? 'Publishing uncertain' : 'Approved', a.id);
                await event(user, 'Publishing needs attention', s.id, a.id, externalStarted ? 'WordPress may have accepted the post. Reconcile before retrying.' : 'Publishing stopped before article submission.');
                throw e;
            }
        }
        if (action === 'reconcile') {
            role(user, ['Admin', 'Manager', 'Publisher']);
            const a = await one('SELECT * FROM articles WHERE id=?', b.id);
            if (!a)
                throw new HttpError(404, 'Article not found.');
            const s = await siteAccess(user, a.site_id);
            if (!['Publishing uncertain', 'Publishing'].includes(a.status))
                throw new HttpError(400, 'No uncertain publication to reconcile.');
            const posts = await wp(s, 'posts?context=edit&status=any&slug=' + encodeURIComponent(a.slug));
            if (posts.length !== 1)
                throw new HttpError(409, posts.length ? 'Multiple matches found. Check WordPress manually.' : 'No matching post found. Confirm the WordPress result before asking an administrator to unlock the article.');
            const p = posts[0];
            await run('UPDATE articles SET wp_id=?,wp_url=?,status=?,updated=? WHERE id=?', p.id, p.link, p.status === 'publish' ? 'Published' : p.status === 'future' ? 'Scheduled' : 'Approved', now(), a.id);
            await event(user, 'Reconciled WordPress post', s.id, a.id, a.title);
            return json({ ok: true });
        }
        if (action === 'saveUser') {
            role(user, ['Admin']);
            const u = z.object({ name: z.string().min(2).max(100), email: z.string().email().max(200), role: z.enum(roles), site_ids: z.array(z.string()).max(100), active: z.boolean().default(true) }).parse(b.data);
            const id = b.id || uid();
            const existing = await one('SELECT * FROM users WHERE id=?', id);
            if (id === user.id && (u.role !== 'Admin' || !u.active))
                throw new HttpError(400, 'You cannot remove your own administrator access.');
            if (existing && existing.email !== u.email.toLowerCase())
                throw new HttpError(400, 'Create a separate invitation to change an account email.');
            for (const sid of u.site_ids)
                await siteAccess(user, sid);
            const duplicate = await one('SELECT id FROM users WHERE email=? AND id!=?', u.email.toLowerCase(), id);
            if (duplicate)
                throw new HttpError(409, 'This email is already invited.');
            const statements = [db().prepare('INSERT INTO users(id,email,name,role,active,created) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active').bind(id, u.email.toLowerCase(), u.name, u.role, u.active ? 1 : 0, now()), db().prepare('DELETE FROM memberships WHERE user_id=?').bind(id), ...u.site_ids.map(sid => db().prepare('INSERT INTO memberships(id,user_id,site_id) VALUES(?,?,?)').bind(uid(), id, sid))];
            await db().batch(statements);
            await event(user, existing ? 'Updated user' : 'Invited user', null, null, u.name);
            return json({ id });
        }
        if (action === 'saveSchedule') {
            role(user, ['Admin', 'Manager']);
            const a = z.object({ site_id: z.string(), title: z.string().min(3).max(250), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().max(100), days: z.string().regex(/^[0-6](,[0-6])*$/), category: z.string().max(100).default(''), reviewer: z.string().nullable(), enabled: z.boolean() }).parse(b.data);
            await siteAccess(user, a.site_id);
            try {
                new Intl.DateTimeFormat('en', { timeZone: a.timezone });
            }
            catch {
                throw new HttpError(400, 'Enter a valid IANA timezone.');
            }
            if (a.reviewer)
                await validateMember(a.reviewer, a.site_id, ['Admin', 'Manager', 'Reviewer']);
            if (b.id) {
                const old = await one('SELECT * FROM schedules WHERE id=?', b.id);
                if (!old)
                    throw new HttpError(404, 'Schedule not found.');
                await siteAccess(user, old.site_id);
            }
            const id = b.id || uid();
            await run('INSERT INTO schedules(id,site_id,title,time,timezone,days,category,reviewer,owner,enabled,created) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,time=excluded.time,timezone=excluded.timezone,days=excluded.days,category=excluded.category,reviewer=excluded.reviewer,enabled=excluded.enabled', id, a.site_id, a.title, a.time, a.timezone, a.days, a.category, a.reviewer, user.id, a.enabled ? 1 : 0, now());
            await event(user, 'Saved schedule', a.site_id, null, a.title);
            return json({ id });
        }
        if (action === 'runSchedule') {
            role(user, ['Admin', 'Manager']);
            const s = await one('SELECT * FROM schedules WHERE id=?', b.id);
            if (!s)
                throw new HttpError(404, 'Schedule not found.');
            await siteAccess(user, s.site_id);
            const { queueSchedule } = await import('@/lib/scheduler');
            return json(await queueSchedule(s, 'manual-' + uid()));
        }
        throw new HttpError(400, 'Unknown action.');
    }
    catch (e) {
        if (e instanceof z.ZodError)
            return Response.json({ error: e.issues.map(i => i.path.join('.') + ': ' + i.message).join('; ') }, { status: 400 });
        return responseError(e);
    }
}
async function validateMember(id: string, site: string, allowed?: string[]) { const u = await one('SELECT * FROM users WHERE id=? AND active=1', id); if (!u || allowed && !allowed.includes(u.role))
    throw new HttpError(400, 'Choose an active user with the required role.'); await siteAccess(u, site); }
