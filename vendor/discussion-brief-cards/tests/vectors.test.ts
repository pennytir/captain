import { cardFromJson, resultFromResponse, fetchCard, type FetchEnv } from '../src/card';
import { describe, expect, it } from 'vitest';
import vectors from './vectors/discussion-brief-cards.json';
import { cacheKey, cutText, discussionUrl, parseDiscussionUrl } from '../src/parse';

interface Case {
	name: string;
	function?: string;
	args: unknown[];
	expected: unknown;
}

describe('golden vectors (packages/spec/vectors/discussion-brief-cards.json)', () => {
	const cases = vectors.cases as Case[];
	it('has at least 20 cases', () => {
		expect(cases.length).toBeGreaterThanOrEqual(20);
	});
	for (const c of cases) {
		it(c.name, async () => {
			if (c.function === 'cardFromJson') { expect(cardFromJson(...(c.args as Parameters<typeof cardFromJson>))).toEqual(c.expected); return; }
			if (c.function === 'resultFromResponse') { expect(resultFromResponse(...(c.args as Parameters<typeof resultFromResponse>))).toEqual(c.expected); return; }
			if (c.function === 'fetchScenario') {
				let calls = 0;
				const ref = { owner: 'acme', repo: 'tools', number: 42 };
				const raw = { title: 'Question', author: { login: 'writer' }, category: { name: 'Q&A' }, bodyText: 'Details', answer: null, comments: { totalCount: 3 }, updatedAt: '2026-10-01T10:00:00Z' };
				const env: FetchEnv = {
					post: async (url, body, token) => {
						calls++;
						expect(url).toBe('https://api.github.com/graphql');
						expect(JSON.parse(body).variables).toEqual({ owner: 'acme', name: 'tools', number: 42 });
						expect(JSON.parse(body).query).not.toContain('mutation');
						expect(token).toBe('test-token');
						if (c.args[0] === 'offline') throw new Error('offline');
						return { status: 200, json: { data: { repository: { discussion: raw } } } };
					},
					read: () => c.args[0] === 'offline' ? cardFromJson(ref, raw, 1000) : null,
					write: () => undefined,
					now: () => 1000,
				};
				expect(await fetchCard(env, 'https://github.com/acme/tools/discussions/42', 'test-token')).toEqual(c.expected);
				expect(calls).toBe(1);
				return;
			}
			if (c.function === 'cacheKey') {
				expect(cacheKey(...(c.args as [Parameters<typeof cacheKey>[0]]))).toEqual(c.expected);
				return;
			}
			if (c.function === 'cutText') {
				expect(cutText(...(c.args as [string | null, number]))).toEqual(c.expected);
				return;
			}
			expect(parseDiscussionUrl(...(c.args as [string]))).toEqual(c.expected);
		});
	}
});

describe('discussionUrl', () => {
	it('builds the source link from a ref', () => {
		expect(discussionUrl({ owner: 'acme', repo: 'tools', number: 42 })).toBe('https://github.com/acme/tools/discussions/42');
	});
});
