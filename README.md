# blog-automations

**Arkentech Content Studio** — a multi-website WordPress editorial workspace.

A full-stack React application with a Cloudflare Worker backend, D1 database, R2 image storage, and ChatGPT account sign-in on Sites. The interface uses Arkentech navy, white, and red.

## Implemented

- Website profiles with separate audience, writing instructions, image rules, and brand color.
- Encrypted WordPress Application Passwords; connection testing and category, author, and recent-post sync.
- Admin, Manager, Writer, Reviewer, and Publisher roles with server-side website assignments.
- Explicit email invitations linked to authenticated ChatGPT identities; account deactivation.
- Draft editor, metadata fields, reference notes, word count, previews, saved revisions, and comments.
- Complete copyable ChatGPT writing and editorial-polish prompts; manual draft import.
- Editorial checks, reviewer assignment, approval, changes requested, and rejection.
- Approval applies to an exact version. Editing invalidates approval. Publishing locks and reconciliation reduce duplicate-post risk.
- WordPress draft export, publish-now, and scheduled publication of approved content.
- Per-website image uploads, actual-file validation, protected image delivery, and featured-image selection.
- Content calendar, activity log, and review queue.
- Timezone-aware recurring writing-brief schedules and authenticated `/api/cron` runner with per-day deduplication.

## Explicit integration limits

This is a working editorial application, **not a fully connected autonomous AI writing service**.

- ChatGPT sign-in provides identity. It does not automatically authorize model inference. Automatic article generation is not implemented; users copy the prepared brief to ChatGPT and paste their draft back.
- Humanization is an assisted editorial prompt, not a connected rewrite model. No AI-detector score is fabricated or guaranteed.
- Images are uploaded manually. Image generation is not connected.
- The daily runner queues briefs; it cannot generate articles. An external scheduler such as n8n must invoke it.
- No scheduled task is created by installing this repository.
- WordPress requires credentials entered in the application. No real credentials are included.
- Rank Math/Yoast metadata write integration is not implemented. SEO fields remain in the workspace for manual transfer.
- WordPress sync imports up to 100 recent posts/categories/authors; duplicate detection is exact title/slug, not semantic analysis of the complete website.
- Invitation emails and email notifications are not sent. Review notifications are the live in-app queue.
- Platform ChatGPT sign-in is used; independent email/password registration is not implemented.
- Automatic web research, factual verification, plagiarism scanning, semantic rewriting, category-level profiles, automatic image compression/cropping, and autonomous retries of uncertain publications are not included.

## Stack

React 19, TypeScript, Vinext/Vite, Tailwind CSS, Shadcn primitives, Cloudflare Workers, D1/SQLite, R2, Drizzle migrations, Zod validation.

## Development

Use Node 22.13 or newer. This checkout uses pnpm and includes a lockfile.

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm run build
```

For a standalone development environment use `pnpm run dev`. The managed Sites environment uses its supervised preview instead. See `docs/DEPLOYMENT.md` for database initialization, runtime secrets, authentication, and scheduler setup.

Local development must not be exposed directly to the public internet: Sites normally supplies the trusted authentication boundary. The portable starter simulates sign-in only in loopback development; the managed profile does not.

## First-use flow

1. Open the owner-private deployed app and sign in. The first authenticated visitor becomes the application administrator, so initialize while access remains owner-only.
2. Add a website and save its instructions.
3. Add its WordPress username and Application Password, save, then test and sync.
4. Invite teammate account emails and assign websites; separately allow them through the hosting platform's access policy when ready.
5. Create a blog, copy its ChatGPT brief, and paste the draft and metadata back.
6. Add references and an image, then submit for approval.
7. The assigned reviewer approves the current revision; a publisher exports or publishes it.

## Verification

Run `node --experimental-vm-modules tests/integration.mjs`. The offline harness executes the actual API handlers with a real in-memory SQLite database, simulated platform identity, and simulated object storage. It tests authentication, role isolation, draft persistence, duplicate protection, approval invalidation, publication blocking, credential encryption, image signatures, and schedule behavior. No real website is contacted. Never point the optional HTTP test mode at production.

See `docs/VERIFICATION.md` for the verification performed for this delivery.
