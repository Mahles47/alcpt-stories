/* ALCPT Stories - per-episode explainer video (stored on the device, separate from quiz data) */
(function () {
  'use strict';
  const A = window.__alcpt; if (!A) return;
  const $ = (id) => document.getElementById(id);
  const DB = 'alcpt-videos', ST = 'videos';
  let dbp = null, curUrl = null, have = new Set();
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('nodb'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('dberr'));
      r.onblocked = () => rej(new Error('dbblocked'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(ST, mode); let out;
      try { out = fn(t.objectStore(ST)); } catch (e) { return rej(e); }
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
    }));
  }
  const getV = (k) => tx('readonly', s => s.get(k));
  const putV = (k, v) => tx('readwrite', s => s.put(v, k));
  const delV = (k) => tx('readwrite', s => s.delete(k));
  const keysV = () => tx('readonly', s => s.getAllKeys());
  const mb = (n) => (n / 1048576).toFixed(1) + ' ميجا';
  const body = () => $('videoBody');

  function setMsg(t, kind) { const m = $('vMsg'); if (m) { m.textContent = t || ''; m.className = 'v-msg ' + (kind || ''); } }
  function chipLabel(ep) { const c = $('videoChip'); if (c) c.textContent = 'فيديو'; c.classList.toggle('on', have.has(ep.id)); }
  function reload() { return keysV().then(k => { have = new Set(k); }).catch(() => {}); }

  function revoke() { if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; } }

  async function render(ep) {
    revoke();
    $('videoTitle').textContent = `\u200E${ep.id}. ${ep.title}`;
    $('videoSub').textContent = 'فيديو الشرح';
    let rec = null, err = null;
    try { rec = await getV(ep.id); } catch (e) { err = e; }
    let est = '';
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); est = `المساحة المستخدمة في المتصفح: ${mb(e.usage || 0)} من ${mb(e.quota || 0)}`; } } catch (e) {}
    let h = '';
    if (err) h += '<div class="v-msg bad">المتصفح مش سامح بتخزين الفيديو هنا (ممكن تكون في وضع التصفح الخاص). افتح التطبيق في كروم عادي.</div>';
    if (rec && rec.blob) {
      curUrl = URL.createObjectURL(rec.blob);
      h += `<video id="vPlayer" class="v-player" controls playsinline preload="metadata" src="${curUrl}"></video>
        <div class="v-info" dir="ltr">${(rec.name || 'video').replace(/[<>&"]/g, '')} , ${(rec.blob.size / 1048576).toFixed(1)} MB</div>
        <div class="v-actions"><button class="q-next" id="vReplace">استبدل الفيديو</button><button class="q-next alt" id="vDelete">امسح الفيديو</button></div>`;
    } else if (!err) {
      h += `<div class="v-empty">مفيش فيديو محفوظ للحلقة دي.<br>اختار ملف الفيديو من الموبايل وهيتحفظ جوه التطبيق ويشتغل من غير نت.</div>
        <div class="v-actions"><button class="q-next" id="vAdd">اختار الفيديو</button></div>`;
    }
    h += '<div id="vMsg" class="v-msg"></div>';
    if (est) h += `<div class="v-est">${est}</div>`;
    h += '<div class="v-est">الفيديو بيتخزن على الجهاز بس. تقدمك في الاختبارات منفصل ومش بيتأثر بالإضافة أو الاستبدال أو المسح.</div>';
    body().innerHTML = h;
    const pick = () => $('vFile').click();
    ['vAdd', 'vReplace'].forEach(i => { const b = $(i); if (b) b.addEventListener('click', pick); });
    const d = $('vDelete'); if (d) d.addEventListener('click', () => confirmDelete(ep));
    const pl = $('vPlayer'); if (pl) pl.addEventListener('error', () => setMsg('الفيديو ده مش بيتشغل على المتصفح. جرّب تستبدله بملف MP4 تاني.', 'bad'));
    chipLabel(ep);
  }

  function confirmDelete(ep) {
    const b = $('vDelete'); if (!b) return;
    if (b.dataset.sure) { delV(ep.id).then(reload).then(() => render(ep)).catch(() => setMsg('فشل المسح، حاول تاني.', 'bad')); return; }
    b.dataset.sure = '1'; b.textContent = 'اضغط تاني للتأكيد';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'امسح الفيديو'; } }, 4000);
  }

  async function onFile(ep, f) {
    if (!f) return;
    if (!f.size) return setMsg('الملف فاضي. اختار ملف تاني.', 'bad');
    if (f.type && !/^video\//.test(f.type)) return setMsg('ده مش ملف فيديو. اختار ملف MP4.', 'bad');
    setMsg('جاري الحفظ...', '');
    const old = await getV(ep.id).catch(() => null);
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      await putV(ep.id, { blob: f, name: f.name, type: f.type || 'video/mp4', added: Date.now() });
      const chk = await getV(ep.id);
      if (!chk || !chk.blob || chk.blob.size !== f.size) throw new Error('verify');
    } catch (e) {
      // roll back to the previous video if the new one failed
      try { if (old) await putV(ep.id, old); else await delV(ep.id); } catch (e2) {}
      const quota = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
      await reload(); await render(ep);
      return setMsg(quota ? 'المساحة مش كفاية. فضّي مساحة من الموبايل وجرّب تاني. الفيديو القديم (لو كان موجود) لسه زي ما هو.' : 'الحفظ فشل ومحصلش أي تغيير. جرّب تاني.', 'bad');
    }
    await reload(); await render(ep); setMsg('اتحفظ بنجاح', 'ok');
  }

  let ep0 = null;
  function open() {
    const ep = A.state.currentEp; if (!ep) return;
    ep0 = ep; A.showView('video'); reload().then(() => render(ep));
  }
  function leave() { const v = $('vPlayer'); if (v) v.pause(); revoke(); if (ep0) A.openEpisode(ep0.id); else A.showView('list'); }

  $('videoChip').addEventListener('click', open);
  $('videoBackBtn').addEventListener('click', leave);
  $('vFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (ep0) onFile(ep0, f); });
  const prev = A.onOpenEpisode;
  A.onOpenEpisode = function (ep) { if (prev) prev(ep); chipLabel(ep); };
  reload();
  window.__video = { keys: keysV };
})();
