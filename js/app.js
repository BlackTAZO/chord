/* Chord Viewer 앱 로직 */
(function () {
  'use strict';
  const T = window.Theory, R = window.Render, A = window.ChordAudio;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TYPES = ['staff', 'guitar-tab', 'guitar-diagram', 'ukulele-tab', 'ukulele-diagram', 'piano'];
  const QUALS = [
    ['', '메이저'], ['m', 'm'], ['7', '7'], ['maj7', 'maj7'], ['m7', 'm7'], ['sus4', 'sus4'], ['sus2', 'sus2'],
    ['6', '6'], ['m6', 'm6'], ['9', '9'], ['maj9', 'maj9'], ['m9', 'm9'], ['11', '11'], ['13', '13'],
    ['dim', 'dim'], ['dim7', 'dim7'], ['m7b5', 'm7♭5'], ['aug', 'aug'], ['7sus4', '7sus4'], ['5', '5'],
    ['7b9', '7♭9'], ['7#9', '7♯9'],
  ];
  const BLACK = [1, 3, 6, 8, 10];

  const state = {
    chords: [], orig: [], custom: [], title: '', projectId: null,
    type: 'guitar-diagram', capo: 0, horizontal: false, zoom: 1, scale: '', sp: {},
    vi: {},
    picker: { root: 0, flat: true, q: '', add9: false, bass: '' },
  };

  const isFretted = (t) => t.startsWith('guitar') || t.startsWith('ukulele');
  const instOf = (t) => (t.startsWith('guitar') ? 'guitar' : t.startsWith('ukulele') ? 'ukulele' : 'piano');
  const spell = (pc) => (state.picker.flat ? T.FLAT : T.SHARP)[pc];

  /* ---------- 토스트 ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------- 운지법 캐시 ---------- */
  const vcache = {};
  function voicingsFor(shape, inst) {
    const k = shape.name + '|' + inst;
    if (!vcache[k]) vcache[k] = T.findVoicings(shape, inst);
    return vcache[k];
  }
  const viKey = (c, inst) => `${c}|${inst}|${state.capo}`;
  function currentVoicing(c) {
    const inst = instOf(state.type);
    const ch = T.parseChord(c);
    const shape = T.transposeChord(ch, -state.capo);
    const vs = voicingsFor(shape, inst);
    let idx = state.vi[viKey(c, inst)] || 0;
    if (idx >= vs.length) idx = 0;
    return { ch, shape, vs, idx, v: vs[idx] };
  }

  function midisFor(c) {
    const ch = T.parseChord(c);
    if (isFretted(state.type)) {
      const inst = instOf(state.type);
      const { v } = currentVoicing(c);
      if (v) return { inst, midis: T.voicingMidis(v, inst, state.capo) };
    }
    const m = T.pianoMidis(ch);
    if (ch.bassPc == null) m.unshift(48 + ch.rootPc);
    return { inst: 'piano', midis: m };
  }

  /* ---------- 재생 ---------- */
  let seqId = 0, seqTimer = null, seqBtn = null, seqLabel = '';
  function playOne(c, mode) {
    const { inst, midis } = midisFor(c);
    return A.playChord(midis, inst, mode);
  }
  function stopSeq() {
    seqId++;
    clearTimeout(seqTimer);
    document.querySelectorAll('.chip.playing, .custom-chip.playing').forEach((e) => e.classList.remove('playing'));
    if (seqBtn) { seqBtn.classList.remove('playing'); seqBtn.textContent = seqLabel; seqBtn = null; }
  }
  function playSeq(list, btn, markSel) {
    if (seqBtn === btn) { stopSeq(); return; }
    stopSeq();
    if (!list.length) return;
    const my = ++seqId;
    seqBtn = btn; seqLabel = btn.textContent;
    btn.classList.add('playing'); btn.textContent = '■ 정지';
    let i = 0;
    const step = () => {
      if (my !== seqId) return;
      document.querySelectorAll(markSel + '.playing').forEach((e) => e.classList.remove('playing'));
      if (i >= list.length) { stopSeq(); return; }
      const el = document.querySelectorAll(markSel)[i];
      if (el) el.classList.add('playing');
      playOne(list[i], 'strum');
      i++;
      seqTimer = setTimeout(step, 1400);
    };
    step();
  }

  /* ---------- URL ---------- */
  function syncUrl() {
    const p = new URLSearchParams();
    if (state.chords.length) p.set('chords', state.chords.join(','));
    p.set('type', state.type);
    if (state.title) p.set('title', state.title);
    if (state.capo) p.set('capo', state.capo);
    try { history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash); } catch (e) { /* file:// 등 */ }
  }

  /* ---------- 코드 추가/삭제 ---------- */
  function addChord(raw, silent) {
    const ch = T.parseChord(raw);
    if (!ch) { toast(`"${raw}" 코드를 인식할 수 없습니다`); return false; }
    if (state.chords.includes(ch.name)) { if (!silent) toast(`${ch.name} 은(는) 이미 추가되어 있습니다`); return false; }
    state.chords.push(ch.name);
    state.orig.push(ch.name);
    return true;
  }
  function afterChange(flashName) {
    syncUrl();
    renderChips();
    renderCustom();
    renderCards();
    if (flashName) {
      const card = document.querySelector(`.card[data-chord="${CSS.escape(flashName)}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        card.classList.add('flash');
        setTimeout(() => card.classList.remove('flash'), 1200);
      }
    }
  }
  function removeChord(name) {
    stopSeq();
    state.chords = state.chords.filter((c) => c !== name);
    state.orig = state.orig.filter((c) => c !== name);
    state.custom = state.custom.filter((c) => c !== name);
    afterChange();
  }

  /* ---------- 선택기 ---------- */
  function pickerName() {
    const p = state.picker;
    return spell(p.root) + p.q + (p.add9 ? '(add9)' : '') + (p.bass !== '' ? '/' + spell(+p.bass) : '');
  }
  function renderPicker() {
    const p = state.picker;
    $('rootGrid').innerHTML = Array.from({ length: 12 }, (_, pc) =>
      `<button data-root="${pc}" class="${BLACK.includes(pc) ? 'black ' : ''}${p.root === pc ? 'active' : ''}">${spell(pc)}</button>`).join('');
    $('qualityGrid').innerHTML = QUALS.map(([q, label]) =>
      `<button data-q="${esc(q)}" class="${p.q === q ? 'active' : ''}">${esc(label)}</button>`).join('');
    $('accToggle').textContent = p.flat ? '♭ 표기' : '♯ 표기';
    updatePreview();
  }
  function updatePreview() {
    const name = pickerName();
    const ch = T.parseChord(name);
    const nameEl = $('previewName');
    if (!ch) {
      nameEl.textContent = '인식 불가';
      nameEl.className = 'preview-name err';
      $('previewNotes').innerHTML = '';
      return;
    }
    nameEl.textContent = ch.name;
    nameEl.className = 'preview-name';
    const notes = T.chordNoteNames(ch);
    let h = '';
    if (ch.bassPc != null) h += `<span class="note-badge bass">베이스 ${T.noteName(ch.bassPc, ch)}</span>`;
    h += notes.map((n, i) => `<span class="note-badge ${n === T.noteName(ch.rootPc, ch) ? 'root' : ''}">${n}</span>`).join('');
    $('previewNotes').innerHTML = h;
  }

  /* ---------- 칩 ---------- */
  let drag = null;
  function renderChips() {
    const has = state.chords.length > 0;
    $('chordChips').innerHTML = has
      ? state.chords.map((c, i) => `<span class="chip" draggable="true" data-i="${i}" title="클릭: 소리 듣기 + 나만의 진행에 추가 / 끌어서 순서 변경"><span class="chip-label">${esc(c)}</span><button class="chip-x" data-del="${i}" title="삭제">×</button></span>`).join('')
      : '<span class="muted" style="margin:0">위에서 코드를 선택해 추가하세요</span>';
    $('playAllBtn').style.display = has ? '' : 'none';
    $('clearAllBtn').style.display = has ? '' : 'none';
    $('customRow').style.display = has ? '' : 'none';
    const origNow = state.orig.filter((c) => state.chords.includes(c));
    $('resetOrderBtn').style.display = has && origNow.join() !== state.chords.join() ? '' : 'none';
    $('emptyState').style.display = has ? 'none' : 'block';
  }
  function renderCustom() {
    const z = $('customZone');
    if (!state.custom.length) {
      z.innerHTML = '<span class="drop-hint">코드를 클릭하거나 끌어다 놓아 추가하세요</span>';
    } else {
      z.innerHTML = state.custom.map((c, i) =>
        `${i ? '<span class="arrow">→</span>' : ''}<span class="custom-chip" draggable="true" data-ci="${i}"><span>${esc(c)}</span><button class="chip-x" data-cdel="${i}">×</button></span>`).join('');
    }
    $('customPlay').style.display = state.custom.length ? '' : 'none';
    $('customClear').style.display = state.custom.length ? '' : 'none';
  }

  /* ---------- 카드 ---------- */
  function noteBadges(ch) {
    const rootN = T.noteName(ch.rootPc, ch);
    let h = '';
    if (ch.bassPc != null) h += `<span class="note-badge bass">베이스 ${T.noteName(ch.bassPc, ch)}</span>`;
    h += T.chordNoteNames(ch).map((n) => `<span class="note-badge ${n === rootN ? 'root' : ''}">${n}</span>`).join('');
    return h;
  }
  const ZOOMS = [0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5];
  const COMPACT_MAX = 0.6;
  function scaleInfo(ch, kind) {
    const ivs = new Set(ch.items.map((i) => i.iv % 12));
    const minor = ivs.has(3) && !ivs.has(4), dim = minor && ivs.has(6);
    const dom = ivs.has(4) && ivs.has(10);
    let list, label;
    if (kind === 'penta') {
      list = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
      label = minor ? '마이너 펜타토닉' : '메이저 펜타토닉';
    } else if (dim) { list = [0, 2, 3, 5, 6, 8, 10]; label = '로크리안'; }
    else if (minor) { list = [0, 2, 3, 5, 7, 8, 10]; label = '내추럴 마이너'; }
    else if (dom) { list = [0, 2, 4, 5, 7, 9, 10]; label = '믹솔리디안'; }
    else { list = [0, 2, 4, 5, 7, 9, 11]; label = '메이저'; }
    return { pcs: list.map((i) => (ch.rootPc + i) % 12), label: T.noteName(ch.rootPc, ch) + ' ' + label };
  }
  function scalePositions(inst, pcs) {
    const tun = T.TUNINGS[inst];
    const low = tun.indexOf(Math.min(...tun));
    const set = new Set();
    pcs.forEach((pc) => { let f = (((pc - tun[low]) % 12) + 12) % 12; if (f === 0) f = 12; set.add(Math.max(f - 1, 0)); });
    return [...set].sort((a, b) => a - b);
  }
  function scaleState(c, ch, v) {
    const inst = instOf(state.type);
    const si = scaleInfo(ch, state.scale);
    const ps = scalePositions(inst, si.pcs);
    const key = `${c}|${inst}|${state.scale}`;
    let idx = state.sp[key];
    if (idx == null) {
      const fr = v ? v.frets.filter((f) => f > 0) : [];
      const m = fr.length ? Math.min(...fr) : 1;
      idx = 0; ps.forEach((s, i) => { if (s <= m) idx = i; });
    }
    return { si, ps, key, idx, s: ps[idx], inst };
  }
  function diagramFor(v, inst, shape, type) {
    return type.endsWith('-tab') ? R.tab(v, inst, state.capo) : R.diagram(v, inst, shape);
  }
  function cardHtml(c) {
    const ch = T.parseChord(c);
    const t = state.type;
    let sub = '', body = '', ctrl = '';
    if (isFretted(t)) {
      const inst = instOf(t);
      const { shape, vs, idx, v } = currentVoicing(c);
      if (state.capo) sub = `<div class="card-sub">${esc(shape.name)} 폼 · 카포 ${state.capo}</div>`;
      if (state.scale && t.endsWith('-diagram')) {
        const sc = scaleState(c, ch, v);
        sub = `<div class="card-sub">${esc(sc.si.label)} 스케일</div>`;
        body = `<div class="diagram">${R.scaleBoard(inst, ch, sc.si.pcs, sc.s)}</div>`;
        ctrl = `<div class="voicing-controls">
          <button class="v-nav" data-act="sprev">‹</button>
          <span class="v-ind wide">포지션 ${sc.idx + 1} / ${sc.ps.length} · ${sc.s}~${Math.max(sc.s, 1) + 4}프렛</span>
          <button class="v-nav" data-act="snext">›</button></div>`;
      } else if (v) {
        body = `<div class="diagram">${diagramFor(v, inst, shape, t)}</div>`;
        ctrl = `<div class="voicing-controls">
          <button class="v-nav" data-act="prev" ${vs.length < 2 ? 'disabled' : ''}>‹</button>
          <span class="v-ind">${idx + 1} / ${vs.length}</span>
          <button class="v-nav" data-act="next" ${vs.length < 2 ? 'disabled' : ''}>›</button>
          <button class="v-all" data-act="all" title="모든 운지법 보기">⋯</button></div>`;
      } else {
        body = '<div class="no-voicing">이 코드의 현실적인 운지법을 찾지 못했습니다.<br>소리는 피아노 음으로 재생됩니다.</div>';
      }
    } else if (t === 'piano') {
      body = `<div class="diagram">${R.piano(T.pianoMidis(ch), ch)}</div>`;
    } else {
      body = `<div class="diagram" data-staff="1"></div>`;
    }
    return `<div class="card" data-chord="${esc(c)}">
      <div class="card-head">
        <div><div class="card-name">${esc(c)}</div>${sub}</div>
        <div class="play-group">
          <button class="play-btn" data-act="play" title="동시에 / 스트럼">▶ 재생</button>
          <button class="play-btn arp" data-act="arp" title="아르페지오">♪ 분산</button>
        </div>
      </div>
      <div class="notes-row">${noteBadges(ch)}</div>
      ${body}${ctrl}
    </div>`;
  }
  function renderCards() {
    const box = $('cards');
    box.innerHTML = state.chords.map(cardHtml).join('');
    box.classList.toggle('horizontal', state.horizontal);
    box.querySelectorAll('[data-staff]').forEach((el) => {
      const c = el.closest('.card').dataset.chord;
      const ch = T.parseChord(c);
      R.staff(el, T.pianoMidis(ch), ch);
    });
    applyZoom();
    const banner = $('capoBanner');
    if (state.capo && isFretted(state.type)) {
      banner.style.display = 'block';
      banner.textContent = `🎸 카포 ${state.capo}프렛 — 카드에는 카포를 끼고 잡는 코드 폼이 표시되고, 소리는 원래 코드로 재생됩니다`;
    } else banner.style.display = 'none';
  }
  function applyZoom() {
    const box = $('cards'), z = state.zoom, compact = z <= COMPACT_MAX;
    box.classList.toggle('compact', compact);
    box.querySelectorAll('.diagram svg').forEach((svg) => {
      if (!svg.dataset.w) {
        let w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
        if (!w || !h) { const r = svg.getBoundingClientRect(); w = r.width; h = r.height; }
        if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.dataset.w = w;
      }
      svg.style.width = (svg.dataset.w * z) + 'px';
      svg.style.height = 'auto';
    });
    if (z === 1) box.style.gridTemplateColumns = '';
    else box.style.gridTemplateColumns = `repeat(auto-fill, minmax(${compact ? Math.round(200 * z + 16) : Math.max(280, Math.round(200 * z + 34))}px, 1fr))`;
    $('zoomVal').textContent = Math.round(z * 100) + '%';
    const zi = ZOOMS.indexOf(z);
    $('zoomOut').disabled = zi <= 0;
    $('zoomIn').disabled = zi >= ZOOMS.length - 1;
  }
  function renderTabs() {
    $('scaleRow').classList.toggle('show', state.type.endsWith('-diagram'));
    document.querySelectorAll('#scaleButtons button').forEach((b) => b.classList.toggle('active', b.dataset.scale === state.scale));
    document.querySelectorAll('#typeTabs button').forEach((b) => {
      const on = b.dataset.type === state.type;
      b.classList.toggle('active', on);
      if (on) $('typeBtn').textContent = b.textContent + ' ▾';
    });
    $('capoRow').classList.toggle('show', isFretted(state.type));
    $('capoButtons').innerHTML = Array.from({ length: 13 }, (_, n) =>
      `<button data-capo="${n}" class="${state.capo === n ? 'active' : ''}">${n ? n : '없음'}</button>`).join('');
  }

  /* ---------- 운지법 모달 ---------- */
  function openVoicingModal(c) {
    const inst = instOf(state.type);
    const { shape, vs, idx } = currentVoicing(c);
    $('voicingTitle').textContent = `${c} 운지법${state.capo ? ` (${shape.name} 폼 · 카포 ${state.capo})` : ''}`;
    $('voicingGrid').innerHTML = vs.map((v, i) =>
      `<div class="v-item ${i === idx ? 'selected' : ''}" data-vi="${i}"><span class="num">${i + 1}</span><div class="diagram">${diagramFor(v, inst, shape, state.type)}</div></div>`).join('');
    $('voicingModal').dataset.chord = c;
    $('voicingModal').hidden = false;
  }

  /* ---------- 드래그 앤 드롭 ---------- */
  function setupDnd() {
    const clear = () => document.querySelectorAll('.drag-over').forEach((e) => e.classList.remove('drag-over'));
    document.addEventListener('dragstart', (e) => {
      const chip = e.target.closest && e.target.closest('.chip, .custom-chip');
      if (!chip) return;
      drag = chip.classList.contains('chip') ? { src: 'main', i: +chip.dataset.i } : { src: 'custom', i: +chip.dataset.ci };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'chord');
    });
    document.addEventListener('dragend', () => { drag = null; clear(); });
    document.addEventListener('dragover', (e) => {
      if (!drag) return;
      const t = e.target.closest('.chip, .custom-chip, #customZone');
      if (!t) return;
      e.preventDefault();
      clear();
      t.classList.add('drag-over');
    });
    document.addEventListener('drop', (e) => {
      if (!drag) return;
      const t = e.target.closest('.chip, .custom-chip, #customZone');
      if (!t) return;
      e.preventDefault();
      const d = drag; drag = null; clear();
      const name = d.src === 'main' ? state.chords[d.i] : state.custom[d.i];
      if (t.classList.contains('chip')) {
        if (d.src !== 'main') return;
        const to = +t.dataset.i;
        const [m] = state.chords.splice(d.i, 1);
        state.chords.splice(to, 0, m);
        afterChange();
      } else {
        // 나만의 진행 쪽으로
        let to = state.custom.length;
        if (t.classList.contains('custom-chip')) to = +t.dataset.ci;
        if (d.src === 'custom') { state.custom.splice(d.i, 1); if (to > d.i) to--; }
        state.custom.splice(to, 0, name);
        renderCustom();
      }
    });
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    // 선택기
    $('rootGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-root]'); if (!b) return;
      state.picker.root = +b.dataset.root; renderPicker();
    });
    $('qualityGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      state.picker.q = b.dataset.q; renderPicker();
    });
    $('add9Check').addEventListener('change', (e) => { state.picker.add9 = e.target.checked; updatePreview(); });
    $('accToggle').addEventListener('click', () => { state.picker.flat = !state.picker.flat; renderPicker(); });
    $('addBtn').addEventListener('click', () => {
      const ch = T.parseChord(pickerName()); if (!ch) { toast('코드를 인식할 수 없습니다'); return; }
      if (addChord(ch.name)) { afterChange(ch.name); toast(`${ch.name} 추가됨`); }
    });
    const direct = () => {
      const inp = $('directInput');
      const parts = inp.value.split(/[,\s]+/).filter(Boolean);
      if (!parts.length) return;
      let last = null, ok = 0;
      parts.forEach((p) => { if (addChord(p)) { ok++; last = T.parseChord(p).name; } });
      if (ok) { inp.value = ''; afterChange(last); if (ok > 1) toast(`${ok}개 코드 추가됨`); }
    };
    $('directAdd').addEventListener('click', direct);
    $('directInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') direct(); });

    // 칩
    $('chordChips').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { removeChord(state.chords[+del.dataset.del]); return; }
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const c = state.chords[+chip.dataset.i];
      playOne(c, 'strum');
      state.custom.push(c);
      renderCustom();
    });
    $('resetOrderBtn').addEventListener('click', () => {
      state.chords = state.orig.filter((c) => state.chords.includes(c));
      afterChange();
    });
    $('clearAllBtn').addEventListener('click', () => {
      stopSeq();
      state.chords = []; state.orig = []; state.custom = [];
      afterChange();
    });
    $('playAllBtn').addEventListener('click', (e) => playSeq(state.chords.slice(), e.currentTarget, '#chordChips .chip'));

    // 나만의 진행
    $('customZone').addEventListener('click', (e) => {
      const del = e.target.closest('[data-cdel]');
      if (del) { state.custom.splice(+del.dataset.cdel, 1); renderCustom(); return; }
      const chip = e.target.closest('.custom-chip');
      if (chip) playOne(state.custom[+chip.dataset.ci], 'strum');
    });
    $('customPlay').addEventListener('click', (e) => playSeq(state.custom.slice(), e.currentTarget, '#customZone .custom-chip'));
    $('customClear').addEventListener('click', () => { stopSeq(); state.custom = []; renderCustom(); });

    // 표기/카포
    $('typeTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]'); if (!b) return;
      state.type = b.dataset.type;
      $('typeTabs').hidden = true;
      renderTabs(); renderCards(); syncUrl();
    });
    $('typeBtn').addEventListener('click', (e) => { e.stopPropagation(); $('typeTabs').hidden = !$('typeTabs').hidden; });
    document.addEventListener('click', (e) => { if (!e.target.closest('.inst-select')) $('typeTabs').hidden = true; });
    $('scaleButtons').addEventListener('click', (e) => {
      const b = e.target.closest('[data-scale]'); if (!b) return;
      state.scale = b.dataset.scale; renderTabs(); renderCards();
    });
    const zoomBy = (d) => {
      const i = Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(state.zoom) + d));
      state.zoom = ZOOMS[i]; renderCards();
    };
    $('zoomOut').addEventListener('click', () => zoomBy(-1));
    $('zoomIn').addEventListener('click', () => zoomBy(1));
    $('capoButtons').addEventListener('click', (e) => {
      const b = e.target.closest('[data-capo]'); if (!b) return;
      state.capo = +b.dataset.capo;
      renderTabs(); renderCards(); syncUrl();
    });

    // 카드
    $('cards').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) {
        const card = e.target.closest('.card');
        if (card && $('cards').classList.contains('compact')) playOne(card.dataset.chord, 'strum');
        return;
      }
      const c = b.closest('.card').dataset.chord;
      const act = b.dataset.act;
      if (act === 'play') playOne(c, 'strum');
      else if (act === 'arp') playOne(c, 'arp');
      else if (act === 'sprev' || act === 'snext') {
        const ch = T.parseChord(c);
        const sc = scaleState(c, ch, currentVoicing(c).v);
        state.sp[sc.key] = (sc.idx + (act === 'snext' ? 1 : -1) + sc.ps.length) % sc.ps.length;
        renderCards();
      } else if (act === 'prev' || act === 'next') {
        const inst = instOf(state.type);
        const { vs, idx } = currentVoicing(c);
        state.vi[viKey(c, inst)] = (idx + (act === 'next' ? 1 : -1) + vs.length) % vs.length;
        renderCards();
        playOne(c, 'strum');
      } else if (act === 'all') openVoicingModal(c);
    });
    $('voicingGrid').addEventListener('click', (e) => {
      const it = e.target.closest('[data-vi]'); if (!it) return;
      const c = $('voicingModal').dataset.chord;
      state.vi[viKey(c, instOf(state.type))] = +it.dataset.vi;
      $('voicingModal').hidden = true;
      renderCards();
      playOne(c, 'strum');
    });
    $('voicingClose').addEventListener('click', () => { $('voicingModal').hidden = true; });
    $('voicingModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('voicingModal').hidden = true; });

    // 헤더 / FAB
    $('horizontalToggle').addEventListener('click', (e) => {
      state.horizontal = !state.horizontal;
      e.currentTarget.classList.toggle('active', state.horizontal);
      $('cards').classList.toggle('horizontal', state.horizontal);
    });
    $('shareBtn').addEventListener('click', () => {
      syncUrl();
      const done = () => toast('링크를 복사했습니다');
      if (navigator.clipboard && location.protocol !== 'file:') navigator.clipboard.writeText(location.href).then(done, () => toast(location.href));
      else toast('주소창의 URL을 복사해 공유하세요');
    });
    $('fabTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => { $('fabTop').style.display = window.scrollY > 300 ? '' : 'none'; });
    $('fabTop').style.display = 'none';
  }

  /* ---------- 시작 ---------- */
  function init() {
    const q = new URLSearchParams(location.search);
    state.title = q.get('title') || '';
    const type = q.get('type');
    if (TYPES.includes(type)) state.type = type;
    const capo = parseInt(q.get('capo'), 10);
    if (capo >= 0 && capo <= 12) state.capo = capo;
    (q.get('chords') || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((c) => addChord(c, true));

    $('songTitle').value = state.title;
    $('songTitle').addEventListener('input', (e) => { state.title = e.target.value; syncUrl(); });
    bind();
    setupDnd();
    renderPicker();
    renderTabs();
    renderChips();
    renderCustom();
    renderCards();
  }
  init();

  function refreshAll() {
    stopSeq();
    $('songTitle').value = state.title;
    syncUrl(); renderTabs(); renderChips(); renderCustom(); renderCards();
  }
  window.AppAPI = { state, addChord, refreshAll, toast, parse: T.parseChord };
})();
