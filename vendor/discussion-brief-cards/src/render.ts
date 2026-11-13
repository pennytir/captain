// Renders one card into a container element. All body and answer text goes through textContent,
// so script and image text in a discussion body is inert text and no element is made from it.
import { BODY_MAX, type CardData } from './card';

function when(ms: number): string {
	return new Date(ms).toLocaleString();
}

/** Draws the card. No innerHTML: every text node comes from textContent. */
export function renderCard(container: HTMLElement, card: CardData, onRefresh: () => void): void {
	container.empty();
	const root = container.createDiv({ cls: 'dbc-card' });

	const head = root.createDiv({ cls: 'dbc-head' });
	head.createEl('a', { cls: 'dbc-title', text: card.title, href: card.url });
	head.createSpan({ cls: 'dbc-meta', text: `${card.author} - ${card.category}` });

	if (card.body) root.createDiv({ cls: 'dbc-body', text: card.body });

	const state = root.createDiv({ cls: card.answered ? 'dbc-answer dbc-answered' : 'dbc-answer dbc-open' });
	state.createSpan({ cls: 'dbc-state', text: card.answered ? 'Answered' : 'Not answered' });
	if (card.answer) state.createDiv({ cls: 'dbc-answer-text', text: card.answer });

	const foot = root.createDiv({ cls: 'dbc-foot' });
	const bits = [`${card.comments} comments`];
	if (card.updatedAt) bits.push(`updated ${card.updatedAt}`);
	if (card.cached) bits.push(`Cached ${when(card.fetchedAt)}`);
	foot.createSpan({ cls: 'dbc-foot-text', text: bits.join(' - ') });
	foot.createEl('button', { cls: 'dbc-refresh', text: 'Refresh' }).addEventListener('click', onRefresh);

	// Long bodies cut at 1,500 characters carry an ellipsis; the source link holds the full text.
	// Only a cut body is longer than BODY_MAX, so a short body that ends with dots gets no link.
	if (card.body && card.body.length > BODY_MAX) {
		root.createEl('a', { cls: 'dbc-full', text: 'Read the full discussion', href: card.url });
	}
}

/** Draws one error card. The token never appears here. The label is the text of the button (default Refresh). */
export function renderError(container: HTMLElement, message: string, onRefresh: () => void, label = 'Refresh'): void {
	container.empty();
	const root = container.createDiv({ cls: 'dbc-card dbc-error' });
	root.createDiv({ cls: 'dbc-error-text', text: message });
	root.createEl('button', { cls: 'dbc-refresh', text: label }).addEventListener('click', onRefresh);
}
