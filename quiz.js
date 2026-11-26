/* ALCPT Stories - Episode quiz + mistakes bank */
(function () {
  'use strict';
  const A = window.__alcpt, QZ = window.QUIZ || {};
  if (!A) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const NEED = 5;
  let results = store.get('st_quiz', {});      // epId -> {score,total,best}
  let mistakes = store.get('st_mistakes', {}); // qn -> {ep, streak}
  const view = $('quizView'), body = $('quizBody'), title = $('quizTitle'), sub = $('quizSub');
  let sess = null;

  const byN = {};
  Object.keys(QZ).forEach(ep => QZ[ep].forEach(q => { byN[q.n] = Object.assign({ ep: +ep }, q); }));

  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function save() { store.set('st_quiz', results); store.set('st_mistakes', mistakes); refreshBadges(); }
  function mistakeCount() { return Object.keys(mistakes).length; }

  function refreshBadges() {
    const c = $('mistakesCount'); if (c) c.textContent = mistakeCount();
    document.querySelectorAll('.ep-card').forEach(card => {
      const id = card.dataset.id, r = results[id];
      const st = card.querySelector('.ep-state');
      let tag = card.querySelector('.q-tag');
      if (!r) { if (tag) tag.remove(); return; }
      if (!tag) { tag = document.createElement('div'); tag.className = 'q-tag'; st.appendChild(tag); }
      const pct = r.total ? r.best / r.total : 0;
      tag.className = 'q-tag ' + (pct >= 0.8 ? 'good' : pct >= 0.5 ? 'mid' : 'low');
      tag.textContent = `اختبار ${r.best}/${r.total}`;
    });
  }

  function show() { A.showView('quiz'); }
  function qCount(ep) { return (QZ[ep] || []).length; }

  function start(items, opts) {
    sess = Object.assign({ items: items.map(q => Object.assign({}, q, { order: shuffle(q.o.map((_, i) => i)) })), i: 0, score: 0, wrong: [], answered: false }, opts);
    show(); render();
  }
  function startEpisode(epId) {
    const items = (QZ[epId] || []).map(q => Object.assign({ ep: epId }, q));
    if (!items.length) return;
    const ep = A.EPISODES.find(e => e.id === epId);
    title.textContent = `\u200E${epId}. ${ep ? ep.title : ''}`;
    sub.textContent = 'اختبار الحلقة';
    start(items, { kind: 'ep', ep: epId });
  }
  function startMistakes() {
    const items = Object.keys(mistakes).map(n => byN[n]).filter(Boolean);
    title.textContent = 'بنك الأخطاء';
    sub.textContent = `${items.length} سؤال، يتمسح السؤال بعد ${NEED} إجابات صح`;
    if (!items.length) { sess = null; show(); body.innerHTML = '<div class="q-empty">بنك الأخطاء فاضي. أي سؤال تغلط فيه هيتجمع هنا.</div>'; return; }
    start(shuffle(items), { kind: 'mist' });
  }

  function render() {
    const s = sess, q = s.items[s.i], total = s.items.length;
    const label = ['A', 'B', 'C', 'D'];
    let qt = esc(q.q);
    if (q.k) qt = qt.replace(new RegExp('(' + q.k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<mark>$1</mark>');
    const streak = mistakes[q.n] ? mistakes[q.n].streak : null;
    body.innerHTML = `
      <div class="q-progress"><div class="q-bar"><div style="width:${(s.i / total) * 100}%"></div></div><span dir="ltr">${s.i + 1} / ${total}</span></div>
      ${streak !== null ? `<div class="q-streak">من بنك الأخطاء: ${streak} من ${NEED} إجابات صح</div>` : ''}
      <div class="q-card"><div class="q-text" dir="ltr">${qt}</div></div>
      <div class="q-opts" id="qOpts">${s.items[s.i].order.map((oi, k) => `<button class="q-opt" data-oi="${oi}" dir="ltr"><span class="q-lab">${label[k]}</span><span class="q-ot">${esc(q.o[oi])}</span></button>`).join('')}</div>
      <div id="qFeed"></div>`;
    s.answered = false;
    body.querySelectorAll('.q-opt').forEach(b => b.addEventListener('click', () => answer(+b.dataset.oi, b)));
    window.scrollTo(0, 0);
  }

  function answer(oi, btn) {
    const s = sess; if (s.answered) return; s.answered = true;
    const q = s.items[s.i], ok = oi === q.c;
    body.querySelectorAll('.q-opt').forEach(b => {
      b.disabled = true;
      if (+b.dataset.oi === q.c) b.classList.add('right');
    });
    if (!ok) btn.classList.add('wrong');
    const wasM = !!mistakes[q.n];
    // bookkeeping
    if (ok) {
      s.score++;
      if (mistakes[q.n]) { mistakes[q.n].streak++; if (mistakes[q.n].streak >= NEED) delete mistakes[q.n]; }
    } else {
      s.wrong.push(q.n);
      mistakes[q.n] = { ep: q.ep, streak: 0 };
    }
    save();
    const last = s.i === s.items.length - 1;
    $('qFeed').innerHTML = `
      <div class="q-feed ${ok ? 'ok' : 'no'}">
        <div class="q-verdict">${ok ? 'إجابة صح' : 'إجابة غلط'}${ok && wasM && mistakes[q.n] === undefined ? ' ، واتمسح السؤال من بنك الأخطاء' : ''}</div>
        <div class="q-logic">${esc(q.e)}</div>
      </div>
      <button class="q-next" id="qNext">${last ? 'شوف النتيجة' : 'السؤال التالي'}</button>`;
    $('qNext').addEventListener('click', () => { if (last) finish(); else { s.i++; render(); } });
    $('qNext').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function finish() {
    const s = sess, total = s.items.length, pct = Math.round((s.score / total) * 100);
    if (s.kind === 'ep') {
      const r = results[s.ep] || { best: 0 };
      results[s.ep] = { score: s.score, total, best: Math.max(r.best || 0, s.score) };
      save();
    }
    const idx = A.EPISODES.findIndex(e => e.id === s.ep), nextEp = s.kind !== 'mist' && idx >= 0 ? A.EPISODES[idx + 1] : null;
    const msg = pct >= 90 ? 'ممتاز' : pct >= 70 ? 'كويس' : pct >= 50 ? 'محتاج مراجعة' : 'ارجع للحلقة وسمعها تاني';
    body.innerHTML = `
      <div class="q-result">
        <div class="q-big" dir="ltr">${s.score} / ${total}</div>
        <div class="q-pct">${pct}% , ${msg}</div>
        ${s.wrong.length ? `<div class="q-note">${s.wrong.length} سؤال اتضافوا لبنك الأخطاء</div>` : '<div class="q-note">مفيش أخطاء</div>'}
        <div class="q-actions">
          ${s.wrong.length ? '<button class="q-next" id="qRetryWrong">راجع الأسئلة اللي غلطت فيها</button>' : ''}
          ${s.kind !== 'mist' && nextEp ? `<button class="q-next" id="qNextEp" style="${s.wrong.length ? 'background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border);font-weight:500' : ''}">الحلقة التالية: ${esc(nextEp.title)}</button>` : ''}
          <button class="q-next alt" id="qAgain">${s.kind === 'mist' ? 'كمّل المراجعة' : 'أعد الاختبار'}</button>
          <button class="q-next alt" id="qExit">${s.kind === 'mist' ? 'رجوع للرئيسية' : 'رجوع للحلقة'}</button>
        </div>
      </div>`;
    const rw = $('qRetryWrong');
    if (rw) rw.addEventListener('click', () => { const items = s.wrong.map(n => byN[n]); const kind = s.kind, ep = s.ep; start(items, { kind: kind === 'ep' ? 'retry' : kind, ep }); });
    $('qAgain').addEventListener('click', () => { if (s.kind === 'ep') startEpisode(s.ep); else if (s.kind === 'mist') startMistakes(); else startEpisode(s.ep); });
    $('qExit').addEventListener('click', exit);
    const ne = $('qNextEp'); if (ne) ne.addEventListener('click', () => A.openEpisode(nextEp.id));
  }

  function exit() {
    const s = sess;
    if (s && s.ep && s.kind !== 'mist') A.openEpisode(s.ep); else A.showView('list');
    refreshBadges();
  }

  $('quizBackBtn').addEventListener('click', exit);
  const mb = $('mistakesBtn'); if (mb) mb.addEventListener('click', startMistakes);
  document.addEventListener('click', (e) => {
    const c = e.target.closest('#quizChip');
    if (c) { const ep = A.state.currentEp; if (ep) startEpisode(ep.id); }
  });
  // quiz tab visibility per episode
  const origOpen = A.openEpisode;
  A.onOpenEpisode = function (ep) { const chip = $('quizChip'); if (chip) { chip.style.display = qCount(ep.id) ? '' : 'none'; chip.textContent = `اختبار (${qCount(ep.id)})`; } };
  A.refreshBadges = refreshBadges;
  window.__quiz = { startEpisode, startMistakes, byN, results: () => results, mistakes: () => mistakes };
  refreshBadges();
})();
