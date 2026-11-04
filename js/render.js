/* SVG / VexFlow 렌더러 — 모두 문자열(SVG) 또는 DOM 반환 */
(function (root) {
  'use strict';
  const T = root.Theory;
  const BLUE = '#3b82f6', ROOT = '#1e3a8a', GRAY = '#9ca3af', INK = '#374151';

  /* ---------- 기타/우쿨렐레 다이어그램 ---------- */
  function diagram(v, inst, chord) {
    const tun = T.TUNINGS[inst], n = tun.length;
    const sw = n === 6 ? 24 : 34, fh = 30, left = 40, right = 30, top = 46, rows = 5;
    const W = left + sw * (n - 1) + right, H = top + rows * fh + 34;
    const fretted = v.frets.filter((f) => f > 0);
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    const minF = fretted.length ? Math.min(...fretted) : 1;
    const start = maxF > rows ? minF : 1;
    const X = (i) => left + i * sw;
    const Y = (f) => top + (f - start + 0.5) * fh;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif">`;
    // 프렛 선
    for (let r = 0; r <= rows; r++) {
      const y = top + r * fh;
      const thick = r === 0 && start === 1;
      s += `<line x1="${X(0)}" y1="${y}" x2="${X(n - 1)}" y2="${y}" stroke="${INK}" stroke-width="${thick ? 5 : 1.3}"/>`;
    }
    // 줄
    for (let i = 0; i < n; i++) s += `<line x1="${X(i)}" y1="${top}" x2="${X(i)}" y2="${top + rows * fh}" stroke="${INK}" stroke-width="1.3"/>`;
    if (start > 1) s += `<text x="${X(0) - 16}" y="${top + fh * 0.5 + 4}" text-anchor="end" font-size="12" fill="${INK}" font-weight="600">${start}fr</text>`;
    // 바레
    if (v.barre) {
      const b = v.barre;
      if (b.fret - start >= 0 && b.fret - start < rows)
        s += `<rect x="${X(b.from) - 9}" y="${Y(b.fret) - 9}" width="${X(b.to) - X(b.from) + 18}" height="18" rx="9" fill="${BLUE}"/>`;
    }
    v.frets.forEach((f, i) => {
      if (f < 0) {
        s += `<text x="${X(i)}" y="${top - 12}" text-anchor="middle" font-size="15" fill="${GRAY}">×</text>`;
      } else if (f === 0) {
        s += `<circle cx="${X(i)}" cy="${top - 16}" r="5" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
      } else {
        const isRoot = chord && ((tun[i] + f) % 12 === chord.rootPc);
        s += `<circle cx="${X(i)}" cy="${Y(f)}" r="10" fill="${isRoot ? ROOT : BLUE}"/>`;
        if (v.fingers[i]) s += `<text x="${X(i)}" y="${Y(f) + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${v.fingers[i]}</text>`;
      }
    });
    // 줄 아래 음 이름
    v.frets.forEach((f, i) => {
      if (f < 0) return;
      const name = T.noteName(tun[i] + f, chord);
      s += `<text x="${X(i)}" y="${top + rows * fh + 20}" text-anchor="middle" font-size="12" fill="${GRAY}">${name}</text>`;
    });
    return s + '</svg>';
  }

  /* ---------- 타브 ---------- */
  function tab(v, inst, capo) {
    const n = v.frets.length, sp = 22, left = 34, top = 24;
    const W = 150, H = top + sp * (n - 1) + 28;
    const labels = n === 6 ? ['E', 'A', 'D', 'G', 'B', 'e'] : ['G', 'C', 'E', 'A'];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif">`;
    for (let i = 0; i < n; i++) {
      const y = top + (n - 1 - i) * sp;
      s += `<line x1="${left}" y1="${y}" x2="${W - 10}" y2="${y}" stroke="${GRAY}" stroke-width="1.2"/>`;
      s += `<text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${GRAY}">${labels[i]}</text>`;
    }
    s += `<text x="12" y="${top + (n - 1) * sp / 2 + 5}" text-anchor="middle" font-size="12" font-weight="700" fill="${INK}" transform="rotate(-90 12 ${top + (n - 1) * sp / 2})">TAB</text>`;
    v.frets.forEach((f, i) => {
      const y = top + (n - 1 - i) * sp;
      const x = left + 50;
      s += `<rect x="${x - 12}" y="${y - 9}" width="24" height="18" fill="#fff"/>`;
      s += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${f < 0 ? GRAY : INK}">${f < 0 ? 'x' : f}</text>`;
    });
    s += `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + (n - 1) * sp}" stroke="${GRAY}" stroke-width="1.2"/>`;
    return s + '</svg>';
  }

  /* ---------- 피아노 ---------- */
  function piano(midis, chord) {
    const white = [0, 2, 4, 5, 7, 9, 11];
    let lo = Math.min(...midis) - 1, hi = Math.max(...midis) + 1;
    while (!white.includes(lo % 12)) lo--;
    while (!white.includes(hi % 12)) hi++;
    while (hi - lo < 12) hi++;
    while (!white.includes(hi % 12)) hi++;
    const WK = 24, WH = 110, BW = 15, BH = 68;
    const on = new Set(midis);
    const rootSet = new Set(midis.filter((m) => m % 12 === chord.rootPc));
    let wc = 0;
    for (let m = lo; m <= hi; m++) if (white.includes(m % 12)) wc++;
    const W = wc * WK + 2, H = WH + 22;
    let wk = '', bk = '';
    let idx = 0;
    for (let m = lo; m <= hi; m++) {
      const pc = m % 12;
      if (white.includes(pc)) {
        const x = idx * WK + 1;
        const lit = on.has(m);
        wk += `<rect x="${x}" y="1" width="${WK}" height="${WH}" fill="${lit ? (rootSet.has(m) ? '#60a5fa' : '#bfdbfe') : '#fff'}" stroke="${INK}" stroke-width="1"/>`;
        if (lit) wk += `<text x="${x + WK / 2}" y="${WH + 15}" text-anchor="middle" font-size="11" font-weight="600" fill="${ROOT}">${T.noteName(m, chord)}</text>`;
        idx++;
      } else {
        const x = idx * WK + 1 - BW / 2;
        const lit = on.has(m);
        bk += `<rect x="${x}" y="1" width="${BW}" height="${BH}" rx="2" fill="${lit ? '#2563eb' : '#1f2937'}"/>`;
        if (lit) bk += `<text x="${x + BW / 2}" y="${WH + 15}" text-anchor="middle" font-size="11" font-weight="600" fill="${ROOT}">${T.noteName(m, chord)}</text>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif">${wk}${bk}</svg>`;
  }

  /* ---------- 오선보 (VexFlow) ---------- */
  function staff(target, midis, chord) {
    target.innerHTML = '';
    if (!root.Vex) { target.innerHTML = '<div class="no-voicing">오선보 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인)</div>'; return; }
    try {
      const VF = root.Vex.Flow;
      const infos = [...midis].sort((a, b) => a - b).map((m) => T.midiInfo(m, chord));
      const div = document.createElement('div');
      target.appendChild(div);
      const r = new VF.Renderer(div, VF.Renderer.Backends.SVG);
      r.resize(170, 190);
      const ctx = r.getContext();
      const st = new VF.Stave(10, 45, 150);
      st.addClef('treble');
      st.setContext(ctx).draw();
      const keys = infos.map((i) => `${i.letter.toLowerCase()}${i.acc}/${i.oct}`);
      const sn = new VF.StaveNote({ clef: 'treble', keys, duration: 'w' });
      infos.forEach((i, idx) => { if (i.acc) sn.addAccidental(idx, new VF.Accidental(i.acc)); });
      VF.Formatter.FormatAndDraw(ctx, st, [sn]);
    } catch (e) {
      target.innerHTML = '<div class="no-voicing">오선보를 그릴 수 없습니다</div>';
      console.error(e);
    }
  }

  /* ---------- 스케일 포지션 (5프렛 창) ---------- */
  function scaleBoard(inst, chord, pcs, s) {
    const tun = T.TUNINGS[inst], n = tun.length;
    const sw = n === 6 ? 24 : 34, fh = 30, left = 40, right = 30, top = 46, rows = 5;
    const W = left + sw * (n - 1) + right, H = top + rows * fh + 10;
    const start = Math.max(s, 1);
    const X = (i) => left + i * sw;
    const Y = (f) => top + (f - start + 0.5) * fh;
    const cps = new Set(chord.pcs);
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif">`;
    for (let r = 0; r <= rows; r++) o += `<line x1="${X(0)}" y1="${top + r * fh}" x2="${X(n - 1)}" y2="${top + r * fh}" stroke="${INK}" stroke-width="${r === 0 && start === 1 ? 5 : 1.3}"/>`;
    for (let i = 0; i < n; i++) o += `<line x1="${X(i)}" y1="${top}" x2="${X(i)}" y2="${top + rows * fh}" stroke="${INK}" stroke-width="1.3"/>`;
    if (start > 1) o += `<text x="${X(0) - 16}" y="${top + fh * 0.5 + 4}" text-anchor="end" font-size="12" fill="${INK}" font-weight="600">${start}fr</text>`;
    const dot = (cx, cy, pc) => {
      const isRoot = pc === chord.rootPc, isChord = cps.has(pc);
      const fill = isRoot ? ROOT : isChord ? BLUE : '#dbeafe';
      const txt = isRoot || isChord ? '#fff' : '#1e40af';
      return `<circle cx="${cx}" cy="${cy}" r="10" fill="${fill}" stroke="${isRoot || isChord ? 'none' : '#93c5fd'}"/>` +
        `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${txt}">${T.noteName(pc, chord)}</text>`;
    };
    for (let i = 0; i < n; i++) {
      for (let f = s; f <= start + rows - 1; f++) {
        const pc = (tun[i] + f) % 12;
        if (!pcs.includes(pc)) continue;
        if (f === 0) o += dot(X(i), top - 16, pc); else o += dot(X(i), Y(f), pc);
      }
    }
    return o + '</svg>';
  }

  root.Render = { diagram, tab, piano, staff, scaleBoard };
})(this);
