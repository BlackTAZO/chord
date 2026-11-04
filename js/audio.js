/* Web Audio 간이 신스: 기타 / 우쿨렐레 / 피아노 */
(function (root) {
  'use strict';
  let ac = null, master = null;

  function init() {
    if (!ac) {
      const AC = root.AudioContext || root.webkitAudioContext;
      ac = new AC();
      master = ac.createDynamicsCompressor();
      const g = ac.createGain();
      g.gain.value = 0.9;
      master.connect(g);
      g.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function note(midi, t, dur, inst, vel) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ac.createGain();
    g.connect(master);
    const stopAt = t + dur + 0.1;

    if (inst === 'piano') {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [[1, 1], [2, 0.45], [3, 0.22], [4, 0.1]].forEach(([mul, amp]) => {
        const o = ac.createOscillator();
        const og = ac.createGain();
        o.type = 'sine';
        o.frequency.value = f * mul;
        og.gain.value = amp;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(stopAt);
      });
    } else {
      const v = vel * (inst === 'ukulele' ? 0.9 : 0.55);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const o = ac.createOscillator();
      o.type = inst === 'ukulele' ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(f * 9, 7000), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.6, 300), t + dur * 0.6);
      o.connect(lp); lp.connect(g);
      o.start(t); o.stop(stopAt);
    }
  }

  /* mode: 'strum' | 'arp' — 반환값: 소리가 끝나는 대략의 시간(ms) */
  function playChord(midis, inst, mode) {
    if (!midis || !midis.length) return 0;
    init();
    const t0 = ac.currentTime + 0.03;
    const gap = mode === 'arp' ? 0.2 : (inst === 'piano' ? 0.012 : 0.045);
    const dur = inst === 'piano' ? 2.4 : (inst === 'ukulele' ? 1.3 : 2.0);
    const vel = Math.min(0.4, 1.0 / Math.sqrt(midis.length));
    midis.forEach((m, i) => note(m, t0 + i * gap, dur, inst, vel));
    return (gap * midis.length + dur) * 1000;
  }

  root.ChordAudio = { init, playChord };
})(this);
