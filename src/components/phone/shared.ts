import type { PhoneCategoryRow } from "@/lib/types";
import { BRANDS, DIVISIONS } from "@/lib/facets";

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sortCats(cats: PhoneCategoryRow[]) {
  const di = (d: string) => (DIVISIONS.includes(d) ? DIVISIONS.indexOf(d) : 99);
  const bi = (b: string) => (BRANDS.includes(b) ? BRANDS.indexOf(b) : 99);
  return [...cats].sort((a, b) => di(a.division) - di(b.division) || bi(a.brand) - bi(b.brand) || a.name.localeCompare(b.name, "ko"));
}

export function optionLabel(c: PhoneCategoryRow) {
  return `${c.division} · ${c.brand} · ${c.name}`;
}

// "2026-11-07 15:59" in Korea time
export function fmtKst(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())} ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}

// "3분 전", "2시간 전", "5일 전"
export function agoText(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "기록 없음";
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
