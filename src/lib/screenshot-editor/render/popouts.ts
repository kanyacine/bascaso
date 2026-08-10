/* Portions derived from appscreen (https://github.com/YUZU-Hub/appscreen), MIT License, Copyright YuzuHub */
import type { Dimensions, Popout, RenderImage, ScreenshotSettings } from "../types";

// Verbatim port of drawPopoutsToContext (app.js:7511-7583). screenshotSettings is unused in the
// body — kept for signature parity with the appscreen call site.
export function drawPopoutsToContext(
  context: CanvasRenderingContext2D,
  dims: Dimensions,
  popouts: Popout[],
  img: RenderImage | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for signature parity
  screenshotSettings: ScreenshotSettings,
): void {
  if (!img || !popouts || popouts.length === 0) return;

  popouts.forEach((p) => {
    context.save();
    context.globalAlpha = p.opacity / 100;

    // Crop from source image (percentages -> pixels)
    const sx = (p.cropX / 100) * img.width;
    const sy = (p.cropY / 100) * img.height;
    const sw = (p.cropWidth / 100) * img.width;
    const sh = (p.cropHeight / 100) * img.height;

    // Display position and size (percentages -> canvas pixels)
    const displayW = dims.width * (p.width / 100);
    const cropAspect = sh / sw;
    const displayH = displayW * cropAspect;
    const cx = dims.width * (p.x / 100);
    const cy = dims.height * (p.y / 100);

    context.translate(cx, cy);

    // Apply popout's own rotation only (no 3D transform inheritance)
    if (p.rotation !== 0) {
      context.rotate((p.rotation * Math.PI) / 180);
    }

    const halfW = displayW / 2;
    const halfH = displayH / 2;
    const radius = p.cornerRadius * (displayW / 300);

    // Draw shadow
    if (p.shadow && p.shadow.enabled) {
      const shadowOpacity = p.shadow.opacity / 100;
      const hex = p.shadow.color || "#000000";
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      context.shadowColor = `rgba(${r},${g},${b},${shadowOpacity})`;
      context.shadowBlur = p.shadow.blur;
      context.shadowOffsetX = p.shadow.x;
      context.shadowOffsetY = p.shadow.y;

      context.fillStyle = "#000";
      context.beginPath();
      context.roundRect(-halfW, -halfH, displayW, displayH, radius);
      context.fill();

      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
    }

    // Draw border behind the image
    if (p.border && p.border.enabled) {
      const bw = p.border.width;
      context.save();
      context.globalAlpha = (p.opacity / 100) * (p.border.opacity / 100);
      context.fillStyle = p.border.color;
      context.beginPath();
      context.roundRect(-halfW - bw, -halfH - bw, displayW + bw * 2, displayH + bw * 2, radius + bw);
      context.fill();
      context.restore();
    }

    // Clip and draw cropped image
    context.beginPath();
    context.roundRect(-halfW, -halfH, displayW, displayH, radius);
    context.clip();
    context.drawImage(img, sx, sy, sw, sh, -halfW, -halfH, displayW, displayH);

    context.restore();
  });
}
