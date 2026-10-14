export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function normal(random) {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export function dot(a, b) {
  let result = 0;
  for (let k = 0; k < a.length; k++) result += a[k] * b[k];
  return result;
}

export function softmax(values) {
  const maximum = Math.max(...values);
  const weights = values.map(value => Math.exp(value - maximum));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value / total);
}

export function solveLinear(system, right) {
  const n = right.length;
  const rows = system.map((row, i) => [...row, right[i]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    if (Math.abs(rows[column][column]) < 1e-14) throw new Error("Singular linear system");
    const divisor = rows[column][column];
    for (let j = column; j <= n; j++) rows[column][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const scale = rows[row][column];
      for (let j = column; j <= n; j++) rows[row][j] -= scale * rows[column][j];
    }
  }
  return rows.map(row => row[n]);
}

export function format(value, digits = 3) {
  return Math.abs(value) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : value.toFixed(digits);
}
