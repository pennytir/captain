import { MarkdownRenderChild, Plugin, requestUrl, type MarkdownPostProcessorContext } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { createGitHubSponsors } from './license/github-obsidian';
import { fetchCard, type CardData, type FetchEnv } from './card';
import { renderList, type ListItem, type ListFilter } from './list';
import { cacheKey, parseDiscussionUrl } from './parse';
import { PRO_LIST, SPONSORS, bindPro, isPro, onProChange, proNotice, proText, resetPro } from './pro';
import { renderCard, renderError } from './render';
import { DEFAULT_SETTINGS, DiscussionBriefCardsSettingTab, normalizeSettings, type DiscussionBriefCardsSettings } from './settings';
import { setupHello } from './hello/index';
import WHATS_NEW from './whats-new.json';

export const BLOCK_LANG = 'discussion';
export const LIST_LANG = 'discussion-list';

type CacheShape = Record<string, { card: CardData } | undefined>;

export default class DiscussionBriefCardsPlugin extends Plugin {
	settings: DiscussionBriefCardsSettings = { ...DEFAULT_SETTINGS };
	pro: SponsorsManager | null = null;
	cache: CacheShape = {};
	/** QA and tests supply a local transport. The normal transport uses requestUrl. */
	opts: { http?: FetchEnv['post'] } = {};
	private pending = new Map<string, Promise<ListItem['result']>>();
	private saveQueue: Promise<void> = Promise.resolve();

	async onload(): Promise<void> {
		// First: "What's new" reads its state before the settings load (packages/hello). It does not wait.
		setupHello(this, WHATS_NEW);
		await this.loadSettings();
		const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
		pro.init();
		this.pro = pro;
		bindPro(pro);
		const tab = new DiscussionBriefCardsSettingTab(this.app, this);
		this.register(pro.onChange(() => tab.update()));
		this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000));
		this.addSettingTab(tab);
		void pro.refresh();
		this.registerMarkdownCodeBlockProcessor(BLOCK_LANG, (source, el, ctx) => this.renderBlock(source, el, ctx));
		this.registerMarkdownCodeBlockProcessor(LIST_LANG, (source, el, ctx) => this.renderListBlock(source, el, ctx));
	}

	onunload(): void {
		resetPro();
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as (Partial<DiscussionBriefCardsSettings> & { cache?: CacheShape }) | null;
		this.settings = normalizeSettings(data);
		this.cache = data?.cache && typeof data.cache === 'object' && !Array.isArray(data.cache) ? data.cache : {};
	}

	async saveSettings(): Promise<void> {
		this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.saveData({ ...this.settings, cache: this.cache }));
		await this.saveQueue;
	}

	token(): string {
		return this.app.secretStorage.getSecret(this.settings.discussionTokenSecret)?.trim() ?? '';
	}

	setToken(value: string): void {
		this.app.secretStorage.setSecret(this.settings.discussionTokenSecret, value.trim());
	}

	private env(): FetchEnv {
		return {
			post: this.opts.http ?? (async (_url, body, token) => {
				const res = await requestUrl({
					url: 'https://api.github.com/graphql',
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.github+json', Authorization: `Bearer ${token ?? ''}` },
					body,
					throw: false,
				});
				let json: unknown = null;
				try { json = res.json as unknown; } catch { /* Non-JSON response. */ }
				return { status: res.status, json };
			}),
			read: (key) => this.settings.useCache ? this.cache[key]?.card ?? null : null,
			write: (card) => {
				if (!this.settings.useCache) return;
				this.cache[cacheKey(card)] = { card };
				void this.saveSettings().catch(() => undefined);
			},
			now: () => Date.now(),
		};
	}

	private async oneCard(input: string, force: boolean): Promise<ListItem['result']> {
		const ref = parseDiscussionUrl(input);
		if (!ref) return { ok: false, message: 'This line is not a https://github.com/<owner>/<repo>/discussions/<number> URL.' };
		const key = cacheKey(ref);
		const hit = this.settings.useCache ? this.cache[key]?.card : null;
		if (!force && hit && Date.now() - hit.fetchedAt < this.settings.refetchMinutes * 60 * 1000) {
			return { ok: true, card: { ...hit, cached: true } };
		}
		const pending = this.pending.get(key);
		if (pending) return pending;
		const task = (async (): Promise<ListItem['result']> => {
			const result = await fetchCard(this.env(), input, this.token() || null);
			if (result.ok) return result;
			if (hit) return { ok: true, card: { ...hit, cached: true } };
			return { ok: false, message: result.error.message };
		})();
		this.pending.set(key, task);
		try { return await task; } finally { this.pending.delete(key); }
	}

	async renderBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
		const input = source.trim();
		const child = new MarkdownRenderChild(el);
		let active = true;
		child.register(() => { active = false; });
		ctx.addChild(child);
		const draw = async (force: boolean): Promise<void> => {
			const result = await this.oneCard(input, force);
			if (!active) return;
			const refresh = () => void draw(true);
			if (result.ok) renderCard(el, result.card, refresh);
			else renderError(el, result.message, refresh);
		};
		await draw(false);
	}

	async renderListBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
		const child = new MarkdownRenderChild(el);
		let active = true;
		let revision = 0;
		let filter: ListFilter = 'all';
		let items: ListItem[] = [];
		const inputs = source.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
		const draw = (): void => {
			if (!active) return;
			if (!isPro()) {
				// The "Get Pro" button of the card shows the Pro notice with the Sponsor on GitHub button. No discussion is read.
				renderError(el, proText(PRO_LIST), () => proNotice(PRO_LIST), 'Get Pro');
				return;
			}
			renderList(el, items, filter, (next) => { filter = next; draw(); }, () => void load(true));
		};
		const load = async (force: boolean): Promise<void> => {
			const current = ++revision;
			if (!isPro()) { draw(); return; }
			const results = await Promise.all(inputs.map((input) => this.oneCard(input, force)));
			if (!active || current !== revision) return;
			items = inputs.map((input, i) => ({ input, result: results[i]! }));
			draw();
		};
		child.register(() => { active = false; revision++; });
		child.register(onProChange(() => { void load(false); }));
		ctx.addChild(child);
		await load(false);
	}
}
