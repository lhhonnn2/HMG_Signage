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
