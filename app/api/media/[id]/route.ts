import { env } from 'cloudflare:workers';
import { currentUser, siteAccess, one, responseError, HttpError } from '@/lib/server';
export async function GET(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    const user = await currentUser();
    const { id } = await params;
    const asset = await one('SELECT * FROM assets WHERE id=?', id);
    if (!asset)
        throw new HttpError(404, 'Image not found.');
    await siteAccess(user, asset.site_id);
    const file = await env.BUCKET?.get(id);
    if (!file)
        throw new HttpError(404, 'Image not found.');
    return new Response(file.body, { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
}
catch (e) {
    return responseError(e);
} }
