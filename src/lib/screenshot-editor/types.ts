/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */

export interface Dimensions {
  width: number;
  height: number;
}

export interface GradientStop {
  color: string; // #rrggbb
  position: number; // 0-100
}

export interface Background {
  type: "gradient" | "solid" | "image";
  gradient: { angle: number; stops: GradientStop[] };
  solid: string;
  image: string | null; // image ref (data URL or asset name); resolved to a bitmap at render time
  imageFit: "cover" | "contain";
  imageBlur: number;
  overlayColor: string;
  overlayOpacity: number; // 0-100
  noise: boolean;
  noiseIntensity: number; // 0-100
}

export interface Shadow {
  enabled: boolean;
  color: string;
  blur: number;
  opacity: number; // 0-100
  x: number;
  y: number;
}

export interface ScreenshotSettings {
  scale: number; // 0-100, fraction of canvas width
  x: number; // 0-100, position
  y: number; // 0-100, position
  rotation: number; // degrees
  perspective: number;
  cornerRadius: number; // px at 400px reference width
  use3D: boolean; // phase 5 — phase 1 always renders 2D
  device3D: string;
  rotation3D: { x: number; y: number; z: number };
  shadow: Shadow;
  frame: { enabled: boolean; color: string; width: number; opacity: number };
}

export interface LanguageLayout {
  headlineSize: number;
  subheadlineSize: number;
  position: "top" | "bottom";
  offsetY: number; // percent of canvas height
  lineHeight: number; // percent of font size
}

export interface TextSettings {
  headlineEnabled: boolean;
  headlines: Record<string, string>;
  headlineLanguages: string[];
  currentHeadlineLang: string;
  headlineFont: string;
  headlineSize: number;
  headlineWeight: string;
  headlineItalic: boolean;
  headlineUnderline: boolean;
  headlineStrikethrough: boolean;
  headlineColor: string;
  perLanguageLayout: boolean;
  languageSettings: Record<string, LanguageLayout>;
  currentLayoutLang: string;
  position: "top" | "bottom";
  offsetY: number;
  lineHeight: number;
  subheadlineEnabled: boolean;
  subheadlines: Record<string, string>;
  subheadlineLanguages: string[];
  currentSubheadlineLang: string;
  subheadlineFont: string;
  subheadlineSize: number;
  subheadlineWeight: string;
  subheadlineItalic: boolean;
  subheadlineUnderline: boolean;
  subheadlineStrikethrough: boolean;
  subheadlineColor: string;
  subheadlineOpacity: number; // 0-100
}

export type ElementLayer = "behind-screenshot" | "above-screenshot" | "above-text";

export type IconWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

export interface EditorElement {
  id: string;
  type: "text" | "emoji" | "icon" | "graphic";
  x: number; // 0-100
  y: number; // 0-100
  width: number; // 0-100, percent of canvas width
  rotation: number;
  opacity: number; // 0-100
  layer: ElementLayer;
  // emoji
  emoji?: string;
  // icon / graphic — image ref; resolved bitmap is passed separately at render time
  src?: string | null;
  name?: string;
  iconShadow?: Partial<Shadow>;
  iconColor?: string; // icon fill baked into src; kept to re-rasterize on change
  iconWeight?: IconWeight; // Phosphor weight (replaces appscreen's iconStrokeWidth)
  // text
  text?: string;
  texts?: Record<string, string>;
  font?: string;
  fontSize?: number;
  fontWeight?: string;
  fontColor?: string;
  italic?: boolean;
  frame?: string; // "none" | "badge-circle" | "badge-ribbon" | "laurel-simple[-star]" | "laurel-detailed[-star]"
  frameColor?: string;
  frameScale?: number; // percent
}

export interface Popout {
  id: string;
  x: number; // 0-100
  y: number; // 0-100
  width: number; // 0-100
  rotation: number;
  opacity: number; // 0-100
  cropX: number; // 0-100 of source image
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  cornerRadius: number; // px at 300px reference width
  shadow: Shadow;
  border: { enabled: boolean; color: string; width: number; opacity: number };
}

export interface EditorScreenshot {
  name?: string;
  src?: string | null; // legacy single-image ref (pre-localizedImages docs)
  localizedImages: Record<string, { src: string | null }>;
  background: Background;
  screenshot: ScreenshotSettings;
  text: TextSettings;
  elements: EditorElement[];
  popouts: Popout[];
}

export interface ScreenshotDefaults {
  background: Background;
  screenshot: ScreenshotSettings;
  text: TextSettings;
  elements: EditorElement[];
  popouts: Popout[];
}

export interface ScreenshotDoc {
  screenshots: EditorScreenshot[];
  selectedIndex: number;
  outputDevice: string; // EDITOR_FORMATS key or "custom"
  outputDevices?: string[]; // working formats; absent = [outputDevice]; never "custom"
  customWidth: number;
  customHeight: number;
  currentLanguage: string;
  projectLanguages: string[];
  defaults: ScreenshotDefaults;
}

// ---- render-side types (resolved bitmaps, environment) ----

/** Anything drawImage accepts that also exposes intrinsic size (browser Image, node-canvas Image, canvas). */
export type RenderImage = CanvasImageSource & { readonly width: number; readonly height: number };

/** Minimal canvas surface the engine needs — satisfied by HTMLCanvasElement and @napi-rs/canvas Canvas. */
export interface RenderCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): CanvasRenderingContext2D | null;
}

export type LaurelVariant = "laurel-simple-left" | "laurel-detailed-left";

/** Resolved bitmaps for one screenshot render. Keys of elementImages are element ids. */
export interface RenderAssets {
  screenshotImages: Record<string, RenderImage | undefined>; // by language
  legacyImage?: RenderImage | null; // resolved EditorScreenshot.src
  backgroundImage?: RenderImage | null;
  elementImages: Record<string, RenderImage | undefined>;
  laurelImages: Partial<Record<LaurelVariant, RenderImage>>;
}

export interface RenderEnv {
  language: string;
  projectLanguages: string[];
  createCanvas: (width: number, height: number) => RenderCanvas;
  rng?: () => number; // noise randomness; defaults to Math.random
}
