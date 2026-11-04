/* Strum: 음원 → 코드 진행 분석 + 연습(속도/구간 반복). 모두 브라우저 안에서 처리 */
(function () {
  'use strict';
  const T = window.Theory, R = window.Render;
  const $ = (id) => document.getElementById(id);
  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const QUALS = [ // [접미사, 구성음, 가중치(약간 단순한 코드 선호)]
    ['', [0, 4, 7], 1.0], ['m', [0, 3, 7], 1.0], ['7', [0, 4, 7, 10], 0.93], ['m7', [0, 3, 7, 10], 0.93], ['maj7', [0, 4, 7, 11], 0.92],
  ];
  const SR = 11025, N = 4096, HOP = 2048;
  const S = { chords: [], inst: 'guitar', a: null, b: null, loop: false, url: null };

  /* ---------- FFT ---------- */
  function makeFFT(n) {
    const rev = new Uint32Array(n), bits = Math.log2(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
    const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
    return (re, im) => {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cos[k] - im[b] * sin[k], ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    };
  }

  /* ---------- 분석 ---------- */
  function toMono(buf) {
    const ch = buf.numberOfChannels, len = buf.length, f = Math.max(1, Math.round(buf.sampleRate / SR));
    const out = new Float32Array(Math.floor(len / f));
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      for (let k = 0; k < f; k++) for (let c = 0; c < ch; c++) sum += data[c][i * f + k];
      out[i] = sum / (f * ch);
    }
    return { x: out, sr: buf.sampleRate / f };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  async function analyze(buf, onProg) {
    const { x, sr } = toMono(buf);
    const fft = makeFFT(N), re = new Float32Array(N), im = new Float32Array(N);
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    // bin → 피치클래스
    const binPc = new Int8Array(N / 2).fill(-1);
    for (let k = 1; k < N / 2; k++) {
      const f = k * sr / N;
      if (f < 70 || f > 1800) continue;
      binPc[k] = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
    }
    const frames = Math.max(0, Math.floor((x.length - N) / HOP));
    const chroma = [];
    for (let fi = 0; fi < frames; fi++) {
      const o = fi * HOP;
      for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
      fft(re, im);
      const c = new Float32Array(12);
      for (let k = 1; k < N / 2; k++) if (binPc[k] >= 0) c[binPc[k]] += Math.log1p(10 * Math.hypot(re[k], im[k]) / 50);
      let n2 = 0; for (let i = 0; i < 12; i++) n2 += c[i] * c[i];
      n2 = Math.sqrt(n2) || 1;
      chroma.push({ c: c.map((v) => v / n2), e: n2 });
      if (fi % 40 === 0) { onProg(fi / frames); await tick(); }
    }
    // 시간 평활 (±2프레임)
    const sm = chroma.map((_, i) => {
      const a = new Float32Array(12); let w = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(chroma.length - 1, i + 2); j++) { for (let p = 0; p < 12; p++) a[p] += chroma[j].c[p]; w++; }
      return a.map((v) => v / w);
    });
    // 상태: 12*QUALS + 무음
    const states = [];
    for (let r = 0; r < 12; r++) QUALS.forEach(([q, iv, wt]) => {
      const t = new Float32Array(12); iv.forEach((v, k) => { t[(r + v) % 12] = k === 0 ? 1.2 : 1; });
      const nn = Math.sqrt(t.reduce((s, v) => s + v * v, 0)); states.push({ name: NAMES[r] + q, t: t.map((v) => v / nn), wt });
    });
    const NS = states.length;
    const maxE = Math.max(...chroma.map((c) => c.e), 1e-6);
    const score = (i) => {
      const sc = new Float32Array(NS + 1);
      for (let s = 0; s < NS; s++) { let d = 0; for (let p = 0; p < 12; p++) d += sm[i][p] * states[s].t[p]; sc[s] = d * states[s].wt; }
      sc[NS] = chroma[i].e < maxE * 0.08 ? 0.9 : 0.2;
      return sc;
    };
    // Viterbi (머무르기 보너스)
    const STAY = 0.12;
    let prev = score(0), back = [];
    for (let i = 1; i < frames; i++) {
      const cur = score(i), bp = new Int16Array(NS + 1);
      let bestPrev = 0; for (let s = 1; s <= NS; s++) if (prev[s] > prev[bestPrev]) bestPrev = s;
      for (let s = 0; s <= NS; s++) {
        const stay = prev[s] + STAY, move = prev[bestPrev];
        if (stay >= move) { bp[s] = s; cur[s] += stay; } else { bp[s] = bestPrev; cur[s] += move; }
      }
      back.push(bp); prev = cur;
      if (i % 200 === 0) await tick();
    }
    let s = 0; for (let k = 1; k <= NS; k++) if (prev[k] > prev[s]) s = k;
    const path = new Int16Array(frames); path[frames - 1] = s;
    for (let i = frames - 1; i >= 1; i--) { s = back[i - 1][s]; path[i - 1] = s; }
    // 구간화
    const dt = HOP / sr, out = [];
    let st = 0;
    for (let i = 1; i <= frames; i++) {
      if (i === frames || path[i] !== path[st]) {
        const id = path[st];
        if (id !== NS) out.push({ t: st * dt, e: i * dt, name: states[id].name });
        st = i;
      }
    }
    // 너무 짧은 구간은 이웃에 병합
    const merged = [];
    out.forEach((c) => {
      const last = merged[merged.length - 1];
      if (last && last.name === c.name && c.t - last.e < 0.6) last.e = c.e;
      else if (c.e - c.t < 0.5 && last) last.e = c.e;
      else merged.push({ ...c });
    });
    return merged;
  }

  /* ---------- UI ---------- */
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const audio = () => $('strumAudio');
  let curIdx = -1;

  function chordAt(t) {
    for (let i = 0; i < S.chords.length; i++) if (t >= S.chords[i].t && t < S.chords[i].e + 0.0001) return i;
    let best = -1; S.chords.forEach((c, i) => { if (c.t <= t) best = i; }); return best;
  }
  function drawDiagram(name) {
    const box = $('nowDiagram'); box.innerHTML = '';
    const ch = name && T.parseChord(name); if (!ch) return;
    try {
      const vs = T.findVoicings(ch, S.inst);
      if (vs[0]) box.innerHTML = R.diagram(vs[0], S.inst, ch);
    } catch (e) { /* 무시 */ }
  }
  function renderChart() {
    $('strumChart').innerHTML = S.chords.map((c, i) => `<button class="sc" data-i="${i}">${c.name}<small>${fmt(c.t)}</small></button>`).join('');
    $('strumChartPanel').hidden = !S.chords.length;
  }
  function update() {
    const a = audio(), t = a.currentTime;
    $('strumCur').textContent = fmt(t);
    if (!$('strumSeek').matches(':active')) $('strumSeek').value = a.duration ? (t / a.duration) * 1000 : 0;
    if (S.loop && S.a != null && S.b != null && S.b > S.a && t >= S.b) a.currentTime = S.a;
    const i = chordAt(t);
    if (i !== curIdx) {
      curIdx = i;
      $('nowChord').textContent = i >= 0 ? S.chords[i].name : '–';
      $('nextChord').textContent = i >= 0 && S.chords[i + 1] ? S.chords[i + 1].name : '–';
      drawDiagram(i >= 0 ? S.chords[i].name : null);
      document.querySelectorAll('#strumChart .sc').forEach((el, k) => el.classList.toggle('cur', k === i));
      const cur = document.querySelector('#strumChart .sc.cur'); if (cur && !a.paused) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (!a.paused) requestAnimationFrame(update);
  }
  function loopInfo() {
    $('loopInfo').textContent = S.a == null && S.b == null ? '' : `A ${S.a != null ? fmt(S.a) : '–'} ~ B ${S.b != null ? fmt(S.b) : '–'}`;
    $('loopToggle').classList.toggle('on', S.loop);
    document.querySelectorAll('#strumChart .sc').forEach((el, k) => {
      const c = S.chords[k];
      el.classList.toggle('inloop', S.a != null && S.b != null && c.t >= S.a - 0.01 && c.e <= S.b + 0.01);
    });
  }

  async function loadFile(file) {
    const st = $('strumStatus'), bar = $('strumBar');
    if (!file) return;
    audio().pause();
    $('strumPlayer').hidden = true; $('strumChartPanel').hidden = true;
    st.className = 'status'; st.textContent = '파일 불러오는 중…';
    $('strumProgress').hidden = false; bar.style.width = '0';
    try {
      const ab = await file.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
      ctx.close && ctx.close();
      st.textContent = '코드 분석 중… (곡 길이에 따라 수 초~수십 초)';
      S.chords = await analyze(buf, (p) => { bar.style.width = Math.round(p * 100) + '%'; });
      if (S.url) URL.revokeObjectURL(S.url);
      S.url = URL.createObjectURL(file);
      audio().src = S.url; audio().playbackRate = +$('strumSpeed').value;
      S.a = S.b = null; S.loop = false; curIdx = -2;
      $('strumPlayer').hidden = false;
      $('strumDur').textContent = fmt(buf.duration);
      renderChart(); loopInfo(); update();
      st.textContent = S.chords.length ? `${file.name} — 코드 ${S.chords.length}개 구간 인식 (자동 분석이라 틀릴 수 있어요)` : '코드를 인식하지 못했습니다';
    } catch (e) {
      console.error(e);
      st.className = 'status err'; st.textContent = '이 파일을 분석할 수 없습니다 (지원 형식: MP3, WAV, M4A)';
    }
    $('strumProgress').hidden = true;
  }

  /* ---------- 링크 임베드 + 직접 입력 ---------- */
  function parseLink(raw) {
    let u; try { u = new URL(raw.trim()); } catch (e) { return null; }
    const h = u.hostname.replace(/^www\.|^m\./, '');
    let m;
    if (h === 'youtu.be') m = u.pathname.slice(1).split('/')[0];
    else if (h.endsWith('youtube.com')) m = u.searchParams.get('v') || (/^\/(shorts|embed|live)\/([\w-]{11})/.exec(u.pathname) || [])[2];
    if (m && /^[\w-]{11}$/.test(m)) return { kind: 'yt', src: `https://www.youtube-nocookie.com/embed/${m}` };
    if (h === 'open.spotify.com') {
      const r = /\/(track|episode|album|playlist|artist)\/(\w+)/.exec(u.pathname);
      if (r) return { kind: 'sp', src: `https://open.spotify.com/embed/${r[1]}/${r[2]}`, h: r[1] === 'track' || r[1] === 'episode' ? 152 : 352 };
    }
    return null;
  }
  let linkInst = 'guitar';
  function renderManual() {
    const names = [];
    ($('manualChords').value.split(/[\s,]+/).filter(Boolean)).forEach((x) => {
      const ch = T.parseChord(x);
      if (ch && !names.includes(ch.name)) names.push(ch.name);
    });
    $('manualGrid').innerHTML = names.map((n) => {
      const ch = T.parseChord(n); let svg = '';
      try { const v = T.findVoicings(ch, linkInst)[0]; if (v) svg = R.diagram(v, linkInst, ch); } catch (e) { /* 무시 */ }
      return `<div class="mg"><b>${n}</b>${svg || '<div class="muted">운지법 없음</div>'}</div>`;
    }).join('');
    return names;
  }
  function initLink() {
    $('linkGo').addEventListener('click', () => {
      const r = parseLink($('linkInput').value), st = $('linkStatus'), box = $('linkEmbed');
      if (!r) { st.textContent = 'YouTube 또는 Spotify 링크를 확인해주세요'; return; }
      st.textContent = '';
      box.className = 'link-embed ' + r.kind; box.hidden = false;
      box.innerHTML = `<iframe src="${r.src}" ${r.kind === 'sp' ? `height="${r.h}"` : ''} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      $('manualBox').hidden = false;
    });
    $('linkInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('linkGo').click(); });
    $('manualChords').addEventListener('input', renderManual);
    document.querySelector('.link-inst').addEventListener('click', (e) => {
      const b = e.target.closest('[data-linst]'); if (!b) return;
      linkInst = b.dataset.linst;
      document.querySelectorAll('[data-linst]').forEach((x) => x.classList.toggle('active', x === b));
      renderManual();
    });
    $('manualToViewer').addEventListener('click', () => {
      const names = renderManual(); if (!names.length) { $('linkStatus').textContent = '보낼 코드가 없습니다'; return; }
      location.href = location.pathname + '?chords=' + encodeURIComponent(names.join(',')) + '&type=' + linkInst + '-diagram';
    });
  }

  function init() {
    initLink();
    const a = audio();
    $('strumFile').addEventListener('change', (e) => loadFile(e.target.files[0]));
    const dz = $('strumDrop');
    ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

    $('strumPlay').addEventListener('click', () => (a.paused ? a.play() : a.pause()));
    a.addEventListener('play', () => { $('strumPlay').textContent = '⏸ 일시정지'; requestAnimationFrame(update); });
    a.addEventListener('pause', () => { $('strumPlay').textContent = '▶ 재생'; update(); });
    a.addEventListener('ended', () => { $('strumPlay').textContent = '▶ 재생'; });
    a.addEventListener('seeked', update);
    $('strumSeek').addEventListener('input', (e) => { if (a.duration) { a.currentTime = (e.target.value / 1000) * a.duration; update(); } });
    $('strumSpeed').addEventListener('change', (e) => { a.playbackRate = +e.target.value; a.preservesPitch = true; });
    $('loopA').addEventListener('click', () => { S.a = a.currentTime; if (S.b != null && S.b <= S.a) S.b = null; loopInfo(); });
    $('loopB').addEventListener('click', () => { if (S.a == null || a.currentTime > S.a) S.b = a.currentTime; loopInfo(); });
    $('loopToggle').addEventListener('click', () => {
      if (S.a == null || S.b == null) { $('loopInfo').textContent = 'A, B 지점을 먼저 지정하세요'; return; }
      S.loop = !S.loop; loopInfo();
    });
    $('loopClear').addEventListener('click', () => { S.a = S.b = null; S.loop = false; loopInfo(); });
    $('strumChart').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      a.currentTime = S.chords[+b.dataset.i].t; update();
    });
    document.querySelector('.strum-inst').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sinst]'); if (!b) return;
      S.inst = b.dataset.sinst;
      document.querySelectorAll('.strum-inst button').forEach((x) => x.classList.toggle('active', x === b));
      curIdx = -2; update();
    });

    // 화면 전환
    const show = (strum) => {
      document.body.classList.toggle('strum-mode', strum);
      $('strumMain').hidden = !strum;
      $('navStrum').classList.toggle('active', strum);
      $('navViewer').classList.toggle('active', !strum);
      if (strum) { try { history.replaceState(null, '', location.pathname + location.search + '#strum'); } catch (e) {} }
      else { a.pause(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
      window.scrollTo(0, 0);
    };
    $('navStrum').addEventListener('click', () => show(true));
    $('navViewer').addEventListener('click', () => show(false));
    if (location.hash === '#strum') show(true);
  }
  window.Strum = { analyze };
  if (document.getElementById('strumMain')) init();
})();
