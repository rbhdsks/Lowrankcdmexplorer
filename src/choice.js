import { normal, seededRandom, softmax } from "./math.js";

export function utilitiesFromMatrix(matrix, menu) {
  return menu.map(x => menu.reduce((sum, z) => sum + (x === z ? 0 : matrix[x][z]), 0));
}

export function choiceProbabilities(matrix, menu) {
  return softmax(utilitiesFromMatrix(matrix, menu));
}

export function sampleMenu(n, mode, random) {
  if (mode === "all") {
    const candidates = [];
    for (let mask = 1; mask < 1 << n; mask++) {
      if (mask.toString(2).replaceAll("0", "").length >= 2) candidates.push(mask);
    }
    const mask = candidates[Math.floor(random() * candidates.length)];
    return Array.from({ length: n }, (_, x) => x).filter(x => mask & (1 << x));
  }
  const size = mode === "pairs" ? 2 : random() < 0.5 ? 2 : 3;
  const items = Array.from({ length: n }, (_, x) => x);
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (n - i));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, size).sort((a, b) => a - b);
}

export function makeTruth({ n, source, seed, scale }) {
  const random = seededRandom(seed + 417);
  if (source === "mnl") {
    const scores = Array.from({ length: n }, () => normal(random) * scale);
    const mean = scores.reduce((sum, value) => sum + value, 0) / n;
    return { kind: "mnl", scores: scores.map(value => value - mean) };
  }
  if (source === "rank2") {
    const factorScale = Math.sqrt(scale / Math.sqrt(2));
    const target = Array.from({ length: n }, () =>
      Array.from({ length: 2 }, () => normal(random) * factorScale),
    );
    const context = Array.from({ length: n }, () =>
      Array.from({ length: 2 }, () => normal(random) * factorScale),
    );
    return {
      kind: "matrix",
      matrix: Array.from({ length: n }, (_, x) =>
        Array.from({ length: n }, (_, z) =>
          x === z ? 0 : target[x][0] * context[z][0] + target[x][1] * context[z][1],
        ),
      ),
    };
  }
  return {
    kind: "matrix",
    matrix: Array.from({ length: n }, (_, x) =>
      Array.from({ length: n }, (_, z) => x === z ? 0 : normal(random) * scale),
    ),
  };
}

export function truthProbabilities(truth, menu) {
  if (truth.kind === "mnl") return softmax(menu.map(x => truth.scores[x]));
  return choiceProbabilities(truth.matrix, menu);
}

export function generateChoices(config) {
  const { n, observations, menuMode, seed } = config;
  const truth = makeTruth({ ...config, seed: config.truthSeed ?? seed });
  const random = seededRandom(seed);
  const data = [];
  for (let i = 0; i < observations; i++) {
    const menu = sampleMenu(n, menuMode, random);
    const probabilities = truthProbabilities(truth, menu);
    let draw = random();
    let chosen = menu.at(-1);
    for (let k = 0; k < menu.length; k++) {
      draw -= probabilities[k];
      if (draw <= 0) { chosen = menu[k]; break; }
    }
    data.push({ menu, chosen });
  }
  for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [data[i], data[j]] = [data[j], data[i]];
  }
  const trainEnd = Math.floor(0.7 * data.length);
  const validationEnd = Math.floor(0.85 * data.length);
  return {
    truth,
    preview: data.slice(0, 5),
    train: data.slice(0, trainEnd),
    validation: data.slice(trainEnd, validationEnd),
    test: data.slice(validationEnd),
  };
}

export function splitObservedChoices(rows, seed) {
  const random = seededRandom(seed);
  const data = rows.map(row => ({ menu: [...row.menu], chosen: row.chosen }));
  for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [data[i], data[j]] = [data[j], data[i]];
  }
  const trainEnd = Math.floor(0.7 * data.length);
  const validationEnd = Math.floor(0.85 * data.length);
  return {
    truth: null,
    preview: data.slice(0, 5),
    train: data.slice(0, trainEnd),
    validation: data.slice(trainEnd, validationEnd),
    test: data.slice(validationEnd),
  };
}
