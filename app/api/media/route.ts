import { env } from 'cloudflare:workers';
import { currentUser, siteAccess, role, run, uid, now, guardOrigin, responseError, HttpError, event } from '@/lib/server';
export async function POST(request: Request) { try {
    guardOrigin(request);
    const user = await currentUser();
    role(user, ['Admin', 'Manager', 'Writer']);
    if (Number(request.headers.get('content-length') || 0) > 8500000)
        throw new HttpError(413, 'Choose an image under 8 MB.');
    const data = await request.formData();
    const site = String(data.get('site_id'));
    await siteAccess(user, site);
    const file = data.get('file');
    if (!(file instanceof File) || file.size > 8000000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
        throw new HttpError(400, 'Upload a JPG, PNG, or WebP image under 8 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === 'image/png' ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
    if (!valid)
        throw new HttpError(400, 'The file does not match its image format.');
    if (!env.BUCKET)
        throw new HttpError(503, 'Image storage is unavailable.');
    const id = uid();
    const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100);
    const alt = String(data.get('alt') || '').slice(0, 500);
    await env.BUCKET.put(id, bytes, { httpMetadata: { contentType: file.type } });
    try {
        await run('INSERT INTO assets(id,site_id,filename,mime,alt,size,created) VALUES(?,?,?,?,?,?,?)', id, site, name, file.type, alt, file.size, now());
    }
    catch (e) {
        await env.BUCKET.delete(id);
        throw e;
    }
    await event(user, 'Uploaded image', site, null, name);
    return Response.json({ id });
}
catch (e) {
    return responseError(e);
} }
