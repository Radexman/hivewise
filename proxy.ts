import NextAuth from 'next-auth';

import authConfig from './auth.config';

/**
 * Route protection for the authenticated pages.
 *
 * Built from `auth.config.ts` rather than `auth.ts` so the Prisma client stays
 * out of this file — Proxy runs ahead of every matched request, and the Next
 * docs are explicit that it should read the session cookie and not touch the
 * database. With the `jwt` strategy that is all the session needs anyway.
 *
 * This is an optimistic check, not the security boundary: pages still call
 * `auth()` themselves.
 */
const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
	// Scoped on purpose. Auth.js suggests running Proxy on all routes, but `/` is
	// public. Every page in the `(dashboard)` group belongs here — the group adds
	// no URL segment, so each of its routes has to be listed by its own path.
	//
	// `/api/generate-pdf` requires a session too, but enforces it by calling
	// `auth()` itself rather than by joining this list. Proxy answers a failed
	// check with a redirect to the sign-in page, and an endpoint that `fetch`
	// posts JSON to needs a 401 it can read — not an HTML login form arriving
	// where a PDF was expected.
	//
	// `/` is deliberately absent even though it now redirects by session: it
	// sends signed-in users to `/dashboard` and everyone else to `/sign-in`, so
	// it has to *render* for both. Listing it here would turn the anonymous
	// branch into next-auth's redirect and the page would never run.
	matcher: ['/dashboard/:path*', '/profile', '/inspection', '/inspect/:path*'],
};
