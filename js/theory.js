/* 코드 이론 + 운지법 생성 (DOM 의존 없음) */
(function (root) {
  'use strict';

  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SHAPE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']; // 카포 폼 이름용
  const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const TUNINGS = { guitar: [40, 45, 50, 55, 59, 64], ukulele: [67, 60, 64, 69] };

  function pcFromName(n) {
    const m = /^([A-G])([#b]?)$/.exec(n);
    if (!m) return null;
    let pc = LETTER[m[1]];
    if (m[2] === '#') pc++;
    else if (m[2] === 'b') pc--;
    return (pc + 12) % 12;
  }

  /* 퀄리티 문자열 -> 구성음 목록. prio: 0 근음, 1 3음, 2 7음/변화5도, 3 나머지 */
  function parseQuality(str) {
    let rem = str.replace(/[()\s]/g, '');
    let third = 4, fifth = 7, seventh = null, sus = null;
    let major = false, dim = false, power = false, fifthAltered = false, bigExt = false;
    const ext = [];
    const eat = (re) => { const m = re.exec(rem); if (m) rem = rem.slice(m[0].length); return m; };

    if (eat(/^(m7b5|ø7|ø)/)) { third = 3; fifth = 6; seventh = 10; fifthAltered = true; }
    else if (eat(/^(dim|°|o)/)) { third = 3; fifth = 6; dim = true; fifthAltered = true; }
    else if (eat(/^(aug|\+)/)) { fifth = 8; fifthAltered = true; }
    else if (eat(/^(min|m(?!aj)|-)/)) { third = 3; }

    while (rem.length) {
      let m;
      if (eat(/^(maj|M|Δ)(?=7|9|11|13)/)) { major = true; }
      else if (eat(/^(maj|M)$/)) { /* 그냥 메이저 */ }
      else if ((m = eat(/^(13|11|9|7)/))) {
        const n = +m[1];
        seventh = major ? 11 : (dim && n === 7 ? 9 : 10);
        if (n >= 9) bigExt = true;
        if (n === 9) ext.push({ iv: 14, req: true });
        if (n === 11) { ext.push({ iv: 14, req: false }); ext.push({ iv: 17, req: true }); }
        if (n === 13) { ext.push({ iv: 14, req: false }); ext.push({ iv: 17, req: false }); ext.push({ iv: 21, req: true }); }
      }
      else if (eat(/^6/)) { ext.push({ iv: 9, req: true }); }
      else if ((m = eat(/^add(9|11|13|2|4)/))) {
        ext.push({ iv: { 9: 14, 11: 17, 13: 21, 2: 14, 4: 17 }[m[1]], req: true });
      }
      else if ((m = eat(/^sus(2|4)?/))) { sus = m[1] === '2' ? 2 : 5; }
      else if (eat(/^(b5|-5)/)) { fifth = 6; fifthAltered = true; }
      else if (eat(/^(#5|\+5)/)) { fifth = 8; fifthAltered = true; }
      else if (eat(/^b9/)) { ext.push({ iv: 13, req: true }); }
      else if (eat(/^#9/)) { ext.push({ iv: 15, req: true }); }
      else if (eat(/^#11/)) { ext.push({ iv: 18, req: true }); }
      else if (eat(/^b13/)) { ext.push({ iv: 20, req: true }); }
      else if (eat(/^5$/)) { power = true; }
      else return null;
    }

    const items = [{ iv: 0, req: true, prio: 0 }];
    if (power) {
      items.push({ iv: 7, req: true, prio: 1 });
    } else {
      items.push({ iv: sus !== null ? sus : third, req: true, prio: 1 });
      const fifthReq = fifthAltered || (seventh === null && !bigExt);
      items.push({ iv: fifth, req: fifthReq, prio: fifthAltered ? 2 : 3 });
      if (seventh !== null) items.push({ iv: seventh, req: true, prio: 2 });
      ext.forEach((e) => items.push({ iv: e.iv, req: e.req, prio: 3 }));
    }
    // 같은 음정 중복 제거
    const seen = new Set();
    return items.filter((i) => (seen.has(i.iv % 12) ? false : (seen.add(i.iv % 12), true)));
  }

  function parseChord(input) {
    const s = String(input || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
    const m = /^([A-Ga-g])([#b]?)(.*)$/.exec(s);
    if (!m) return null;
    const rootName = m[1].toUpperCase() + m[2];
    let rest = m[3], bassName = null;
    const si = rest.lastIndexOf('/');
    if (si >= 0) {
      const b = /^([A-Ga-g])([#b]?)$/.exec(rest.slice(si + 1));
      if (!b) return null;
      bassName = b[1].toUpperCase() + b[2];
      rest = rest.slice(0, si);
    }
    const items = parseQuality(rest);
    if (!items) return null;
    const rootPc = pcFromName(rootName);
    const bassPc = bassName ? pcFromName(bassName) : null;
    const flats = rootName.includes('b') || (bassName && bassName.includes('b')) || rootName === 'F';
    const pcs = [...new Set(items.map((i) => (rootPc + i.iv) % 12))];
    return {
      name: rootName + rest + (bassName ? '/' + bassName : ''),
      rootName, rest, bassName, rootPc, bassPc, items, pcs, flats,
    };
  }

  function noteName(pc, chord) { return (chord && chord.flats ? FLAT : SHARP)[((pc % 12) + 12) % 12]; }

  /* 카포: n프렛 카포일 때 연주할 '폼' 코드 */
  function transposeChord(chord, n) {
    if (!n) return chord;
    const t = (pc) => SHAPE[(((pc + n) % 12) + 12) % 12];
    const str = t(chord.rootPc) + chord.rest + (chord.bassPc != null ? '/' + t(chord.bassPc) : '');
    return parseChord(str);
  }

  /* 구성음 이름 (근음부터 쌓은 순서) */
  function chordNoteNames(chord) {
    const sorted = [...chord.items].sort((a, b) => (a.iv % 12) - (b.iv % 12));
    const names = sorted.map((i) => noteName(chord.rootPc + i.iv, chord));
    return names;
  }

  /* ---------- 운지법 ---------- */
  function analyzeFingers(frets) {
    const fr = frets.map((f, i) => ({ f, i })).filter((o) => o.f > 0);
    const fingers = frets.map(() => 0);
    if (!fr.length) return { count: 0, barre: null, fingers };
    const minF = Math.min(...fr.map((o) => o.f));
    const atMin = fr.filter((o) => o.f === minF).map((o) => o.i);
    let barre = null;
    if (atMin.length >= 2) {
      const a = atMin[0], b = atMin[atMin.length - 1];
      let ok = true;
      for (let i = a; i <= b; i++) if (frets[i] < minF) ok = false;
      if (ok) barre = { fret: minF, from: a, to: b };
    }
    let next = 1;
    let others;
    if (barre) {
      atMin.forEach((i) => (fingers[i] = 1));
      next = 2;
      others = fr.filter((o) => o.f !== minF);
    } else {
      others = fr.slice();
    }
    others.sort((x, y) => x.f - y.f || x.i - y.i);
    others.forEach((o) => { fingers[o.i] = Math.min(next++, 4); });
    // barre 가 없으면 others 에 atMin 도 포함되어 있으므로 others.length 가 곧 전체 손가락 수
    const total = barre ? 1 + others.length : others.length;
    return { count: total, barre, fingers };
  }

  function findVoicings(chord, inst, max) {
    max = max || 12;
    const tun = TUNINGS[inst];
    const n = tun.length;
    const guitar = inst === 'guitar';
    const slash = chord.bassPc != null;
    const bassPc = slash ? chord.bassPc : chord.rootPc;
    const allowed = new Set(chord.pcs);
    if (slash) allowed.add(bassPc);
    
    for (let level = 0; level < 3; level++) {
      const req = new Set(
        chord.items.filter((i) => i.req && i.prio <= 3 - level).map((i) => (chord.rootPc + i.iv) % 12)
      );
      if (slash) req.add(bassPc);
      const found = new Map();
      const minPlayed = guitar ? 4 : (level === 0 ? 4 : 3);

      for (let w = 1; w <= 12; w++) {
        const frets = new Array(n).fill(-1);
        const rec = (i) => {
          if (i === n) { evaluate(frets, w); return; }
          frets[i] = -1;
          rec(i + 1);
          const cand = [];
          if (w <= 4) cand.push(0);
          for (let f = w; f <= w + 3; f++) cand.push(f);
          for (const f of cand) {
            if (!allowed.has((tun[i] + f) % 12)) continue;
            frets[i] = f;
            rec(i + 1);
          }
          frets[i] = -1;
        };
        rec(0);
      }

      function evaluate(frets, w) {
        const played = [];
        for (let i = 0; i < n; i++) if (frets[i] >= 0) played.push(i);
        if (played.length < minPlayed) return;
        // 중간에 뮤트 금지
        for (let i = played[0]; i <= played[played.length - 1]; i++) if (frets[i] < 0) return;
        const fretted = frets.filter((f) => f > 0);
        if (!fretted.length) { if (w !== 1) return; }
        else if (w > 1 && Math.min(...fretted) !== w) return;

        const pcsPlayed = new Set(played.map((i) => (tun[i] + frets[i]) % 12));
        for (const p of req) if (!pcsPlayed.has(p)) return;

        let lowIdx = played[0], lowMidi = tun[lowIdx] + frets[lowIdx];
        for (const i of played) { const m = tun[i] + frets[i]; if (m < lowMidi) { lowMidi = m; lowIdx = i; } }
        const lowPc = lowMidi % 12;
        if (guitar && lowPc !== bassPc) return;
        if (!guitar && slash && lowPc !== bassPc) return;

        const fg = analyzeFingers(frets);
        if (fg.count > 4) return;

        const muted = n - played.length;
        const open = played.filter((i) => frets[i] === 0).length;
        const fifthPc = (chord.rootPc + 7) % 12;
        let score = fg.count * 1.6 + (w - 1) * 0.5 + muted * (guitar ? 1.7 : 3) - open * 0.4 - played.length * 0.3;
        if (lowPc !== chord.rootPc && !slash) score += 1.5;
        if (chord.pcs.includes(fifthPc) && !pcsPlayed.has(fifthPc)) score += 0.4;
        if (w > 1 && !fg.barre) score += 1;

        const key = frets.join(',');
        if (!found.has(key)) {
          found.set(key, { frets: frets.slice(), fingers: fg.fingers, barre: fg.barre, score, pos: fretted.length ? Math.min(...fretted) : 0 });
        }
      }

      if (found.size) {
        const arr = [...found.values()].sort((a, b) => a.score - b.score).slice(0, max);
        const best = arr.shift();
        arr.sort((a, b) => a.pos - b.pos || a.score - b.score);
        return [best, ...arr];
      }
    }
    return [];
  }

  function voicingMidis(v, inst, capo) {
    const tun = TUNINGS[inst];
    const out = [];
    v.frets.forEach((f, i) => { if (f >= 0) out.push(tun[i] + f + (capo || 0)); });
    return out;
  }

  /* 피아노/오선보 보이싱: 근음이 C4~B4 에 오도록 쌓고, 슬래시 베이스는 아래에 */
  function pianoMidis(chord) {
    const base = 60 + chord.rootPc;
    const mids = [...new Set(chord.items.map((i) => i.iv % 12))]
      .sort((a, b) => a - b)
      .map((iv) => base + iv);
    if (chord.bassPc != null) {
      let b = base - 1;
      while (((b % 12) + 12) % 12 !== chord.bassPc) b--;
      mids.unshift(b);
    }
    return mids;
  }

  function midiInfo(midi, chord) {
    const name = noteName(midi, chord);
    return { midi, name, letter: name[0], acc: name.slice(1), oct: Math.floor(midi / 12) - 1 };
  }

  const api = { SHARP, FLAT, TUNINGS, parseChord, noteName, transposeChord, chordNoteNames,
    findVoicings, voicingMidis, pianoMidis, midiInfo, pcFromName, analyzeFingers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Theory = api;
})(this);
