import { Matrix3, transform, Vector2 } from '../math/index.js';

/**
 * Backend-agnostic interface used by contraptions to draw their debug overlays.
 * Implementations:
 *  - Canvas2DDebugRenderer (wraps a CanvasRenderingContext2D)
 *  - WebGLDebugRenderer    (forwarded to a WebGLRenderer's overlay batch)
 */
export interface DebugRenderer {
	drawLine(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		color: string,
		width: number
	): void;
	drawCircle(cx: number, cy: number, radius: number, color: string): void;
	fillCircle(cx: number, cy: number, radius: number, color: string): void;
	drawMountPoint(transformation: Matrix3): void;
}

const MOUNT_POINT_DISPLAY_COORDS: Vector2[] = [
	{ x: 2, y: 6 },
	{ x: 2, y: 2 },
	{ x: 6, y: 2 },
	{ x: 6, y: -2 },
	{ x: 2, y: -2 },
	{ x: 2, y: -6 },
	{ x: -2, y: -6 },
	{ x: -2, y: -2 },
	{ x: -6, y: -2 },
	{ x: -6, y: 2 },
	{ x: -2, y: 2 },
	{ x: -2, y: 6 },
	{ x: 2, y: 6 },
];

/**
 * Default mount-point glyph rendering shared by all DebugRenderer implementations.
 * Walks the canonical glyph polyline through `transformation` and emits line segments.
 */
export function drawMountPointGeneric(
	renderer: DebugRenderer,
	transformation: Matrix3,
	color: string = '#000000',
	width: number = 1
) {
	const a: Vector2 = { x: 0, y: 0 };
	const b: Vector2 = { x: 0, y: 0 };
	for (let i = 0; i < MOUNT_POINT_DISPLAY_COORDS.length - 1; ++i) {
		transform(a, MOUNT_POINT_DISPLAY_COORDS[i], transformation);
		transform(b, MOUNT_POINT_DISPLAY_COORDS[i + 1], transformation);
		renderer.drawLine(a.x, a.y, b.x, b.y, color, width);
	}
}
