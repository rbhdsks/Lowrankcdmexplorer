import { choiceProbabilities, utilitiesFromMatrix } from "./choice.js";

// Illustrative initial values from Nitesh Kumar Shah's worked notes.
// These are not fitted parameters or measurements from the ICML paper.
export const NOTE_ITEMS = ["Chai", "Coffee", "Juice"];
export const NOTE_CODES = ["A", "B", "J"];
export const NOTE_OBSERVATIONS = [
  { menu: [0, 1], chosen: 0 },
  { menu: [0, 1], chosen: 0 },
  { menu: [0, 1], chosen: 1 },
  { menu: [0, 2], chosen: 2 },
  { menu: [1, 2], chosen: 1 },
  { menu: [0, 1, 2], chosen: 1 },
];

export const NOTE_FACTORS = {
  1: {
    target: [[0.2], [0.4], [0.1]],
    context: [[0.3], [0.5], [0.2]],
  },
  2: {
    target: [[0.2, 0.1], [0.4, 0.2], [0.1, 0.3]],
    context: [[0.3, 0.2], [0.5, 0.1], [0.2, 0.4]],
  },
  3: {
    target: [[0.2, 0.1, 0.3], [0.4, 0.2, 0.1], [0.1, 0.3, 0.2]],
    context: [[0.3, 0.2, 0.1], [0.5, 0.1, 0.4], [0.2, 0.4, 0.2]],
  },
};

export function factorProduct(rank) {
  const factors = NOTE_FACTORS[rank];
  if (!factors) throw new RangeError("The notes include ranks 1, 2, and 3 only.");
  return factors.target.map(t => factors.context.map(c =>
    t.reduce((sum, component, k) => sum + component * c[k], 0),
  ));
}

export function observedChoice(rank, observationIndex) {
  const observation = NOTE_OBSERVATIONS[observationIndex];
  if (!observation) throw new RangeError("Unknown observation.");
  const matrix = factorProduct(rank);
  const scores = utilitiesFromMatrix(matrix, observation.menu);
  const probabilities = choiceProbabilities(matrix, observation.menu);
  const chosenProbability = probabilities[observation.menu.indexOf(observation.chosen)];
  return { observation, matrix, scores, probabilities, chosenProbability, nll: -Math.log(chosenProbability) };
}

export function meanExampleNLL(rank) {
  return NOTE_OBSERVATIONS.reduce((sum, _, index) =>
    sum + observedChoice(rank, index).nll, 0) / NOTE_OBSERVATIONS.length;
}

const fixed = (value, places = 2) => value.toFixed(places);

export function initPaperExample() {
  const byId = id => document.getElementById(id);
  let rank = 1;
  let observationIndex = 5;

  const buttons = byId("example-observations");
  NOTE_OBSERVATIONS.forEach(({ menu, chosen }, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${index + 1} · ${menu.map(i => NOTE_CODES[i]).join("+")} → ${NOTE_CODES[chosen]}`;
    button.setAttribute("aria-label", `Observation ${index + 1}: ${menu.map(i => NOTE_ITEMS[i]).join(", ")}; chosen ${NOTE_ITEMS[chosen]}`);
    button.addEventListener("click", () => { observationIndex = index; render(); });
    buttons.append(button);
  });
  document.querySelectorAll("[data-example-rank]").forEach(button => {
    button.addEventListener("click", () => { rank = Number(button.dataset.exampleRank); render(); });
  });

  function render() {
    const factors = NOTE_FACTORS[rank];
    const { observation, matrix, scores, probabilities, chosenProbability, nll } = observedChoice(rank, observationIndex);
    document.querySelectorAll("[data-example-rank]").forEach(button => {
      const selected = Number(button.dataset.exampleRank) === rank;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    [...buttons.children].forEach((button, index) => {
      const selected = index === observationIndex;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    byId("example-factors").innerHTML = `<table class="example-table"><thead><tr><th scope="col">Item</th><th scope="col">Target t</th><th scope="col">Context c</th></tr></thead><tbody>${NOTE_ITEMS.map((item, i) =>
      `<tr><th scope="row">${item} (${NOTE_CODES[i]})</th><td>(${factors.target[i].map(v => fixed(v, 1)).join(", ")})</td><td>(${factors.context[i].map(v => fixed(v, 1)).join(", ")})</td></tr>`,
    ).join("")}</tbody></table>`;

    byId("example-matrix").innerHTML = `<table class="example-table matrix-example"><thead><tr><th scope="col">t · c</th>${NOTE_CODES.map(code => `<th scope="col">${code}</th>`).join("")}</tr></thead><tbody>${matrix.map((row, i) =>
      `<tr><th scope="row">${NOTE_CODES[i]}</th>${row.map((value, j) => `<td class="${i === j ? "unused" : ""}">${fixed(value)}</td>`).join("")}</tr>`,
    ).join("")}</tbody></table>`;
    const productTerms = factors.target[0].map((value, k) => `${fixed(value, 1)}×${fixed(factors.context[1][k], 1)}`).join(" + ");
    byId("example-product").textContent = `Coffee's effect on Chai: u_AB = ${productTerms} = ${fixed(matrix[0][1])}. The reverse u_BA = ${fixed(matrix[1][0])}.`;

    byId("example-observation-title").textContent = `Observation ${observationIndex + 1}: {${observation.menu.map(i => NOTE_ITEMS[i]).join(", ")}} → ${NOTE_ITEMS[observation.chosen]}`;
    byId("example-scores").innerHTML = `<div class="score-list">${observation.menu.map((item, position) => {
      const contributors = observation.menu.filter(other => other !== item);
      const sum = contributors.map(other => fixed(matrix[item][other])).join(" + ");
      return `<div class="score-row ${item === observation.chosen ? "chosen" : ""}"><b>${NOTE_ITEMS[item]}</b><span>score = ${sum} = ${fixed(scores[position])}</span><strong>P = ${fixed(probabilities[position], 4)}</strong></div>`;
    }).join("")}</div>`;
    byId("example-chosen-probability").textContent = fixed(chosenProbability, 4);
    byId("example-observation-nll").textContent = `This observation's NLL = −log(${fixed(chosenProbability, 4)}) = ${fixed(nll, 4)}`;

    byId("example-nll-table").innerHTML = `<table class="example-table nll-example"><thead><tr><th scope="col">Illustrative rank</th><th scope="col">Mean NLL</th></tr></thead><tbody>${[1, 2, 3].map(r =>
      `<tr class="${rank === r ? "active" : ""}"><th scope="row">Rank ${r}</th><td>${fixed(meanExampleNLL(r), 4)}</td></tr>`,
    ).join("")}</tbody></table>`;
  }

  render();
}
