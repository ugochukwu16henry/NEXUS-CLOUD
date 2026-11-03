/** Pick relevant files. The whole repository is never the default context. */

export type RepoFile = { path: string; text: string };

const TOKEN = /[a-z0-9_./-]{3,}/gi;

export function selectContext(files: readonly RepoFile[], query: string, limit = 12): RepoFile[] {
  if (limit <= 0) return [];
  const terms = (query.toLowerCase().match(TOKEN) ?? []).filter((term) => term.length > 2);
  const scored = files.map((file) => {
    const path = file.path.toLowerCase();
    const text = file.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (path.includes(term)) score += 5;
      if (text.includes(term)) score += 1;
    }
    return { file, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
    .slice(0, limit)
    .map((item) => item.file);
}
