/* 악보/코드표 → 코드 진행 추출 (텍스트, ChordPro, ASCII 타브, MusicXML, 이미지·PDF OCR) */
(function (root) {
  'use strict';
  const T = root.Theory;

  const CHORD_RE = /^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|-|\d|b|#|\(|\))*(?:\/[A-G][#b♯♭]?)?$/;
  const isChord = (tok) => CHORD_RE.test(tok) && !!T.parseChord(tok);
  const norm = (tok) => T.parseChord(tok).name;

  /* ---------- 텍스트 / ChordPro / 가사 위 코드 ---------- */
  function extractFromText(text) {
    const seq = [];
    for (const line of text.split(/\r?\n/)) {
      const br = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()).filter(isChord);
      if (br.length) { br.forEach((c) => seq.push(norm(c))); continue; }
      const toks = line.replace(/[|:]/g, ' ').split(/\s+/)
        .filter((t) => t && !/^[-–—/.~>*%]+$/.test(t) && !/^x\d+$/i.test(t) && !/^[lI!1]$/.test(t));
      if (!toks.length) continue;
      const ch = toks.filter(isChord);
      if (ch.length && ch.length / toks.length >= 0.6) ch.forEach((c) => seq.push(norm(c)));
    }
    return seq;
  }

  /* ---------- 음 집합 → 코드 이름 추정 ---------- */
  const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const QS = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', '6', 'm6', 'dim', 'aug', 'm7b5', 'dim7', 'add9', '9', 'm9', '5'];
  function detectChord(pcs, bassPc) {
    if (pcs.size < 2) return null;
    let best = null;
    for (const r of pcs) {
      QS.forEach((q, qi) => {
        const name = ROOTS[r] + q;
        const ch = T.parseChord(name);
        if (!ch) return;
        const set = new Set(ch.pcs);
        const need = ch.items.filter((i) => i.req).map((i) => (r + i.iv) % 12);
        if (!need.every((p) => pcs.has(p))) return;
        const extra = [...pcs].filter((p) => !set.has(p)).length;
        const missing = ch.pcs.filter((p) => !pcs.has(p)).length;
        const score = 3 - extra * 2 - missing * 0.6 - qi * 0.05 + (r === bassPc ? 0.8 : 0);
        if (!best || score > best.score) best = { name, score };
      });
    }
    return best && best.score > 0 ? best.name : null;
  }

  /* ---------- ASCII 기타 타브 ---------- */
  const OPEN = [64, 59, 55, 50, 45, 40]; // 위 줄(1번줄) → 아래 줄(6번줄)
  const isTabLine = (l) => /^\s*[eEBGDAa]?[|:]?[-0-9|hpbrx\/\\~()^<>\s]{8,}$/.test(l) && /-{2,}/.test(l);
  function extractFromTab(text) {
    const lines = text.split(/\r?\n/);
    const seq = [];
    let run = [];
    const flush = () => {
      for (let k = 0; k + 6 <= run.length; k += 6) tabBlock(run.slice(k, k + 6), seq);
      run = [];
    };
    for (const l of lines) { if (isTabLine(l)) run.push(l); else flush(); }
    flush();
    return seq.filter((c, i) => c !== seq[i - 1]);
  }
  function tabBlock(block, seq) {
    const len = Math.max(...block.map((l) => l.length));
    const barPos = [];
    for (let c = 2; c < len; c++) if (block.filter((l) => l[c] === '|').length >= 4) barPos.push(c);
    const bars = new Map();
    block.forEach((l, s) => {
      const re = /\d+/g; let m;
      while ((m = re.exec(l))) {
        const bar = barPos.filter((p) => p < m.index).length;
        const midi = OPEN[s] + parseInt(m[0], 10);
        if (!bars.has(bar)) bars.set(bar, []);
        bars.get(bar).push(midi);
      }
    });
    [...bars.keys()].sort((a, b) => a - b).forEach((b) => {
      const mids = bars.get(b);
      const pcs = new Set(mids.map((m) => m % 12));
      const name = detectChord(pcs, Math.min(...mids) % 12);
      if (name) seq.push(name);
    });
  }

  /* ---------- MusicXML ---------- */
  const KIND = { major: '', minor: 'm', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7', diminished: 'dim',
    'diminished-seventh': 'dim7', augmented: 'aug', 'half-diminished': 'm7b5', 'major-sixth': '6', 'minor-sixth': 'm6',
    'dominant-ninth': '9', 'major-ninth': 'maj9', 'minor-ninth': 'm9', 'suspended-fourth': 'sus4', 'suspended-second': 'sus2',
    power: '5', 'dominant-11th': '11', 'dominant-13th': '13' };
  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function extractFromMusicXML(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) return null;
    const txt = (el, tag) => { const e = el.getElementsByTagName(tag)[0]; return e ? e.textContent.trim() : ''; };
    const alt = (a) => (a === '1' ? '#' : a === '-1' ? 'b' : '');
    const seq = [];
    [...doc.getElementsByTagName('harmony')].forEach((h) => {
      const rootEl = h.getElementsByTagName('root')[0];
      if (!rootEl) return;
      const kindEl = h.getElementsByTagName('kind')[0];
      const kind = kindEl ? kindEl.textContent.trim() : 'major';
      const q = kind in KIND ? KIND[kind] : (kindEl && kindEl.getAttribute('text')) || '';
      let name = txt(rootEl, 'root-step') + alt(txt(rootEl, 'root-alter')) + q;
      const bassEl = h.getElementsByTagName('bass')[0];
      if (bassEl) name += '/' + txt(bassEl, 'bass-step') + alt(txt(bassEl, 'bass-alter'));
      if (isChord(name)) seq.push(norm(name));
    });
    if (seq.length) return seq;
    // 코드 기호가 없으면 마디별 음으로 추정
    [...doc.getElementsByTagName('measure')].forEach((me) => {
      const pcs = new Set(); let low = 999;
      [...me.getElementsByTagName('note')].forEach((n) => {
        if (n.getElementsByTagName('rest')[0]) return;
        const step = txt(n, 'step'); if (!(step in STEP)) return;
        const oct = parseInt(txt(n, 'octave'), 10) || 4;
        const a = parseInt(txt(n, 'alter') || '0', 10);
        const midi = (oct + 1) * 12 + STEP[step] + a;
        pcs.add(((midi % 12) + 12) % 12); low = Math.min(low, midi);
      });
      const name = detectChord(pcs, ((low % 12) + 12) % 12);
      if (name) seq.push(name);
    });
    return seq.filter((c, i) => c !== seq[i - 1]);
  }

  /* ---------- 외부 라이브러리 지연 로드 (이미지/PDF) ---------- */
  const loaded = {};
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (loaded[src]) return res();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { loaded[src] = 1; res(); };
      s.onerror = () => rej(new Error('라이브러리를 불러오지 못했습니다 (인터넷 연결을 확인하세요)'));
      document.head.appendChild(s);
    });
  }
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  async function ocr(sources, status) {
    await loadScript(TESS);
    status('문자 인식 엔진 준비 중… (처음에는 언어 데이터를 내려받느라 시간이 걸립니다)');
    const worker = await root.Tesseract.createWorker('eng', 1, {
      logger: (m) => { if (m.status === 'recognizing text') status(`문자 인식 중… ${Math.round(m.progress * 100)}%`); },
    });
    let out = '';
    try {
      for (const src of sources) { const { data } = await worker.recognize(src); out += data.text + '\n'; }
    } finally { await worker.terminate(); }
    return out;
  }

  async function pdfToText(file, status) {
    await loadScript(PDFJS);
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await root.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = Math.min(pdf.numPages, 8);
    let text = '';
    for (let p = 1; p <= pages; p++) {
      status(`PDF ${p}/${pages} 페이지 읽는 중…`);
      const tc = await (await pdf.getPage(p)).getTextContent();
      const rows = new Map();
      tc.items.forEach((it) => {
        const y = Math.round(it.transform[5] / 3);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(it);
      });
      [...rows.keys()].sort((a, b) => b - a).forEach((y) => {
        text += rows.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join('  ') + '\n';
      });
    }
    if (text.replace(/\s/g, '').length > 30) return text; // 텍스트 PDF
    // 스캔본 PDF → 이미지로 그려서 OCR
    const canvases = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 4); p++) {
      status(`PDF ${p} 페이지를 이미지로 변환 중…`);
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      const cv = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      canvases.push(cv);
    }
    return ocr(canvases, status);
  }

  /* ---------- 진입점 ---------- */
  function fromText(text) {
    const tab = extractFromTab(text);
    if (tab.length) return { seq: tab, kind: '기타 타브(텍스트)' };
    return { seq: extractFromText(text), kind: '코드표(텍스트)' };
  }

  async function importFile(file, status) {
    const name = file.name.toLowerCase();
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/.test(name)) {
      const text = await ocr([file], status);
      return Object.assign(fromText(text), { kind: '이미지(OCR)', raw: text });
    }
    if (name.endsWith('.pdf')) {
      const text = await pdfToText(file, status);
      return Object.assign(fromText(text), { kind: 'PDF', raw: text });
    }
    if (/\.(musicxml|xml)$/.test(name)) {
      const seq = extractFromMusicXML(await file.text());
      if (!seq) throw new Error('MusicXML 형식이 아닙니다');
      return { seq, kind: 'MusicXML' };
    }
    if (name.endsWith('.mxl')) throw new Error('압축된 .mxl 은 지원하지 않습니다. 악보 프로그램에서 압축하지 않은 .musicxml/.xml 로 내보내 주세요');
    if (/\.(mid|midi)$/.test(name)) throw new Error('MIDI 파일은 아직 지원하지 않습니다');
    const text = await file.text();
    return Object.assign(fromText(text), { raw: text });
  }

  root.Importer = { importFile, fromText, extractFromText, extractFromTab, extractFromMusicXML, detectChord, isChord };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Importer;
})(typeof window !== 'undefined' ? window : globalThis);
