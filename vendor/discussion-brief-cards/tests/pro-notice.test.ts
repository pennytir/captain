import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, Notice } from 'obsidian-test-mocks/obsidian';
import type { SponsorsManager } from '../src/license/index';
import DiscussionBriefCardsPlugin from '../src/main';
import { bindPro, resetPro } from '../src/pro';
import manifest from '../manifest.json';

// A free user sees the discussion-list block card "needs Pro" with a button. Before, the button did nothing. Now it
// shows the shared Pro notice with the "Sponsor on GitHub" button. No discussion is read. A Pro user gets the list.
const LEAD = 'The discussion-list block needs Pro.';
const PITCH = 'One payment turns on Pro in every NoteMods plugin. Sponsor on GitHub, then sign in from the plugin settings.';
const SOURCE = 'https://github.com/acme/tools/discussions/42\nhttps://github.com/acme/tools/discussions/7';

function fakePro(pro: boolean): SponsorsManager {
	return {
		isPro: () => pro,
		onChange: () => () => undefined,
		hasToken: () => false,
		isChecking: () => false,
		getState: () => ({ status: 'unchecked', lastAttemptAt: 0 }),
		config: { sponsorLogin: 'theluckystrike', source: 'discussion-brief-cards' },
	} as unknown as SponsorsManager;
}

async function setup(pro: boolean) {
	const app = App.createConfigured__({ files: {} });
	const plugin = new DiscussionBriefCardsPlugin(app as never, manifest as never);
	await plugin.loadSettings();
	plugin.setToken('fixture-read-token');
	let reads = 0;
	plugin.opts.http = async (_url: string, body: string) => {
		reads++;
		const number = (JSON.parse(body) as { variables: { number: number } }).variables.number;
		return { status: 200, json: { data: { repository: { discussion: { title: `Discussion ${number}`, isAnswered: false, answer: null, comments: { totalCount: number } } } } } };
	};
	bindPro(fakePro(pro));
	const shown: { text: string; buttons: number }[] = [];
	vi.spyOn(Notice.prototype as unknown as { constructor__(): void }, 'constructor__').mockImplementation(function (this: Notice) {
		shown.push({ text: this.messageEl.textContent ?? '', buttons: this.messageEl.querySelectorAll('.pf-pro-notice-sponsor').length });
	});
	const el = activeDocument.createElement('div');
	await plugin.renderListBlock(SOURCE, el, { addChild: () => undefined } as never);
	return { el, shown, reads: () => reads };
}

describe('discussion-list block for a free user', () => {
	afterEach(() => { resetPro(); vi.restoreAllMocks(); });

	it('a free user who selects the button of the discussion-list card gets the Pro notice with a Sponsor button, and no discussion is read', async () => {
		const { el, shown, reads } = await setup(false);
		expect(el.textContent).toContain(LEAD);
		const button = el.querySelector<HTMLButtonElement>('.dbc-refresh')!;
		expect(button).not.toBeNull();
		// The button label says what the button does: it shows how to get Pro. It does not refresh.
		expect(button.textContent).toBe('Get Pro');
		button.click();
		await new Promise((r) => setTimeout(r, 0));
		expect(shown).toEqual([{ text: `${LEAD} ${PITCH}Sponsor on GitHub`, buttons: 1 }]);
		expect(reads()).toBe(0);
		expect(el.textContent).toContain(LEAD);
	});

	it('a Pro user gets the list and no Pro notice', async () => {
		const { el, shown, reads } = await setup(true);
		expect(el.querySelectorAll('.dbc-list-title')).toHaveLength(2);
		expect(reads()).toBe(2);
		expect(shown.filter((n) => n.buttons > 0)).toEqual([]);
	});
});
