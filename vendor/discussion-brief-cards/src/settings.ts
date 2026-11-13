// Settings store the cache controls and a reference to the discussion read secret.
import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { PRO_UI, isPro } from './pro';
import type DiscussionBriefCardsPlugin from './main';
import { helloSettingItems } from './hello/settings';

export interface DiscussionBriefCardsSettings {
	/** Keep showing the cached card when the network fails. */
	useCache: boolean;
	discussionTokenSecret: string;
	/** Minutes between the fetch of one card and the next fetch of the same URL. */
	refetchMinutes: number;
}

export const REFETCH_MIN = 1;
export const REFETCH_MAX = 1440;

export const DEFAULT_SETTINGS: DiscussionBriefCardsSettings = {
	useCache: true,
	discussionTokenSecret: 'discussion-brief-cards-read-token',
	refetchMinutes: 30,
};

/** Fills gaps and drops bad values from saved data, before the settings are used. */
export function normalizeSettings(saved: Partial<DiscussionBriefCardsSettings> | null | undefined): DiscussionBriefCardsSettings {
	const s = saved ?? {};
	const m = typeof s.refetchMinutes === 'number' && Number.isFinite(s.refetchMinutes) ? Math.round(s.refetchMinutes) : DEFAULT_SETTINGS.refetchMinutes;
	return {
		discussionTokenSecret: typeof s.discussionTokenSecret === 'string' && /^[a-z0-9-]+$/.test(s.discussionTokenSecret) && s.discussionTokenSecret !== 'discussion-brief-cards-github-token' ? s.discussionTokenSecret : DEFAULT_SETTINGS.discussionTokenSecret,
		useCache: typeof s.useCache === 'boolean' ? s.useCache : DEFAULT_SETTINGS.useCache,
		refetchMinutes: Math.min(REFETCH_MAX, Math.max(REFETCH_MIN, m)),
	};
}

export class DiscussionBriefCardsSettingTab extends PluginSettingTab {
	plugin: DiscussionBriefCardsPlugin;

	constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], plugin: DiscussionBriefCardsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		// The product rows, then the "More from NoteMods" card (packages/hello).
		return [...this.productSettingDefinitions(), ...helloSettingItems()];
	}

	productSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Discussion read token',
				desc: 'Select or add a GitHub token for discussion reads. This token is separate from Pro sign-in.',
				control: { type: 'secret', key: 'discussionTokenSecret', defaultValue: DEFAULT_SETTINGS.discussionTokenSecret },
			},
			...(this.plugin.pro ? sponsorsSettingItems(this.plugin.pro, PRO_UI) : []),
			{
				name: 'Use the cached card',
				desc: 'When the network fails, show the last card for the discussion with its load time.',
				control: { type: 'toggle', key: 'useCache', defaultValue: DEFAULT_SETTINGS.useCache },
			},
			{
				name: 'Minutes before a card reloads',
				desc: `A card shows the cached value until this many minutes pass, from ${REFETCH_MIN} to ${REFETCH_MAX}. The Refresh button requests a new card.`,
				control: { type: 'slider', key: 'refetchMinutes', defaultValue: DEFAULT_SETTINGS.refetchMinutes, min: REFETCH_MIN, max: REFETCH_MAX, step: 1 },
			},
			{
				name: 'Pro features',
				desc: isPro()
					? 'Pro is on: the discussion-list block with several URLs as one compact list and an answer state filter.'
					: 'Free version: one discussion card per block. Pro adds the discussion-list block, which shows several discussions as one compact list with an answer state filter.',
			},
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		await super.setControlValue(key, value);
		this.plugin.settings = normalizeSettings(this.plugin.settings);
		await this.plugin.saveSettings();
	}
}
