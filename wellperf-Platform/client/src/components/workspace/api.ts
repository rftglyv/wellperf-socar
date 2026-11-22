export const ENGINE_URL = (process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000").replace(/\/$/, "");

export type StageName = "clean" | "vfm" | "pta";
export type StageStatus = "idle" | "running" | "done" | "stale" | "error";

export interface Part {
  id: string;
  filename: string;
  kind: "high_freq" | "choke" | "tests" | "pvt" | "completion" | "vfm_ref" | "pta_ref";
  rows: number;
  wells: string[];
  start: string | null;
  end: string | null;
  uploaded_at: string;
}

export interface EngineStatus {
  ready: boolean;
  error: string | null;
  loaded_in_s: number | null;
  model: {
    type?: string;
    wells?: string[];
    alpha?: number;
    held_out_mape?: Record<string, number>;
    forward_mape?: Record<string, number>;
    n_tests?: number;
  };
  history: { start: string; end: string; rows: number; wells: string[] } | null;
  use_history: boolean;
  recalibrate?: boolean;
  parts: Part[];
  stages: Record<StageName, StageStatus>;
  meta: Record<string, any>;
  period: [string, string] | null;
  reference?: { vfm?: any; pta?: any };
  log: { t: string; level: string; msg: string }[];
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data && (data.detail || data.error)) || `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

export async function engineGet<T = any>(path: string): Promise<T> {
  return parse(await fetch(`${ENGINE_URL}${path}`, { cache: "no-store" }));
}

export async function enginePost<T = any>(path: string, body?: unknown): Promise<T> {
  return parse(
    await fetch(`${ENGINE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

export async function engineDelete<T = any>(path: string): Promise<T> {
  return parse(await fetch(`${ENGINE_URL}${path}`, { method: "DELETE" }));
}

/** Multipart upload with progress (fetch has no upload progress, so XHR). */
export function engineUpload(files: File[], onProgress: (pct: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f, f.name));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${ENGINE_URL}/api/upload`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.detail || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Engine not reachable — is the Python engine running on port 8000?"));
    xhr.send(form);
  });
}

export const exportUrl = (name: string) => `${ENGINE_URL}/api/export/${name}`;

export const fmt = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "—"
    : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const LOCALE: Record<string, string> = { az: "az-Latn-AZ", en: "en-GB", ru: "ru-RU" };
let currentLocale = "en-GB";
export const setDateLocale = (lang: string) => (currentLocale = LOCALE[lang] || "en-GB");

const AZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];

export const fmtDate = (s?: string | null, withTime = false) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  let date: string;
  if (currentLocale.startsWith("az")) {
    // browsers ship no Azerbaijani month names (they print "M07"), so format by hand
    date = `${String(d.getDate()).padStart(2, "0")} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    return withTime ? `${date} ${d.toTimeString().slice(0, 5)}` : date;
  }
  try {
    date = d.toLocaleDateString(currentLocale, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return withTime ? `${date} ${d.toTimeString().slice(0, 5)}` : date;
};

export const tickDate = (t: string) => {
  const d = new Date(t);
  if (currentLocale.startsWith("az")) return `${d.getDate()} ${AZ_MONTHS[d.getMonth()]}`;
  try {
    return d.toLocaleDateString(currentLocale, { day: "numeric", month: "short" });
  } catch {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }
};

export const PART_KINDS: Part["kind"][] = ["high_freq", "choke", "tests", "pvt", "completion", "vfm_ref", "pta_ref"];
