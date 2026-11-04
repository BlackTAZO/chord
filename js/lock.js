/* 편집 도구 잠금: 방문자는 보기·재생만, 비밀번호를 입력하면 편집 도구가 열린다 (브라우저 탭 단위 유지) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SK = 'chordviewer.unlocked';
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

  function setLocked(locked) {
    document.body.classList.toggle('locked', locked);
    $('lockBtn').textContent = locked ? '🔒 편집 잠금해제' : '🔓 잠그기';
    $('songTitle').readOnly = locked;
    try { locked ? sessionStorage.removeItem(SK) : sessionStorage.setItem(SK, '1'); } catch (e) { /* 무시 */ }
  }
  async function check(pw) {
    const L = window.LOCK;
    if (!L || !window.crypto || !crypto.subtle) throw new Error('이 환경에서는 잠금을 확인할 수 없습니다 (https 또는 localhost 필요)');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(L.salt), iterations: L.iter, hash: 'SHA-256' }, key, 256);
    return hex(bits) === L.hash;
  }

  const modal = $('lockModal'), input = $('lockInput'), msg = $('lockMsg');
  function openModal() { msg.textContent = ''; input.value = ''; modal.hidden = false; input.focus(); }
  async function submit() {
    msg.textContent = '확인 중…';
    try {
      if (await check(input.value)) { setLocked(false); modal.hidden = true; window.AppAPI.toast('편집 도구가 열렸습니다'); }
      else msg.textContent = '비밀번호가 맞지 않습니다';
    } catch (e) { msg.textContent = e.message; }
  }
  $('lockBtn').addEventListener('click', () => (document.body.classList.contains('locked') ? openModal() : setLocked(true)));
  $('lockSubmit').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.hidden = true; });

  let was = false;
  try { was = sessionStorage.getItem(SK) === '1'; } catch (e) { /* 무시 */ }
  setLocked(!was);
})();
