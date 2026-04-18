import { MountPoint } from './MountPoint.js';
import { SceneObject } from './SceneObject.js';
import { DebugRenderer } from '../rendering/DebugRenderer.js';
import {
	Matrix3,
	identity,
	fromRotation,
	fromTranslation,
	multiply,
	transform,
} from '../math/Matrices.js';
import { EasingFunction, easingFunctions } from './EasingFunction.js';

const EMPTY_ARRAY: MountPoint[] = [];

export class Oscillator implements SceneObject {
	public mountPoint: MountPoint = { transformation: identity(), owner: this };
	public easingFunction: EasingFunction;
	public getParentMountPoints = () =>
		this.mountedAt ? [this.mountedAt] : EMPTY_ARRAY;

	private currentPosition: number = 0;
	private localRotation: Matrix3 = identity();
	private localTranslation: Matrix3 = identity();
	private localTransformation: Matrix3 = identity();
	private debugEnabled = true;

	constructor(
		private mountedAt: MountPoint,
		public length: number,
		public angle: number,
		public speed: number,
		public strokeStyle: string = '#555555',
		easingFunction?: EasingFunction,
		public id?: string
	) {
		if (!easingFunction) {
			this.easingFunction = easingFunctions.sine;
		} else {
			this.easingFunction = easingFunction;
		}
	}

	step(elapsedTime: number) {
		this.currentPosition =
			this.easingFunction(elapsedTime * this.speed) * this.length -
			this.length * 0.5;
		fromRotation(this.localRotation, this.angle);
		fromTranslation(this.localTranslation, this.currentPosition, 0);
		multiply(
			this.localTransformation,
			this.localRotation,
			this.localTranslation
		);
		multiply(
			this.mountPoint.transformation,
			this.mountedAt.transformation,
			this.localTransformation
		);
	}

	drawDebug(r: DebugRenderer) {
		if (!this.debugEnabled) return;
		let end1 = { x: -this.length / 2 - this.currentPosition, y: 0 };
		let end2 = { x: this.length / 2 - this.currentPosition, y: 0 };

		transform(end1, end1, this.mountPoint.transformation);
		transform(end2, end2, this.mountPoint.transformation);

		r.drawLine(end1.x, end1.y, end2.x, end2.y, this.strokeStyle, 1);
		r.drawMountPoint(this.mountPoint.transformation);
	}

	setDebugEnabled(enabled: boolean) { this.debugEnabled = enabled; }
	isDebugEnabled() { return this.debugEnabled; }
}
