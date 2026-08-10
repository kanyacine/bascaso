/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
// WebGL mockup renderer – port of three-renderer.js on modern three (r128 globals → npm module:
// outputEncoding → outputColorSpace, new Texture(canvas) → CanvasTexture, GLTFLoader from
// examples/jsm). One offscreen WebGL canvas, one loaded pivot per device (hidden unless
// rendered), transparent composites sized to the export dims per call – appscreen behavior
// (three-renderer.js:782-810).
// Excluded from coverage (vitest.config.ts) – the pure math lives in three-scene.ts.
import {
  MOCKUP_BASE_SIZE, MOCKUP_CAMERA, MODEL_FIT_SIZE, deviceModel, frameColorPreset,
  pivotTransform, screenCornerRadius, screenPlaneSize,
} from "./three-scene";
import type { Dimensions, RenderImage, ScreenshotSettings } from "./types";
import type { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, WebGLRenderer } from "three";

type ThreeModule = typeof import("three");

interface LoadedModel {
  pivot: Group;
  screenPlane: Mesh;
}

export class MockupRenderer {
  private constructor(
    private readonly three: ThreeModule,
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {}

  private readonly models = new Map<string, LoadedModel>();
  private readonly loading = new Map<string, Promise<void>>();

  static async create(): Promise<MockupRenderer> {
    const three = await import("three");
    const scene = new three.Scene();
    scene.background = null;
    const camera = new three.PerspectiveCamera(
      MOCKUP_CAMERA.fov, MOCKUP_BASE_SIZE.width / MOCKUP_BASE_SIZE.height,
      MOCKUP_CAMERA.near, MOCKUP_CAMERA.far,
    );
    camera.position.set(0, 0, MOCKUP_CAMERA.z);
    const renderer = new three.WebGLRenderer({
      antialias: false, // interactive perf – export quality comes from resolution (appscreen note)
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(MOCKUP_BASE_SIZE.width, MOCKUP_BASE_SIZE.height);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = three.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    // Lighting – three-renderer.js:172-186 verbatim
    scene.add(new three.AmbientLight(0xffffff, 0.5));
    const keyLight = new three.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);
    const fillLight = new three.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);
    const rimLight = new three.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, -2, -3);
    scene.add(rimLight);
    return new MockupRenderer(three, renderer, scene, camera);
  }

  isReady(device: string): boolean {
    return this.models.has(deviceModel(device).key);
  }

  loadModel(device: string): Promise<void> {
    const config = deviceModel(device);
    if (this.models.has(config.key)) return Promise.resolve();
    const inFlight = this.loading.get(config.key);
    if (inFlight) return inFlight;
    const promise = (async () => {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync(config.modelPath);
      const model = gltf.scene;
      // Center + normalize scale (three-renderer.js:227-240)
      const box = new this.three.Box3().setFromObject(model);
      const center = box.getCenter(new this.three.Vector3());
      const size = box.getSize(new this.three.Vector3());
      model.position.sub(center);
      const baseScale = MODEL_FIT_SIZE / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(baseScale);
      // Pivot at the screen center (three-renderer.js:293-307)
      model.position.set(
        -config.screenOffset.x * baseScale,
        -config.screenOffset.y * baseScale,
        -config.screenOffset.z * baseScale,
      );
      const pivot = new this.three.Group();
      pivot.add(model);
      pivot.visible = false;
      // Screen plane, child of the model so it inherits the scale (three-renderer.js:564-609)
      const plane = screenPlaneSize(config);
      const screenPlane = new this.three.Mesh(
        new this.three.PlaneGeometry(plane.width, plane.height),
        new this.three.MeshBasicMaterial({ color: 0x111111, side: this.three.DoubleSide }),
      );
      screenPlane.position.set(config.screenOffset.x, config.screenOffset.y, config.screenOffset.z);
      screenPlane.rotation.set(
        (-config.modelRotation.x * Math.PI) / 180,
        (-config.modelRotation.y * Math.PI) / 180,
        (-config.modelRotation.z * Math.PI) / 180,
      );
      model.add(screenPlane);
      this.scene.add(pivot);
      this.models.set(config.key, { pivot, screenPlane });
      this.loading.delete(config.key);
    })();
    this.loading.set(config.key, promise);
    return promise;
  }

  private setFrameColor(device: string, presetId: string | undefined): void {
    const loaded = this.models.get(deviceModel(device).key);
    if (!loaded) return;
    const preset = frameColorPreset(deviceModel(device).key, presetId);
    loaded.pivot.traverse((child) => {
      if (!(child as Mesh).isMesh) return;
      const material = (child as Mesh).material as MeshBasicMaterial | MeshBasicMaterial[];
      for (const m of Array.isArray(material) ? material : [material]) {
        const hex = preset.materials[(m.name || "").toLowerCase()];
        if (hex) m.color.set(hex);
      }
    });
  }

  private screenTexture(image: RenderImage, device: string) {
    // Rounded-corner texture (createRoundedScreenImage, three-renderer.js:612-640)
    const config = deviceModel(device);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    const radius = screenCornerRadius(image.width, config);
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
    ctx.clip();
    ctx.drawImage(image as CanvasImageSource, 0, 0);
    const texture = new this.three.CanvasTexture(canvas);
    texture.colorSpace = this.three.SRGBColorSpace;
    return texture;
  }

  /** Synchronous once loadModel resolved. Returns a transparent canvas at `dims`. */
  render(settings: ScreenshotSettings, image: RenderImage, dims: Dimensions): HTMLCanvasElement {
    const config = deviceModel(settings.device3D);
    const loaded = this.models.get(config.key);
    if (!loaded) throw new Error(`model not loaded: ${config.key}`);
    this.setFrameColor(config.key, settings.frameColor);
    const texture = this.screenTexture(image, config.key);
    const material = new this.three.MeshBasicMaterial({
      map: texture, side: this.three.FrontSide, transparent: true,
    });
    const previousMaterial = loaded.screenPlane.material as MeshBasicMaterial;
    loaded.screenPlane.material = material;
    const transform = pivotTransform(settings);
    loaded.pivot.position.set(transform.position.x, transform.position.y, transform.position.z);
    loaded.pivot.rotation.set(transform.rotationRad.x, transform.rotationRad.y, transform.rotationRad.z);
    loaded.pivot.scale.setScalar(transform.scale);
    loaded.pivot.visible = true;
    // ponytail: resize + render at full export dims per call like appscreen; a persistent
    // render target per dims is the upgrade path if interactive 3D drag ever feels slow.
    this.renderer.setSize(dims.width, dims.height, false);
    this.camera.aspect = dims.width / dims.height;
    this.camera.updateProjectionMatrix();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement("canvas");
    out.width = dims.width;
    out.height = dims.height;
    out.getContext("2d")!.drawImage(this.renderer.domElement, 0, 0, dims.width, dims.height);
    // Restore the base state so the next caller starts clean
    loaded.pivot.visible = false;
    loaded.screenPlane.material = previousMaterial;
    material.dispose();
    texture.dispose();
    this.renderer.setSize(MOCKUP_BASE_SIZE.width, MOCKUP_BASE_SIZE.height, false);
    this.camera.aspect = MOCKUP_BASE_SIZE.width / MOCKUP_BASE_SIZE.height;
    this.camera.updateProjectionMatrix();
    return out;
  }

  dispose(): void {
    this.renderer.dispose();
    this.models.clear();
  }
}

let singleton: Promise<MockupRenderer> | null = null;

export function getMockupRenderer(): Promise<MockupRenderer> {
  singleton ??= MockupRenderer.create();
  return singleton;
}
