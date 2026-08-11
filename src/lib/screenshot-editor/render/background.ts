/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import type { Background, Dimensions, RenderImage } from "../types";

// Verbatim port of drawBackgroundToContext (app.js:7104-7168). Adaptation: bg.image is an image
// ref in the doc model, so the already-resolved bitmap arrives as the bgImage parameter.
export function drawBackgroundToContext(
  context: CanvasRenderingContext2D,
  dims: Dimensions,
  bg: Background,
  bgImage?: RenderImage | null,
): void {
  if (bg.type === "gradient") {
    const angle = (bg.gradient.angle * Math.PI) / 180;
    const x1 = dims.width / 2 - Math.cos(angle) * dims.width;
    const y1 = dims.height / 2 - Math.sin(angle) * dims.height;
    const x2 = dims.width / 2 + Math.cos(angle) * dims.width;
    const y2 = dims.height / 2 + Math.sin(angle) * dims.height;

    const gradient = context.createLinearGradient(x1, y1, x2, y2);
    bg.gradient.stops.forEach((stop) => {
      gradient.addColorStop(stop.position / 100, stop.color);
    });

    context.fillStyle = gradient;
    context.fillRect(0, 0, dims.width, dims.height);
  } else if (bg.type === "solid") {
    context.fillStyle = bg.solid;
    context.fillRect(0, 0, dims.width, dims.height);
  } else if (bg.type === "image" && bgImage) {
    const img = bgImage;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    let dx = 0, dy = 0, dw = dims.width, dh = dims.height;

    if (bg.imageFit === "cover") {
      const imgRatio = img.width / img.height;
      const canvasRatio = dims.width / dims.height;

      if (imgRatio > canvasRatio) {
        sw = img.height * canvasRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / canvasRatio;
        sy = (img.height - sh) / 2;
      }
    } else if (bg.imageFit === "contain") {
      const imgRatio = img.width / img.height;
      const canvasRatio = dims.width / dims.height;

      if (imgRatio > canvasRatio) {
        dh = dims.width / imgRatio;
        dy = (dims.height - dh) / 2;
      } else {
        dw = dims.height * imgRatio;
        dx = (dims.width - dw) / 2;
      }

      context.fillStyle = "#000";
      context.fillRect(0, 0, dims.width, dims.height);
    }

    if (bg.imageBlur > 0) {
      context.filter = `blur(${bg.imageBlur}px)`;
    }

    context.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    context.filter = "none";

    if (bg.overlayOpacity > 0) {
      context.fillStyle = bg.overlayColor;
      context.globalAlpha = bg.overlayOpacity / 100;
      context.fillRect(0, 0, dims.width, dims.height);
      context.globalAlpha = 1;
    }
  }
}

// Verbatim port of drawNoiseToContext (app.js:7170-7183). Adaptation: the RNG is injectable so
// renders are reproducible in tests.
export function drawNoiseToContext(
  context: CanvasRenderingContext2D,
  dims: Dimensions,
  intensity: number,
  rng: () => number = Math.random,
): void {
  const imageData = context.getImageData(0, 0, dims.width, dims.height);
  const data = imageData.data;
  const noiseAmount = intensity / 100;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng() - 0.5) * 255 * noiseAmount;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }

  context.putImageData(imageData, 0, 0);
}
