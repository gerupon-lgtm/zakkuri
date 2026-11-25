// 文字列を Shift_JIS のバイト列にする（SIMA・DXF の書き出し用）。
// 対応表は持たず、ブラウザ（と Node）の TextDecoder("shift_jis") から逆引き表を作る。表せない文字は「?」にする
let table = null;
function build() {
  table = new Map();
  const dec = new TextDecoder("shift_jis");
  for (let b = 0xa1; b <= 0xdf; b++) table.set(dec.decode(new Uint8Array([b])), [b]); // 半角カナ
  for (let a = 0x81; a <= 0xfc; a++) {
    if (a > 0x9f && a < 0xe0) continue;
    for (let b = 0x40; b <= 0xfc; b++) {
      if (b === 0x7f) continue;
      const ch = dec.decode(new Uint8Array([a, b]));
      if (ch.length === 1 && ch !== "�" && !table.has(ch)) table.set(ch, [a, b]);
    }
  }
}
export function encodeSjis(str) {
  if (!table) build();
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else { const b = table.get(ch); if (b) out.push(...b); else out.push(0x3f); }
  }
  return new Uint8Array(out);
}
