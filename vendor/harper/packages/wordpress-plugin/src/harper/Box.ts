import type { Lint, Suggestion } from 'harper.js';

export type Box = {
	/** Horizontal position in pixels */
	x: number;
	/** Vertical position in pixels */
	y: number;
	/** Width in pixels */
	width: number;
	/** Height in pixels */
	height: number;
};

export type LintBox = Box & {
	lint: Lint;
	applySuggestion: (sug: Suggestion) => void;
};

export type IgnorableLintBox = LintBox & {
	ignoreLint: () => Promise<void>;
};

export function isPointInBox(point: [number, number], box: Box) {
	const [x, y] = point;

	return x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height;
}
