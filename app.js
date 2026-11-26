/* Cross-Stream Playlist — controller UI.
 *
 * How autoplay works:
 *   Streaming services block embedding (DRM + frame-ancestors), so videos are
 *   opened in a single named "player window". This page keeps a clock for each
 *   item's runtime and, when it runs out, sends the player window to the next
 *   link. Signed-in services autoplay a /watch or /play link on load.
 */
(function () {
  'use strict';
  const C = window.PlaylistCore;
  const STORE_KEY = 'crossStreamPlaylist.v1';
  const PLAYER_NAME = 'crossStreamPlayer';

  // ---------- state ----------
  const state = {
    items: [],
    settings: { loop: false, shuffle: false, buffer: 0, warn: 15 },
    order: [],        // indices into items
    pos: -1,          // position in order
    playing: false,
    paused: false,
    elapsed: 0,
    warned: false,
  };
  let playerWin = null;
  let tick = null;

  const $ = (id) => document.getElementById(id);
  const el = {
    nowPlaying: $('nowPlaying'), bar: $('progressBar'), time: $('timeLabel'),
    play: $('playBtn'), prev: $('prevBtn'), next: $('nextBtn'), stop: $('stopBtn'),
    loop: $('loopChk'), shuffle: $('shuffleChk'), buffer: $('bufferInput'), warn: $('warnInput'),
    form: $('addForm'), url: $('urlInput'), title: $('titleInput'), service: $('serviceInput'),
    duration: $('durationInput'), skip: $('skipInput'),
    list: $('playlist'), empty: $('emptyList'), total: $('totalLabel'),
    exportBtn: $('exportBtn'), importInput: $('importInput'), clear: $('clearBtn'),
    toast: $('toast'), tpl: $('itemTpl'),
  };

  // ---------- persistence ----------
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ items: state.items, settings: state.settings })); } catch (_) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.items = C.normalizeImport(data);
      Object.assign(state.settings, data.settings || {});
    } catch (_) { /* start fresh */ }
  }

  // ---------- helpers ----------
  let toastTimer;
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms || 3500);
  }
  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.05;
      o.connect(g).connect(ctx.destination); o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 180);
    } catch (_) {}
  }
  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, silent: true }); } catch (_) {}
  }
  const current = () => (state.pos >= 0 ? state.items[state.order[state.pos]] : null);
  const durationOf = (item) => C.effectiveDuration(item, state.settings.buffer);

  function buildOrder(startIndex) {
    const n = state.items.length;
    state.order = state.settings.shuffle
      ? C.shuffledOrder(n, startIndex)
      : Array.from({ length: n }, (_, i) => i);
    state.pos = Math.max(0, state.order.indexOf(startIndex));
  }

  // ---------- player window ----------
  function sendToPlayer(url, fromUserGesture) {
    // Prefer navigating the existing window (doesn't trip popup blockers).
    if (playerWin && !playerWin.closed) {
      try { playerWin.location.href = url; return true; } catch (_) { /* fall through */ }
    }
    const w = window.open(url, PLAYER_NAME);
    if (w) { playerWin = w; return true; }
    if (!fromUserGesture) return false;
    toast('Pop-up blocked — allow pop-ups for this page, then press Play again.', 6000);
    return false;
  }

  function startItem(fromUserGesture) {
    const item = current();
    if (!item) return stop();
    state.elapsed = 0;
    state.warned = false;
    state.paused = false;
    state.playing = true;
    const ok = sendToPlayer(item.url, fromUserGesture);
    if (!ok) {
      // Couldn't reach the player window without a click (it was closed, or the
      // site's security headers detached it). Wait for the user.
      state.paused = true;
      showResumePrompt(item);
    }
    if (!tick) tick = setInterval(onTick, 1000);
    render();
  }

  function showResumePrompt(item) {
    el.nowPlaying.classList.add('needs-click');
    chime();
    notify('Up next: ' + item.title, 'Click the playlist tab to continue.');
    toast('Click ▶ Play to open "' + item.title + '"', 8000);
    state.needsClick = true;
  }

  function onTick() {
    if (!state.playing || state.paused) return;
    const item = current();
    if (!item) return;
    state.elapsed += 1;
    const total = durationOf(item);
    const left = total - state.elapsed;
    if (!state.warned && state.settings.warn > 0 && left <= state.settings.warn && left > 0) {
      state.warned = true;
      const nxt = peekNext();
      if (nxt) {
        toast(`Up next in ${left}s: ${nxt.title}`, Math.min(left, 10) * 1000);
        notify('Up next: ' + nxt.title, `Starting in ${left} seconds on ${C.SERVICES[nxt.service].name}`);
      }
    }
    if (state.elapsed >= total) advance(1, false);
    else renderProgress();
  }

  function peekNext() {
    if (state.pos + 1 < state.order.length) return state.items[state.order[state.pos + 1]];
    return state.settings.loop && state.items.length ? state.items[state.order[0]] : null;
  }

  function advance(delta, fromUserGesture) {
    if (!state.items.length) return stop();
    let p = state.pos + delta;
    if (p >= state.order.length) {
      if (!state.settings.loop) { toast('Playlist finished 🎉'); return stop(); }
      if (state.settings.shuffle) { buildOrder(); }
      p = 0;
    }
    if (p < 0) p = state.settings.loop ? state.order.length - 1 : 0;
    state.pos = p;
    startItem(fromUserGesture);
  }

  function playFrom(index) {
    buildOrder(index);
    startItem(true);
  }

  function togglePlay() {
    if (!state.items.length) return toast('Add a video first.');
    if (state.needsClick) {
      state.needsClick = false;
      el.nowPlaying.classList.remove('needs-click');
      return startItem(true);
    }
    if (!state.playing) {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      return playFrom(state.settings.shuffle ? Math.floor(Math.random() * state.items.length) : 0);
    }
    state.paused = !state.paused;
    toast(state.paused
      ? 'Timer paused — pause the video in the player window too.'
      : 'Timer resumed.');
    render();
  }

  function stop() {
    state.playing = false;
    state.paused = false;
    state.needsClick = false;
    state.pos = -1;
    state.elapsed = 0;
    clearInterval(tick); tick = null;
    el.nowPlaying.classList.remove('needs-click');
    render();
  }

  // ---------- rendering ----------
  function renderProgress() {
    const item = current();
    if (!item) {
      el.bar.style.width = '0%';
      el.time.textContent = '--:-- / --:--';
      return;
    }
    const total = durationOf(item);
    el.bar.style.width = Math.min(100, (state.elapsed / total) * 100) + '%';
    el.time.textContent = `${C.formatTime(state.elapsed)} / ${C.formatTime(total)}` +
      (state.paused ? '  (paused)' : '');
  }

  function render() {
    const item = current();
    if (item) {
      const svc = C.SERVICES[item.service];
      el.nowPlaying.classList.remove('empty');
      el.nowPlaying.innerHTML = '';
      const badge = document.createElement('span');
      badge.className = 'badge'; badge.textContent = svc.name; badge.style.background = svc.color;
      const t = document.createElement('strong'); t.textContent = item.title;
      const nxt = peekNext();
      const n = document.createElement('div'); n.className = 'muted small';
      n.textContent = nxt ? `Up next: ${nxt.title} (${C.SERVICES[nxt.service].name})` : 'Last item';
      el.nowPlaying.append(badge, ' ', t, n);
    } else {
      el.nowPlaying.className = 'now-playing empty';
      el.nowPlaying.textContent = 'Nothing playing yet. Add videos, then press Play.';
    }
    el.play.textContent = state.needsClick ? '▶ Continue'
      : !state.playing ? '▶ Play' : state.paused ? '▶ Resume' : '⏸ Pause';
    renderProgress();
    renderList();
  }

  function renderList() {
    el.list.innerHTML = '';
    el.empty.hidden = state.items.length > 0;
    const playingIdx = state.playing ? state.order[state.pos] : -1;
    let total = 0;
    state.items.forEach((item, i) => {
      total += durationOf(item);
      const svc = C.SERVICES[item.service];
      const li = el.tpl.content.firstElementChild.cloneNode(true);
      li.dataset.index = i;
      if (i === playingIdx) li.classList.add('playing');
      const b = li.querySelector('.badge');
      b.textContent = svc.name; b.style.background = svc.color;
      li.querySelector('.title').textContent = item.title;
      li.querySelector('.sub').textContent =
        C.formatTime(item.duration) + (item.skip ? ` · skip ${C.formatTime(item.skip)}` : '');
      li.querySelector('.up').disabled = i === 0;
      li.querySelector('.down').disabled = i === state.items.length - 1;
      el.list.appendChild(li);
    });
    el.total.textContent = state.items.length
      ? `· ${state.items.length} video${state.items.length > 1 ? 's' : ''} · ${C.formatTime(total)}`
      : '';
  }

  // Keep the "now playing" pointer stable when items move.
  function mutateItems(fn) {
    const curItem = state.playing ? current() : null;
    fn();
    save();
    if (curItem) {
      const idx = state.items.indexOf(curItem);
      if (idx === -1) { // removed the playing item: keep going from the same slot
        if (!state.items.length) return stop();
        buildOrder(Math.min(state.order[state.pos], state.items.length - 1));
        startItem(true);
        return;
      }
      if (state.settings.shuffle) {
        // rebuild order, keeping remaining unplayed items after current
        buildOrder(idx);
      } else {
        state.order = state.items.map((_, i) => i);
        state.pos = idx;
      }
    }
    render();
  }

  // ---------- events ----------
  function fillServices() {
    for (const [key, svc] of Object.entries(C.SERVICES)) {
      const o = document.createElement('option');
      o.value = key; o.textContent = svc.name;
      el.service.appendChild(o);
    }
  }

  el.url.addEventListener('input', () => {
    const s = C.detectService(el.url.value);
    if (s !== 'other' || !el.url.value) el.service.value = s;
  });

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = el.url.value.trim();
    try { new URL(url); } catch (_) { return toast('That link doesn’t look valid.'); }
    const duration = C.parseDuration(el.duration.value);
    if (!isFinite(duration) || duration <= 0) return toast('Runtime not understood — try "42" or "1h 58m".');
    const skip = el.skip.value.trim() ? C.parseDuration(el.skip.value) : 0;
    if (!isFinite(skip) || skip < 0) return toast('“Skip first” not understood — try "1:30".');
    if (skip >= duration) return toast('“Skip first” must be shorter than the runtime.');
    mutateItems(() => state.items.push({
      id: C.uid(), url,
      title: el.title.value.trim() || C.guessTitle(url),
      service: el.service.value || C.detectService(url),
      duration, skip,
    }));
    el.form.reset();
    el.service.value = 'other';
    el.url.focus();
    toast('Added to playlist.');
  });

  el.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    const li = e.target.closest('li.item');
    if (!btn || !li) return;
    const i = Number(li.dataset.index);
    if (btn.classList.contains('play-one')) return playFrom(i);
    if (btn.classList.contains('remove')) return mutateItems(() => state.items.splice(i, 1));
    const j = btn.classList.contains('up') ? i - 1 : btn.classList.contains('down') ? i + 1 : -1;
    if (j >= 0 && j < state.items.length) {
      mutateItems(() => { [state.items[i], state.items[j]] = [state.items[j], state.items[i]]; });
    }
  });

  // drag & drop reordering
  let dragFrom = -1;
  el.list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li.item'); if (!li) return;
    dragFrom = Number(li.dataset.index);
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  el.list.addEventListener('dragover', (e) => { if (dragFrom >= 0) e.preventDefault(); });
  el.list.addEventListener('drop', (e) => {
    e.preventDefault();
    const li = e.target.closest('li.item');
    const to = li ? Number(li.dataset.index) : state.items.length - 1;
    const from = dragFrom; dragFrom = -1;
    if (from < 0 || from === to) return render();
    mutateItems(() => { const [it] = state.items.splice(from, 1); state.items.splice(to, 0, it); });
  });
  el.list.addEventListener('dragend', () => { dragFrom = -1; renderList(); });

  el.play.addEventListener('click', togglePlay);
  el.next.addEventListener('click', () => state.playing ? advance(1, true) : playFrom(0));
  el.prev.addEventListener('click', () => {
    if (!state.playing) return;
    if (state.elapsed > 10) startItem(true); // restart current, like a music player
    else advance(-1, true);
  });
  el.stop.addEventListener('click', stop);

  el.loop.addEventListener('change', () => { state.settings.loop = el.loop.checked; save(); render(); });
  el.shuffle.addEventListener('change', () => {
    state.settings.shuffle = el.shuffle.checked; save();
    if (state.playing) buildOrder(state.order[state.pos]);
    render();
  });
  el.buffer.addEventListener('change', () => { state.settings.buffer = Number(el.buffer.value) || 0; save(); render(); });
  el.warn.addEventListener('change', () => { state.settings.warn = Math.max(0, Number(el.warn.value) || 0); save(); });

  el.exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, items: state.items, settings: state.settings }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-streaming-playlist.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  el.importInput.addEventListener('change', async () => {
    const file = el.importInput.files[0];
    el.importInput.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const items = C.normalizeImport(data);
      const replace = !state.items.length || confirm(`Replace your current playlist with ${items.length} imported video(s)?\nCancel = add them to the end instead.`);
      stop();
      state.items = replace ? items : state.items.concat(items);
      if (data.settings) Object.assign(state.settings, data.settings);
      save(); syncSettingsUI(); render();
      toast(`Imported ${items.length} video(s).`);
    } catch (err) {
      toast('Import failed: ' + err.message, 6000);
    }
  });

  el.clear.addEventListener('click', () => {
    if (!state.items.length || !confirm('Remove every video from the playlist?')) return;
    stop(); state.items = []; save(); render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' || e.key === 'n') { if (state.playing) advance(1, true); }
    else if (e.key === 'ArrowLeft' || e.key === 'p') { if (state.playing) advance(-1, true); }
  });

  // Keep the timer honest when the tab is backgrounded (browsers throttle setInterval).
  let lastWall = Date.now();
  setInterval(() => {
    const now = Date.now();
    const drift = Math.floor((now - lastWall) / 1000) - 1;
    lastWall = now;
    if (drift > 0 && state.playing && !state.paused) {
      state.elapsed += Math.min(drift, 3600);
    }
  }, 1000);

  window.addEventListener('beforeunload', (e) => {
    if (state.playing) { e.preventDefault(); e.returnValue = ''; }
  });

  function syncSettingsUI() {
    el.loop.checked = !!state.settings.loop;
    el.shuffle.checked = !!state.settings.shuffle;
    el.buffer.value = state.settings.buffer;
    el.warn.value = state.settings.warn;
  }

  // ---------- boot ----------
  fillServices();
  el.service.value = 'other';
  load();
  syncSettingsUI();
  render();
})();
