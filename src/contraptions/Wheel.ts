import { MountPoint } from './MountPoint.js';
import { SceneObject } from './SceneObject.js';
import { drawMountPoint } from './rendering/drawMountPoint.js';
import {
	Matrix3,
	identity,
	fromRotation,
	fromTranslation,
	multiply,
	transform,
} from '../math/Matrices.js';

const EMPTY_ARRAY: MountPoint[] = [];

export class Wheel implements SceneObject {
	private localTransformation: Matrix3;
	public readonly mountPoint: MountPoint;
	public getParentMountPoints = () =>
		this.mountedAt ? [this.mountedAt] : EMPTY_ARRAY;
	private debugEnabled = true;

	private currentAngle: number;

	private rotationMatrix: Matrix3;
	private translationMatrix: Matrix3;

	constructor(
		private mountedAt: MountPoint,
		public radius: number,
		public startAngle: number,
		public speed: number
	) {
		this.currentAngle = startAngle;
		this.rotationMatrix = identity();
		this.translationMatrix = identity();
		this.localTransformation = identity();
		this.mountPoint = { transformation: identity(), owner: this };

		this.#update();
	}

	step(elapsedTime: number) {
		this.currentAngle =
			(this.startAngle + 2 * Math.PI * this.speed * elapsedTime) %
			(2 * Math.PI);

		this.#update();
	}

	drawDebug(context: CanvasRenderingContext2D) {
		if (!this.isDebugEnabled()) return;
		let center = { x: 0, y: 0 };
		transform(center, center, this.mountedAt.transformation);

		context.beginPath();

		context.arc(center.x, center.y, this.radius, 0, Math.PI * 2);
		context.strokeStyle = '#888888';
		context.stroke();

		drawMountPoint(context, this.mountPoint.transformation);
	}

	setDebugEnabled(enabled: boolean) { this.debugEnabled = enabled; }
	isDebugEnabled() { return this.debugEnabled; }

	#update() {
		fromRotation(this.rotationMatrix, this.currentAngle);
		fromTranslation(this.translationMatrix, this.radius, 0);
		multiply(
			this.localTransformation,
			this.rotationMatrix,
			this.translationMatrix
		);
		multiply(
			this.mountPoint.transformation,
			this.mountedAt.transformation,
			this.localTransformation
		);
	}
}
