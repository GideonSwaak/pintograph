import { DebugRenderer, drawMountPointGeneric } from './DebugRenderer.js';
import { Matrix3 } from '../math/index.js';

/**
 * Wraps a CanvasRenderingContext2D so contraptions written against the new
 * DebugRenderer interface still draw correctly into a 2D canvas overlay.
 */
export class Canvas2DDebugRenderer implements DebugRenderer {
	constructor(private context: CanvasRenderingContext2D) {}

	drawLine(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		color: string,
		width: number
	): void {
		const ctx = this.context;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.lineWidth = width;
		ctx.strokeStyle = color;
		ctx.stroke();
		ctx.lineWidth = 1;
	}

	drawCircle(cx: number, cy: number, radius: number, color: string): void {
		const ctx = this.context;
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.strokeStyle = color;
		ctx.stroke();
	}

	fillCircle(cx: number, cy: number, radius: number, color: string): void {
		const ctx = this.context;
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
	}

	drawMountPoint(transformation: Matrix3): void {
		drawMountPointGeneric(this, transformation, '#000000', 1);
	}
}
