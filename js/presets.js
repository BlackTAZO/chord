/* 곡 코드 진행 프리셋 (로마숫자 → 키에 맞는 코드) */
(function (root) {
  'use strict';
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];
  const NUM = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const PRESETS = [
    { n: '팝 기본', d: '가장 흔한 4코드', r: ['I', 'V', 'vi', 'IV'] },
    { n: '감성 발라드', d: 'vi 로 시작하는 4코드', r: ['vi', 'IV', 'I', 'V'] },
    { n: '50년대 진행', d: 'doo-wop', r: ['I', 'vi', 'IV', 'V'] },
    { n: '기본 3코드', d: '포크·동요·컨트리', r: ['I', 'IV', 'V', 'I'] },
    { n: '카논 진행', d: '파헬벨 캐논', r: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'] },
    { n: '일본식 왕도 진행', d: 'IV–V–iii–vi', r: ['IV', 'V', 'iii', 'vi'] },
    { n: '록', d: 'I–♭VII–IV', r: ['I', 'bVII', 'IV', 'I'] },
    { n: '재즈 ii–V–I', d: '세븐스 코드', r: ['ii7', 'V7', 'Imaj7', 'Imaj7'] },
    { n: '재즈 턴어라운드', d: 'I–vi–ii–V', r: ['Imaj7', 'vi7', 'ii7', 'V7'] },
    { n: '12마디 블루스', d: '블루스 기본 12마디', r: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'] },
    { n: '단조 팝', d: 'i–VI–III–VII', minor: true, r: ['i', 'VI', 'III', 'VII'] },
    { n: '안달루시안', d: 'i–VII–VI–V (플라멩코)', minor: true, r: ['i', 'VII', 'VI', 'V'] },
    { n: '단조 기본', d: 'i–iv–V–i', minor: true, r: ['i', 'iv', 'V', 'i'] },
  ];

  function chordFor(numeral, key, minor) {
    const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/.exec(numeral);
    if (!m) return null;
    const lower = m[2] === m[2].toLowerCase();
    const deg = NUM[m[2].toUpperCase()];
    let pc = key + (minor ? MINOR : MAJOR)[deg] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
    pc = ((pc % 12) + 12) % 12;
    const relMajor = minor ? (key + 3) % 12 : key;
    const names = [5, 10, 3, 8, 1].includes(relMajor) ? FLAT : SHARP;
    let suffix = m[3];
    if (lower && !suffix.startsWith('m') && !suffix.startsWith('dim')) suffix = 'm' + suffix;
    return names[pc] + suffix;
  }

  function build(preset, key) {
    return preset.r.map((n) => chordFor(n, key, !!preset.minor));
  }

  const api = { PRESETS, build, chordFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Presets = api;
})(typeof window !== 'undefined' ? window : globalThis);
