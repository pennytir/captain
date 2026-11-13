// Unit tests for card data: the GraphQL request, the response mapping, the error mapping and the cache.
// No Obsidian and no network: the post and the cache store are fakes.
import { describe, expect, it } from 'vitest';
import {
	ANSWER_MAX,
	BODY_MAX,
	GRAPHQL_URL,
	type CardData,
	type CardJson,
	type FetchEnv,
	cardFromJson,
	fetchCard,
	graphqlBody,
	resultFromResponse,
} from '../src/card';
import type { DiscussionRef } from '../src/parse';

const REF: DiscussionRef = { owner: 'acme', repo: 'tools', number: 42 };

function rawDiscussion(overrides: Partial<CardJson> = {}): CardJson {
	return {
		title: 'How do I sync two vaults?',
		author: { login: 'bee' },
		category: { name: 'Help' },
		bodyText: 'I keep two vaults and want one library.',
		url: 'https://github.com/acme/tools/discussions/42',
		number: 42,
		answer: null,
		comments: { totalCount: 3 },
		updatedAt: '2026-10-01T10:00:00Z',
		...overrides,
	};
}

const MEMORY = new Map<string, CardData>();

function fakeEnv(postImpl: FetchEnv['post'], now = 1_000): FetchEnv {
	return {
		post: postImpl,
		read: (key: string) => MEMORY.get(key) ?? null,
		write: (card: CardData) => {
			MEMORY.set(`${card.owner}/${card.repo}/${card.number}`, card);
		},
		now: () => now,
	};
}

const okPost: FetchEnv['post'] = async () => ({ status: 200, json: { data: { repository: { discussion: rawDiscussion() } } } });

describe('graphqlBody', () => {
	it('builds one POST body with owner, name and number', () => {
		const body = graphqlBody(REF);
		expect(body).toContain('"query"');
		expect(body).toContain('"owner":"acme"');
		expect(body).toContain('"name":"tools"');
		expect(body).toContain('"number":42');
	});
});

describe('cardFromJson', () => {
	it('maps a plain discussion with no answer', () => {
		const card = cardFromJson(REF, rawDiscussion(), 5_000);
		expect(card).toEqual<CardData>({
			owner: 'acme',
			repo: 'tools',
			number: 42,
			title: 'How do I sync two vaults?',
			author: 'bee',
			category: 'Help',
			body: 'I keep two vaults and want one library.',
			answered: false,
			answer: null,
			comments: 3,
			url: 'https://github.com/acme/tools/discussions/42',
			updatedAt: '2026-10-01T10:00:00Z',
			fetchedAt: 5_000,
			cached: false,
		});
	});

	it('maps an answered discussion and cuts the answer at 800', () => {
		const card = cardFromJson(REF, rawDiscussion({ answer: { bodyText: 'x'.repeat(801), author: { login: 'm' } } }), 1);
		expect(card.answered).toBe(true);
		expect(card.answer).toBe('x'.repeat(ANSWER_MAX) + '...');
	});

	it('cuts a long body at 1,500 and keeps 1,500 as is', () => {
		const long = cardFromJson(REF, rawDiscussion({ bodyText: 'y'.repeat(BODY_MAX + 1) }), 1);
		expect(long.body).toBe('y'.repeat(BODY_MAX) + '...');
		const exact = cardFromJson(REF, rawDiscussion({ bodyText: 'z'.repeat(BODY_MAX) }), 1);
		expect(exact.body).toBe('z'.repeat(BODY_MAX));
	});

	it('keeps script and image text as plain text', () => {
		const card = cardFromJson(REF, rawDiscussion({ bodyText: '<script>alert(1)</script><img src=x>' }), 1);
		expect(card.body).toBe('<script>alert(1)</script><img src=x>');
	});
});

describe('resultFromResponse', () => {
	it('gives token-needed for HTTP 401 without a token', () => {
		const r = resultFromResponse(401, {}, REF, 1, false);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('token-needed');
	});

	it('gives http for HTTP 401 with a token and never echoes the token', () => {
		const r = resultFromResponse(401, {}, REF, 1, true);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('http');
		expect(JSON.stringify(r)).not.toContain('ghp_secret');
	});

	it('gives not-found for a NOT_FOUND GraphQL error', () => {
		const r = resultFromResponse(200, { errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a Discussion' }] }, REF, 1, true);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('not-found');
	});

	it('gives token-needed for NOT_FOUND without a token', () => {
		const r = resultFromResponse(200, { errors: [{ type: 'NOT_FOUND', message: 'x' }] }, REF, 1, false);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('token-needed');
	});

	it('gives rate-limit for HTTP 429', () => {
		const r = resultFromResponse(429, {}, REF, 1, false);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('rate-limit');
	});

	it('gives http for other statuses', () => {
		const r = resultFromResponse(500, {}, REF, 1, false);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.message).toContain('500');
	});
});

describe('fetchCard', () => {
	it('sends one POST to the GraphQL endpoint', async () => {
		let calls = 0;
		let url = '';
		const env = fakeEnv(async (u) => {
			calls++;
			url = u;
			return { status: 200, json: { data: { repository: { discussion: rawDiscussion() } } } };
		});
		const r = await fetchCard(env, 'https://github.com/acme/tools/discussions/42', 'test-token');
		expect(calls).toBe(1);
		expect(url).toBe(GRAPHQL_URL);
		expect(r.ok).toBe(true);
	});

	it('refuses a bad URL with no request', async () => {
		let calls = 0;
		const env = fakeEnv(async () => {
			calls++;
			return { status: 200, json: {} };
		});
		for (const bad of ['https://example.com/a/b/discussions/1', 'https://github.com/a/b/issues/1', 'not a url']) {
			const r = await fetchCard(env, bad, 'test-token');
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.kind).toBe('bad-url');
		}
		expect(calls).toBe(0);
	});

	it('serves the cache after a network failure and marks it cached', async () => {
		const first = await fetchCard(fakeEnv(okPost), 'https://github.com/acme/tools/discussions/42', 'test-token');
		expect(first.ok).toBe(true);
		const dead = fakeEnv(async () => {
			throw new Error('offline');
		}, 9_000);
		const second = await fetchCard(dead, 'https://github.com/acme/tools/discussions/42', 'test-token');
		expect(second.ok).toBe(true);
		if (second.ok) {
			expect(second.card.cached).toBe(true);
			expect(second.card.fetchedAt).toBe(1_000);
		}
	});

	it('gives network with no cached card after a failure', async () => {
		const dead = fakeEnv(async () => {
			throw new Error('offline');
		});
		const r = await fetchCard(dead, 'https://github.com/acme/other/discussions/7', 'test-token');
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('network');
	});

	it('keeps two repos with the same number apart in the cache', async () => {
		MEMORY.clear();
		const env = fakeEnv(okPost);
		await fetchCard(env, 'https://github.com/acme/tools/discussions/42', 'test-token');
		await fetchCard(env, 'https://github.com/acme/kit/discussions/42', 'test-token');
		expect(MEMORY.size).toBe(2);
		expect(MEMORY.get('acme/tools/42')?.repo).toBe('tools');
		expect(MEMORY.get('acme/kit/42')?.repo).toBe('kit');
	});

	it('never puts the token in any result', async () => {
		const env = fakeEnv(async () => ({ status: 401, json: {} }));
		const r = await fetchCard(env, 'https://github.com/acme/tools/discussions/42', 'ghp_supersecret');
		expect(r.ok).toBe(false);
		expect(JSON.stringify(r)).not.toContain('ghp_supersecret');
	});
});

describe('token requirement', () => {
	it('sends no request before a discussion token is supplied', async () => {
		let calls = 0;
		const env: FetchEnv = { post: async () => { calls++; return { status: 200, json: {} }; }, read: () => null, write: () => undefined, now: () => 1 };
		const result = await fetchCard(env, 'https://github.com/acme/tools/discussions/42', null);
		expect(calls).toBe(0);
		expect(result).toEqual({ ok: false, error: { kind: 'token-needed', message: 'Add a discussion read token in the settings of Discussion Brief Cards, then select Refresh.' } });
	});
});
