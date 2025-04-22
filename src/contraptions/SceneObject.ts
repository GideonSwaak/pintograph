import { MountPoint } from './MountPoint.js';

export interface SceneObject {
	step: (elapsedTime: number, deltaTime: number) => void;
	drawDebug: (context: CanvasRenderingContext2D) => void;
	getParentMountPoints: () => MountPoint[];

	// Debug control helpers
	setDebugEnabled?: (enabled: boolean) => void;
	isDebugEnabled?: () => boolean;
}
