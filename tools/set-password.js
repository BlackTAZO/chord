#!/usr/bin/env node
/* 사용법: node tools/set-password.js "새 비밀번호"  → js/lock-config.js 갱신 (해시만 저장, 원문은 저장하지 않음) */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pw = process.argv[2];
if (!pw || pw.length < 8) { console.error('비밀번호는 8자 이상이어야 합니다.\n사용법: node tools/set-password.js "새 비밀번호"'); process.exit(1); }
const salt = crypto.randomBytes(16);
const iter = 200000;
const hash = crypto.pbkdf2Sync(pw, salt, iter, 32, 'sha256');
const out = `/* 자동 생성: tools/set-password.js — 비밀번호 원문이 아닌 솔트+해시(PBKDF2-SHA256)만 들어 있습니다 */\nwindow.LOCK = { salt: '${salt.toString('hex')}', iter: ${iter}, hash: '${hash.toString('hex')}' };\n`;
fs.writeFileSync(path.join(__dirname, '..', 'js', 'lock-config.js'), out);
console.log('js/lock-config.js 를 갱신했습니다.');
