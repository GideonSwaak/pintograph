/**
 * Parse a CSS color string into normalized RGBA components in [0,1].
 *
 * Supports the common cases used by the library and its drawer presets:
 *  - "#rrggbb" / "#rrggbbaa" / "#rgb" / "#rgba"
 *  - "rgb(r, g, b)" / "rgba(r, g, b, a)"
 *  - Named colors (lime, pink, etc.) via a small lookup table.
 *
 * Falls back to opaque black on unknown input.
 */
const NAMED: Record<string, string> = {
	black: '#000000',
	white: '#ffffff',
	red: '#ff0000',
	green: '#008000',
	lime: '#00ff00',
	blue: '#0000ff',
	yellow: '#ffff00',
	cyan: '#00ffff',
	magenta: '#ff00ff',
	pink: '#ffc0cb',
	orange: '#ffa500',
	purple: '#800080',
	gray: '#808080',
	grey: '#808080',
	silver: '#c0c0c0',
	transparent: '#00000000',
};

const cache = new Map<string, [number, number, number, number]>();

export function parseColor(input: string): [number, number, number, number] {
	const cached = cache.get(input);
	if (cached) return cached;

	let s = input.trim().toLowerCase();
	if (NAMED[s]) s = NAMED[s];

	let r = 0,
		g = 0,
		b = 0,
		a = 1;

	if (s.startsWith('#')) {
		const hex = s.slice(1);
		if (hex.length === 3 || hex.length === 4) {
			r = parseInt(hex[0] + hex[0], 16) / 255;
			g = parseInt(hex[1] + hex[1], 16) / 255;
			b = parseInt(hex[2] + hex[2], 16) / 255;
			if (hex.length === 4) a = parseInt(hex[3] + hex[3], 16) / 255;
		} else if (hex.length === 6 || hex.length === 8) {
			r = parseInt(hex.slice(0, 2), 16) / 255;
			g = parseInt(hex.slice(2, 4), 16) / 255;
			b = parseInt(hex.slice(4, 6), 16) / 255;
			if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
		}
	} else if (s.startsWith('rgb')) {
		const m = s.match(/-?\d*\.?\d+/g);
		if (m && m.length >= 3) {
			r = Math.min(255, Math.max(0, parseFloat(m[0]))) / 255;
			g = Math.min(255, Math.max(0, parseFloat(m[1]))) / 255;
			b = Math.min(255, Math.max(0, parseFloat(m[2]))) / 255;
			if (m.length >= 4) a = Math.min(1, Math.max(0, parseFloat(m[3])));
		}
	}

	const tuple: [number, number, number, number] = [r, g, b, a];
	cache.set(input, tuple);
	return tuple;
}
