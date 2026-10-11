import {
  ACESFilmicToneMapping,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  LineBasicMaterial,
  LineLoop,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AnnotationOverlay } from './annotation-overlay';
import { Measurement, distanceMm } from './measurement';

/** How a layer is drawn. Mirrors what a reviewer needs: look at it, look through it, or not at all. */
export type LayerDisplay = 'solid' | 'ghost' | 'hidden';

export type LayerMaterial = 'bone' | 'titanium' | 'polymer' | 'marker' | 'segmentation';

export interface LayerSpec {
  id: string;
  geometry: BufferGeometry;
  color: string;
  material: LayerMaterial;
  display: LayerDisplay;
  /** True when the engine should free the geometry once the layer drops or replaces it. */
  ownsGeometry?: boolean;
}

export type ViewPreset = 'overview' | 'volar' | 'dorsal' | 'radial' | 'ulnar';

export interface SlicePlane {
  /** Grid axis the plane is perpendicular to: 0 = x, 1 = y, 2 = z. */
  axis: 0 | 1 | 2;
  positionMm: number;
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

interface Layer {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial | MeshBasicMaterial>;
  spec: LayerSpec;
}

const FILM = 0x0a1219;
const GHOST_OPACITY = 0.2;
const CLICK_TOLERANCE_PX = 4;

/**
 * The WebGL side of the viewer, with no Angular in it.
 *
 * The scene is in millimetres in the scanner frame, with z (proximal to distal) pointing up
 * on screen. Frames are drawn on demand: nothing is rendered while the picture is unchanged.
 */
export class SceneEngine {
  /** Called whenever the list of measurements changes. */
  onMeasurements: (measurements: readonly Measurement[]) => void = () => {};
  /** Called when the user places the first point of a measurement, or cancels it. */
  onPendingPoint: (pending: boolean) => void = () => {};

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(26, 1, 1, 2000);
  private readonly controls: OrbitControls;
  private readonly overlay: AnnotationOverlay;
  private readonly raycaster = new Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly layers = new Map<string, Layer>();
  private readonly listeners = new AbortController();

  private slice: { fill: Mesh; outline: LineLoop; corners: BufferAttribute } | null = null;
  private measurements: Measurement[] = [];
  private pendingPoint: Vector3 | null = null;
  private measuring = false;
  private nextMeasurementId = 1;
  private frameRequested = false;
  private animation = 0;
  private disposed = false;
  private pointerDown: { x: number; y: number } | null = null;
  /** +1 when radial is +x (right wrist), -1 when it is -x (left wrist). */
  private radialSign = 1;
  private readonly reducedMotion: boolean;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    overlaySvg: SVGSVGElement,
  ) {
    // Throws when WebGL is unavailable; the caller shows a message instead of the viewer.
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.scene.background = new Color(FILM);
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    pmrem.dispose();

    // A headlight that travels with the camera keeps surfaces readable from every side.
    this.camera.up.set(0, 0, 1);
    const key = new DirectionalLight(0xffffff, 1.7);
    key.position.set(-0.6, 0.9, 1);
    const fill = new DirectionalLight(0xbfd4ff, 0.35);
    fill.position.set(1, -0.4, 0.6);
    this.camera.add(key, fill);
    this.scene.add(this.camera, new HemisphereLight(0xffffff, 0x1b2a36, 0.35));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.rotateSpeed = 0.9;
    this.controls.addEventListener('change', () => this.invalidate());

    this.overlay = new AnnotationOverlay(overlaySvg);
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const { signal } = this.listeners;
    canvas.addEventListener(
      'pointerdown',
      (e) => (this.pointerDown = { x: e.clientX, y: e.clientY }),
      { signal },
    );
    canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e), { signal });
    canvas.addEventListener('webglcontextrestored', () => this.invalidate(), { signal });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  // ---- layers --------------------------------------------------------------------------

  /** Adds a layer, or replaces its geometry and appearance if the id is already known. */
  setLayer(spec: LayerSpec): void {
    const existing = this.layers.get(spec.id);
    if (existing) {
      if (existing.mesh.geometry !== spec.geometry) {
        if (existing.spec.ownsGeometry) existing.mesh.geometry.dispose();
        existing.mesh.geometry = spec.geometry;
      }
      existing.spec = spec;
      applyAppearance(existing.mesh, spec);
    } else {
      const mesh = new Mesh(spec.geometry, createMaterial(spec));
      applyAppearance(mesh, spec);
      this.scene.add(mesh);
      this.layers.set(spec.id, { mesh, spec });
    }
    this.invalidate();
  }

  removeLayer(id: string): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    this.scene.remove(layer.mesh);
    layer.mesh.material.dispose();
    if (layer.spec.ownsGeometry) layer.mesh.geometry.dispose();
    this.layers.delete(id);
    this.invalidate();
  }

  layerIds(): string[] {
    return [...this.layers.keys()];
  }

  // ---- camera --------------------------------------------------------------------------

  setSide(side: 'LEFT' | 'RIGHT'): void {
    this.radialSign = side === 'RIGHT' ? 1 : -1;
  }

  /** Moves the camera to a named view of everything that is currently shown. */
  setView(preset: ViewPreset, animate = true): void {
    const sphere = this.visibleBounds();
    if (!sphere) return;
    const direction = this.viewDirection(preset);
    const vertical = (this.camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = (sphere.radius / Math.sin(Math.min(vertical, horizontal))) * 1.02;
    const position = sphere.center.clone().addScaledVector(direction, distance);
    this.camera.near = Math.max(distance - sphere.radius * 3, 1);
    this.camera.far = distance + sphere.radius * 6;
    this.camera.updateProjectionMatrix();
    this.moveCamera(position, sphere.center, animate && !this.reducedMotion);
  }

  // ---- measuring -------------------------------------------------------------------------

  setMeasuring(enabled: boolean): void {
    this.measuring = enabled;
    this.canvas.style.cursor = enabled ? 'crosshair' : '';
    if (!enabled) this.setPending(null);
  }

  clearMeasurements(): void {
    this.measurements = [];
    this.setPending(null);
    this.onMeasurements(this.measurements);
    this.invalidate();
  }

  removeMeasurement(id: number): void {
    this.measurements = this.measurements.filter((m) => m.id !== id);
    this.onMeasurements(this.measurements);
    this.invalidate();
  }

  // ---- CT slice indicator ----------------------------------------------------------------

  /** Shows where the 2D slice lies inside the 3D scene, or hides the indicator with `null`. */
  setSlicePlane(plane: SlicePlane | null): void {
    if (!this.slice) {
      if (!plane) return;
      const corners = new BufferAttribute(new Float32Array(12), 3);
      const fill = new Mesh(
        new BufferGeometry().setAttribute('position', corners).setIndex([0, 1, 2, 0, 2, 3]),
        new MeshBasicMaterial({
          color: 0x9676ff,
          transparent: true,
          opacity: 0.06,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      fill.renderOrder = 3;
      const outline = new LineLoop(
        new BufferGeometry().setAttribute('position', corners),
        new LineBasicMaterial({ color: 0xb8a6ff }),
      );
      // The corners move with every slice change, so skip culling instead of re-measuring.
      fill.frustumCulled = outline.frustumCulled = false;
      this.slice = { fill, outline, corners };
      this.scene.add(fill, outline);
    }
    this.slice.fill.visible = this.slice.outline.visible = plane !== null;
    if (plane) {
      const [u, v] = ([0, 1, 2] as const).filter((axis) => axis !== plane.axis);
      const rectangle = [
        [plane.min[u], plane.min[v]],
        [plane.max[u], plane.min[v]],
        [plane.max[u], plane.max[v]],
        [plane.min[u], plane.max[v]],
      ];
      rectangle.forEach(([pu, pv], n) => {
        this.slice!.corners.setComponent(n, plane.axis, plane.positionMm);
        this.slice!.corners.setComponent(n, u, pu);
        this.slice!.corners.setComponent(n, v, pv);
      });
      this.slice.corners.needsUpdate = true;
    }
    this.invalidate();
  }

  // ---- lifecycle -------------------------------------------------------------------------

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const layer of this.layers.values()) layer.mesh.material.dispose();
    this.layers.clear();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  // ---- internals -------------------------------------------------------------------------

  private invalidate(): void {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
      this.overlay.draw(this.measurements, this.pendingPoint, (p) => this.project(p));
    });
  }

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.overlay.resize(width, height);
    this.invalidate();
  }

  private visibleBounds(): Sphere | null {
    const box = new Box3();
    for (const { mesh, spec } of this.layers.values()) {
      if (spec.display === 'hidden' || spec.material === 'marker') continue;
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox && !mesh.geometry.boundingBox.isEmpty())
        box.union(mesh.geometry.boundingBox);
    }
    return box.isEmpty() ? null : box.getBoundingSphere(new Sphere());
  }

  private viewDirection(preset: ViewPreset): Vector3 {
    const radial = this.radialSign;
    switch (preset) {
      case 'volar':
        return new Vector3(0, -1, 0);
      case 'dorsal':
        return new Vector3(0, 1, 0);
      case 'radial':
        return new Vector3(radial, 0, 0);
      case 'ulnar':
        return new Vector3(-radial, 0, 0);
      case 'overview':
        return new Vector3(radial * 0.62, -1, 0.3).normalize();
    }
  }

  private moveCamera(position: Vector3, target: Vector3, animate: boolean): void {
    cancelAnimationFrame(this.animation);
    if (!animate) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.invalidate();
      return;
    }
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / 320, 1);
      const eased = 1 - (1 - t) ** 3;
      // Interpolating on the sphere around the target keeps the model in frame all the way.
      const offsetFrom = fromPosition.clone().sub(fromTarget);
      const offsetTo = position.clone().sub(target);
      const offset = offsetFrom
        .clone()
        .normalize()
        .lerp(offsetTo.clone().normalize(), eased)
        .normalize()
        .multiplyScalar(offsetFrom.length() + (offsetTo.length() - offsetFrom.length()) * eased);
      this.controls.target.lerpVectors(fromTarget, target, eased);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
      this.invalidate();
      if (t < 1 && !this.disposed) this.animation = requestAnimationFrame(step);
    };
    this.animation = requestAnimationFrame(step);
  }

  private handlePointerUp(event: PointerEvent): void {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!this.measuring || !down || event.button !== 0) return;
    // A drag rotates the view; only a click places a point.
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) return;

    const point = this.pick(event.clientX, event.clientY);
    if (!point) return;
    if (!this.pendingPoint) {
      this.setPending(point);
      return;
    }
    const start = this.pendingPoint;
    this.measurements = [
      ...this.measurements,
      {
        id: this.nextMeasurementId++,
        start: toTuple(start),
        end: toTuple(point),
        distanceMm: distanceMm(toTuple(start), toTuple(point)),
      },
    ];
    this.setPending(null);
    this.onMeasurements(this.measurements);
  }

  private setPending(point: Vector3 | null): void {
    const changed = (this.pendingPoint === null) !== (point === null);
    this.pendingPoint = point;
    if (changed) this.onPendingPoint(point !== null);
    this.invalidate();
  }

  /** Nearest point on a solid layer under the given screen position. */
  private pick(clientX: number, clientY: number): Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.layers.values()]
      .filter(({ spec }) => spec.display === 'solid' && spec.material !== 'marker')
      .map(({ mesh }) => mesh);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ? hit.point.clone() : null;
  }

  private project(point: readonly [number, number, number]): {
    x: number;
    y: number;
    visible: boolean;
  } {
    const v = new Vector3(point[0], point[1], point[2]).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.host.clientWidth,
      y: ((1 - v.y) / 2) * this.host.clientHeight,
      visible: v.z > -1 && v.z < 1,
    };
  }
}

function toTuple(v: Vector3): [number, number, number] {
  return [v.x, v.y, v.z];
}

function createMaterial(spec: LayerSpec): MeshStandardMaterial | MeshBasicMaterial {
  if (spec.material === 'marker') {
    return new MeshBasicMaterial({ side: DoubleSide, transparent: true, depthWrite: false });
  }
  return new MeshStandardMaterial();
}

function applyAppearance(
  mesh: Mesh<BufferGeometry, MeshStandardMaterial | MeshBasicMaterial>,
  spec: LayerSpec,
): void {
  const material = mesh.material as Material & { color: Color };
  material.color.set(spec.color);
  mesh.visible = spec.display !== 'hidden';
  const ghost = spec.display === 'ghost';

  if (material instanceof MeshStandardMaterial) {
    const look = {
      bone: { roughness: 0.72, metalness: 0 },
      segmentation: { roughness: 0.8, metalness: 0 },
      polymer: { roughness: 0.42, metalness: 0 },
      titanium: { roughness: 0.34, metalness: 0.85 },
      marker: { roughness: 1, metalness: 0 },
    }[spec.material];
    material.roughness = look.roughness;
    material.metalness = look.metalness;
    material.transparent = ghost;
    material.opacity = ghost ? GHOST_OPACITY : 1;
    material.depthWrite = !ghost;
  } else {
    material.opacity = ghost ? 0.12 : 0.34;
  }
  // Draw see-through layers after the solid ones so they blend over them.
  mesh.renderOrder = spec.material === 'marker' ? 2 : ghost ? 1 : 0;
  material.needsUpdate = true;
}
