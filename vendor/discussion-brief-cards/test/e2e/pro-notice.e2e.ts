import { browser, expect } from '@wdio/globals';
import { pluginId } from './load';

// A free user sees the discussion-list card "needs Pro". Its button shows the shared Pro notice with the
// "Sponsor on GitHub" button, and no discussion is read. A Pro user gets the list.
const LEAD = 'The discussion-list block needs Pro.';
type Fixture = {
	cache: Record<string, unknown>; opts: { http?: (url: string, body: string) => Promise<unknown> }; setToken(token: string): void;
	pro: { signOut(): void; refreshNow(): Promise<void>; isPro(): boolean; opts: { http: () => Promise<unknown> } };
};

async function render(pro: boolean) {
	return browser.executeObsidian(async ({ app, obsidian }, id, enabled) => {
		const plugin = (app as unknown as { plugins: { plugins: Record<string, Fixture> } }).plugins.plugins[id]!;
		plugin.pro.signOut();
		plugin.cache = {};
		plugin.setToken('fixture-read-token');
		let reads = 0;
		plugin.opts.http = async (_url, body) => {
			reads++;
			const number = (JSON.parse(body) as { variables: { number: number } }).variables.number;
			return { status: 200, json: { data: { repository: { discussion: { title: `Discussion ${number}`, isAnswered: false, answer: null, comments: { totalCount: number } } } } } };
		};
		if (enabled) {
			// Synthetic token and HTTP answer. No network request.
			plugin.pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'fixture-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
			app.secretStorage.setSecret(`${id}-github-token`, 'gho_' + '0'.repeat(36));
			await plugin.pro.refreshNow();
		}
		activeDocument.querySelectorAll('.notice').forEach((n) => n.remove());
		const component = new obsidian.Component();
		component.load();
		try {
			const el = activeDocument.body.createDiv();
			await obsidian.MarkdownRenderer.render(app, '```discussion-list\nhttps://github.com/acme/tools/discussions/42\nhttps://github.com/acme/tools/discussions/7\n```', el, 'Welcome.md', component);
			await new Promise((r) => setTimeout(r, 300));
			const card = el.textContent ?? '';
			const readsBefore = reads;
			el.querySelector<HTMLButtonElement>('.dbc-refresh')?.click();
			await new Promise((r) => setTimeout(r, 500));
			const result = {
				pro: plugin.pro.isPro(),
				card,
				rows: el.querySelectorAll('.dbc-list-title').length,
				readsBefore,
				notices: [...activeDocument.querySelectorAll('.notice')].map((n) => ({ text: n.textContent ?? '', sponsor: n.querySelectorAll('.pf-pro-notice-sponsor').length })),
			};
			el.remove();
			return result;
		} finally { component.unload(); plugin.pro.signOut(); plugin.setToken(''); }
	}, pluginId, pro);
}

describe('discussion-list block Pro notice', function () {
	it('a free user who selects the button of the discussion-list card gets the Pro notice with a Sponsor button, and no discussion is read', async function () {
		const r = await render(false);
		expect(r.pro).toBe(false);
		expect(r.card).toContain(LEAD);
		if (!r.notices.some((n) => n.text.includes(LEAD) && n.sponsor === 1)) throw new Error(`No Pro notice after the card button: ${JSON.stringify(r.notices)}`);
		expect(r.readsBefore).toBe(0);
		expect(r.rows).toBe(0);
	});

	it('a Pro user gets the list and no Pro notice', async function () {
		const r = await render(true);
		expect(r.pro).toBe(true);
		expect(r.rows).toBe(2);
		expect(r.notices.filter((n) => n.sponsor > 0)).toEqual([]);
	});
});
