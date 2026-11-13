// Card data: the GraphQL request, the response shape, the error mapping and the cache.
// The network client and the cache store are injected, so unit tests run with no Obsidian and no network.

import { cacheKey, cutText, discussionUrl, parseDiscussionUrl as parseRef, type DiscussionRef } from './parse';

/** First 1,500 characters of the body. */
export const BODY_MAX = 1500;
/** First 800 characters of the accepted answer. */
export const ANSWER_MAX = 800;

export interface CardData {
	owner: string;
	repo: string;
	number: number;
	title: string;
	author: string;
	category: string;
	body: string | null;
	answered: boolean;
	answer: string | null;
	comments: number;
	url: string;
	updatedAt: string | null;
	/** ms time of the fetch that filled this card. */
	fetchedAt: number;
	/** True when this card came from the cache after a network failure. */
	cached: boolean;
}

export type CardError =
	| { kind: 'bad-url'; message: string }
	| { kind: 'token-needed'; message: string }
	| { kind: 'not-found'; message: string }
	| { kind: 'rate-limit'; message: string }
	| { kind: 'network'; message: string }
	| { kind: 'http'; message: string };

export type CardResult = { ok: true; card: CardData } | { ok: false; error: CardError };

/** One GraphQL POST to https://api.github.com/graphql. Literal URL (tools/network-gate.mjs). */
export const GRAPHQL_URL = 'https://api.github.com/graphql';

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    discussion(number: $number) {
      title
      bodyText
      isAnswered
      updatedAt
      url
      number
      category { name }
      author { login }
      answer { bodyText author { login } }
      comments { totalCount }
    }
  }
}`;

/** Builds the exact POST body. Exported so the golden vectors pin it. */
export function graphqlBody(ref: DiscussionRef): string {
	return JSON.stringify({ query: QUERY, variables: { owner: ref.owner, name: ref.repo, number: ref.number } });
}

export interface CardJson {
	isAnswered?: boolean | null;
	title?: unknown;
	bodyText?: unknown;
	updatedAt?: unknown;
	url?: unknown;
	number?: unknown;
	category?: { name?: unknown } | null;
	author?: { login?: unknown } | null;
	answer?: { bodyText?: unknown; author?: { login?: unknown } } | null;
	comments?: { totalCount?: unknown } | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Maps one discussion JSON node to the card fields. Text goes through textContent at render time. */
export function cardFromJson(ref: DiscussionRef, json: CardJson, fetchedAt: number): CardData {
	return {
		owner: ref.owner,
		repo: ref.repo,
		number: ref.number,
		title: str(json.title) ?? `(no title)`,
		author: str(json.author?.login) ?? `(unknown author)`,
		category: str(json.category?.name) ?? `(no category)`,
		body: cutText(str(json.bodyText), BODY_MAX),
		answered: typeof json.isAnswered === 'boolean' ? json.isAnswered : json.answer != null,
		answer: json.answer == null ? null : cutText(str(json.answer.bodyText), ANSWER_MAX),
		comments: num(json.comments?.totalCount) ?? 0,
		url: discussionUrl(ref),
		updatedAt: str(json.updatedAt),
		fetchedAt,
		cached: false,
	};
}

/** Turns a GraphQL answer into a card or one clear error. The token never reaches a message. */
export function resultFromResponse(
	status: number,
	json: unknown,
	ref: DiscussionRef,
	fetchedAt: number,
	tokenUsed: boolean,
): CardResult {
	if (status === 401 || status === 403) {
		return tokenUsed
			? { ok: false, error: { kind: 'http', message: `GitHub answered ${status} for this token. Check the token in the settings.` } }
			: { ok: false, error: { kind: 'token-needed', message: 'GitHub needs a token for this request. Add one in the settings of Discussion Brief Cards.' } };
	}
	if (status === 404) return { ok: false, error: { kind: 'not-found', message: 'GitHub found no such repository or discussion.' } };
	if (status === 429) return { ok: false, error: { kind: 'rate-limit', message: 'GitHub rate limit reached. Wait, or add a token in the settings.' } };
	if (status !== 200) return { ok: false, error: { kind: 'http', message: `GitHub answered HTTP ${status}.` } };
	const data = (json as { data?: { repository?: { discussion?: CardJson | null } | null } | null } | null)?.data;
	const discussion = data?.repository?.discussion;
	if (discussion) return { ok: true, card: cardFromJson(ref, discussion, fetchedAt) };
	const errors = (json as { errors?: { type?: unknown; message?: unknown }[] } | null)?.errors;
	const type = typeof errors?.[0]?.type === 'string' ? errors[0].type : '';
	if (type === 'NOT_FOUND' || type === 'FORBIDDEN') {
		return tokenUsed
			? { ok: false, error: { kind: 'not-found', message: 'GitHub found no such discussion, or the token may not read it.' } }
			: { ok: false, error: { kind: 'token-needed', message: 'GitHub needs a token for this request. Add one in the settings of Discussion Brief Cards.' } };
	}
	if (type === 'RATE_LIMITED') return { ok: false, error: { kind: 'rate-limit', message: 'GitHub rate limit reached. Wait, or add a token in the settings.' } };
	return { ok: false, error: { kind: 'http', message: `GitHub gave no discussion data (HTTP ${status}).` } };
}

export interface FetchEnv {
	/** Sends the POST. Returns the HTTP status and the parsed JSON (null when the body is not JSON). */
	post(url: string, body: string, token: string | null): Promise<{ status: number; json: unknown }>;
	/** Reads one cached card, or null. */
	read(key: string): CardData | null;
	/** Writes one cached card. */
	write(card: CardData): void;
	now(): number;
}

/**
 * Fetches one discussion. Order: bad URL refused with no request, cache after a network failure,
 * then the live answer. A live success writes the cache with its fetch time.
 */
export async function fetchCard(env: FetchEnv, input: string, token: string | null): Promise<CardResult> {
	const ref = parseRef(input);
	if (!ref) return { ok: false, error: { kind: 'bad-url', message: 'This block needs one https://github.com/<owner>/<repo>/discussions/<number> URL.' } };
	const key = cacheKey(ref);
	if (!token?.trim()) {
		const hit = env.read(key);
		if (hit) return { ok: true, card: { ...hit, cached: true } };
		return { ok: false, error: { kind: 'token-needed', message: 'Add a discussion read token in the settings of Discussion Brief Cards, then select Refresh.' } };
	}
	let live: CardResult;
	try {
		const { status, json } = await env.post(GRAPHQL_URL, graphqlBody(ref), token);
		live = resultFromResponse(status, json, ref, env.now(), token != null && token.length > 0);
	} catch {
		const hit = env.read(key);
		if (hit) return { ok: true, card: { ...hit, cached: true } };
		return { ok: false, error: { kind: 'network', message: 'No answer from GitHub, and no cached card for this discussion.' } };
	}
	if (live.ok) env.write(live.card);
	return live;
}
