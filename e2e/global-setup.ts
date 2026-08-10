import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const TMP = path.join(__dirname, ".tmp");

export default function globalSetup() {
  // Fresh DB every run – the server migrates it on first request.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  // Fixture screenshot – generated, never committed.
  const canvas = createCanvas(1290, 2796);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3478f6";
  ctx.fillRect(0, 0, 1290, 2796);
  ctx.fillStyle = "#ffffff";
  ctx.font = "120px sans-serif";
  ctx.fillText("E2E", 100, 300);
  fs.writeFileSync(path.join(TMP, "shot.png"), canvas.toBuffer("image/png"));
}
