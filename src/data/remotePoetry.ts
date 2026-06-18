import type { Dynasty, Poem, PoemForm, Poet } from "./poems";

const DATA_BASE = "/data";

type RemoteManifest = {
  poetCount: number;
  poemCount: number;
  buckets: string[];
  dynCounts: Record<string, number>;
  supplementBuckets?: string[];
};

type RemotePoet = {
  id: string;
  name: string;
  dynasty: string;
  poemCount: number;
  clusterSize: number;
};

type RemotePoem = {
  t: string;
  f: string;
  p: string[];
};

export type PoetryManifest = {
  poetCount: number;
  poemCount: number;
  buckets: string[];
  dynCounts: Record<string, number>;
  supplementBuckets?: string[];
};

export type RemotePoetryData = {
  manifest: PoetryManifest;
  poets: Poet[];
  poems: Poem[];
  loadedPoetId: string;
};

export type PoemSearchResult = {
  poem: Poem;
  poet: Poet;
  matchedText: string;
  matchType: "诗名" | "诗句" | "单字";
  score: number;
};

type SearchOptions = {
  signal?: AbortSignal;
};

const dynastyName: Record<string, Dynasty | string> = {
  xianqin: "先秦",
  qinhan: "秦汉",
  weijin: "魏晋",
  nanbeichao: "南北朝",
  sui: "隋",
  tang: "唐",
  song: "宋",
  yuan: "元",
  ming: "明",
  qing: "清",
  jin: "金",
  liao: "辽",
  jinxiandai: "近现代",
  dangdai: "当代",
};

const formName: Record<string, PoemForm> = {
  wujue: "五绝",
  qijue: "七绝",
  wulu: "五律",
  qilu: "七律",
  other: "自由",
};

const bucketTextCache = new Map<string, string>();
const supplementBase = "supplement";
let supplementManifestPromise: Promise<RemoteManifest | null> | null = null;

const variantChars: Record<string, string> = {
  體: "体",
  詩: "诗",
  詞: "词",
  語: "语",
  點: "点",
  綠: "绿",
  紅: "红",
  黃: "黄",
  藍: "蓝",
  雲: "云",
  風: "风",
  雨: "雨",
  雪: "雪",
  門: "门",
  長: "长",
  頭: "头",
  舉: "举",
  鄉: "乡",
  國: "国",
  萬: "万",
  千: "千",
  裏: "里",
  里: "里",
  還: "还",
  遙: "遥",
  聲: "声",
  塵: "尘",
  煙: "烟",
  牀: "床",
  床: "床",
  疑: "疑",
  霜: "霜",
  閒: "闲",
  閑: "闲",
  鳥: "鸟",
  馬: "马",
  魚: "鱼",
  龍: "龙",
  樹: "树",
  橋: "桥",
  樓: "楼",
  臺: "台",
  臨: "临",
  聽: "听",
  歸: "归",
  飛: "飞",
  開: "开",
  關: "关",
  葉: "叶",
  華: "华",
  獨: "独",
  滿: "满",
  應: "应",
  無: "无",
  來: "来",
  復: "复",
  後: "后",
  寒: "寒",
  陽: "阳",
  陰: "阴",
  見: "见",
  醉: "醉",
  夢: "梦",
  憶: "忆",
  東: "东",
  西: "西",
  輕: "轻",
  聖: "圣",
  壯: "壮",
  寫: "写",
  殘: "残",
  斷: "断",
  舊: "旧",
  淨: "净",
  聯: "联",
  懷: "怀",
  遠: "远",
  楊: "杨",
  柳: "柳",
  銀: "银",
  爲: "为",
  為: "为",
  與: "与",
};

const searchCharVariants = Object.entries(variantChars).reduce<Record<string, string[]>>((items, [traditional, simplified]) => {
  items[traditional] = Array.from(new Set([traditional, simplified]));
  items[simplified] = Array.from(new Set([simplified, traditional, ...(items[simplified] ?? [])]));
  return items;
}, {});

function bucketOf(poetId: string) {
  return poetId.slice(0, 2);
}

function stableHex(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function supplementBucketOf(poetId: string) {
  return stableHex(poetId).slice(0, 2);
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .split("")
    .map((char) => variantChars[char] ?? char)
    .join("");
}

function hashUnit(input: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function poetPosition(poet: RemotePoet) {
  const radius = 2.2 + (1 - Math.min(poet.poemCount, 6000) / 6000) * 4.4;
  const theta = hashUnit(poet.id, 11) * Math.PI * 2;
  const y = (hashUnit(poet.id, 29) - 0.5) * 4.8;
  return {
    x: Math.cos(theta) * radius,
    y,
    z: Math.sin(theta) * radius,
  };
}

function normalizePoet(poet: RemotePoet): Poet {
  const position = poetPosition(poet);
  const dynasty = dynastyName[poet.dynasty] ?? poet.dynasty;
  return {
    id: poet.id,
    name: poet.name,
    dynasty: dynasty as Dynasty,
    bio: `${dynasty}诗人，收录 ${poet.poemCount.toLocaleString("zh-CN")} 首作品。`,
    poemCount: poet.poemCount,
    x: position.x,
    y: position.y,
    z: position.z,
  };
}

function keywordsFromPoem(poem: RemotePoem) {
  const common = ["山", "月", "风", "云", "江", "花", "雪", "夜", "秋", "春", "酒", "舟", "梦", "客"];
  const text = `${poem.t}${poem.p.join("")}`;
  const hits = common.filter((char) => text.includes(char));
  return hits.slice(0, 4);
}

function normalizePoem(poet: Poet, poem: RemotePoem, index: number): Poem {
  return {
    id: `${poet.id}-${index}`,
    title: poem.t,
    poetId: poet.id,
    form: formName[poem.f] ?? "自由",
    lines: poem.p,
    keywords: keywordsFromPoem(poem),
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DATA_BASE}/${path}`);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchOptionalJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${DATA_BASE}/${path}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json() as Promise<T>;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Search aborted", "AbortError");
}

async function fetchText(path: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${DATA_BASE}/${path}`, { signal });
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.text();
}

async function loadBucketText(bucket: string, textCache: Map<string, string>, basePath = "poems", signal?: AbortSignal) {
  throwIfAborted(signal);
  const key = `${basePath}/${bucket}`;
  let text = textCache.get(key) ?? bucketTextCache.get(key);
  if (!text) {
    text = await fetchText(`${basePath}/${bucket}.json`, signal);
    bucketTextCache.set(key, text);
  }
  throwIfAborted(signal);
  textCache.set(key, text);
  return text;
}

async function loadSupplementManifest() {
  supplementManifestPromise ??= fetchOptionalJson<RemoteManifest>(`${supplementBase}/manifest.json`).catch(() => null);
  return supplementManifestPromise;
}

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function makeSearchTerms(query: string, allowSingle = false) {
  const compact = normalizeSearchText(query);
  if (!compact) return [];
  const terms = [compact];
  if (compact.length > 2) {
    for (let index = 0; index < compact.length - 1; index += 1) {
      terms.push(compact.slice(index, index + 2));
    }
  }
  if (allowSingle || compact.length === 1) {
    terms.push(...compact.split(""));
  }
  return uniqueItems(terms).sort((left, right) => right.length - left.length);
}

function makeRawSearchTerms(query: string, allowSingle = false, exactOnly = false) {
  const compact = query.trim().replace(/\s+/g, "");
  if (!compact) return [];
  const baseTerms = exactOnly ? [compact] : [compact];
  if (!exactOnly && compact.length > 2) {
    for (let index = 0; index < compact.length - 1; index += 1) {
      baseTerms.push(compact.slice(index, index + 2));
    }
  }
  if (!exactOnly && (allowSingle || compact.length === 1)) {
    baseTerms.push(...compact.split(""));
  }

  const variants = new Set<string>();
  for (const term of uniqueItems(baseTerms)) {
    const options = term.split("").map((char) => searchCharVariants[char] ?? [char]);
    let combinations = [""];
    for (const option of options) {
      combinations = combinations.flatMap((prefix) => option.map((char) => `${prefix}${char}`)).slice(0, 32);
    }
    combinations.forEach((item) => variants.add(item));
  }
  return Array.from(variants).filter(Boolean).sort((left, right) => right.length - left.length);
}

function findMatchedLine(poem: RemotePoem, terms: string[]) {
  const title = normalizeSearchText(poem.t);
  const exact = terms[0];
  if (exact && title.includes(exact)) {
    return { matchType: "诗名" as const, matchedText: poem.t, score: 900 + exact.length * 18 };
  }

  for (const line of poem.p) {
    const normalizedLine = normalizeSearchText(line);
    if (exact && normalizedLine.includes(exact)) {
      return { matchType: "诗句" as const, matchedText: line, score: 760 + exact.length * 16 };
    }
  }

  for (const term of terms.filter((item) => item.length > 1)) {
    if (title.includes(term)) {
      return { matchType: "诗名" as const, matchedText: poem.t, score: 520 + term.length * 12 };
    }
    const line = poem.p.find((item) => normalizeSearchText(item).includes(term));
    if (line) {
      return { matchType: "诗句" as const, matchedText: line, score: 430 + term.length * 10 };
    }
  }

  for (const term of terms.filter((item) => item.length === 1)) {
    if (title.includes(term)) {
      return { matchType: "单字" as const, matchedText: poem.t, score: 180 };
    }
    const line = poem.p.find((item) => normalizeSearchText(item).includes(term));
    if (line) {
      return { matchType: "单字" as const, matchedText: line, score: 120 };
    }
  }

  return null;
}

function findExactMatchedLine(poem: RemotePoem, query: string) {
  const normalizedTitle = normalizeSearchText(poem.t);
  if (normalizedTitle === query) {
    return { matchType: "诗名" as const, matchedText: poem.t, score: 2400 };
  }
  if (normalizedTitle.includes(query)) {
    return { matchType: "诗名" as const, matchedText: poem.t, score: 1900 + query.length * 20 };
  }

  const line = poem.p.find((item) => normalizeSearchText(item).includes(query));
  if (line) {
    return { matchType: "诗句" as const, matchedText: line, score: 1500 + query.length * 18 };
  }

  return null;
}

async function scanBucketsForPoems(
  query: string,
  poets: Poet[],
  buckets: string[],
  maxResults: number,
  allowSingle: boolean,
  textCache: Map<string, string>,
  exactOnly = false,
  basePath = "poems",
  signal?: AbortSignal,
  stopOnFirstExact = exactOnly,
) {
  throwIfAborted(signal);
  const compactQuery = normalizeSearchText(query);
  const terms = exactOnly ? [compactQuery] : makeSearchTerms(query, allowSingle);
  const rawTerms = makeRawSearchTerms(query, allowSingle, exactOnly);
  if (terms.length === 0 || !compactQuery) return [];
  const poetMap = new Map(poets.map((poet) => [poet.id, poet]));
  const results: PoemSearchResult[] = [];
  const collectLimit = Math.max(maxResults * 2, 12);

  for (const bucket of buckets) {
    throwIfAborted(signal);
    const text = await loadBucketText(bucket, textCache, basePath, signal);

    if (!rawTerms.some((term) => text.includes(term))) continue;

    throwIfAborted(signal);
    const poemsByPoet = JSON.parse(text) as Record<string, RemotePoem[]>;
    for (const [poetId, remotePoems] of Object.entries(poemsByPoet)) {
      const poet = poetMap.get(poetId);
      if (!poet) continue;

      for (let index = 0; index < remotePoems.length; index += 1) {
        if (index % 120 === 0) throwIfAborted(signal);
        const remotePoem = remotePoems[index];
        const match = exactOnly ? findExactMatchedLine(remotePoem, compactQuery) : findMatchedLine(remotePoem, terms);
        if (!match) continue;
        results.push({
          poem: normalizePoem(poet, remotePoem, index),
          poet,
          matchedText: match.matchedText,
          matchType: match.matchType,
          score: match.score + Math.min(poet.poemCount ?? 0, 2000) / 100,
        });
      }
    }

    if (exactOnly && stopOnFirstExact && results.length > 0) break;
    if (!exactOnly && results.length >= collectLimit) break;
  }

  return results
    .sort((left, right) => right.score - left.score || (right.poet.poemCount ?? 0) - (left.poet.poemCount ?? 0))
    .slice(0, maxResults);
}

export async function loadRemotePoetry(initialPoetId = "82a5851c"): Promise<RemotePoetryData> {
  const [manifest, remotePoets, supplementManifest, supplementPoets] = await Promise.all([
    fetchJson<RemoteManifest>("manifest.json"),
    fetchJson<RemotePoet[]>("poets.index.json"),
    loadSupplementManifest(),
    fetchOptionalJson<RemotePoet[]>(`${supplementBase}/poets.index.json`).catch(() => null),
  ]);
  const mergedPoets = [...remotePoets, ...(supplementPoets ?? [])];
  const poets = mergedPoets.map(normalizePoet);
  const selectedPoet = poets.find((poet) => poet.id === initialPoetId) ?? poets[0];
  const poems = await loadRemotePoetPoems(selectedPoet.id, selectedPoet);
  return {
    manifest: {
      poetCount: manifest.poetCount + (supplementManifest?.poetCount ?? 0),
      poemCount: manifest.poemCount + (supplementManifest?.poemCount ?? 0),
      buckets: manifest.buckets,
      supplementBuckets: supplementManifest?.buckets ?? [],
      dynCounts: manifest.dynCounts,
    },
    poets,
    poems,
    loadedPoetId: selectedPoet.id,
  };
}

export async function loadRemotePoetPoems(poetId: string, poet: Poet): Promise<Poem[]> {
  if (poetId.startsWith("cp-")) {
    const bucket = supplementBucketOf(poetId);
    const poemsByPoet = await fetchJson<Record<string, RemotePoem[]>>(`${supplementBase}/poems/${bucket}.json`);
    return (poemsByPoet[poetId] ?? []).map((poem, index) => normalizePoem(poet, poem, index));
  }

  const bucket = bucketOf(poetId);
  const [index, response] = await Promise.all([
    fetchJson<Record<string, [number, number]>>(`poems/${bucket}.idx.json`),
    fetch(`${DATA_BASE}/poems/${bucket}.json`),
  ]);
  if (!response.ok) throw new Error(`Failed to load poems/${bucket}.json: ${response.status}`);
  const range = index[poetId];
  if (!range) return [];
  const [start, length] = range;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes.slice(start, start + length));
  const remotePoems = JSON.parse(text) as RemotePoem[];
  return remotePoems.map((poem, index) => normalizePoem(poet, poem, index));
}

export async function searchRemotePoems(
  query: string,
  poets: Poet[],
  buckets: string[],
  maxResults = 8,
  options: SearchOptions = {},
): Promise<PoemSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || buckets.length === 0 || poets.length === 0) return [];

  const textCache = new Map<string, string>();
  const supplementManifest = await loadSupplementManifest();
  const supplementBuckets = supplementManifest?.buckets ?? [];
  const signal = options.signal;
  const mergeResults = (...groups: PoemSearchResult[][]) => {
    const seen = new Set<string>();
    return groups
      .flat()
      .filter((result) => {
        const key = `${result.poet.name}:${result.poem.title}:${result.poem.lines.join("")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => right.score - left.score || (right.poet.poemCount ?? 0) - (left.poet.poemCount ?? 0))
      .slice(0, maxResults);
  };

  if (normalizedQuery.replace(/\s+/g, "").length > 1) {
    const supplementExactResults =
      supplementBuckets.length > 0
        ? await scanBucketsForPoems(
            normalizedQuery,
            poets,
            supplementBuckets,
            maxResults,
            false,
            textCache,
            true,
            `${supplementBase}/poems`,
            signal,
            false,
          )
        : [];
    if (supplementExactResults.length > 0) return mergeResults(supplementExactResults);

    throwIfAborted(signal);
    const exactResults = await scanBucketsForPoems(normalizedQuery, poets, buckets, maxResults, false, textCache, true, "poems", signal);
    if (exactResults.length > 0) return mergeResults(exactResults);
  }

  const supplementPrimaryResults =
    supplementBuckets.length > 0
      ? await scanBucketsForPoems(
          normalizedQuery,
          poets,
          supplementBuckets,
          maxResults,
          false,
          textCache,
          false,
          `${supplementBase}/poems`,
          signal,
        )
      : [];
  if (supplementPrimaryResults.length > 0) return mergeResults(supplementPrimaryResults);

  throwIfAborted(signal);
  const primaryResults = mergeResults(await scanBucketsForPoems(normalizedQuery, poets, buckets, maxResults, false, textCache, false, "poems", signal));
  if (primaryResults.length > 0) return primaryResults;

  throwIfAborted(signal);
  return mergeResults(await scanBucketsForPoems(normalizedQuery, poets, buckets, maxResults, true, textCache, false, "poems", signal));
}
