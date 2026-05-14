export function fuzzyMatch(
  query: string,
  target: string,
): { score: number; indices: number[] } | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return { score: 0, indices: [] };
  if (q.length > t.length * 2) return null;

  const indices: number[] = [];
  let qi = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }

  const matched = indices.length;
  if (matched === 0) return null;

  const ratio = matched / q.length;
  if (ratio < 0.75) return null;

  let score = (1 - ratio) * 100;

  for (let i = 1; i < indices.length; i++) {
    const gap = indices[i] - indices[i - 1] - 1;
    score += gap;
  }

  if (indices.length > 0 && indices[0] > 0) {
    score += indices[0] * 2;
  }

  for (const idx of indices) {
    if (idx === 0 || "-_/ ~".includes(t[idx - 1])) {
      score -= 5;
    }
  }

  score += t.length * 0.1;

  return { score, indices };
}
