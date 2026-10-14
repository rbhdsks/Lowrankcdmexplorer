import { normal, seededRandom, softmax } from "./math.js";
import { generateChoices, splitObservedChoices } from "./choice.js";

function initialParameters(kind, n, rank, seed) {
  if (kind === "mnl") return new Float64Array(n);
  if (kind === "full") return new Float64Array(n * n);
  const random = seededRandom(seed);
  return Float64Array.from({ length: 2 * n * rank }, () => normal(random) * 0.16);
}

function menuUtilities(parameters, kind, n, rank, menu) {
  if (kind === "mnl") return menu.map(x => parameters[x]);
  if (kind === "full") {
    return menu.map(x => menu.reduce((sum, z) => sum + (x === z ? 0 : parameters[x * n + z]), 0));
  }
  const offset = n * rank;
  return menu.map(x => {
    let utility = 0;
    for (const z of menu) {
      if (x === z) continue;
      for (let k = 0; k < rank; k++) {
        utility += parameters[x * rank + k] * parameters[offset + z * rank + k];
      }
    }
    return utility;
  });
}

export function evaluate(parameters, kind, n, rank, data) {
  let loss = 0;
  let correct = 0;
  for (const { menu, chosen } of data) {
    const probabilities = softmax(menuUtilities(parameters, kind, n, rank, menu));
    const chosenIndex = menu.indexOf(chosen);
    loss -= Math.log(Math.max(probabilities[chosenIndex], 1e-15));
    if (menu[probabilities.indexOf(Math.max(...probabilities))] === chosen) correct++;
  }
  return { nll: loss / data.length, accuracy: correct / data.length };
}

function gradient(parameters, kind, n, rank, data, regularization) {
  const result = new Float64Array(parameters.length);
  const offset = n * rank;
  for (const { menu, chosen } of data) {
    const probabilities = softmax(menuUtilities(parameters, kind, n, rank, menu));
    for (let i = 0; i < menu.length; i++) {
      const x = menu[i];
      const contribution = (probabilities[i] - Number(x === chosen)) / data.length;
      if (kind === "mnl") { result[x] += contribution; continue; }
      for (const z of menu) {
        if (x === z) continue;
        if (kind === "full") { result[x * n + z] += contribution; continue; }
        for (let k = 0; k < rank; k++) {
          result[x * rank + k] += contribution * parameters[offset + z * rank + k];
          result[offset + z * rank + k] += contribution * parameters[x * rank + k];
        }
      }
    }
  }
  for (let i = 0; i < result.length; i++) result[i] += regularization * parameters[i];
  return result;
}

export function fitModel({ kind, n, rank = 0, train, validation, seed, regularization = 0.001 }) {
  const parameters = initialParameters(kind, n, rank, seed);
  const firstMoment = new Float64Array(parameters.length);
  const secondMoment = new Float64Array(parameters.length);
  const learningRate = kind === "rank" ? 0.045 : 0.07;
  let bestParameters = parameters.slice();
  let bestValidation = Infinity;
  let staleChecks = 0;
  let epochs = 0;
  for (let epoch = 1; epoch <= 240; epoch++) {
    const gradients = gradient(parameters, kind, n, rank, train, regularization);
    const biasOne = 1 - 0.9 ** epoch;
    const biasTwo = 1 - 0.999 ** epoch;
    for (let i = 0; i < parameters.length; i++) {
      firstMoment[i] = 0.9 * firstMoment[i] + 0.1 * gradients[i];
      secondMoment[i] = 0.999 * secondMoment[i] + 0.001 * gradients[i] ** 2;
      parameters[i] -= learningRate * (firstMoment[i] / biasOne) /
        (Math.sqrt(secondMoment[i] / biasTwo) + 1e-8);
    }
    epochs = epoch;
    if (epoch % 5 !== 0) continue;
    const validationNLL = evaluate(parameters, kind, n, rank, validation).nll;
    if (validationNLL < bestValidation - 1e-5) {
      bestValidation = validationNLL;
      bestParameters = parameters.slice();
      staleChecks = 0;
    } else {
      staleChecks++;
    }
    if (epoch >= 90 && staleChecks >= 18) break;
  }
  return {
    kind,
    rank,
    parameters: bestParameters,
    epochs,
    train: evaluate(bestParameters, kind, n, rank, train),
    validation: evaluate(bestParameters, kind, n, rank, validation),
  };
}

export function modelMatrix(model, n) {
  if (model.kind === "mnl") return null;
  if (model.kind === "full") {
    return Array.from({ length: n }, (_, x) =>
      Array.from({ length: n }, (_, z) => x === z ? 0 : model.parameters[x * n + z]),
    );
  }
  const { parameters, rank } = model;
  const offset = n * rank;
  return Array.from({ length: n }, (_, x) =>
    Array.from({ length: n }, (_, z) => {
      if (x === z) return 0;
      let sum = 0;
      for (let k = 0; k < rank; k++) sum += parameters[x * rank + k] * parameters[offset + z * rank + k];
      return sum;
    }),
  );
}

// A common shift to all off-diagonal entries changes no choice probability.
// Center both matrices before describing recovery error.
export function centeredMatrixRMSE(truth, estimate) {
  const n = truth.length;
  let trueMean = 0;
  let estimateMean = 0;
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) if (x !== z) {
    trueMean += truth[x][z]; estimateMean += estimate[x][z];
  }
  const count = n * (n - 1);
  trueMean /= count; estimateMean /= count;
  let error = 0;
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) if (x !== z) {
    error += ((truth[x][z] - trueMean) - (estimate[x][z] - estimateMean)) ** 2;
  }
  return Math.sqrt(error / count);
}

export function runExperiment(config, report = () => {}) {
  const data = config.observedData
    ? splitObservedChoices(config.observedData.rows, config.seed)
    : generateChoices(config);
  const { n, seed } = config;
  const rankLimit = Math.min(4, n);
  const restarts = config.restarts;
  const total = 2 + rankLimit * restarts;
  let completed = 0;
  const update = label => report({ completed, total, label });
  const mnl = fitModel({ kind: "mnl", n, train: data.train, validation: data.validation, seed });
  completed++; update("MNL baseline fitted");
  const models = [];
  for (let rank = 1; rank <= rankLimit; rank++) {
    let best = null;
    for (let restart = 0; restart < restarts; restart++) {
      const candidate = fitModel({
        kind: "rank", n, rank, train: data.train, validation: data.validation,
        seed: seed + 10000 + 100 * rank + restart,
      });
      if (!best || candidate.validation.nll < best.validation.nll) best = { ...candidate, restart };
      completed++; update(`Rank ${rank}: ${restart + 1}/${restarts} restarts`);
    }
    models.push(best);
  }
  const full = fitModel({ kind: "full", n, train: data.train, validation: data.validation, seed });
  completed++; update("Full CDM fitted");
  const selected = models.reduce((best, model) =>
    model.validation.nll < best.validation.nll ? model : best,
  );
  const summary = [mnl, ...models, full].map(model => ({
    kind: model.kind,
    rank: model.rank,
    restart: model.restart ?? null,
    epochs: model.epochs,
    train: model.train,
    validation: model.validation,
    recoveryRMSE: data.truth?.kind === "matrix" && model.kind !== "mnl"
      ? centeredMatrixRMSE(data.truth.matrix, modelMatrix(model, n)) : null,
  }));
  // The test split is used after validation has selected a rank.
  return {
    type: "rank",
    config,
    sizes: { train: data.train.length, validation: data.validation.length, test: data.test.length },
    preview: data.preview,
    models: summary,
    selectedRank: selected.rank,
    test: {
      selected: evaluate(selected.parameters, selected.kind, n, selected.rank, data.test),
      mnl: evaluate(mnl.parameters, "mnl", n, 0, data.test),
      full: evaluate(full.parameters, "full", n, 0, data.test),
    },
  };
}

// A compact analogue of the paper's synthetic recovery question. The truth is
// fixed across sample sizes; within each trial, larger training samples contain
// the smaller samples. This is an exploratory curve, not the paper's estimator.
export function runScalingStudy(config, report = () => {}) {
  if (config.source === "mnl" || config.observedData) throw new Error("Choose rank-2 or full synthetic CDM truth for matrix recovery.");
  const sampleSizes = [0.25, 0.5, 1, 2].map(fraction =>
    Math.max(100, Math.round(config.observations * fraction / 25) * 25),
  );
  const trials = 3;
  const squaredErrors = sampleSizes.map(() => []);
  const total = sampleSizes.length * trials;
  let completed = 0;
  for (let trial = 0; trial < trials; trial++) {
    const data = generateChoices({
      ...config,
      observations: Math.ceil(sampleSizes.at(-1) / 0.7) + 400,
      seed: config.seed + trial * 1031,
      truthSeed: config.seed,
    });
    const validation = data.validation.slice(0, Math.min(500, data.validation.length));
    for (let i = 0; i < sampleSizes.length; i++) {
      const training = data.train.slice(0, sampleSizes[i]);
      const model = fitModel({
        kind: "full", n: config.n, train: training, validation,
        seed: config.seed + trial * 1031 + i * 101,
      });
      const rmse = centeredMatrixRMSE(data.truth.matrix, modelMatrix(model, config.n));
      squaredErrors[i].push(rmse ** 2);
      completed++;
      report({ completed, total, label: `${sampleSizes[i]} choices · trial ${trial + 1}/${trials}` });
    }
  }
  return {
    type: "scaling",
    config,
    trials,
    points: sampleSizes.map((m, i) => {
      const mean = squaredErrors[i].reduce((sum, value) => sum + value, 0) / trials;
      const variance = squaredErrors[i].reduce((sum, value) => sum + (value - mean) ** 2, 0) / (trials - 1);
      return { m, mean, se: Math.sqrt(variance / trials), trials: squaredErrors[i] };
    }),
  };
}
