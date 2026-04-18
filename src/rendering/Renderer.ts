import { DebugRenderer } from './DebugRenderer.js';
import { Pen } from '../contraptions/index.js';

/**
 * Backend-agnostic frame renderer. The Scene calls these hooks each tick.
 *
 * Lifecycle per frame:
 *   beginFrame()
 *   for each pen: pen.draw()                  (pens push their own buffered geometry)
 *   for each pen subtree: drawDebug(...)      (issued via getDebugRenderer())
 *   endFrame()
 *
 * Lifecycle per pen:
 *   onPenRegistered(pen)   when scene.registerPen() is called
 *   onPenReset(pen)        when scene.reset() is called
 */
export interface Renderer {
	beginFrame(): void;
	endFrame(): void;
	getDebugRenderer(): DebugRenderer;
	onPenRegistered?(pen: Pen): void;
	onPenReset?(pen: Pen): void;
}
