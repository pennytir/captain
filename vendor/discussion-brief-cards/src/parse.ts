// Parsing and text cutting for Discussion Brief Cards. Pure logic, no Obsidian imports.
// Golden vectors (packages/spec/vectors/discussion-brief-cards.json) pin these functions.

export interface DiscussionRef {
	owner: string;
	repo: string;
	number: number;
}

/** Matches only a GitHub discussions URL. Everything else is an error card with no network request. */
const DISCUSSION_URL = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/discussions\/([1-9]\d*)(?:\/)?(?:[?#][^\s]*)?$/;

/**
 * Reads owner, repo and number from one https://github.com/<owner>/<repo>/discussions/<n> URL.
 * Accepts a query string, a trailing slash and a #discussioncomment anchor. Returns null for
 * other hosts, an issue or pull URL, or text that is not a URL.
 */
export function parseDiscussionUrl(input: string): DiscussionRef | null {
	const m = DISCUSSION_URL.exec(input.trim());
	if (!m || !m[1] || !m[2] || !m[3] || Number(m[3]) > 2147483647) return null;
	return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/** Cache key for one discussion, so the same number in two repos never mixes content. */
export function cacheKey(ref: DiscussionRef): string {
	return `${ref.owner}/${ref.repo}/${ref.number}`;
}

/** Cuts text at max characters with an ellipsis. Returns null for empty text. */
export function cutText(text: string | null | undefined, max: number): string | null {
	if (typeof text !== 'string') return null;
	const t = text.trim();
	if (!t) return null;
	if (t.length <= max) return t;
	// Drop a high surrogate at the cut, so an emoji is not split into a broken glyph.
	const end = /[\uD800-\uDBFF]/.test(t.charAt(max - 1)) ? max - 1 : max;
	return `${t.slice(0, end)}...`;
}

/** One safe host for the source link and the full text link. */
export function discussionUrl(ref: DiscussionRef): string {
	return `https://github.com/${ref.owner}/${ref.repo}/discussions/${ref.number}`;
}
