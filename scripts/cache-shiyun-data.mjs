import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicData = join(root, "public", "data");
const baseUrl = "https://shiyun.cohenjikan.com/data";
const concurrency = 8;

async function download(path) {
  const target = join(publicData, path);
  if (existsSync(target)) return { path, skipped: true };
  await mkdir(dirname(target), { recursive: true });
  const response = await fetch(`${baseUrl}/${path}`);
  if (!response.ok || !response.body) {
    throw new Error(`Failed ${path}: ${response.status}`);
  }
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(target)));
  return { path, skipped: false };
}

async function runQueue(items) {
  let index = 0;
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const item = items[index++];
      const result = await download(item);
      done += 1;
      const mark = result.skipped ? "skip" : "down";
      process.stdout.write(`[${done}/${items.length}] ${mark} ${result.path}\n`);
    }
  });
  await Promise.all(workers);
}

await mkdir(join(publicData, "poems"), { recursive: true });
await download("manifest.json");
await download("poets.index.json");

const manifest = await fetch(`${baseUrl}/manifest.json`).then((res) => res.json());
const items = manifest.buckets.flatMap((bucket) => [
  `poems/${bucket}.idx.json`,
  `poems/${bucket}.json`,
]);

await runQueue(items);
console.log("Shiyun data cache complete.");
