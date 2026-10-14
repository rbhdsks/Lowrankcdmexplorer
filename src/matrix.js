import { dot, seededRandom, solveLinear } from "./math.js";

export const ITEM_NAMES = ["A", "B", "C", "D"];
export const EXAMPLE_MATRIX = [
  [0, 1.2, 0.5, -0.8],
  [-0.7, 0, 1.1, 0.3],
  [0.9, -0.4, 0, 1.4],
  [0.2, 0.8, -1.0, 0],
];

export const RANK_ONE_MATRIX = [
  [0, 0.9, -0.6, 0.3],
  [-0.6, 0, 0.4, -0.2],
  [1.8, 1.8, 0, 0.6],
  [0.6, 0.6, -0.4, 0],
];

export function copyMatrix(matrix) {
  return matrix.map(row => [...row]);
}

export function reconstruct(target, context) {
  return target.map(row => context.map(other => dot(row, other)));
}

export function offDiagonalRMSE(original, approximation) {
  let sum = 0;
  let count = 0;
  for (let x = 0; x < original.length; x++) {
    for (let z = 0; z < original.length; z++) {
      if (x === z) continue;
      sum += (original[x][z] - approximation[x][z]) ** 2;
      count++;
    }
  }
  return Math.sqrt(sum / count);
}

function leastSquares(vectors, values, rank, ridge = 1e-8) {
  const gram = Array.from({ length: rank }, (_, i) =>
    Array.from({ length: rank }, (_, j) =>
      vectors.reduce((sum, vector) => sum + vector[i] * vector[j], i === j ? ridge : 0),
    ),
  );
  const right = Array.from({ length: rank }, (_, i) =>
    vectors.reduce((sum, vector, k) => sum + vector[i] * values[k], 0),
  );
  return solveLinear(gram, right);
}

function alternatingLeastSquares(matrix, target, context, rank) {
  for (let step = 0; step < 120; step++) {
    for (let x = 0; x < 4; x++) {
      const indices = [0, 1, 2, 3].filter(z => z !== x);
      target[x] = leastSquares(indices.map(z => context[z]), indices.map(z => matrix[x][z]), rank);
    }
    for (let z = 0; z < 4; z++) {
      const indices = [0, 1, 2, 3].filter(x => x !== z);
      context[z] = leastSquares(indices.map(x => target[x]), indices.map(x => matrix[x][z]), rank);
    }
  }
  return { target, context, error: offDiagonalRMSE(matrix, reconstruct(target, context)) };
}

// For four items, any three of these four rows are independent. A context
// vector therefore solves its three observed interactions exactly.
function exactRankThree(matrix) {
  const target = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]];
  const context = Array.from({ length: 4 }, (_, z) => {
    const indices = [0, 1, 2, 3].filter(x => x !== z);
    return leastSquares(indices.map(x => target[x]), indices.map(x => matrix[x][z]), 3, 0);
  });
  return { target, context, error: offDiagonalRMSE(matrix, reconstruct(target, context)) };
}

export function fitMatrixAtAllRanks(matrix) {
  const fits = [];
  for (let rank = 1; rank <= 2; rank++) {
    let best = null;
    for (let restart = 0; restart < 12; restart++) {
      const random = seededRandom(7300 + rank * 100 + restart);
      const target = Array.from({ length: 4 }, () =>
        Array.from({ length: rank }, () => (random() - 0.5) * 2),
      );
      const context = Array.from({ length: 4 }, () =>
        Array.from({ length: rank }, () => (random() - 0.5) * 2),
      );
      const fit = alternatingLeastSquares(matrix, target, context, rank);
      if (!best || fit.error < best.error) best = fit;
    }
    if (rank === 2 && best.error > fits[0].error) {
      best = {
        target: fits[0].target.map(row => [row[0], 0]),
        context: fits[0].context.map(row => [row[0], 0]),
        error: fits[0].error,
      };
    }
    fits.push(best);
  }
  fits.push(exactRankThree(matrix));
  const target = Array.from({ length: 4 }, (_, x) =>
    Array.from({ length: 4 }, (_, k) => Number(x === k)),
  );
  const context = Array.from({ length: 4 }, (_, z) => matrix.map(row => row[z]));
  fits.push({ target, context, error: 0 });
  return fits;
}
