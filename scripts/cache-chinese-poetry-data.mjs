import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(root, "public", "data", "supplement");
const outputPoems = join(outputRoot, "poems");
const apiBase = "https://api.github.com/repos/chinese-poetry/chinese-poetry/contents";

const sourceGroups = [
  {
    dynasty: "tang",
    form: "other",
    folder: "全唐诗",
    matcher: /^poet\.tang\.\d+\.json$/,
    titleOf: (item) => item.title,
  },
  {
    dynasty: "song",
    form: "other",
    folder: "宋词",
    matcher: /^ci\.song\.\d+\.json$/,
    titleOf: (item) => item.rhythmic || item.title || "词",
  },
];

function stableHash(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeParagraphs(paragraphs) {
  return (paragraphs ?? [])
    .map((line) => String(line).trim())
    .filter(Boolean);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "shiyun-data-cache",
    },
  });
  if (!response.ok) throw new Error(`Failed ${url}: ${response.status}`);
  return response.json();
}

async function listFiles(folder) {
  return fetchJson(`${apiBase}/${encodeURIComponent(folder)}?ref=master`);
}

async function readCachedJson(url, cacheName) {
  const cacheDir = join(root, ".cache", "chinese-poetry");
  const target = join(cacheDir, cacheName);
  if (existsSync(target)) return JSON.parse(await readFile(target, "utf8"));

  await mkdir(cacheDir, { recursive: true });
  const json = await fetchJson(url);
  await writeFile(target, JSON.stringify(json), "utf8");
  return json;
}

function makePoetRecord(author, dynasty, count) {
  const id = `cp-${stableHash(`${dynasty}:${author}`)}`;
  return {
    id,
    name: author,
    dynasty,
    poemCount: count,
    clusterSize: Math.min(60, Math.max(2, Math.sqrt(count) * 2.2)),
  };
}

await mkdir(outputPoems, { recursive: true });

const poemsByPoet = new Map();
const poetDynasty = new Map();

for (const group of sourceGroups) {
  const files = (await listFiles(group.folder))
    .filter((item) => item.type === "file" && group.matcher.test(item.name))
    .sort((left, right) => left.name.localeCompare(right.name, "en", { numeric: true }));

  for (const file of files) {
    const items = await readCachedJson(file.download_url, `${group.folder}-${file.name}`);
    for (const item of items) {
      const author = String(item.author || "佚名").trim();
      const title = String(group.titleOf(item) || "无题").trim();
      const paragraphs = normalizeParagraphs(item.paragraphs);
      if (!author || !title || paragraphs.length === 0) continue;

      const poetId = `cp-${stableHash(`${group.dynasty}:${author}`)}`;
      const key = `${poetId}:${title}:${paragraphs.join("")}`;
      const poem = {
        t: title,
        f: group.form,
        p: paragraphs,
        k: stableHash(key),
      };

      const poems = poemsByPoet.get(poetId) ?? [];
      if (!poems.some((existing) => existing.k === poem.k)) poems.push(poem);
      poemsByPoet.set(poetId, poems);
      poetDynasty.set(poetId, { author, dynasty: group.dynasty });
    }
    process.stdout.write(`loaded ${group.folder}/${file.name}\n`);
  }
}

const poets = Array.from(poemsByPoet.entries())
  .map(([poetId, poems]) => {
    const info = poetDynasty.get(poetId);
    return makePoetRecord(info.author, info.dynasty, poems.length);
  })
  .sort((left, right) => right.poemCount - left.poemCount || left.name.localeCompare(right.name, "zh-Hans-CN"));

const buckets = new Map();
for (const [poetId, poems] of poemsByPoet.entries()) {
  const bucket = stableHash(poetId).slice(0, 2);
  const record = buckets.get(bucket) ?? {};
  record[poetId] = poems.map(({ k: _key, ...poem }) => poem);
  buckets.set(bucket, record);
}

for (const [bucket, record] of buckets.entries()) {
  await writeFile(join(outputPoems, `${bucket}.json`), JSON.stringify(record), "utf8");
}

await writeFile(join(outputRoot, "poets.index.json"), JSON.stringify(poets), "utf8");
await writeFile(
  join(outputRoot, "manifest.json"),
  JSON.stringify({
    version: 1,
    poetCount: poets.length,
    poemCount: Array.from(poemsByPoet.values()).reduce((sum, poems) => sum + poems.length, 0),
    buckets: Array.from(buckets.keys()).sort(),
    sources: ["chinese-poetry:全唐诗", "chinese-poetry:宋词"],
  }),
  "utf8",
);

console.log(`Chinese poetry supplement complete: ${poets.length} poets.`);
