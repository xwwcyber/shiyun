import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Aperture,
  Bookmark,
  Camera,
  Check,
  Copy,
  Crosshair,
  EyeOff,
  Filter,
  Github,
  Home,
  LocateFixed,
  MoreHorizontal,
  Orbit,
  Route,
  Search,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Stars,
  WandSparkles,
  X,
} from "lucide-react";
import { PoetryCloud } from "./components/PoetryCloud";
import {
  dynasties as fallbackDynasties,
  poemForms,
  poems as fallbackPoems,
  poets as fallbackPoets,
  type Dynasty,
  type Poem,
  type PoemForm,
  type Poet,
} from "./data/poems";
import {
  loadRemotePoetPoems,
  loadRemotePoetry,
  type PoemSearchResult,
  type PoetryManifest,
} from "./data/remotePoetry";

const allForms = "全部";
const allDynasties = "全部朝代";
const glyphs = "山月风云江花雪夜秋春酒舟梦客天水烟雨松竹星河长安故园人间".split("");
const introSlides = [
  {
    title: "诗云 · 一切可见的诗",
    body: "每位历史诗人是一颗真实的星，星与星之间的虚空，是千万首诗词沉积出的光尘。",
  },
  {
    title: "按图索诗",
    body: "搜索诗人、诗题、诗句或意象，星云会切换到对应作者，并按需加载他的全部作品。",
  },
  {
    title: "在诗里飞行",
    body: "拖拽旋转星图，滚轮推进远近；点击诗人恒星展开作品列表，点击小行星查看一首诗。",
  },
];

const defaultManifest: PoetryManifest = {
  poetCount: fallbackPoets.length,
  poemCount: fallbackPoems.length,
  buckets: [],
  dynCounts: {},
};

type LayerState = {
  stars: boolean;
  network: boolean;
  gravity: boolean;
};

type ViewMode = "poet" | "poem" | "explore" | "dynasty";

type PoetrySearchWorkerResponse =
  | { type: "ready" }
  | { type: "success"; requestId: number; results: PoemSearchResult[] }
  | { type: "error"; requestId: number; message: string };

function makeStableCode(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Array.from({ length: 3 }, (_, index) =>
    String((hash + index * 2654435761) >>> 0).padStart(10, "0"),
  ).join("");
}

function App() {
  const [allPoets, setAllPoets] = useState<Poet[]>(fallbackPoets);
  const [loadedPoems, setLoadedPoems] = useState<Poem[]>(fallbackPoems);
  const [manifest, setManifest] = useState<PoetryManifest>(defaultManifest);
  const [selectedPoetId, setSelectedPoetId] = useState("li-bai");
  const [selectedPoemId, setSelectedPoemId] = useState("p-001");
  const [form, setForm] = useState<PoemForm | typeof allForms>(poemForms[0]);
  const [dynasty, setDynasty] = useState<Dynasty | typeof allDynasties>(allDynasties);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("poet");
  const [showPanel, setShowPanel] = useState(true);
  const [showMorePanel, setShowMorePanel] = useState(false);
  const [introStep, setIntroStep] = useState(introSlides.length);
  const [routeHash, setRouteHash] = useState(() => window.location.hash || window.location.search);
  const [loading, setLoading] = useState("正在连接诗云数据...");
  const [drawerMode, setDrawerMode] = useState<"singlePoem" | "poetWorks">("singlePoem");
  const [poemPeekOpen, setPoemPeekOpen] = useState(true);
  const [guideMode, setGuideMode] = useState<"hidden" | "once" | "resident">("once");
  const [guideStyle, setGuideStyle] = useState<"plane" | "classic">("plane");
  const [coverage, setCoverage] = useState<"all" | "optimized">("all");
  const [guideDuration, setGuideDuration] = useState(10);
  const [guideBrightness, setGuideBrightness] = useState(0.7);
  const [layers, setLayers] = useState<LayerState>({ stars: true, network: false, gravity: true });
  const [routeStart, setRouteStart] = useState("");
  const [routeEnd, setRouteEnd] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [poemSearchResults, setPoemSearchResults] = useState<PoemSearchResult[]>([]);
  const [poemSearchStatus, setPoemSearchStatus] = useState("");
  const [activeSearchResultId, setActiveSearchResultId] = useState("");
  const poemCacheRef = useRef<Map<string, Promise<Poem[]>>>(new Map());
  const poemSearchRequestRef = useRef(0);
  const poemSearchWorkerRef = useRef<Worker | null>(null);
  const poemSearchReady = manifest.buckets.length > 0 && allPoets.length > 0;

  useEffect(() => {
    const worker = new Worker(new URL("./data/poetrySearchWorker.ts", import.meta.url), { type: "module" });
    poemSearchWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<PoetrySearchWorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") return;
      if (message.requestId !== poemSearchRequestRef.current) return;

      if (message.type === "success") {
        setPoemSearchResults(message.results);
        setActiveSearchResultId((current) =>
          message.results.some((item) => item.poem.id === current) ? current : (message.results[0]?.poem.id ?? ""),
        );
        setPoemSearchStatus(message.results.length > 0 ? "" : "没有找到相近诗句");
        return;
      }

      setPoemSearchResults([]);
      setActiveSearchResultId("");
      setPoemSearchStatus(message.message || "检索失败，稍后再试");
    };

    return () => {
      worker.terminate();
      if (poemSearchWorkerRef.current === worker) poemSearchWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (allPoets.length === 0 || manifest.buckets.length === 0) return;
    poemSearchWorkerRef.current?.postMessage({ type: "init", poets: allPoets, buckets: manifest.buckets });
  }, [allPoets, manifest.buckets]);

  useEffect(() => {
    let cancelled = false;
    loadRemotePoetry()
      .then((data) => {
        if (cancelled) return;
        setAllPoets(data.poets);
        setLoadedPoems(data.poems);
        poemCacheRef.current.set(data.loadedPoetId, Promise.resolve(data.poems));
        setManifest(data.manifest);
        setSelectedPoetId(data.loadedPoetId);
        setSelectedPoemId(data.poems[0]?.id ?? "");
        setLoading("");
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoading("远程数据加载失败，当前使用本地样例。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const resetScroll = () => {
      if (window.innerWidth > 980) window.scrollTo({ left: 0, top: 0 });
    };
    resetScroll();
    window.addEventListener("resize", resetScroll);
    return () => window.removeEventListener("resize", resetScroll);
  }, []);

  useEffect(() => {
    const closeCrowdedPanels = () => {
      if (window.innerWidth <= 980) setShowMorePanel(false);
    };
    closeCrowdedPanels();
    window.addEventListener("resize", closeCrowdedPanels);
    return () => window.removeEventListener("resize", closeCrowdedPanels);
  }, []);

  useEffect(() => {
    const syncHash = () => setRouteHash(window.location.hash || window.location.search);
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key.toLowerCase() === "h") setShowPanel((value) => !value);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (viewMode !== "poem") {
      poemSearchWorkerRef.current?.postMessage({ type: "cancel" });
      setPoemSearchResults([]);
      setActiveSearchResultId("");
      setPoemSearchStatus("");
      return;
    }

    const term = query.trim();
    if (!term) {
      poemSearchWorkerRef.current?.postMessage({ type: "cancel" });
      setPoemSearchResults([]);
      setPoemSearchStatus("");
      setActiveSearchResultId("");
      return;
    }

    if (term.replace(/\s+/g, "").length < 2) {
      poemSearchWorkerRef.current?.postMessage({ type: "cancel" });
      setPoemSearchResults([]);
      setPoemSearchStatus("输入两个字开始全库检索");
      setActiveSearchResultId("");
      return;
    }

    if (!poemSearchReady) {
      poemSearchWorkerRef.current?.postMessage({ type: "cancel" });
      setPoemSearchResults([]);
      setPoemSearchStatus("诗库还在加载，稍等会自动检索");
      setActiveSearchResultId("");
      return;
    }

    const requestId = poemSearchRequestRef.current + 1;
    poemSearchRequestRef.current = requestId;
    setPoemSearchStatus("准备检索全库...");

    const timer = window.setTimeout(() => {
      if (poemSearchRequestRef.current !== requestId) return;
      setPoemSearchStatus("正在后台检索全库...");
      poemSearchWorkerRef.current?.postMessage({ type: "search", requestId, query: term, maxResults: 8 });
    }, 520);

    return () => {
      window.clearTimeout(timer);
      poemSearchWorkerRef.current?.postMessage({ type: "cancel" });
    };
  }, [poemSearchReady, query, viewMode]);

  const selectedPoet = allPoets.find((poet) => poet.id === selectedPoetId) ?? allPoets[0];
  const selectedPoem = loadedPoems.find((poem) => poem.id === selectedPoemId) ?? loadedPoems[0];

  const dynamicDynasties = useMemo(() => {
    const priority = ["唐", "宋", "元", "明", "清", "当代"];
    const available = new Set(allPoets.map((poet) => poet.dynasty));
    const merged = [...priority.filter((item) => available.has(item)), ...fallbackDynasties.filter((item) => available.has(item))];
    return Array.from(new Set(merged)).slice(0, 6);
  }, [allPoets]);

  const filteredPoets = useMemo(() => {
    const normalized = viewMode === "poet" ? query.trim().toLowerCase() : "";
    return allPoets.filter((poet) => {
      const matchesDynasty = dynasty === allDynasties || poet.dynasty === dynasty;
      const matchesQuery = !normalized || poet.name.toLowerCase().includes(normalized);
      return matchesDynasty && matchesQuery;
    });
  }, [allPoets, dynasty, query, viewMode]);

  const visiblePoems = useMemo(() => {
    const normalized = viewMode === "poem" ? query.trim().toLowerCase() : "";
    return loadedPoems.filter((poem) => {
      const matchesForm = form === allForms || poem.form === form;
      const haystack = [poem.title, selectedPoet?.name, poem.form, ...(poem.lines ?? []), ...(poem.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return matchesForm && (!normalized || haystack.includes(normalized) || selectedPoet?.name.toLowerCase().includes(normalized));
    });
  }, [form, loadedPoems, query, selectedPoet, viewMode]);

  const cloudPoets = useMemo(() => filteredPoets.slice(0, 700), [filteredPoets]);
  const cloudVisualPoems = useMemo(() => visiblePoems.slice(0, 14000), [visiblePoems]);
  const poetMatches = useMemo(() => {
    const preferred = filteredPoets.filter((poet) => poet.id === selectedPoetId || query.trim() || dynasty !== allDynasties);
    return (preferred.length > 0 ? preferred : allPoets).slice(0, 8);
  }, [allPoets, dynasty, filteredPoets, query, selectedPoetId]);
  const dynastyMatches = useMemo(() => {
    const normalized = viewMode === "dynasty" ? query.trim().toLowerCase() : "";
    return dynamicDynasties.filter((item) => !normalized || item.toLowerCase().includes(normalized));
  }, [dynamicDynasties, query, viewMode]);
  const activePoemSearchResult = useMemo(
    () => poemSearchResults.find((item) => item.poem.id === activeSearchResultId) ?? poemSearchResults[0],
    [activeSearchResultId, poemSearchResults],
  );
  const searchPlaceholder =
    viewMode === "poem"
      ? "搜索诗题、诗句、意象..."
      : viewMode === "dynasty"
        ? "搜索朝代..."
        : "搜索诗人...（回车飞到第一个）";

  const poemList = visiblePoems.length > 0 ? visiblePoems : loadedPoems;
  const visibleKeywords = new Set(visiblePoems.flatMap((poem) => poem.keywords));
  const poemCode = useMemo(() => makeStableCode(selectedPoem?.id ?? selectedPoetId), [selectedPoem?.id, selectedPoetId]);
  const isFavorite = !!selectedPoem && favoriteIds.includes(selectedPoem.id);

  const shellStyle = {
    "--cloud-brightness": (0.86 + guideBrightness * 0.42).toFixed(2),
    "--cloud-saturation": layers.stars ? "1.82" : "1.18",
    "--interface-opacity": showPanel ? "1" : "0.42",
  } as CSSProperties;

  useEffect(() => {
    if (visiblePoems.length === 0) return;
    const selectedPoemIsVisible = visiblePoems.some((poem) => poem.id === selectedPoemId);
    if (!selectedPoemIsVisible) setSelectedPoemId(visiblePoems[0].id);
  }, [selectedPoemId, visiblePoems]);

  const loadPoemsForPoet = (poet: Poet) => {
    const cached = poemCacheRef.current.get(poet.id);
    if (cached) return cached;
    const request = loadRemotePoetPoems(poet.id, poet);
    poemCacheRef.current.set(poet.id, request);
    return request;
  };

  const selectPoet = async (poetId: string) => {
    const poet = allPoets.find((item) => item.id === poetId);
    if (!poet) return;
    setDrawerMode("poetWorks");
    setPoemPeekOpen(true);
    setSelectedPoetId(poetId);
    setLoading(`正在加载 ${poet.name} 的作品...`);
    try {
      const poems = await loadPoemsForPoet(poet);
      setLoadedPoems(poems);
      setSelectedPoemId(poems[0]?.id ?? "");
      setLoading("");
    } catch (error) {
      console.error(error);
      setLoading(`${poet.name} 的作品加载失败。`);
    }
  };

  const selectStarPoem = async (poetId: string) => {
    const poet = allPoets.find((item) => item.id === poetId);
    if (!poet) return;
    setDrawerMode("singlePoem");
    setPoemPeekOpen(true);
    setSelectedPoetId(poetId);
    setLoading(`正在定位 ${poet.name} 的诗...`);
    try {
      const poems = loadedPoems.some((poem) => poem.poetId === poet.id)
        ? loadedPoems.filter((poem) => poem.poetId === poet.id)
        : await loadPoemsForPoet(poet);
      setLoadedPoems(poems);
      const pickedIndex = Math.floor((poet.x * poet.x + poet.y * poet.y + poet.z * poet.z) * 1000) % Math.max(poems.length, 1);
      setSelectedPoemId(poems[pickedIndex]?.id ?? "");
      setLoading("");
    } catch (error) {
      console.error(error);
      setLoading(`${poet.name} 的诗加载失败。`);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${selectedPoem?.id ?? selectedPoetId}`);
  };

  const handleShare = async () => {
    const title = selectedPoem ? `《${selectedPoem.title}》` : "诗云";
    const text = selectedPoem && selectedPoet ? `${selectedPoet.name} · ${selectedPoem.lines.join(" / ")}` : "在诗云里捞起一颗星";
    if (navigator.share) {
      await navigator.share({ title, text, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(`${title}\n${text}\n${window.location.href}`);
    }
  };

  const pickRandomPoem = async () => {
    const pool = filteredPoets.length > 0 ? filteredPoets : allPoets;
    const poet = pool[Math.floor(Math.random() * Math.max(pool.length, 1))];
    if (poet) await selectStarPoem(poet.id);
  };

  const selectPoemFromSearch = async (poem: Poem) => {
    const poet = allPoets.find((item) => item.id === poem.poetId);
    if (poet && poet.id !== selectedPoetId) {
      const poems = await loadPoemsForPoet(poet);
      setLoadedPoems(poems);
      setSelectedPoetId(poet.id);
    }
    setSelectedPoemId(poem.id);
    setDrawerMode("singlePoem");
    setPoemPeekOpen(true);
  };

  const selectPoemSearchResult = async (result: PoemSearchResult) => {
    setActiveSearchResultId(result.poem.id);
    setDynasty(allDynasties);
    await selectPoemFromSearch(result.poem);
  };

  const copySearchResultCode = async () => {
    if (!activePoemSearchResult) return;
    await navigator.clipboard.writeText(makeStableCode(activePoemSearchResult.poem.id));
  };

  const resetViewFilters = () => {
    setViewMode("poet");
    setQuery("");
    setDynasty(allDynasties);
    setForm(allForms);
    setDrawerMode("singlePoem");
  };

  const switchViewMode = (nextMode: ViewMode) => {
    setViewMode(nextMode);
    if (nextMode !== viewMode) setQuery("");
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (viewMode === "poet" && poetMatches[0]) {
      void selectPoet(poetMatches[0].id);
    } else if (viewMode === "poem" && activePoemSearchResult) {
      void selectPoemSearchResult(activePoemSearchResult);
    } else if (viewMode === "dynasty" && dynastyMatches[0]) {
      setDynasty(dynastyMatches[0]);
      setQuery("");
    }
  };

  const toggleFavorite = () => {
    if (!selectedPoem) return;
    setFavoriteIds((items) => (items.includes(selectedPoem.id) ? items.filter((id) => id !== selectedPoem.id) : [...items, selectedPoem.id]));
  };

  const resetGuide = () => {
    setGuideMode("once");
    setGuideStyle("plane");
    setCoverage("all");
    setGuideDuration(10);
    setGuideBrightness(0.7);
    setLayers({ stars: true, network: false, gravity: true });
  };

  const currentIntro = introSlides[introStep];

  return (
    <main className={`app-shell ${showPanel ? "" : "ui-hidden"}`} style={shellStyle}>
      <PoetryCloud
        poets={cloudPoets}
        poems={cloudVisualPoems}
        selectedPoetId={selectedPoetId}
        selectedPoemId={selectedPoemId}
        visualKey={routeHash.startsWith("#p=") || routeHash.includes("?p=") ? routeHash : "poetry-cloud"}
        onSelectPoet={selectPoet}
        onSelectPoem={selectStarPoem}
      />

      <div className="glyph-field" aria-hidden="true">
        {Array.from({ length: 78 }, (_, index) => (
          <span
            key={index}
            style={{
              left: `${(index * 37) % 96}%`,
              top: `${(index * 61) % 92}%`,
              animationDelay: `${(index % 17) * -0.7}s`,
              opacity: 0.08 + (index % 5) * 0.025,
            }}
          >
            {glyphs[index % glyphs.length]}
          </span>
        ))}
      </div>

      <header className="topbar">
        <button className="brand" onClick={() => setShowPanel((value) => !value)} type="button">
          <span>诗云</span>
          <small>Poetry Cloud</small>
        </button>

        {showPanel && (
          <nav className="mode-tabs" aria-label="诗体筛选">
            <button className={form === allForms ? "active" : ""} onClick={() => setForm(allForms)} type="button">
              全部
            </button>
            {poemForms.map((item) => (
              <button className={form === item ? "active" : ""} key={item} onClick={() => setForm(item)} type="button">
                {item}
              </button>
            ))}
          </nav>
        )}

        <div className="top-counts">
          <span>{manifest.poetCount.toLocaleString("zh-CN")} 诗人</span>
          <i />
          <span>{manifest.poemCount.toLocaleString("zh-CN")} 首</span>
        </div>

        <div className="toolbar">
          <button title="隐藏界面 - H" onClick={() => setShowPanel((value) => !value)} type="button">
            <EyeOff size={17} />
            <span>隐藏界面 · H</span>
          </button>
          <button title="复制分享链接" onClick={handleCopy} type="button">
            <Share2 size={17} />
          </button>
          <button title="留影" onClick={() => window.print()} type="button">
            <Camera size={17} />
          </button>
        </div>
      </header>

      {showPanel && (
        <section className="command-rail" aria-label="星图工具">
          <button className="active" type="button">
            <Stars size={15} />
            常用字
          </button>
          <button type="button">
            <Orbit size={15} />
            星桥
          </button>
          <button className={showMorePanel ? "active" : ""} onClick={() => setShowMorePanel((value) => !value)} type="button">
            <MoreHorizontal size={16} />
            更多
          </button>
        </section>
      )}

      {showPanel && (
        <aside className="control-panel">
          <section className="view-tabs" aria-label="诗云模式" data-view-mode={viewMode}>
            <button aria-pressed={viewMode === "poet"} onClick={() => switchViewMode("poet")} type="button">
              诗人
            </button>
            <button aria-pressed={viewMode === "poem"} onClick={() => switchViewMode("poem")} type="button">寻诗</button>
            <button
              aria-pressed={viewMode === "explore"}
              onClick={() => {
                switchViewMode("explore");
                void pickRandomPoem();
              }}
              type="button"
            >
              探诗
            </button>
            <button aria-pressed={viewMode === "dynasty"} onClick={() => switchViewMode("dynasty")} type="button">朝代</button>
            <button aria-label="重置筛选" onClick={resetViewFilters} type="button">∞</button>
          </section>

          <section className="search-block">
            <label>
              <Search size={16} />
              <input value={query} placeholder={searchPlaceholder} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} />
            </label>
          </section>

          {viewMode === "poet" && query.trim() && (
            <section className="quick-results">
              {poetMatches.map((poet) => (
                <button
                  className={poet.id === selectedPoetId ? "selected" : ""}
                  key={poet.id}
                  onClick={() => selectPoet(poet.id)}
                  type="button"
                >
                  <strong>{poet.name}</strong>
                  <span>{poet.dynasty}</span>
                </button>
              ))}
            </section>
          )}

          {viewMode === "poem" && query.trim() && (
            <section className="poem-search-panel">
              <div className="poem-search-head">
                <strong>真实的诗 · 诗句 / 诗名</strong>
                <span>{poemSearchStatus || `${poemSearchResults.length} 条`}</span>
              </div>

              {poemSearchResults.length > 0 ? (
                <div className="poem-search-list">
                  {poemSearchResults.map((result) => (
                    <button
                      className={result.poem.id === activePoemSearchResult?.poem.id ? "selected" : ""}
                      key={result.poem.id}
                      onClick={() => void selectPoemSearchResult(result)}
                      type="button"
                    >
                      <span className="result-main">
                        <strong>{result.poet.name}</strong>
                        <span>《{result.poem.title}》</span>
                      </span>
                      <span className="result-meta">{result.poet.dynasty} · {result.poem.form}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="poem-search-empty">{poemSearchStatus}</p>
              )}

              {activePoemSearchResult && (
                <div className="poem-search-card">
                  <div className="search-card-title">
                    <span>{activePoemSearchResult.matchType} · 半编号</span>
                    <button onClick={copySearchResultCode} type="button">复制</button>
                  </div>
                  <p>{activePoemSearchResult.matchedText}</p>
                  <code>{makeStableCode(activePoemSearchResult.poem.id)}</code>
                  <button className="search-fly-button" onClick={() => void selectPoemSearchResult(activePoemSearchResult)} type="button">
                    飞到这条高位街区 · 点亮代表星
                  </button>
                </div>
              )}
            </section>
          )}

          {viewMode === "dynasty" && (
            <section className="quick-results dynasty-results">
              <button className={dynasty === allDynasties ? "selected" : ""} onClick={() => setDynasty(allDynasties)} type="button">
                <strong>全部</strong>
                <span>{allPoets.length.toLocaleString("zh-CN")} 位诗人</span>
              </button>
              {dynastyMatches.map((item) => {
                const count = allPoets.filter((poet) => poet.dynasty === item).length;
                return (
                  <button className={dynasty === item ? "selected" : ""} key={item} onClick={() => setDynasty(item)} type="button">
                    <strong>{item}</strong>
                    <span>{count.toLocaleString("zh-CN")} 位诗人</span>
                  </button>
                );
              })}
            </section>
          )}
        </aside>
      )}

      {showPanel && showMorePanel && (
        <aside className="more-panel">
          <div className="panel-title">
            <strong>
              更多 <SlidersHorizontal size={15} />
            </strong>
            <button onClick={() => setShowMorePanel(false)} title="关闭更多面板" type="button">
              <X size={18} />
            </button>
          </div>

          <section className="setting-group">
            <h3>行星指引线</h3>
            <div className="segmented setting-line">
              <span>显示</span>
              <button className={guideMode === "hidden" ? "active" : ""} onClick={() => setGuideMode("hidden")} type="button">
                不显示
              </button>
              <button className={guideMode === "once" ? "active" : ""} onClick={() => setGuideMode("once")} type="button">
                一次性
              </button>
              <button className={guideMode === "resident" ? "active" : ""} onClick={() => setGuideMode("resident")} type="button">
                常驻
              </button>
            </div>
            <div className="segmented setting-line">
              <span>样式</span>
              <button className={guideStyle === "plane" ? "active" : ""} onClick={() => setGuideStyle("plane")} type="button">
                平面坐标
              </button>
              <button className={guideStyle === "classic" ? "active" : ""} onClick={() => setGuideStyle("classic")} type="button">
                直线旧版
              </button>
            </div>
            <div className="segmented setting-line">
              <span>覆盖</span>
              <button className={coverage === "all" ? "active" : ""} onClick={() => setCoverage("all")} type="button">
                全部
              </button>
              <button className={coverage === "optimized" ? "active" : ""} onClick={() => setCoverage("optimized")} type="button">
                优化
              </button>
            </div>

            <label className="range-row">
              <span>时长</span>
              <input min="4" max="24" step="1" type="range" value={guideDuration} onChange={(event) => setGuideDuration(Number(event.target.value))} />
              <strong>{guideDuration}s</strong>
            </label>
            <label className="range-row">
              <span>亮度</span>
              <input min="0.35" max="1.1" step="0.01" type="range" value={guideBrightness} onChange={(event) => setGuideBrightness(Number(event.target.value))} />
              <strong>{guideBrightness.toFixed(2)}×</strong>
            </label>

            <button className="ghost-button" onClick={resetGuide} type="button">
              指引恢复默认
            </button>
          </section>

          <section className="setting-group">
            <h3>显示层</h3>
            <label className="check-row">
              <input checked={layers.stars} onChange={(event) => setLayers((value) => ({ ...value, stars: event.target.checked }))} type="checkbox" />
              <Check size={16} />
              <span>行星 · 全部诗人的作品环绕</span>
            </label>
            <label className="check-row">
              <input checked={layers.network} onChange={(event) => setLayers((value) => ({ ...value, network: event.target.checked }))} type="checkbox" />
              <Check size={16} />
              <span>赠诗网络 · 选中后出现漫游路径</span>
            </label>
            <label className="check-row">
              <input checked={layers.gravity} onChange={(event) => setLayers((value) => ({ ...value, gravity: event.target.checked }))} type="checkbox" />
              <Check size={16} />
              <span>引力 · 摄像机随星系自转</span>
            </label>
          </section>

          <section className="setting-group">
            <h3>拾遗</h3>
            <button className="primary-wide" onClick={pickRandomPoem} type="button">
              <Shuffle size={17} />
              拾遗 — 我捞起的诗
            </button>
          </section>

          <section className="setting-group link-grid">
            <h3>关于 · 反馈</h3>
            <button type="button">
              <Home size={16} />
              个人主页
            </button>
            <button type="button">
              <Github size={16} />
              GitHub
            </button>
            <button type="button">
              <WandSparkles size={16} />
              开源致谢
            </button>
          </section>
        </aside>
      )}

      {showPanel && layers.network && (
        <aside className="gift-panel">
          <h2>赠诗漫游</h2>
          <div className="gift-body">
            <span>往来</span>
            <p>先选中一位诗人，这里列出他的赠答往来</p>
          </div>
          <div className="route-tools">
            <span>路径查找</span>
            <label>
              <input value={routeStart} onChange={(event) => setRouteStart(event.target.value)} placeholder="起点诗人...（可输入）" />
              <button onClick={() => setRouteStart(selectedPoet?.name ?? "")} type="button">
                选中
              </button>
              <i>—</i>
            </label>
            <label>
              <input value={routeEnd} onChange={(event) => setRouteEnd(event.target.value)} placeholder="终点诗人...（可输入）" />
              <button onClick={() => setRouteEnd(selectedPoet?.name ?? "")} type="button">
                选中
              </button>
              <i>—</i>
            </label>
            <button className="route-button" type="button">
              <Route size={15} />
              查找路径
            </button>
            <label className="soft-check">
              <input type="checkbox" />
              <span>弱化往来线</span>
            </label>
          </div>
        </aside>
      )}

      {(showPanel || poemPeekOpen) && (
        <aside className={`poem-drawer ${drawerMode === "singlePoem" ? "single-mode" : "works-mode"} ${poemPeekOpen ? "is-visible" : ""}`}>
          <button className="poem-close" onClick={() => setPoemPeekOpen(false)} title="收起诗词" type="button">
            <X size={18} />
          </button>

          {drawerMode === "poetWorks" ? (
            <>
              <div className="drawer-head">
                <div>
                  <span>{visibleKeywords.size} 个意象 · {poemList.length.toLocaleString("zh-CN")} 条结果</span>
                  <h2>诗作星表</h2>
                </div>
                <button className="icon-action" title="定位诗人" onClick={() => selectedPoet && selectStarPoem(selectedPoet.id)} type="button">
                  <LocateFixed size={17} />
                </button>
              </div>
              <div className="poem-list">
                {poemList.slice(0, 160).map((poem, index) => (
                  <button
                    className={selectedPoemId === poem.id ? "selected" : ""}
                    key={poem.id}
                    onClick={() => {
                      setSelectedPoemId(poem.id);
                      setDrawerMode("singlePoem");
                      setPoemPeekOpen(true);
                    }}
                    type="button"
                  >
                    <span>◆ {String(index + 1).padStart(2, "0")} · {poem.form}</span>
                    <strong>{poem.title}</strong>
                    <small>{selectedPoet?.name} · {selectedPoet?.dynasty} · 定位 / 留影 / 复制编号</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <article className="single-poem">
              <h2 className="single-poem-title">{selectedPoem?.title ?? "诗作全文"}</h2>
              <div className="single-poem-meta">
                <strong>〔{selectedPoet?.dynasty}〕{selectedPoet?.name}</strong>
                <span>{selectedPoem?.form ?? "作品"}</span>
              </div>
              <ol className="single-poem-lines">
                {(selectedPoem?.lines ?? [loading || "正在等待作品数据"]).map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ol>
              <div className="keyword-row">
                {(selectedPoem?.keywords ?? []).map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
                {loading && <span>{loading}</span>}
              </div>

              <div className="poem-meta-panel">
                <span>诗体</span>
                <strong>{selectedPoem?.form ?? "自由格式"} · 词</strong>
                <span>全集编号 唯一 · 跨诗体 · {String((selectedPoem?.lines.length ?? 0) * 31 + (selectedPoem?.title.length ?? 0)).padStart(3, "0")} 位</span>
                <code>{poemCode}</code>
                <p>换行也写进了编号里 —— 这串数字锁定了字，也锁定了断句。</p>
              </div>

              <div className="drawer-actions">
                <button onClick={handleShare} type="button">
                  <Share2 size={15} />
                  分享
                </button>
                <button className={isFavorite ? "active" : ""} onClick={toggleFavorite} type="button">
                  <Bookmark size={15} />
                  {isFavorite ? "已收藏" : "留影"}
                </button>
                <button onClick={handleCopy} type="button">
                  <Copy size={15} />
                  收进拾遗
                </button>
              </div>
            </article>
          )}
        </aside>
      )}

      <footer className="flight-help">
        <Sparkles size={16} />
        <span>WASD 飞行 · 拖拽转向 · 滚轮调速 · 点恒星看作品列表 · 点行星看诗</span>
      </footer>

      {currentIntro && (
        <section className="intro-scrim" aria-label="诗云导览">
          <div className="intro-card">
            <div className="intro-index">{introStep + 1} / {introSlides.length}</div>
            <h2>{currentIntro.title}</h2>
            <p>{currentIntro.body}</p>
            <div className="intro-dots" aria-hidden="true">
              {introSlides.map((_, index) => (
                <span className={index === introStep ? "active" : ""} key={index} />
              ))}
            </div>
            <div className="intro-actions">
              <button type="button" onClick={() => setIntroStep(introSlides.length)}>
                跳过
              </button>
              <button type="button" onClick={() => setIntroStep((step) => step + 1)}>
                {introStep === introSlides.length - 1 ? "进入诗云" : "下一步"}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
