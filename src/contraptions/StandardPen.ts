import { MountPoint, SceneObject, Pen } from './index.js';
import { transform, Vector2 } from '../math/index.js';
import { drawMountPoint } from './rendering/drawMountPoint.js';

interface DrawBufferItem extends Vector2 {
	color: string;
}

const EMPTY_ARRAY: MountPoint[] = [];

export class StandardPen implements SceneObject, Pen {
	public color: (elapsedTime: number) => string;

	public getParentMountPoints = () =>
		this.mountedAt ? [this.mountedAt] : EMPTY_ARRAY;

	public reset() {
		this.drawBuffer = [];
	}

	private worldPosition: Vector2 = { x: 0, y: 0 };
	private drawBuffer: DrawBufferItem[] = [];
	private debugEnabled = true;

	constructor(
		private mountedAt: MountPoint,
		private renderingContext: CanvasRenderingContext2D,
		color: string | ((elapsedTime: number) => string)
	) {
		if (typeof color === 'string') {
			this.color = () => color;
		} else {
			this.color = color;
		}
	}

	step(elapsedTime: number) {
		transform(
			this.worldPosition,
			{ x: 0, y: 0 },
			this.mountedAt.transformation
		);
		this.drawBuffer.push({
			...this.worldPosition,
			color: this.color(elapsedTime),
		});
	}

	drawDebug(context: CanvasRenderingContext2D) {
		if (!this.debugEnabled) return;
		// Draw mount point crosshair and small circle for current pen position
		// Mount point marker
		drawMountPoint(context, this.mountedAt.transformation);

		// Draw current pen world position as a small circle
		const pos: Vector2 = { x: 0, y: 0 };
		transform(pos, pos, this.mountedAt.transformation);
		context.beginPath();
		context.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
		context.fillStyle = '#ff0000';
		context.fill();
	}

	draw() {
		const context = this.renderingContext;
		if (this.drawBuffer.length > 1) {
			context.beginPath();
			context.moveTo(this.drawBuffer[0].x, this.drawBuffer[0].y);

			let lineDistance = 0;

			for (let i = 1; i < this.drawBuffer.length; ++i) {
				this.renderingContext.lineTo(
					this.drawBuffer[i].x,
					this.drawBuffer[i].y
				);

				lineDistance += Math.sqrt(
					Math.pow(this.drawBuffer[i].x - this.drawBuffer[i - 1].x, 2) +
						Math.pow(this.drawBuffer[i].y - this.drawBuffer[i - 1].y, 2)
				);

				if (lineDistance >= 3) {
					context.strokeStyle = this.drawBuffer[i].color;
					context.stroke();
					context.beginPath();
					context.moveTo(this.drawBuffer[i].x, this.drawBuffer[i].y);
					lineDistance = 0;
				}
			}

			if (lineDistance > 0) {
				context.strokeStyle = this.drawBuffer[this.drawBuffer.length - 1].color;
				context.stroke();
			}

			this.drawBuffer = [this.drawBuffer[this.drawBuffer.length - 1]];
		}

		// Rendering of debug overlay handled by Scene
	}

	setDebugEnabled(enabled: boolean) { this.debugEnabled = enabled; }
	isDebugEnabled() { return this.debugEnabled; }
}
