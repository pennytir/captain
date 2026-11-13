import { browser, expect } from '@wdio/globals';
import { pluginId, reloadPlugin } from './load';

describe(`${pluginId} rendered features`, function () {
	it('loads and reloads without errors', async function () {
		expect(await reloadPlugin(pluginId)).toEqual({ enabled: true, reloaded: true, errors: [] });
	});

	it('renders a real Markdown block and refreshes it into a cached card', async function () {
		const result = await browser.executeObsidian(async ({ app, obsidian }, id) => {
			const plugin = (app as unknown as { plugins: { plugins: Record<string, {
				cache: Record<string, unknown>; opts: { http?: (...args: unknown[]) => Promise<unknown> }; setToken(token: string): void; saveSettings(): Promise<void>;
			}> } }).plugins.plugins[id]!;
			plugin.cache = {};
			plugin.setToken('fixture-read-token');
			let calls = 0;
			plugin.opts.http = async () => {
				calls++;
				return { status: 200, json: { data: { repository: { discussion: {
					title: 'Runtime question', bodyText: '<script>x</script><img src=x>', author: { login: 'writer' }, category: { name: 'Q&A' },
					isAnswered: null, answer: { bodyText: 'Use the documented runtime.' }, comments: { totalCount: 12 },
				} } } } };
			};
			const container = document.createElement('div');
			const component = new obsidian.Component();
			component.load();
			try {
				await obsidian.MarkdownRenderer.render(app, '```discussion\nhttps://github.com/acme/tools/discussions/42\n```', container, 'Welcome.md', component);
				const first = container.textContent;
				const inert = !container.querySelector('script, img');
				plugin.opts.http = async () => { throw new Error('offline fixture'); };
				container.querySelector<HTMLButtonElement>('.dbc-refresh')!.click();
				// Observe the asynchronous operation by DOM state, with no fixed sleep.
				await new Promise<void>((resolve, reject) => {
					const observer = new MutationObserver(() => {
						if (container.textContent?.includes('Cached')) { observer.disconnect(); clearTimeout(deadline); resolve(); }
					});
					const deadline = setTimeout(() => { observer.disconnect(); reject(new Error('Cached card did not render')); }, 10000);
					observer.observe(container, { childList: true, subtree: true });
				});
				await plugin.saveSettings();
				return { first, inert, calls, cached: container.textContent?.includes('Cached') };
			} finally { component.unload(); plugin.setToken(''); }
		}, pluginId);
		expect(result.first).toContain('Runtime question');
		expect(result.first).toContain('Use the documented runtime.');
		expect(result.first).toContain('Answered');
		expect(result.first).toContain('12 comments');
		expect(result.inert).toBe(true);
		expect(result.calls).toBe(1);
		expect(result.cached).toBe(true);
	});

	it('rejects another host and requires a read token without making a request', async function () {
		const result = await browser.executeObsidian(async ({ app, obsidian }, id) => {
			const plugin = (app as unknown as { plugins: { plugins: Record<string, {
				cache: Record<string, unknown>; opts: { http?: () => Promise<unknown> }; setToken(token: string): void;
			}> } }).plugins.plugins[id]!;
			plugin.cache = {};
			plugin.setToken('');
			let calls = 0;
			plugin.opts.http = async () => { calls++; throw new Error('Must not request'); };
			const component = new obsidian.Component();
			component.load();
			try {
				const bad = document.createElement('div');
				const noToken = document.createElement('div');
				await obsidian.MarkdownRenderer.render(app, '```discussion\nhttps://example.com/a/b/discussions/1\n```', bad, 'Welcome.md', component);
				await obsidian.MarkdownRenderer.render(app, '```discussion\nhttps://github.com/a/b/discussions/1\n```', noToken, 'Welcome.md', component);
				return { bad: bad.textContent, noToken: noToken.textContent, calls };
			} finally { component.unload(); }
		}, pluginId);
		expect(result.bad).toContain('not a https://github.com');
		expect(result.noToken).toContain('read token');
		expect(result.calls).toBe(0);
	});

	it('gates lists with Sponsors and keeps refresh and filters working', async function () {
		const result = await browser.executeObsidian(async ({ app, obsidian }, id) => {
			const plugin = (app as unknown as { plugins: { plugins: Record<string, {
				cache: Record<string, unknown>; opts: { http?: (url: string, body: string) => Promise<unknown> }; setToken(token: string): void;
				pro: { signOut(): void; refreshNow(): Promise<void>; opts: { http: () => Promise<unknown> } };
			}> } }).plugins.plugins[id]!;
			plugin.pro.signOut();
			plugin.cache = {};
			plugin.setToken('fixture-read-token');
			let reads = 0;
			let batch = 1;
			plugin.opts.http = async (_url, body) => {
				reads++;
				const number = (JSON.parse(body) as { variables: { number: number } }).variables.number;
				return { status: 200, json: { data: { repository: { discussion: { title: `Batch ${batch} discussion ${number}`, isAnswered: number === 7, answer: number === 7 ? { bodyText: 'Accepted' } : null, comments: { totalCount: number } } } } } };
			};
			const markdown = '```discussion-list\nhttps://github.com/acme/tools/discussions/42\nhttps://github.com/acme/tools/discussions/7\n```';
			const component = new obsidian.Component();
			component.load();
			try {
				const locked = document.createElement('div');
				await obsidian.MarkdownRenderer.render(app, markdown, locked, 'Welcome.md', component);
				const gated = locked.textContent?.includes('needs Pro') && reads === 0;
				plugin.pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'fixture-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
				app.secretStorage.setSecret(`${id}-github-token`, 'gho_' + '0'.repeat(36));
				await plugin.pro.refreshNow();
				const container = document.createElement('div');
				await obsidian.MarkdownRenderer.render(app, markdown, container, 'Welcome.md', component);
				const rowCount = container.querySelectorAll('.dbc-list-title').length;
				const waitFor = (text: string) => new Promise<void>((resolve, reject) => {
					if (container.textContent?.includes(text)) { resolve(); return; }
					const observer = new MutationObserver(() => { if (container.textContent?.includes(text)) { observer.disconnect(); clearTimeout(deadline); resolve(); } });
					const deadline = setTimeout(() => { observer.disconnect(); reject(new Error(`Missing ${text}`)); }, 10000);
					observer.observe(container, { childList: true, subtree: true });
				});
				batch = 2;
				container.querySelector<HTMLButtonElement>('.dbc-refresh')!.click();
				await waitFor('Batch 2');
				(container.querySelectorAll<HTMLButtonElement>('.dbc-filter')[1])!.click();
				const filtered = [...container.querySelectorAll('.dbc-list-title')].map((el) => el.textContent);
				batch = 3;
				container.querySelector<HTMLButtonElement>('.dbc-refresh')!.click();
				await waitFor('Batch 3');
				const refreshedAgain = container.querySelector('.dbc-list-title')?.textContent;
				plugin.pro.signOut();
				await waitFor('needs Pro');
				const readTokenSurvivesSignOut = app.secretStorage.getSecret('discussion-brief-cards-read-token') === 'fixture-read-token';
				return { gated, rowCount, filtered, refreshedAgain, readTokenSurvivesSignOut };
			} finally { component.unload(); plugin.pro.signOut(); plugin.setToken(''); }
		}, pluginId);
		expect(result.gated).toBe(true);
		expect(result.rowCount).toBe(2);
		expect(result.filtered).toEqual(['Batch 2 discussion 7']);
		expect(result.refreshedAgain).toBe('Batch 3 discussion 7');
		expect(result.readTokenSurvivesSignOut).toBe(true);
	});
});
