/*
 * Shared content helpers for the player blocks.
 */

/* URL-safe slug from a title — ASCII survives, diacritics strip, Cyrillic/CJK
   drop out (the romanised part usually remains); empty falls back to item-N. */
export function slugify(str) {
  return str
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* Turn parsed entries into the final ordered item list, expanding any Apple
   playlist/album references via the catalog API. `finalize(item, index)` is
   block-specific (adds slug/wallpaper/etc). Expansion failures drop that entry. */
export async function resolveEntries(entries, apple, finalize) {
  const resolved = await Promise.all(entries.map(async (e) => {
    if (e.kind === 'track') return [e.track];
    if (!apple) return [];
    try { return await apple.expand(e.apple); } catch (err) { return []; }
  }));
  return resolved.flat().map((t, i) => finalize(t, i));
}
