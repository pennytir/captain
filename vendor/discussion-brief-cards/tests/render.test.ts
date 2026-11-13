import { describe, expect, it } from 'vitest';
import { cardFromJson } from '../src/card';
import { renderCard } from '../src/render';
import { renderList } from '../src/list';

const ref = { owner: 'acme', repo: 'tools', number: 42 };

describe('card rendering', () => {
	it('keeps remote HTML inert in the body and answer', () => {
		const el = document.createElement('div');
		const html = '<script>alert(1)</script><img src="https://example.com/a.png">';
		renderCard(el, cardFromJson(ref, { bodyText: html, answer: { bodyText: html } }, 1), () => undefined);
		expect(el.querySelector('script, img')).toBeNull();
		expect(el.querySelector('.dbc-body')?.textContent).toBe(html);
		expect(el.querySelector('.dbc-answer-text')?.textContent).toBe(html);
	});
	it('links to the full source after a long body is cut', () => {
		const el = document.createElement('div');
		renderCard(el, cardFromJson(ref, { bodyText: 'a'.repeat(1501) }, 1), () => undefined);
		expect(el.querySelector<HTMLAnchorElement>('.dbc-full')?.href).toBe('https://github.com/acme/tools/discussions/42');
	});
	it('gives no full text link to a short body that ends with dots', () => {
		const el = document.createElement('div');
		renderCard(el, cardFromJson(ref, { bodyText: 'Let me think...' }, 1), () => undefined);
		expect(el.querySelector('.dbc-body')?.textContent).toBe('Let me think...');
		expect(el.querySelector('.dbc-full')).toBeNull();
	});
	it('keeps errors visible while filtering answered discussions', () => {
		const el = document.createElement('div');
		const items = [
			{ input: 'a', result: { ok: true as const, card: cardFromJson(ref, { title: 'Answered', answer: { bodyText: 'yes' } }, 1) } },
			{ input: 'b', result: { ok: true as const, card: cardFromJson(ref, { title: 'Open', answer: null }, 1) } },
			{ input: 'bad', result: { ok: false as const, message: 'Bad URL' } },
		];
		renderList(el, items, 'answered', () => undefined, () => undefined);
		expect(el.querySelectorAll('.dbc-list-title')).toHaveLength(1);
		expect(el.querySelector('.dbc-list-title')?.textContent).toBe('Answered');
		expect(el.querySelector('.dbc-list-error')?.textContent).toBe('Bad URL');
	});
});
