# 코드 뷰어 (Chord Viewer + Strum)

기타·우쿨렐레·피아노·오선보로 코드를 보여주는 정적 웹 앱. 서버·빌드 없이 동작한다.
GitHub Pages로 배포: https://blacktazo.github.io/chord/ (저장소 BlackTAZO/chord, `main` 푸시 시 자동 배포)

## 실행
`index.html`을 열거나 `python3 -m http.server`. (YouTube/Spotify 임베드는 https 배포 주소에서 테스트)

## 구조
- `index.html` — 모든 화면 마크업. 헤더에서 Chord Viewer ↔ Strum 전환 (`#viewerMain` / `#strumMain`)
- `css/style.css` — 전체 스타일 (모바일 우선, 560px 이하 별도 규칙)
- `js/theory.js` — 코드 파싱, 구성음, 운지법 탐색 (`window.Theory`)
- `js/render.js` — 다이어그램/타브/피아노/오선보(VexFlow)/스케일 SVG (`window.Render`)
- `js/app.js` — Chord Viewer 로직 (선택기, 칩, 카드, 줌/간단 모드, 스케일 포지션, URL 동기화)
- `js/audio.js` — 코드 소리 재생
- `js/strum.js` — Strum: 음원 업로드 코드 분석(FFT+크로마+Viterbi), 속도/구간 반복, YouTube·Spotify 임베드 + 코드 직접 입력
- `js/importer.js`, `js/presets.js`, `js/extras.js` — 악보 가져오기, 진행 프리셋, 프로젝트 저장
- `js/lock.js`, `js/lock-config.js`, `tools/set-password.js` — 편집 도구 비밀번호 잠금 (해시만 저장)

## 규칙
- 화면 문구는 한국어로 작성한다.
- CSS/JS를 수정하면 `index.html`의 `?v=` 버전 숫자를 올려 캐시를 피한다.
- 모바일 화면 기준으로 먼저 확인한다 (줄바꿈, 여백, 컴팩트한 UI 선호).
- 기존 Chord Viewer 기능은 유지하고, Strum은 별도 화면으로 둔다.
- 커밋과 푸시는 사용자가 요청할 때만 한다. 푸시하면 바로 배포된다.
- 비밀번호나 해시 값은 대화나 문서에 옮겨 적지 않는다.

## 한계 (알고 있을 것)
- YouTube/Spotify 링크는 브라우저에서 오디오 분석이 불가능해 임베드 + 수동 입력만 지원한다.
- 코드 자동 분석은 메이저/마이너/7/m7/maj7만 인식하며 정확도에 한계가 있다.
