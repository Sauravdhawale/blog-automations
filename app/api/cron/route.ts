import { runtimeSecret, responseError, HttpError } from '@/lib/server';
import { runDue } from '@/lib/scheduler';
export async function POST(request: Request) { try {
    const secret = runtimeSecret('CRON_SECRET');
    if (!secret)
        throw new HttpError(503, 'Schedule runner is not configured.');
    const actual = request.headers.get('authorization') || '';
    const expected = 'Bearer ' + secret;
    const a = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(actual)));
    const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected)));
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a[i] ^ b[i];
    if (diff)
        throw new HttpError(401, 'Unauthorized');
    return Response.json({ runs: await runDue() });
}
catch (e) {
    return responseError(e);
} }
