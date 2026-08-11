/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import type { Dimensions, RenderImage, ScreenshotSettings } from "../types";

// Verbatim port of drawScreenshotToContext (app.js:7185-7269).
export function drawScreenshotToContext(
  context: CanvasRenderingContext2D,
  dims: Dimensions,
  img: RenderImage | null,
  settings: ScreenshotSettings,
): void {
  if (!img) return;

  const scale = settings.scale / 100;
  let imgWidth = dims.width * scale;
  let imgHeight = (img.height / img.width) * imgWidth;

  if (imgHeight > dims.height * scale) {
    imgHeight = dims.height * scale;
    imgWidth = (img.width / img.height) * imgHeight;
  }

  // Ensure minimum movement range so position works even at 100% scale
  const moveX = Math.max(dims.width - imgWidth, dims.width * 0.15);
  const moveY = Math.max(dims.height - imgHeight, dims.height * 0.15);
  const x = (dims.width - imgWidth) / 2 + (settings.x / 100 - 0.5) * moveX;
  const y = (dims.height - imgHeight) / 2 + (settings.y / 100 - 0.5) * moveY;
  const centerX = x + imgWidth / 2;
  const centerY = y + imgHeight / 2;

  context.save();

  // Apply transformations
  context.translate(centerX, centerY);

  // Apply rotation
  if (settings.rotation !== 0) {
    context.rotate((settings.rotation * Math.PI) / 180);
  }

  // Apply perspective (simulated with scale transform)
  if (settings.perspective !== 0) {
    context.transform(1, settings.perspective * 0.01, 0, 1, 0, 0);
  }

  context.translate(-centerX, -centerY);

  // Scale corner radius with image size
  const radius = (settings.cornerRadius || 0) * (imgWidth / 400);

  // Draw shadow first (needs a filled shape, not clipped)
  if (settings.shadow && settings.shadow.enabled) {
    const shadowOpacity = settings.shadow.opacity / 100;
    const shadowColor = settings.shadow.color + Math.round(shadowOpacity * 255).toString(16).padStart(2, "0");
    context.shadowColor = shadowColor;
    context.shadowBlur = settings.shadow.blur;
    context.shadowOffsetX = settings.shadow.x;
    context.shadowOffsetY = settings.shadow.y;

    // Draw filled rounded rect for shadow
    context.fillStyle = "#000";
    context.beginPath();
    context.roundRect(x, y, imgWidth, imgHeight, radius);
    context.fill();

    // Reset shadow before drawing image
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
  }

  // Clip and draw image
  context.beginPath();
  context.roundRect(x, y, imgWidth, imgHeight, radius);
  context.clip();
  context.drawImage(img, x, y, imgWidth, imgHeight);

  context.restore();

  // Draw device frame if enabled
  if (settings.frame && settings.frame.enabled) {
    context.save();
    context.translate(centerX, centerY);
    if (settings.rotation !== 0) {
      context.rotate((settings.rotation * Math.PI) / 180);
    }
    if (settings.perspective !== 0) {
      context.transform(1, settings.perspective * 0.01, 0, 1, 0, 0);
    }
    context.translate(-centerX, -centerY);
    drawDeviceFrameToContext(context, x, y, imgWidth, imgHeight, settings);
    context.restore();
  }
}

// Verbatim port of drawDeviceFrameToContext (app.js:7271-7284).
export function drawDeviceFrameToContext(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  settings: ScreenshotSettings,
): void {
  const frameColor = settings.frame.color;
  const frameWidth = settings.frame.width * (width / 400);
  const frameOpacity = settings.frame.opacity / 100;
  const radius = (settings.cornerRadius || 0) * (width / 400) + frameWidth;

  context.globalAlpha = frameOpacity;
  context.strokeStyle = frameColor;
  context.lineWidth = frameWidth;
  context.beginPath();
  context.roundRect(x - frameWidth / 2, y - frameWidth / 2, width + frameWidth, height + frameWidth, radius);
  context.stroke();
  context.globalAlpha = 1;
}
