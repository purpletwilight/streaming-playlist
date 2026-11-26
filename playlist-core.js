/* Pure helpers shared by the browser app and the Node tests. */
(function (root) {
  'use strict';

  const SERVICES = {
    paramount: { name: 'Paramount+', color: '#0064ff', hosts: ['paramountplus.com'] },
    disney:    { name: 'Disney+',    color: '#113ccf', hosts: ['disneyplus.com'] },
    max:       { name: 'HBO Max',    color: '#7b2ff7', hosts: ['max.com', 'hbomax.com'] },
    peacock:   { name: 'Peacock',    color: '#111111', hosts: ['peacocktv.com'] },
    other:     { name: 'Other',      color: '#555555', hosts: [] },
  };

  /** Return the service key for a URL, or 'other'. */
  function detectService(url) {
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return 'other'; }
    for (const [key, svc] of Object.entries(SERVICES)) {
      if (svc.hosts.some((h) => host === h || host.endsWith('.' + h))) return key;
    }
    return 'other';
  }

  /**
   * Parse a human duration into seconds.
   * Accepts: "42" (minutes), "42m", "1h 58m", "1h58m30s", "1:58:00" (H:MM:SS), "58:30" (M:SS), "90s".
   * Returns NaN when it can't be parsed.
   */
  function parseDuration(input) {
    if (input == null) return NaN;
    const s = String(input).trim().toLowerCase();
    if (!s) return NaN;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60); // bare number = minutes
    if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
      const parts = s.split(':').map(Number);
      if (parts.slice(1).some((p) => p >= 60)) return NaN;
      // "M:SS" or "H:MM:SS" — same as a video player's clock.
      return parts.reduce((acc, p) => acc * 60 + p, 0);
    }
    const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/g;
    let total = 0, matched = '', m;
    while ((m = re.exec(s))) {
      const n = parseFloat(m[1]);
      const u = m[2][0];
      total += u === 'h' ? n * 3600 : u === 'm' ? n * 60 : n;
      matched += m[0];
    }
    if (!matched || s.replace(/[\s,]/g, '') !== matched.replace(/\s/g, '')) return NaN;
    return Math.round(total);
  }

  /** Format seconds as H:MM:SS or M:SS. */
  function formatTime(sec) {
    if (!isFinite(sec)) return '--:--';
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  /** Make a title from a URL slug when the user leaves it blank. */
  function guessTitle(url) {
    try {
      const u = new URL(url);
      const segs = u.pathname.split('/').filter(Boolean)
        .filter((p) => !/^(video|videos|watch|play|playback|vod|movies?|shows?|series|episode|details|[0-9a-f-]{16,}|[A-Za-z0-9]{12,})$/i.test(p));
      const slug = segs.sort((a, b) => b.length - a.length)[0];
      if (slug && /[a-z]/i.test(slug)) {
        return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
      }
    } catch (_) { /* fall through */ }
    return 'Untitled video';
  }

  /** Seconds an item should play before advancing. bufferMin may be negative. */
  function effectiveDuration(item, bufferMin) {
    const base = (item.duration || 0) - (item.skip || 0);
    return Math.max(10, base + (Number(bufferMin) || 0) * 60);
  }

  /** Fisher–Yates shuffle of indices, keeping `first` (if given) at position 0. */
  function shuffledOrder(length, first, rand) {
    rand = rand || Math.random;
    const idx = Array.from({ length }, (_, i) => i).filter((i) => i !== first);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return first != null && first >= 0 && first < length ? [first, ...idx] : idx;
  }

  /** Validate & normalise an imported playlist. Throws on bad input. */
  function normalizeImport(data) {
    const items = Array.isArray(data) ? data : data && data.items;
    if (!Array.isArray(items)) throw new Error('File has no "items" list.');
    return items.map((it, i) => {
      if (!it || typeof it.url !== 'string') throw new Error(`Item ${i + 1} is missing a url.`);
      try { new URL(it.url); } catch (_) { throw new Error(`Item ${i + 1} has an invalid url.`); }
      const duration = typeof it.duration === 'number' ? it.duration : parseDuration(it.duration);
      if (!isFinite(duration) || duration <= 0) throw new Error(`Item ${i + 1} has an invalid duration.`);
      const skip = typeof it.skip === 'number' ? it.skip : (it.skip ? parseDuration(it.skip) : 0);
      return {
        id: it.id || uid(),
        url: it.url,
        title: String(it.title || guessTitle(it.url)).slice(0, 200),
        service: SERVICES[it.service] ? it.service : detectService(it.url),
        duration,
        skip: isFinite(skip) && skip > 0 ? skip : 0,
      };
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const api = { SERVICES, detectService, parseDuration, formatTime, guessTitle, effectiveDuration, shuffledOrder, normalizeImport, uid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlaylistCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
