import test from "node:test";
import assert from "node:assert/strict";
import { choiceProbabilities, generateChoices, utilitiesFromMatrix } from "../src/choice.js";
import { parseChoiceCSV } from "../src/upload.js";
import { fitModel, evaluate, runExperiment, runScalingStudy } from "../src/fit.js";
import { dot, softmax } from "../src/math.js";
import { factorProduct, meanExampleNLL, observedChoice } from "../src/paper-example.js";
import {
  EXAMPLE_MATRIX, RANK_ONE_MATRIX, fitMatrixAtAllRanks, reconstruct,
  offDiagonalRMSE,
} from "../src/matrix.js";

test("directed CDM effects, menu utilities, and probabilities", () => {
  const pair = utilitiesFromMatrix(EXAMPLE_MATRIX, [0, 1]);
  const triple = utilitiesFromMatrix(EXAMPLE_MATRIX, [0, 1, 2]);
  assert.deepEqual(pair, [1.2, -0.7]);
  assert.ok(Math.abs(triple[0] - 1.7) < 1e-12);
  assert.ok(Math.abs(triple[1] - 0.4) < 1e-12);
  assert.ok(Math.abs(triple[2] - 0.5) < 1e-12);
  const probabilities = choiceProbabilities(EXAMPLE_MATRIX, [0, 1, 2]);
  assert.ok(Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
  const pairOdds = Math.exp(pair[0] - pair[1]);
  const tripleOdds = Math.exp(triple[0] - triple[1]);
  assert.ok(Math.abs(pairOdds - tripleOdds) > 0.1);
  assert.ok(softmax([1000, 1001]).every(Number.isFinite));
});

test("Nitesh's worked example reproduces the notes across ranks 1–3", () => {
  const expectedAB = [0.10, 0.11, 0.23];
  const expectedMeans = [0.7510, 0.7425, 0.7536];
  const expectedTripleB = [0.3535, 0.3651, 0.3398];
  for (const [index, rank] of [1, 2, 3].entries()) {
    assert.ok(Math.abs(factorProduct(rank)[0][1] - expectedAB[index]) < 1e-12);
    assert.ok(Math.abs(meanExampleNLL(rank) - expectedMeans[index]) < 0.00005);
    const triple = observedChoice(rank, 5);
    assert.deepEqual(triple.scores.length, 3);
    assert.ok(Math.abs(triple.chosenProbability - expectedTripleB[index]) < 0.00005);
    assert.ok(Math.abs(triple.probabilities.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
  }
});

test("factor dot products reconstruct a rank-one example and unused diagonal stays excluded", () => {
  const fits = fitMatrixAtAllRanks(RANK_ONE_MATRIX);
  assert.ok(fits[0].error < 1e-6);
  assert.ok(fits[1].error < 1e-6);
  assert.ok(Math.abs(dot(fits[0].target[0], fits[0].context[1]) - 0.9) < 1e-6);
  const alteredDiagonal = EXAMPLE_MATRIX.map((row, x) => row.map((value, z) => x === z ? 100 : value));
  assert.equal(offDiagonalRMSE(EXAMPLE_MATRIX, alteredDiagonal), 0);
});

test("ranks 3 and 4 reconstruct any four-item off-diagonal matrix", () => {
  const matrices = [EXAMPLE_MATRIX];
  for (let trial = 0; trial < 6; trial++) {
    matrices.push(Array.from({ length: 4 }, (_, x) =>
      Array.from({ length: 4 }, (_, z) => x === z ? 0 : 2 * Math.sin(trial * 13 + x * 4 + z)),
    ));
  }
  for (const matrix of matrices) {
    const fits = fitMatrixAtAllRanks(matrix);
    assert.ok(fits[0].error >= fits[1].error - 1e-8);
    assert.ok(fits[2].error < 1e-10);
    assert.ok(offDiagonalRMSE(matrix, reconstruct(fits[3].target, fits[3].context)) < 1e-12);
  }
});

test("same seed repeats the data and the held-out experiment", () => {
  const config = { n: 4, observations: 300, source: "rank2", menuMode: "all", seed: 20260831, scale: 0.8, restarts: 2 };
  const one = generateChoices(config);
  const two = generateChoices(config);
  assert.deepEqual(one, two);
  assert.deepEqual([one.train.length, one.validation.length, one.test.length], [210, 45, 45]);
  for (const observation of [...one.train, ...one.validation, ...one.test]) {
    assert.ok(observation.menu.length >= 2);
    assert.ok(observation.menu.includes(observation.chosen));
  }
  const result = runExperiment(config);
  assert.ok(result.selectedRank >= 1 && result.selectedRank <= 4);
  assert.equal(result.models.length, 6);
  assert.ok(result.models.every(model => Number.isFinite(model.validation.nll)));
  assert.ok(Number.isFinite(result.test.selected.nll));
  assert.deepEqual(result.selectedRank, result.models.filter(model => model.kind === "rank")
    .reduce((best, model) => model.validation.nll < best.validation.nll ? model : best).rank);
});

test("MNL fit learns from repeated chosen items", () => {
  const data = Array.from({ length: 100 }, (_, i) => ({ menu: [0, 1], chosen: i < 85 ? 0 : 1 }));
  const initial = evaluate(new Float64Array(2), "mnl", 2, 0, data).nll;
  const fit = fitModel({ kind: "mnl", n: 2, train: data, validation: data, seed: 9 });
  assert.ok(fit.train.nll < initial - 0.2);
  assert.ok(fit.parameters[0] > fit.parameters[1]);
});

test("recovery scaling holds truth fixed and reports finite repeated-trial errors", () => {
  const config = { n: 4, observations: 300, source: "rank2", menuMode: "all", seed: 318, scale: 0.8, restarts: 1 };
  const result = runScalingStudy(config);
  assert.equal(result.type, "scaling");
  assert.equal(result.points.length, 4);
  assert.equal(result.trials, 3);
  assert.ok(result.points.every(point => point.trials.length === 3 &&
    Number.isFinite(point.mean) && Number.isFinite(point.se) && point.se >= 0));
  assert.ok(result.points.every((point, i) => i === 0 || point.m > result.points[i - 1].m));
});

test("uploaded choices are parsed strictly and use the same rank workflow", () => {
  const rows = ["menu,chosen"];
  for (let i = 0; i < 80; i++) {
    rows.push(i % 3 === 0 ? "Walk|Bus|Bike,Bus" : i % 2 ? "Walk|Bike,Walk" : "Bus|Bike,Bike");
  }
  const observedData = parseChoiceCSV(rows.join("\n"));
  assert.deepEqual(observedData.labels, ["Bike", "Bus", "Walk"]);
  assert.equal(observedData.rows.length, 80);
  assert.throws(() => parseChoiceCSV(rows.join("\n").replace("Bus|Bike,Bike", "Bus|Bike,Walk")), /chosen item/);
  const result = runExperiment({
    n: 3, observations: 80, source: "uploaded", menuMode: "all", scale: 0.8,
    seed: 123, restarts: 1, observedData, labels: observedData.labels,
  });
  assert.deepEqual(result.sizes, { train: 56, validation: 12, test: 12 });
  assert.ok(result.models.every(model => model.recoveryRMSE === null));
});
