// 구분(DX/DP) → 브랜드 → 카테고리 선택 로직 (화면과 서버가 같이 씀).
//
// 카테고리 하나 = (구분, 브랜드, 이름) 한 조합. 같은 이름이 여러 브랜드에 있을 수 있음.
// 직원의 선택 = 세 줄(구분/브랜드/카테고리이름)의 칩. 규칙:
//   - 같은 줄 안에서는 "또는", 줄끼리는 "그리고".
//   - 아무것도 안 고른 줄은 제한 없음(모두 허용). 단, 세 줄 모두 비어 있으면 아무것도 받지 않음.
//   - 각 줄에 보이는 칩은 "다른 두 줄의 선택과 실제로 이어지는 것"만 (예: 제네시스를 고르면
//     제네시스에 없는 카테고리는 사라지고, 반대로 카테고리를 먼저 고르면 그 카테고리가 있는
//     브랜드만 남음).

export const DIVISIONS = ["DX", "DP"];
export const BRANDS = ["현대", "기아", "제네시스", "HMG"];
export const LEAD_OPTIONS = [1, 3, 5, 10, 15, 20, 30];

export type CatInfo = { division: string; brand: string; name: string };
export type Facets = { divisions: string[]; brands: string[]; names: string[] };
export type FacetKey = keyof Facets;

export const emptyFacets = (): Facets => ({ divisions: [], brands: [], names: [] });

const FIELD: Record<FacetKey, keyof CatInfo> = { divisions: "division", brands: "brand", names: "name" };

function passes(cat: CatInfo, f: Facets, skip?: FacetKey) {
  return (["divisions", "brands", "names"] as FacetKey[]).every(
    (k) => k === skip || f[k].length === 0 || f[k].includes(cat[FIELD[k]])
  );
}

function uniq(a: string[]) {
  return Array.from(new Set(a));
}

function ordered(values: string[], preferred: string[]) {
  const rest = values.filter((v) => !preferred.includes(v)).sort((a, b) => a.localeCompare(b, "ko"));
  return [...preferred.filter((p) => values.includes(p)), ...rest];
}

export function facetOptions(cats: CatInfo[], f: Facets): Facets {
  const opt = (k: FacetKey, preferred: string[]) =>
    ordered(uniq(cats.filter((c) => passes(c, f, k)).map((c) => c[FIELD[k]])), preferred);
  return { divisions: opt("divisions", DIVISIONS), brands: opt("brands", BRANDS), names: opt("names", []) };
}

export function facetActive(f: Facets) {
  return f.divisions.length + f.brands.length + f.names.length > 0;
}

// Drops selected chips that no longer connect to the other rows' selections.
export function pruneFacets(cats: CatInfo[], f: Facets): Facets {
  let cur = f;
  for (let i = 0; i < 6; i++) {
    const o = facetOptions(cats, cur);
    const next: Facets = {
      divisions: cur.divisions.filter((v) => o.divisions.includes(v)),
      brands: cur.brands.filter((v) => o.brands.includes(v)),
      names: cur.names.filter((v) => o.names.includes(v))
    };
    if (next.divisions.length === cur.divisions.length && next.brands.length === cur.brands.length && next.names.length === cur.names.length) {
      return next;
    }
    cur = next;
  }
  return cur;
}

export function toggleFacet(cats: CatInfo[], f: Facets, key: FacetKey, value: string): Facets {
  const has = f[key].includes(value);
  return pruneFacets(cats, { ...f, [key]: has ? f[key].filter((v) => v !== value) : [...f[key], value] });
}

// "전체선택" for one row = every chip currently visible in that row.
export function selectAllInRow(cats: CatInfo[], f: Facets, key: FacetKey): Facets {
  return pruneFacets(cats, { ...f, [key]: facetOptions(cats, f)[key] });
}

export function clearRow(f: Facets, key: FacetKey): Facets {
  return { ...f, [key]: [] };
}

export function selectEverything(cats: CatInfo[]): Facets {
  const o = facetOptions(cats, emptyFacets());
  return { divisions: o.divisions, brands: o.brands, names: o.names };
}

export function catMatches(cat: CatInfo, f: Facets) {
  return facetActive(f) && passes(cat, f);
}

export function catLabel(c: CatInfo) {
  return `${c.division} · ${c.brand} · ${c.name}`;
}
