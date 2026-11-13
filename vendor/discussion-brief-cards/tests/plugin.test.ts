import { describe, expect, it } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import DiscussionBriefCardsPlugin from '../src/main';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';
import manifest from '../manifest.json';

describe('DiscussionBriefCardsPlugin', () => {
	it('loads with default settings against an in-memory vault', async () => {
		const app = App.createConfigured__({ files: { 'notes/a.md': '# Hello world' } });
		const plugin = new DiscussionBriefCardsPlugin(app as never, manifest as never);
		await plugin.loadSettings();
		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});

	it('replaces a saved cache that is an array, so new cache entries persist', async () => {
		const app = App.createConfigured__({ files: {} });
		const plugin = new DiscussionBriefCardsPlugin(app as never, manifest as never);
		await plugin.saveData({ cache: [] });
		await plugin.loadSettings();
		plugin.cache['acme/tools/42'] = { card: { title: 'kept' } as never };
		// saveData writes JSON. JSON.stringify drops named keys on an array.
		const roundTrip = JSON.parse(JSON.stringify({ cache: plugin.cache })) as { cache: Record<string, unknown> };
		expect(roundTrip.cache['acme/tools/42']).toBeDefined();
	});

	it('repairs bad saved settings', () => {
		expect(normalizeSettings({ refetchMinutes: NaN })).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
	});
});

describe('read token isolation', () => {
	it('stores only a secret reference in data.json and preserves the Sponsors token', async () => {
		const app = App.createConfigured__({ files: {} });
		const plugin = new DiscussionBriefCardsPlugin(app as never, manifest as never);
		app.secretStorage.setSecret('discussion-brief-cards-github-token', 'fixture-sponsors-token');
		plugin.setToken(' fixture-read-token ');
		await plugin.saveSettings();
		expect(plugin.token()).toBe('fixture-read-token');
		expect(app.secretStorage.getSecret('discussion-brief-cards-github-token')).toBe('fixture-sponsors-token');
		const saved = await plugin.loadData();
		expect(JSON.stringify(saved)).not.toContain('fixture-read-token');
		expect(JSON.stringify(saved)).not.toContain('fixture-sponsors-token');
		expect(saved.discussionTokenSecret).toBe('discussion-brief-cards-read-token');
	});
	it('does not accept the Sponsors secret as a card secret reference', () => {
		expect(normalizeSettings({ discussionTokenSecret: 'discussion-brief-cards-github-token' }).discussionTokenSecret).toBe('discussion-brief-cards-read-token');
	});
});
