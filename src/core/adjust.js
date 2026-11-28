// L-10 入力した長さに合わせて頂点を調整する（F-019。求積に使う長さ「入力した長さ」）。DOMに触らない純粋な計算
// 考え方: 入力した長さ（頂点どうしの距離）はほぼ厳密に満たし、それ以外は画像から求めた位置にできるだけ近く保つ。
//   最小化する量 = Σ W·(距離 − 入力値)² + Σ |頂点 − 画像からの位置|²   （W を十分大きくして、入力値をほぼ厳密に守る）
// ガウス・ニュートン法で解く。辺の長さだけでは形が決まらない分（角度など）は、画像の形が補う。
export const W_LENGTH = 1e8;      // 入力した長さの重み
export const TOL_M = 0.0005;      // 満たせたとみなす差（0.5mm）

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

/**
 * @param {{x,y}[]} p0 画像から求めた実座標（m）
 * @param {{i:number, j:number, L:number}[]} cons 頂点番号の組と、入力した長さ（m）
 * @returns {{pts:{x,y}[], maxMove:number, maxResidual:number, code?:string}}
 */
export function adjustToLengths(p0, cons) {
  const n = p0.length;
  if (!cons.length) return { pts: p0.map((p) => ({ ...p })), maxMove: 0, maxResidual: 0 };
  const x = p0.flatMap((p) => [p.x, p.y]);
  for (let it = 0; it < 60; it++) {
    const N = Array.from({ length: 2 * n }, () => new Array(2 * n).fill(0)), g = new Array(2 * n).fill(0);
    for (let k = 0; k < n; k++) { N[2 * k][2 * k] += 1; N[2 * k + 1][2 * k + 1] += 1; g[2 * k] += x[2 * k] - p0[k].x; g[2 * k + 1] += x[2 * k + 1] - p0[k].y; }
    for (const { i, j, L } of cons) {
      const dx = x[2 * i] - x[2 * j], dy = x[2 * i + 1] - x[2 * j + 1], d = Math.hypot(dx, dy) || 1e-12;
      const J = [dx / d, dy / d, -dx / d, -dy / d], idx = [2 * i, 2 * i + 1, 2 * j, 2 * j + 1], r = d - L;
      for (let a = 0; a < 4; a++) { g[idx[a]] += W_LENGTH * J[a] * r; for (let b = 0; b < 4; b++) N[idx[a]][idx[b]] += W_LENGTH * J[a] * J[b]; }
    }
    const dlt = solve(N, g.map((v) => -v)); if (!dlt) break;
    let mx = 0; for (let k = 0; k < 2 * n; k++) { x[k] += dlt[k]; mx = Math.max(mx, Math.abs(dlt[k])); }
    if (mx < 1e-10) break;
  }
  const pts = [...Array(n).keys()].map((k) => ({ x: x[2 * k], y: x[2 * k + 1] }));
  const maxMove = Math.max(...pts.map((p, k) => Math.hypot(p.x - p0[k].x, p.y - p0[k].y)));
  const maxResidual = Math.max(...cons.map(({ i, j, L }) => Math.abs(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) - L)));
  return { pts, maxMove, maxResidual, ...(maxResidual > TOL_M ? { code: "ADJUST_INCONSISTENT" } : {}) };
}
