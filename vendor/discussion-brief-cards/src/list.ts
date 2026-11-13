// Renders the Pro discussion-list block: several discussion URLs as one compact list with an
// answer state filter. The caller passes one resolved card or error per URL.
import type { CardData } from './card';

export type ListFilter = 'all' | 'answered' | 'open';

export interface ListItem {
	input: string;
	result: { ok: true; card: CardData } | { ok: false; message: string };
}

/** Draws the compact list. Text only through textContent. */
export function renderList(container: HTMLElement, items: ListItem[], filter: ListFilter, onFilter: (f: ListFilter) => void, onRefresh: () => void): void {
	container.empty();
	const root = container.createDiv({ cls: 'dbc-list' });

	const bar = root.createDiv({ cls: 'dbc-list-bar' });
	for (const f of ['all', 'answered', 'open'] as ListFilter[]) {
		const btn = bar.createEl('button', { cls: f === filter ? 'dbc-filter dbc-filter-on' : 'dbc-filter', text: f === 'all' ? 'All' : f === 'answered' ? 'Answered' : 'Not answered' });
		btn.addEventListener('click', () => onFilter(f));
	}
	bar.createEl('button', { cls: 'dbc-refresh', text: 'Refresh' }).addEventListener('click', onRefresh);

	let shown = 0;
	for (const item of items) {
		if (!item.result.ok) {
			const row = root.createDiv({ cls: 'dbc-list-row dbc-list-error', text: item.result.message });
			void row;
			shown++;
			continue;
		}
		const card = item.result.card;
		if (filter === 'answered' && !card.answered) continue;
		if (filter === 'open' && card.answered) continue;
		const row = root.createDiv({ cls: 'dbc-list-row' });
		row.createEl('a', { cls: 'dbc-list-title', text: card.title, href: card.url });
		row.createSpan({ cls: 'dbc-list-state', text: card.answered ? 'Answered' : 'Not answered' });
		row.createSpan({ cls: 'dbc-list-meta', text: `${card.comments} comments` });
		shown++;
	}
	if (shown === 0) root.createDiv({ cls: 'dbc-list-row', text: 'No discussion in this filter.' });
}
