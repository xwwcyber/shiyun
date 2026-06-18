import type { Poet } from "./poems";
import { searchRemotePoems, type PoemSearchResult } from "./remotePoetry";

type InitMessage = {
  type: "init";
  poets: Poet[];
  buckets: string[];
};

type SearchMessage = {
  type: "search";
  requestId: number;
  query: string;
  maxResults: number;
};

type CancelMessage = {
  type: "cancel";
};

type WorkerMessage = InitMessage | SearchMessage | CancelMessage;

type WorkerResponse =
  | { type: "ready" }
  | { type: "success"; requestId: number; results: PoemSearchResult[] }
  | { type: "error"; requestId: number; message: string };

let poets: Poet[] = [];
let buckets: string[] = [];
let activeController: AbortController | null = null;

const postWorkerMessage = (message: WorkerResponse) => {
  self.postMessage(message);
};

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === "init") {
    poets = message.poets;
    buckets = message.buckets;
    postWorkerMessage({ type: "ready" });
    return;
  }

  if (message.type === "cancel") {
    activeController?.abort();
    activeController = null;
    return;
  }

  activeController?.abort();

  if (poets.length === 0 || buckets.length === 0) {
    postWorkerMessage({ type: "error", requestId: message.requestId, message: "诗库还在加载" });
    return;
  }

  const controller = new AbortController();
  activeController = controller;

  try {
    const results = await searchRemotePoems(message.query, poets, buckets, message.maxResults, {
      signal: controller.signal,
    });
    if (activeController !== controller || controller.signal.aborted) return;
    postWorkerMessage({ type: "success", requestId: message.requestId, results });
  } catch (error) {
    if (controller.signal.aborted) return;
    const reason = error instanceof Error ? error.message : "检索失败";
    postWorkerMessage({ type: "error", requestId: message.requestId, message: reason });
  }
};

export {};
