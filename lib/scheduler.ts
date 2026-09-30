import { all, one, db, uid, now, event } from './server';
import { promptFor, slugify } from './editorial';
export async function queueSchedule(s: any, day: string) { const owner = await one('SELECT * FROM users WHERE id=? AND active=1', s.owner); if (!owner)
    return { skipped: true, reason: 'Owner is inactive' }; if (owner.role !== 'Admin' && !await one('SELECT id FROM memberships WHERE user_id=? AND site_id=?', owner.id, s.site_id))
    return { skipped: true, reason: 'Owner no longer has website access' }; if (await one('SELECT id FROM runs WHERE schedule_id=? AND day=?', s.id, day))
    return { skipped: true }; const site = await one('SELECT * FROM sites WHERE id=?', s.site_id); const id = uid(); const title = s.title + ' — ' + day.slice(0, 10); const a = { title, keyword: '', category: s.category, instructions: 'Suggest a fresh angle. Check existing articles before writing.' }; const snapshot = promptFor(a, site); try {
    await db().batch([db().prepare('INSERT INTO runs(id,schedule_id,day,article_id,status,created) VALUES(?,?,?,?,?,?)').bind(uid(), s.id, day, id, 'Awaiting ChatGPT', now()), db().prepare('INSERT INTO articles(id,site_id,title,category,instructions,snapshot,status,assignee,reviewer,slug,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, s.site_id, title, s.category, a.instructions, snapshot, 'Awaiting ChatGPT', s.owner, s.reviewer, slugify(title) + '-' + id.slice(0, 6), now(), now())]);
}
catch (e) {
    if (await one('SELECT id FROM runs WHERE schedule_id=? AND day=?', s.id, day))
        return { skipped: true };
    throw e;
} await event(owner, 'Queued writing brief', s.site_id, id, title); return { id }; }
export async function runDue() { const schedules = await all('SELECT * FROM schedules WHERE enabled=1'); const results = []; for (const s of schedules) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: s.timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    if (!s.days.split(',').includes(String(weekday)) || p.hour + ':' + p.minute < s.time)
        continue;
    results.push(await queueSchedule(s, `${p.year}-${p.month}-${p.day}`));
} return results; }
