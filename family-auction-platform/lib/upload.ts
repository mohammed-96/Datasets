import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);

export async function saveUploadedImage(file: File): Promise<string> {
  const ext = path.extname(file.name).toLowerCase() || ".jpg";
  const safeExt = ALLOWED_EXT.has(ext) ? ext : ".jpg";
  const filename = `${crypto.randomUUID()}${safeExt}`;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return `/uploads/${filename}`;
}
