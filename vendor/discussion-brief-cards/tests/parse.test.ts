import { describe, expect, it } from 'vitest';
import { cutText } from '../src/parse';

describe('cutText', () => {
	it('does not split an emoji at the cut point', () => {
		const cut = cutText(`${'a'.repeat(1499)}\u{1F600}b`, 1500);
		expect(cut).toBe(`${'a'.repeat(1499)}...`);
		expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
	});
	it('keeps an emoji that ends at the cut point', () => {
		expect(cutText(`${'a'.repeat(1498)}\u{1F600}b`, 1500)).toBe(`${'a'.repeat(1498)}\u{1F600}...`);
	});
});
