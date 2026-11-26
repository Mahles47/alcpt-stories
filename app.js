/* ALCPT Stories — App Logic
   Data: window.EPISODES = [{id,title,tense,voices:{SPK:'M'|'F'},lines:[{s,t,ar}]}] */
(function () {
  'use strict';
  const PLAY_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';

  // ---------- State ----------
  const EPISODES = Array.isArray(window.EPISODES) ? window.EPISODES : [];
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const state = {
    completed: new Set(store.get('st_completed', [])),
    positions: store.get('st_positions', {}),       // epId -> line index
    vocab: store.get('st_vocab', []),               // [{w, ep, line, sentence}]
    settings: Object.assign({ voiceMale: '', voiceFemale: '', rate: 0.95 }, store.get('st_settings', {})),
    showTranslation: store.get('st_showtr', false),
    mode: 'normal',
    wordMode: false,
    autoPlay: true,
    currentEp: null,
    currentLine: 0,
    playing: false,
    paused: false,
    filter: '',
    tenseFilter: 'all',
    voices: [],
    speed: store.get('st_speed', 1),
    audioMode: false,
    sleepTimer: null,
    sleepMin: 0,
    view: 'list' // list | player | vocab
  };

  const TENSE_AR = {
    'present simple': 'المضارع البسيط',
    'present continuous': 'المضارع المستمر',
    'present perfect': 'المضارع التام',
    'present perfect continuous': 'المضارع التام المستمر',
    'past simple': 'الماضي البسيط',
    'past continuous': 'الماضي المستمر',
    'past perfect': 'الماضي التام',
    'past perfect continuous': 'الماضي التام المستمر',
    'future simple': 'المستقبل البسيط',
    'future continuous': 'المستقبل المستمر',
    'future perfect': 'المستقبل التام',
    'future perfect continuous': 'المستقبل التام المستمر'
  };
  const TENSE_ORDER = ['present simple','present continuous','present perfect','present perfect continuous','past simple','past continuous','past perfect','past perfect continuous','future simple','future continuous','future perfect','future perfect continuous'];

  // ---------- Elements ----------
  const $ = (id) => document.getElementById(id);
  const listView = $('listView'), playerView = $('playerView'), vocabView = $('vocabView');
  const searchBox = $('searchBox'), progressText = $('progressText'), progressFill = $('progressFill');
  const tenseFilters = $('tenseFilters'), continueSlot = $('continueSlot');
  const playerTitle = $('playerTitle'), playerSub = $('playerSub'), linesContainer = $('linesContainer');
  const controlBar = $('controlBar'), statusText = $('statusText');
  const playBtn = $('playBtn');
  const back30Btn = $('back30Btn'), fwd30Btn = $('fwd30Btn'), speedBtn = $('speedBtn'), sleepBtn = $('sleepBtn');
  const autoPlayToggle = $('autoPlayToggle'), wordModeToggle = $('wordModeToggle'), revealAllBtn = $('revealAllBtn');
  const trToggle = $('trToggle');
  const vocabBtn = $('vocabBtn'), vocabCount = $('vocabCount'), vocabList = $('vocabList');
  const settingsModal = $('settingsModal'), voiceMaleSel = $('voiceMale'), voiceFemaleSel = $('voiceFemale');
  const rateSlider = $('rateSlider'), rateValue = $('rateValue');
  const toast = $('toast');

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  // ---------- Progress ----------
  function updateProgress() {
    const done = state.completed.size;
    progressText.textContent = `${done} / ${EPISODES.length}`;
    progressFill.style.width = `${(done / (EPISODES.length || 1)) * 100}%`;
    vocabCount.textContent = state.vocab.length;
  }

  // ---------- Home list ----------
  function renderTenseFilters() {
    const present = new Set(EPISODES.map(e => e.tense));
    const chips = [`<button class="tense-chip active" data-tense="all">الكل</button>`];
    TENSE_ORDER.forEach(t => {
      if (present.has(t)) chips.push(`<button class="tense-chip" data-tense="${esc(t)}">${TENSE_AR[t] || t}</button>`);
    });
    tenseFilters.innerHTML = chips.join('');
    tenseFilters.querySelectorAll('.tense-chip').forEach(ch => {
      ch.addEventListener('click', () => {
        state.tenseFilter = ch.dataset.tense;
        tenseFilters.querySelectorAll('.tense-chip').forEach(c => c.classList.toggle('active', c === ch));
        renderList();
      });
    });
  }

  function estMinutes(ep) {
    const chars = ep.lines.reduce((a, l) => a + l.t.length, 0);
    return Math.max(1, Math.round(chars / 900));
  }

  function renderContinue() {
    const inprog = EPISODES.filter(e => state.positions[e.id] > 0 && !state.completed.has(e.id));
    if (!inprog.length) { continueSlot.innerHTML = ''; return; }
    const ep = inprog[inprog.length - 1];
    const pos = state.positions[ep.id] || 0;
    continueSlot.innerHTML = `
      <div class="continue-card" id="continueCard">
        <div class="continue-play"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
        <div class="continue-info">
          <div class="continue-label">كمّل من حيث وقفت</div>
          <div class="continue-title">${ep.id}. ${esc(ep.title)}</div>
          <div class="continue-sub">السطر ${pos + 1} من ${ep.lines.length}</div>
        </div>
      </div>`;
    $('continueCard').addEventListener('click', () => openEpisode(ep.id, pos));
  }

  function renderList() {
    const term = state.filter.trim().toLowerCase();
    let eps = EPISODES.filter(ep => {
      if (state.tenseFilter !== 'all' && ep.tense !== state.tenseFilter) return false;
      if (!term) return true;
      return ep.title.toLowerCase().includes(term) ||
        String(ep.id) === term ||
        ep.lines.some(l => l.t.toLowerCase().includes(term));
    });
    if (!eps.length) { listView.innerHTML = '<div class="empty-list">مفيش حلقات مطابقة</div>'; return; }
    let html = '';
    let lastTense = null;
    eps.forEach(ep => {
      if (state.tenseFilter === 'all' && !term && ep.tense !== lastTense) {
        lastTense = ep.tense;
        html += `<div class="tense-group-title">${TENSE_AR[ep.tense] || ep.tense} <span class="en">${esc(ep.tense)}</span></div>`;
      }
      const done = state.completed.has(ep.id);
      const pos = state.positions[ep.id] || 0;
      const inprog = pos > 0 && !done;
      html += `
        <div class="ep-card ${done ? 'completed' : ''}" data-id="${ep.id}">
          <div class="ep-num">${ep.id}</div>
          <div class="ep-info">
            <div class="ep-title">${esc(ep.title)}</div>
            <div class="ep-meta"><span>${TENSE_AR[ep.tense] || ''}</span><span>~${estMinutes(ep)} دقيقة</span><span>${ep.lines.length} سطر</span></div>
          </div>
          <div class="ep-state">${done ? '<span class="inprog">تمت</span>' : inprog ? '<span class="inprog">بتسمعها</span>' : ''}</div>
        </div>`;
    });
    listView.innerHTML = html;
    listView.querySelectorAll('.ep-card').forEach(c => c.addEventListener('click', () => openEpisode(+c.dataset.id)));
  }

  // ---------- Views ----------
  function showView(v) {
    state.view = v;
    document.querySelector('.app-header').style.display = v === 'list' ? '' : 'none';
    tenseFilters.style.display = v === 'list' ? '' : 'none';
    continueSlot.style.display = v === 'list' ? '' : 'none';
    listView.style.display = v === 'list' ? '' : 'none';
    playerView.classList.toggle('active', v === 'player');
    vocabView.classList.toggle('active', v === 'vocab');
    controlBar.classList.toggle('active', v === 'player');
    window.scrollTo(0, 0);
  }

  // ---------- Player ----------
  function openEpisode(id, startAt) {
    const ep = EPISODES.find(e => e.id === id);
    if (!ep) return;
    stopSpeaking();
    state.currentEp = ep;
    state.currentLine = Math.min(startAt || 0, ep.lines.length - 1);
    state.playing = false; state.paused = false;
    playerTitle.textContent = `\u200E${ep.id}. ${ep.title}`;
    playerSub.textContent = TENSE_AR[ep.tense] || ep.tense;
    const hasTr = ep.lines.some(l => l.ar);
    trToggle.style.display = hasTr ? '' : 'none';
    trToggle.classList.toggle('on', state.showTranslation);
    revealAllBtn.style.display = state.mode === 'blind' ? '' : 'none';
    showView('player');
    renderLines();
    updateStatus();
  }

  function savedWordSet() { return new Set(state.vocab.map(v => v.w.toLowerCase())); }

  function wrapWords(text) {
    const saved = savedWordSet();
    return text.split(/(\s+)/).map(tok => {
      if (!/[A-Za-z]/.test(tok)) return esc(tok);
      const clean = tok.replace(/[^A-Za-z'’-]/g, '');
      const cls = saved.has(clean.toLowerCase()) ? 'w saved' : 'w';
      return `<span class="${cls}" data-w="${esc(clean)}">${esc(tok)}</span>`;
    }).join('');
  }

  function renderLines() {
    const ep = state.currentEp;
    if (!ep) return;
    linesContainer.classList.toggle('word-mode', state.wordMode);
    linesContainer.classList.toggle('lyric', state.mode !== 'dictation');
    linesContainer.innerHTML = ep.lines.map((l, i) => {
      const isNarr = l.s === 'NARRATOR';
      const gender = ep.voices[l.s] || 'M';
      const icon = '';
      const name = isNarr ? 'الراوي' : l.s;
      let body;
      if (state.mode === 'dictation') {
        body = `
          <div class="dict-box" data-idx="${i}">
            <input type="text" class="dict-input" id="dict-in-${i}" placeholder="اكتب اللي سمعته..." autocomplete="off" autocapitalize="off" spellcheck="false">
            <div class="dict-actions">
              <button class="dict-btn check" data-act="check" data-idx="${i}">تحقق</button>
              <button class="dict-btn" data-act="hear" data-idx="${i}">اسمع</button>
              <button class="dict-btn" data-act="show" data-idx="${i}">النص</button>
            </div>
            <div class="dict-result" id="dict-res-${i}"></div>
          </div>`;
      } else {
        const blurred = state.mode === 'blind' && !l._revealed;
        const txt = state.wordMode ? wrapWords(l.t) : esc(l.t);
        body = `<div class="en">${txt}</div>` +
          (state.showTranslation && l.ar ? `<div class="ar">${esc(l.ar)}</div>` : '') +
          (blurred ? '<div class="reveal-hint">دوس عشان تظهر السطر</div>' : '');
      }
      return `<div class="line ${isNarr ? 'narrator' : 'character'} ${state.mode === 'blind' && !l._revealed ? 'blurred' : ''}" data-idx="${i}">
        <div class="speaker">${icon} ${esc(name)}</div>${body}</div>`;
    }).join('');

    linesContainer.querySelectorAll('.line').forEach(el => {
      el.addEventListener('click', (ev) => {
        const idx = +el.dataset.idx;
        if (state.wordMode && ev.target.classList && ev.target.classList.contains('w')) {
          collectWord(ev.target.dataset.w, idx);
          return;
        }
        if (state.mode === 'dictation') return;
        if (state.mode === 'blind' && el.classList.contains('blurred')) {
          state.currentEp.lines[idx]._revealed = true;
          renderLines(); markCurrent();
          return;
        }
        playLine(idx);
      });
    });
    linesContainer.querySelectorAll('.dict-btn').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const idx = +b.dataset.idx;
        const act = b.dataset.act;
        if (act === 'hear') playLine(idx);
        else if (act === 'check') checkDictation(idx);
        else if (act === 'show') {
          const r = $('dict-res-' + idx);
          r.innerHTML = `<span style="color:var(--text-secondary)">${esc(state.currentEp.lines[idx].t)}</span>`;
        }
      });
    });
    markCurrent(false);
  }

  function markCurrent(smooth) {
    const pos = state.positions[state.currentEp.id] || 0;
    let playingEl = null;
    linesContainer.querySelectorAll('.line').forEach(el => {
      const i = +el.dataset.idx;
      const isCur = i === state.currentLine;
      el.classList.toggle('playing', isCur);
      el.classList.toggle('done', i < pos);
      if (isCur) playingEl = el;
    });
    if (playingEl && state.mode !== 'dictation') {
      const hd = document.querySelector('.player-head');
      const y = playingEl.getBoundingClientRect().top + window.pageYOffset - ((hd ? hd.offsetHeight : 0) + Math.round(window.innerHeight * 0.14));
      window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
    }
  }

  function updateStatus() {
    const ep = state.currentEp;
    if (!ep) { statusText.textContent = ''; return; }
    statusText.textContent = `السطر ${state.currentLine + 1} من ${ep.lines.length}`;
  }

  function savePosition() {
    state.positions[state.currentEp.id] = state.currentLine;
    store.set('st_positions', state.positions);
  }

  // ---------- Recorded audio (per-line mp3) ----------
  const AUDIO_EMBED = window.AUDIO_EMBED || {};   // epId -> [dataURI, ...]
  const AUDIO_DURS = window.AUDIO_DURS || {};     // epId -> [seconds, ...]
  const AUDIO_BASE = typeof window.AUDIO_BASE === 'string' ? window.AUDIO_BASE : ''; // e.g. 'audio/' when hosted
  const audio = new Audio();
  audio.preload = 'auto';

  function audioSrc(ep, idx) {
    const emb = AUDIO_EMBED[ep.id];
    if (emb && emb[idx]) return emb[idx];
    if (AUDIO_BASE) return AUDIO_BASE + ep.id + '/' + idx + '.mp3';
    return null;
  }

  function lineDur(ep, idx) {
    const d = AUDIO_DURS[ep.id];
    if (d && d[idx]) return d[idx];
    const words = ep.lines[idx].t.split(/\s+/).length;
    return words / 2.5 / (state.settings.rate || 1) + 0.5;
  }

  // ---------- TTS ----------
  function loadVoices() {
    state.voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'));
    EPISODES.forEach(e => { delete e._vmap; });
    fillVoiceSelects();
  }

  function fillVoiceSelects() {
    const opts = state.voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    voiceMaleSel.innerHTML = opts || '<option value="">صوت النظام</option>';
    voiceFemaleSel.innerHTML = opts || '<option value="">صوت النظام</option>';
    if (state.settings.voiceMale) voiceMaleSel.value = state.settings.voiceMale;
    if (state.settings.voiceFemale) voiceFemaleSel.value = state.settings.voiceFemale;
  }

  function pickVoice(gender) {
    const uri = gender === 'F' ? state.settings.voiceFemale : state.settings.voiceMale;
    let v = state.voices.find(x => x.voiceURI === uri);
    if (v) return v;
    // heuristics
    const en = state.voices;
    if (gender === 'F') {
      v = en.find(x => /female|zira|susan|hazel|kate|serena|aria|samantha/i.test(x.name));
      if (!v) v = en.find(x => /en-GB/i.test(x.lang)) || en[0];
    } else {
      v = en.find(x => /male|david|daniel|george|ryan|brian|alex|fred/i.test(x.name) && !/female/i.test(x.name));
      if (!v) v = en.find(x => /en-US/i.test(x.lang)) || en[0];
    }
    return v || null;
  }

  // Distinct voice per character: cycle available voices, vary pitch as fallback
  const MALE_HINT = /male|david|daniel|george|ryan|brian|alex|fred|guy|christopher|eric|andrew|james|thomas/i;
  const FEMALE_HINT = /female|zira|susan|hazel|kate|serena|aria|samantha|jenny|michelle|natasha|sonia|libby/i;
  function voiceMapFor(ep) {
    if (ep._vmap) return ep._vmap;
    const males = [], females = [];
    ep.lines.forEach(l => {
      const g = ep.voices[l.s] || 'M';
      if (g === 'F' && !females.includes(l.s)) females.push(l.s);
      if (g !== 'F' && !males.includes(l.s)) males.push(l.s);
    });
    const en = state.voices;
    let poolM = en.filter(v => MALE_HINT.test(v.name) && !FEMALE_HINT.test(v.name));
    let poolF = en.filter(v => FEMALE_HINT.test(v.name));
    if (!poolM.length) poolM = en.filter(v => !poolF.includes(v));
    if (!poolM.length) poolM = en;
    if (!poolF.length) poolF = en;
    // user-picked voices lead their pools
    const lead = (pool, uri) => {
      const i = pool.findIndex(v => v.voiceURI === uri);
      if (i > 0) pool = [pool[i], ...pool.slice(0, i), ...pool.slice(i + 1)];
      return pool;
    };
    poolM = lead(poolM, state.settings.voiceMale);
    poolF = lead(poolF, state.settings.voiceFemale);
    const pitchM = [0.95, 1.1, 0.8, 1.25, 1.0];
    const pitchF = [1.1, 1.25, 0.95, 1.35];
    const map = {};
    males.forEach((s, i) => { map[s] = { voice: poolM[i % poolM.length] || null, pitch: pitchM[i % pitchM.length] }; });
    females.forEach((s, i) => { map[s] = { voice: poolF[i % poolF.length] || null, pitch: pitchF[i % pitchF.length] }; });
    ep._vmap = map;
    return map;
  }

  function speak(text, speaker, onend) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const ep = state.currentEp;
    let pitch = 1;
    let v = null;
    if (ep && speaker && Object.prototype.hasOwnProperty.call(ep.voices, speaker)) {
      const entry = voiceMapFor(ep)[speaker];
      if (entry) { v = entry.voice; pitch = entry.pitch; }
    }
    if (!v) {
      const g = (ep && speaker && ep.voices[speaker]) || (speaker === 'F' ? 'F' : 'M');
      v = pickVoice(g);
    }
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
    u.rate = Math.min(3, (state.settings.rate || 1) * (state.speed || 1));
    u.pitch = pitch;
    u.onend = () => onend && onend();
    u.onerror = () => onend && onend();
    speechSynthesis.speak(u);
  }

  function playLine(idx, offset) {
    const ep = state.currentEp;
    if (!ep) return;
    state.currentLine = idx;
    savePosition();
    markCurrent(); updateStatus();
    const l = ep.lines[idx];
    state.playing = true; state.paused = false;
    playBtn.innerHTML = PAUSE_SVG;
    const onend = () => {
      if (!state.playing) return;
      if (state.autoPlay && idx < ep.lines.length - 1) {
        playLine(idx + 1);
      } else {
        state.playing = false;
        playBtn.innerHTML = PLAY_SVG;
        if (idx >= ep.lines.length - 1) finishEpisode();
      }
    };
    const src = audioSrc(ep, idx);
    if (src) {
      state.audioMode = true;
      speechSynthesis.cancel();
      audio.onended = onend;
      audio.onerror = () => { state.audioMode = false; speak(l.t, l.s, onend); };
      audio.playbackRate = state.speed || 1;
      if (audio.dataset.src !== src) { audio.src = src; audio.dataset.src = src; }
      const startAt = offset || 0;
      const begin = () => {
        try { if (startAt > 0) audio.currentTime = startAt; } catch (e) {}
        audio.play().catch(() => {});
      };
      if (audio.readyState >= 1) begin(); else audio.onloadedmetadata = begin;
    } else {
      state.audioMode = false;
      audio.pause();
      speak(l.t, l.s, onend);
    }
  }

  // skip forward/back by seconds (exact with recorded audio, estimated with TTS)
  function skipBy(sec) {
    const ep = state.currentEp;
    if (!ep) return;
    const durs = ep.lines.map((_, i) => lineDur(ep, i));
    const pos = (state.audioMode && state.playing && audio.duration) ? (audio.currentTime || 0) : 0;
    let idx = state.currentLine;
    if (sec > 0) {
      let rem = sec + pos;
      while (idx < ep.lines.length - 1 && rem > durs[idx]) { rem -= durs[idx]; idx++; }
      playLine(idx, Math.max(0, Math.min(rem, durs[idx] - 0.2)));
    } else {
      let rem = -sec - pos;
      while (idx > 0 && rem > 0) { idx--; rem -= durs[idx]; }
      playLine(idx, Math.max(0, -rem));
    }
  }

  function stopSpeaking() {
    speechSynthesis.cancel();
    audio.pause();
    state.playing = false; state.paused = false;
    playBtn.innerHTML = PLAY_SVG;
  }

  function finishEpisode() {
    const id = state.currentEp.id;
    if (!state.completed.has(id)) {
      state.completed.add(id);
      store.set('st_completed', [...state.completed]);
    }
    state.positions[id] = 0;
    store.set('st_positions', state.positions);
    updateProgress();
    showToast('خلصت الحلقة! برافو عليك');
  }

  // ---------- Dictation ----------
  function normWords(s) { return s.toLowerCase().replace(/[^a-z'’\s-]/g, ' ').split(/\s+/).filter(Boolean); }

  function checkDictation(idx) {
    const input = $('dict-in-' + idx).value;
    const res = $('dict-res-' + idx);
    const target = normWords(state.currentEp.lines[idx].t);
    const typed = normWords(input);
    if (!typed.length) { res.innerHTML = '<span class="miss">اكتب اللي سمعته الأول</span>'; return; }
    // simple LCS diff
    const n = target.length, m = typed.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = target[i] === typed[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0, html = '', correct = 0;
    while (i < n && j < m) {
      if (target[i] === typed[j]) { html += `<span class="ok">${esc(typed[j])}</span> `; correct++; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { html += `<span class="miss">[${esc(target[i])}]</span> `; i++; }
      else { html += `<span class="bad">${esc(typed[j])}</span> `; j++; }
    }
    while (i < n) { html += `<span class="miss">[${esc(target[i])}]</span> `; i++; }
    while (j < m) { html += `<span class="bad">${esc(typed[j])}</span> `; j++; }
    const pct = Math.round((correct / n) * 100);
    res.innerHTML = `<div style="margin-bottom:4px"><span class="${pct >= 80 ? 'ok' : 'miss'}">${pct}% صح</span></div>` + html;
  }

  // ---------- Vocab ----------
  function collectWord(word, lineIdx) {
    const w = word.toLowerCase();
    if (!w) return;
    const ep = state.currentEp;
    if (state.vocab.some(v => v.w.toLowerCase() === w)) { showToast('الكلمة دي عندك already'); return; }
    state.vocab.unshift({ w: word, ep: ep.id, line: lineIdx, sentence: ep.lines[lineIdx].t });
    store.set('st_vocab', state.vocab);
    updateProgress();
    showToast(`اتحفظت "${word}" في كلماتي`);
    if (state.wordMode) { renderLines(); }
  }

  function renderVocab() {
    if (!state.vocab.length) {
      vocabList.innerHTML = '<div class="empty-list">لسه مفيش كلمات. افتح حلقة، فعّل "وضع الكلمات"، ودوس على أي كلمة صعبة تحفظها.</div>';
      return;
    }
    vocabList.innerHTML = state.vocab.map((v, i) => `
      <div class="vocab-item">
        <div class="vocab-word-row">
          <button class="mini-btn" data-act="speak" data-i="${i}">اسمع</button>
          <span class="vocab-word">${esc(v.w)}</span>
          <button class="mini-btn" data-act="goto" data-i="${i}">الحلقة</button>
          <button class="mini-btn" data-act="del" data-i="${i}">حذف</button>
        </div>
        <div class="vocab-sentence">${esc(v.sentence)}</div>
        <div class="vocab-ep">حلقة ${v.ep}</div>
      </div>`).join('');
    vocabList.querySelectorAll('.mini-btn').forEach(b => {
      b.addEventListener('click', () => {
        const i = +b.dataset.i, act = b.dataset.act, v = state.vocab[i];
        if (act === 'speak') speak(v.w, 'M', null);
        else if (act === 'del') { state.vocab.splice(i, 1); store.set('st_vocab', state.vocab); updateProgress(); renderVocab(); }
        else if (act === 'goto') openEpisode(v.ep, v.line);
      });
    });
  }

  // ---------- Events ----------
  searchBox.addEventListener('input', () => { state.filter = searchBox.value; renderList(); });

  $('backBtn').addEventListener('click', () => { stopSpeaking(); showView('list'); renderContinue(); renderList(); });
  $('vocabBackBtn').addEventListener('click', () => { showView('list'); });
  vocabBtn.addEventListener('click', () => { renderVocab(); showView('vocab'); });

  playBtn.addEventListener('click', () => {
    if (state.playing && !state.paused) {
      if (state.audioMode) audio.pause(); else speechSynthesis.pause();
      state.paused = true; playBtn.innerHTML = PLAY_SVG;
    } else if (state.paused) {
      if (state.audioMode) audio.play().catch(() => {}); else speechSynthesis.resume();
      state.paused = false; playBtn.innerHTML = PAUSE_SVG;
    } else {
      playLine(state.currentLine);
    }
  });
  back30Btn.addEventListener('click', () => skipBy(-30));
  fwd30Btn.addEventListener('click', () => skipBy(30));

  const SPEEDS = [1, 1.25, 1.5, 0.75];
  speedBtn.addEventListener('click', () => {
    const i = SPEEDS.indexOf(state.speed);
    state.speed = SPEEDS[(i + 1) % SPEEDS.length];
    store.set('st_speed', state.speed);
    speedBtn.textContent = state.speed + 'x';
    speedBtn.classList.toggle('on', state.speed !== 1);
    if (state.audioMode) audio.playbackRate = state.speed;
    showToast(`سرعة التشغيل ${state.speed}x`);
  });
  speedBtn.textContent = state.speed + 'x';
  speedBtn.classList.toggle('on', state.speed !== 1);

  const SLEEP_OPTS = [0, 5, 10, 15, 20];
  sleepBtn.addEventListener('click', () => {
    const i = SLEEP_OPTS.indexOf(state.sleepMin);
    state.sleepMin = SLEEP_OPTS[(i + 1) % SLEEP_OPTS.length];
    clearTimeout(state.sleepTimer);
    state.sleepTimer = null;
    if (state.sleepMin > 0) {
      sleepBtn.textContent = `نوم ${state.sleepMin}د`;
      sleepBtn.classList.add('on');
      showToast(`هيقفل التشغيل بعد ${state.sleepMin} دقيقة`);
      state.sleepTimer = setTimeout(() => {
        stopSpeaking();
        state.sleepMin = 0;
        sleepBtn.textContent = 'مؤقت النوم';
        sleepBtn.classList.remove('on');
        showToast('مؤقت النوم قفل التشغيل');
      }, state.sleepMin * 60000);
    } else {
      sleepBtn.textContent = 'مؤقت النوم';
      sleepBtn.classList.remove('on');
      showToast('مؤقت النوم اتلغى');
    }
  });

  autoPlayToggle.addEventListener('click', () => {
    state.autoPlay = !state.autoPlay;
    autoPlayToggle.classList.toggle('on', state.autoPlay);
  });
  wordModeToggle.addEventListener('click', () => {
    state.wordMode = !state.wordMode;
    wordModeToggle.classList.toggle('on', state.wordMode);
    renderLines();
  });
  revealAllBtn.addEventListener('click', () => {
    state.currentEp.lines.forEach(l => l._revealed = true);
    renderLines();
  });
  trToggle.addEventListener('click', () => {
    state.showTranslation = !state.showTranslation;
    store.set('st_showtr', state.showTranslation);
    trToggle.classList.toggle('on', state.showTranslation);
    renderLines();
  });

  document.querySelectorAll('.mode-chip').forEach(ch => {
    ch.addEventListener('click', () => {
      state.mode = ch.dataset.mode;
      document.querySelectorAll('.mode-chip').forEach(c => c.classList.toggle('active', c === ch));
      revealAllBtn.style.display = state.mode === 'blind' ? '' : 'none';
      renderLines();
    });
  });

  $('settingsBtn').addEventListener('click', () => { loadVoices(); settingsModal.classList.add('active'); });
  $('closeSettingsBtn').addEventListener('click', () => {
    state.settings.voiceMale = voiceMaleSel.value;
    state.settings.voiceFemale = voiceFemaleSel.value;
    state.settings.rate = parseFloat(rateSlider.value);
    store.set('st_settings', state.settings);
    EPISODES.forEach(e => { delete e._vmap; });
    settingsModal.classList.remove('active');
  });
  rateSlider.addEventListener('input', () => { rateValue.textContent = parseFloat(rateSlider.value).toFixed(2); });
  $('testVoiceBtn').addEventListener('click', () => {
    state.settings.voiceMale = voiceMaleSel.value;
    state.settings.voiceFemale = voiceFemaleSel.value;
    state.settings.rate = parseFloat(rateSlider.value);
    speak('This is how the story will sound. Are you ready?', 'M', null);
  });

  // ---------- Init ----------
  rateSlider.value = state.settings.rate;
  rateValue.textContent = state.settings.rate.toFixed(2);
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  renderTenseFilters();
  renderContinue();
  renderList();
  updateProgress();
  const m = location.hash.match(/^#ep=(\d+)(?:&tr)?(?:&l=(\d+))?/);
  if (m && m[0].includes('&tr')) { state.showTranslation = true; }
  if (m) openEpisode(+m[1], m[2] ? +m[2] : 0);
  window.__alcpt = { playLine, openEpisode, state };
})();
