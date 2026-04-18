import { MountPoint } from './MountPoint.js';
import { DebugRenderer } from '../rendering/DebugRenderer.js';

export interface SceneObject {
	step: (elapsedTime: number, deltaTime: number) => void;
	/**
	 * Called once per frame to render the debug overlay for this object.
	 * The Scene injects a DebugRenderer (Canvas2D or WebGL backed) so
	 * implementations don't need to know which backend is in use.
	 */
	drawDebug: (context: DebugRenderer) => void;
	getParentMountPoints: () => MountPoint[];

	// Debug control helpers
	setDebugEnabled?: (enabled: boolean) => void;
	isDebugEnabled?: () => boolean;
}
