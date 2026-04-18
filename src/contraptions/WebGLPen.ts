import { MountPoint } from './MountPoint.js';
import { SceneObject } from './SceneObject.js';
import { Pen } from './Pen.js';
import { transform, Vector2 } from '../math/index.js';
import { WebGLRenderer } from '../rendering/WebGLRenderer.js';
import { DebugRenderer } from '../rendering/DebugRenderer.js';

const EMPTY_ARRAY: MountPoint[] = [];

/**
 * Pen implementation that streams its trail into a WebGLRenderer instead of
 * issuing canvas-2D stroke calls. The actual GPU upload + draw happens once
 * per frame in WebGLRenderer.endFrame(); this class just appends samples on
 * each step() and resets/debugs on demand.
 *
 * NB: shadowBlur / shadowColor from drawer presets are ignored on this path
 * (no native equivalent in raw WebGL2 line rendering). Color and lineWidth
 * are honored.
 */
export class WebGLPen implements SceneObject, Pen {
	public color: (elapsedTime: number) => string;

	public getParentMountPoints = () =>
		this.mountedAt ? [this.mountedAt] : EMPTY_ARRAY;

	private worldPosition: Vector2 = { x: 0, y: 0 };
	private debugEnabled = true;

	constructor(
		private mountedAt: MountPoint,
		private renderer: WebGLRenderer,
		color: string | ((elapsedTime: number) => string),
		public lineWidth: number = 1
	) {
		if (typeof color === 'string') {
			const fixed = color;
			this.color = () => fixed;
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
		this.renderer.appendTrailPoint(
			this,
			this.worldPosition.x,
			this.worldPosition.y,
			this.color(elapsedTime)
		);
	}

	draw() {
		// no-op: WebGLRenderer flushes all pen buffers in one pass per frame
	}

	reset() {
		this.renderer.onPenReset(this);
	}

	drawDebug(r: DebugRenderer) {
		if (!this.debugEnabled) return;
		r.drawMountPoint(this.mountedAt.transformation);
		const pos: Vector2 = { x: 0, y: 0 };
		transform(pos, pos, this.mountedAt.transformation);
		r.fillCircle(pos.x, pos.y, 3, '#ff0000');
	}

	setDebugEnabled(enabled: boolean) {
		this.debugEnabled = enabled;
	}
	isDebugEnabled() {
		return this.debugEnabled;
	}
}
