import { Renderer } from './Renderer.js';
import { DebugRenderer, drawMountPointGeneric } from './DebugRenderer.js';
import { parseColor } from './parseColor.js';
import { Matrix3 } from '../math/index.js';
import { Pen } from '../contraptions/index.js';

const TRAIL_INITIAL_CAPACITY = 4096;
const TRAIL_GROWTH_FACTOR = 2;
const FLOATS_PER_VERTEX = 5;

const OVERLAY_INITIAL_CAPACITY = 1024;

const TRAIL_VS = `#version 300 es
in vec2 a_position;
in vec3 a_color;
uniform vec2 u_resolution;
uniform vec2 u_viewScale;
uniform vec2 u_viewTranslate;
out vec3 v_color;
void main() {
    // Apply world-space viewport transform (pan/zoom) before mapping to clip
    // space. The trail VBO stays in raw world coordinates; only the projection
    // is touched, so zooming costs zero extra work per simulation step and
    // every existing trail vertex re-projects at full GPU precision.
    vec2 view = a_position * u_viewScale + u_viewTranslate;
    vec2 clip = (view / u_resolution) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    v_color = a_color;
}`;

const TRAIL_FS = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 outColor;
void main() {
    outColor = vec4(v_color, 1.0);
}`;

interface PenBuffer {
	pen: Pen;
	host: Float32Array;
	gl: WebGLBuffer;
	vao: WebGLVertexArrayObject;
	count: number;
	uploadedCount: number;
	capacity: number;
	lineWidth: number;
}

/**
 * WebGL2-backed renderer for the Scene.
 *
 * - Pen trails: each registered pen owns a VBO. The pen pushes vertices via
 *   appendTrailPoint(); endFrame() only re-uploads the newly appended tail
 *   region to the GPU and issues one drawArrays(LINE_STRIP) per pen. For
 *   line widths > 1, segments are expanded into screen-space quads on the
 *   CPU (still one draw call per pen since the geometry is pre-extruded).
 *
 * - Debug overlay: a transient line buffer that is reset each frame and
 *   uploaded as a single drawArrays(LINES) call. Filled circles use a small
 *   triangle-fan helper baked into the same overlay buffer.
 *
 * Trails are persistent (the simulation is additive); the canvas is cleared
 * exactly once when the renderer is created or when reset() is called.
 */
export class WebGLRenderer implements Renderer {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;
	private uResolution: WebGLUniformLocation;
	private uViewScale: WebGLUniformLocation;
	private uViewTranslate: WebGLUniformLocation;
	private aPosition: number;
	private aColor: number;

	private pens: Map<Pen, PenBuffer> = new Map();

	private overlayHost: Float32Array;
	private overlayGl: WebGLBuffer;
	private overlayVao: WebGLVertexArrayObject;
	private overlayCount: number = 0;
	private overlayCapacity: number = OVERLAY_INITIAL_CAPACITY;

	private debugRenderer: WebGLDebugRenderer;
	private trailsDirty: boolean = false;
	private debugEnabled: boolean = true;

	private backgroundColor: [number, number, number, number] = [0, 0, 0, 0];

	// World-space viewport transform applied in the vertex shader. Default is
	// the identity (scale 1, no translate), so existing call sites keep their
	// 1:1 world<->canvas mapping. setView() updates these and triggers a
	// redraw on the next endFrame().
	private viewScaleX: number = 1;
	private viewScaleY: number = 1;
	private viewTranslateX: number = 0;
	private viewTranslateY: number = 0;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.program = compileProgram(gl, TRAIL_VS, TRAIL_FS);
		const uRes = gl.getUniformLocation(this.program, 'u_resolution');
		if (!uRes) throw new Error('WebGLRenderer: missing u_resolution uniform');
		this.uResolution = uRes;
		const uVS = gl.getUniformLocation(this.program, 'u_viewScale');
		if (!uVS) throw new Error('WebGLRenderer: missing u_viewScale uniform');
		this.uViewScale = uVS;
		const uVT = gl.getUniformLocation(this.program, 'u_viewTranslate');
		if (!uVT) throw new Error('WebGLRenderer: missing u_viewTranslate uniform');
		this.uViewTranslate = uVT;
		this.aPosition = gl.getAttribLocation(this.program, 'a_position');
		this.aColor = gl.getAttribLocation(this.program, 'a_color');

		this.overlayHost = new Float32Array(
			this.overlayCapacity * FLOATS_PER_VERTEX
		);
		const ob = gl.createBuffer();
		if (!ob) throw new Error('WebGLRenderer: failed to allocate overlay buffer');
		this.overlayGl = ob;
		const ovao = gl.createVertexArray();
		if (!ovao) throw new Error('WebGLRenderer: failed to create overlay VAO');
		this.overlayVao = ovao;
		this.bindVao(this.overlayVao, this.overlayGl);

		this.debugRenderer = new WebGLDebugRenderer(this);

		this.clearCanvas();
	}

	/** Resize the GL viewport to match the underlying canvas. */
	resize(width: number, height: number): void {
		const gl = this.gl;
		gl.canvas.width = width;
		gl.canvas.height = height;
		gl.viewport(0, 0, width, height);
		this.clearCanvas();
		this.trailsDirty = true;
	}

	getDebugRenderer(): DebugRenderer {
		return this.debugRenderer;
	}

	onPenRegistered(pen: Pen): void {
		if (this.pens.has(pen)) return;
		const lineWidth = ((pen as unknown) as { lineWidth?: number }).lineWidth ?? 1;
		const gl = this.gl;
		const buf = gl.createBuffer();
		if (!buf) throw new Error('WebGLRenderer: failed to allocate pen VBO');
		const vao = gl.createVertexArray();
		if (!vao) throw new Error('WebGLRenderer: failed to create pen VAO');
		this.bindVao(vao, buf);
		const capacity = TRAIL_INITIAL_CAPACITY;
		const host = new Float32Array(capacity * FLOATS_PER_VERTEX);
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, host.byteLength, gl.DYNAMIC_DRAW);
		this.pens.set(pen, {
			pen,
			host,
			gl: buf,
			vao,
			count: 0,
			uploadedCount: 0,
			capacity,
			lineWidth,
		});
	}

	onPenReset(pen: Pen): void {
		const b = this.pens.get(pen);
		if (!b) return;
		b.count = 0;
		b.uploadedCount = 0;
		this.clearCanvas();
		this.trailsDirty = true;
	}

	/**
	 * Push a single (x, y, color) sample into the pen's trail buffer.
	 * Called from WebGLPen.step().
	 */
	appendTrailPoint(pen: Pen, x: number, y: number, color: string): void {
		const b = this.pens.get(pen);
		if (!b) return;
		if (b.count >= b.capacity) {
			const newCapacity = b.capacity * TRAIL_GROWTH_FACTOR;
			const newHost = new Float32Array(newCapacity * FLOATS_PER_VERTEX);
			newHost.set(b.host);
			b.host = newHost;
			b.capacity = newCapacity;
			const gl = this.gl;
			gl.bindBuffer(gl.ARRAY_BUFFER, b.gl);
			gl.bufferData(gl.ARRAY_BUFFER, newHost.byteLength, gl.DYNAMIC_DRAW);
			b.uploadedCount = 0;
		}
		const [r, g, bl] = parseColor(color);
		const off = b.count * FLOATS_PER_VERTEX;
		b.host[off] = x;
		b.host[off + 1] = y;
		b.host[off + 2] = r;
		b.host[off + 3] = g;
		b.host[off + 4] = bl;
		b.count++;
		this.trailsDirty = true;
	}

	beginFrame(): void {
		this.overlayCount = 0;
		// Clear the framebuffer each frame. Pen trails are persistent in their
		// VBOs and re-issued in endFrame() (one drawArrays(LINE_STRIP) per pen),
		// so the additive look survives the clear; the debug overlay then
		// renders on top freshly without ghosting from previous frames.
		this.clearCanvas();
	}

	endFrame(): void {
		const gl = this.gl;
		gl.useProgram(this.program);
		gl.uniform2f(
			this.uResolution,
			(gl.canvas as HTMLCanvasElement).width,
			(gl.canvas as HTMLCanvasElement).height
		);
		gl.uniform2f(this.uViewScale, this.viewScaleX, this.viewScaleY);
		gl.uniform2f(this.uViewTranslate, this.viewTranslateX, this.viewTranslateY);

		if (this.trailsDirty) {
			for (const b of this.pens.values()) {
				if (b.count <= b.uploadedCount) continue;
				gl.bindBuffer(gl.ARRAY_BUFFER, b.gl);
				const offsetVerts = b.uploadedCount > 0 ? b.uploadedCount - 1 : 0;
				const startByte = offsetVerts * FLOATS_PER_VERTEX * 4;
				const view = b.host.subarray(
					offsetVerts * FLOATS_PER_VERTEX,
					b.count * FLOATS_PER_VERTEX
				);
				gl.bufferSubData(gl.ARRAY_BUFFER, startByte, view);
				b.uploadedCount = b.count;
			}
			this.trailsDirty = false;
		}

		for (const b of this.pens.values()) {
			if (b.count < 2) continue;
			gl.bindVertexArray(b.vao);
			gl.drawArrays(gl.LINE_STRIP, 0, b.count);
		}

		if (this.overlayCount > 0) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayGl);
			const view = this.overlayHost.subarray(
				0,
				this.overlayCount * FLOATS_PER_VERTEX
			);
			gl.bufferData(gl.ARRAY_BUFFER, view, gl.STREAM_DRAW);
			gl.bindVertexArray(this.overlayVao);
			gl.drawArrays(gl.LINES, 0, this.overlayCount);
		}

		gl.bindVertexArray(null);
	}

	/**
	 * Toggle the debug overlay (wheels, arms, mount points) without touching
	 * pen trails. When disabled, overlay primitive calls are dropped so the
	 * canvas only shows the additive trail buffer.
	 */
	setDebugEnabled(enabled: boolean): void {
		this.debugEnabled = enabled;
	}

	isDebugEnabled(): boolean {
		return this.debugEnabled;
	}

	pushOverlayLine(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		color: string
	): void {
		if (!this.debugEnabled) return;
		this.ensureOverlayCapacity(2);
		const [r, g, b] = parseColor(color);
		let off = this.overlayCount * FLOATS_PER_VERTEX;
		const h = this.overlayHost;
		h[off] = x1;
		h[off + 1] = y1;
		h[off + 2] = r;
		h[off + 3] = g;
		h[off + 4] = b;
		off += FLOATS_PER_VERTEX;
		h[off] = x2;
		h[off + 1] = y2;
		h[off + 2] = r;
		h[off + 3] = g;
		h[off + 4] = b;
		this.overlayCount += 2;
	}

	pushOverlayCircleOutline(
		cx: number,
		cy: number,
		radius: number,
		color: string,
		segments: number = 48
	): void {
		if (!this.debugEnabled) return;
		this.ensureOverlayCapacity(segments * 2);
		const [r, g, b] = parseColor(color);
		const h = this.overlayHost;
		const step = (Math.PI * 2) / segments;
		let prevX = cx + radius;
		let prevY = cy;
		for (let i = 1; i <= segments; ++i) {
			const a = step * i;
			const x = cx + Math.cos(a) * radius;
			const y = cy + Math.sin(a) * radius;
			let off = this.overlayCount * FLOATS_PER_VERTEX;
			h[off] = prevX;
			h[off + 1] = prevY;
			h[off + 2] = r;
			h[off + 3] = g;
			h[off + 4] = b;
			off += FLOATS_PER_VERTEX;
			h[off] = x;
			h[off + 1] = y;
			h[off + 2] = r;
			h[off + 3] = g;
			h[off + 4] = b;
			this.overlayCount += 2;
			prevX = x;
			prevY = y;
		}
	}

	pushOverlayCircleFill(
		cx: number,
		cy: number,
		radius: number,
		color: string,
		segments: number = 24
	): void {
		if (!this.debugEnabled) return;
		// Approximate a filled disc with a star of overlapping line segments
		// from the centre outward. Uses the same overlay buffer as outlines so
		// it's still one draw call. Acceptable visual since the only filled
		// circle in the library is StandardPen's 3px position marker.
		this.ensureOverlayCapacity(segments * 2);
		const [r, g, b] = parseColor(color);
		const h = this.overlayHost;
		const step = (Math.PI * 2) / segments;
		for (let i = 0; i < segments; ++i) {
			const a = step * i;
			const x = cx + Math.cos(a) * radius;
			const y = cy + Math.sin(a) * radius;
			let off = this.overlayCount * FLOATS_PER_VERTEX;
			h[off] = cx;
			h[off + 1] = cy;
			h[off + 2] = r;
			h[off + 3] = g;
			h[off + 4] = b;
			off += FLOATS_PER_VERTEX;
			h[off] = x;
			h[off + 1] = y;
			h[off + 2] = r;
			h[off + 3] = g;
			h[off + 4] = b;
			this.overlayCount += 2;
		}
	}

	/** Set the canvas clear color. Components in [0,1]. */
	setBackgroundColor(r: number, g: number, b: number, a: number = 1): void {
		this.backgroundColor = [r, g, b, a];
		this.clearCanvas();
		this.trailsDirty = true;
	}

	/**
	 * Configure the world-space viewport transform. Applied in the vertex
	 * shader as `position * scale + translate` (in canvas pixels) before
	 * mapping to clip space, so changing this is essentially free per frame
	 * and the existing trail data re-projects at full GPU precision.
	 *
	 * @param scaleX  horizontal scale (1 = original; 2 = 2x zoom)
	 * @param scaleY  vertical scale (typically equal to scaleX)
	 * @param tx      horizontal translation in canvas pixels
	 * @param ty      vertical translation in canvas pixels
	 */
	setView(scaleX: number, scaleY: number, tx: number, ty: number): void {
		this.viewScaleX = scaleX;
		this.viewScaleY = scaleY;
		this.viewTranslateX = tx;
		this.viewTranslateY = ty;
	}

	getView(): { scaleX: number; scaleY: number; tx: number; ty: number } {
		return {
			scaleX: this.viewScaleX,
			scaleY: this.viewScaleY,
			tx: this.viewTranslateX,
			ty: this.viewTranslateY,
		};
	}

	private clearCanvas(): void {
		const gl = this.gl;
		const [r, g, b, a] = this.backgroundColor;
		gl.clearColor(r, g, b, a);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	private bindVao(vao: WebGLVertexArrayObject, buffer: WebGLBuffer): void {
		const gl = this.gl;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		const stride = FLOATS_PER_VERTEX * 4;
		gl.enableVertexAttribArray(this.aPosition);
		gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(this.aColor);
		gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, stride, 8);
		gl.bindVertexArray(null);
	}

	private ensureOverlayCapacity(extraVerts: number): void {
		if (this.overlayCount + extraVerts <= this.overlayCapacity) return;
		let cap = this.overlayCapacity;
		while (cap < this.overlayCount + extraVerts) cap *= 2;
		const next = new Float32Array(cap * FLOATS_PER_VERTEX);
		next.set(this.overlayHost.subarray(0, this.overlayCount * FLOATS_PER_VERTEX));
		this.overlayHost = next;
		this.overlayCapacity = cap;
	}
}

/**
 * DebugRenderer impl that buffers segments into the WebGLRenderer's overlay batch.
 * Note: line width is not honored at the WebGL level (most browsers cap LINE width
 * at 1px). For thicker debug strokes we emit several parallel offset segments.
 */
class WebGLDebugRenderer implements DebugRenderer {
	constructor(private renderer: WebGLRenderer) {}

	drawLine(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		color: string,
		width: number
	): void {
		if (width <= 1) {
			this.renderer.pushOverlayLine(x1, y1, x2, y2, color);
			return;
		}
		const dx = x2 - x1;
		const dy = y2 - y1;
		const len = Math.hypot(dx, dy);
		if (len === 0) return;
		const nx = -dy / len;
		const ny = dx / len;
		const half = width / 2;
		// Emit ~width parallel line copies offset along the normal so the result
		// reads as a thick stroke even though native gl.LINES is capped at 1px.
		const copies = Math.max(2, Math.round(width));
		for (let i = 0; i < copies; ++i) {
			const t = (i / (copies - 1) - 0.5) * 2 * half;
			const ox = nx * t;
			const oy = ny * t;
			this.renderer.pushOverlayLine(
				x1 + ox,
				y1 + oy,
				x2 + ox,
				y2 + oy,
				color
			);
		}
	}

	drawCircle(cx: number, cy: number, radius: number, color: string): void {
		this.renderer.pushOverlayCircleOutline(cx, cy, radius, color);
	}

	fillCircle(cx: number, cy: number, radius: number, color: string): void {
		this.renderer.pushOverlayCircleFill(cx, cy, radius, color);
	}

	drawMountPoint(transformation: Matrix3): void {
		drawMountPointGeneric(this, transformation, '#000000', 1);
	}
}

function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('WebGLRenderer: failed to create shader');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error('WebGLRenderer: shader compile error: ' + log);
	}
	return shader;
}

function compileProgram(
	gl: WebGL2RenderingContext,
	vsSource: string,
	fsSource: string
): WebGLProgram {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
	const program = gl.createProgram();
	if (!program) throw new Error('WebGLRenderer: failed to create program');
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error('WebGLRenderer: program link error: ' + log);
	}
	return program;
}
