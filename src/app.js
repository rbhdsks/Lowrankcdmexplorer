import { choiceProbabilities, utilitiesFromMatrix } from "./choice.js";
import { dot, format } from "./math.js";
import { parseChoiceCSV } from "./upload.js";
import {
  ITEM_NAMES, EXAMPLE_MATRIX, RANK_ONE_MATRIX, copyMatrix,
  fitMatrixAtAllRanks, reconstruct,
} from "./matrix.js";

const byId = id => document.getElementById(id);
const state = {
  matrix: copyMatrix(EXAMPLE_MATRIX),
  rank: 2,
  selectedCell: [0, 1],
  fits: [],
  worker: null,
  result: null,
  uploadedData: null,
};

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function axis(label, className = "") {
  return element("span", `axis-label ${className}`, label);
}

function diagonal() {
  const node = element("span", "diagonal-cell", "—");
  node.setAttribute("aria-label", "Undefined diagonal interaction");
  return node;
}

function setView(view) {
  for (const name of ["matrix", "experiment", "paper"]) {
    byId(`view-${name}`).classList.toggle("hidden", name !== view);
  }
  document.querySelectorAll("[data-view]").forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  history.replaceState(null, "", `#${view}`);
}

function renderSource() {
  const grid = byId("source-matrix");
  grid.replaceChildren(axis("target / context", "corner"), ...ITEM_NAMES.map(name => axis(name)));
  for (let x = 0; x < 4; x++) {
    grid.append(axis(ITEM_NAMES[x], "row"));
    for (let z = 0; z < 4; z++) {
      if (x === z) { grid.append(diagonal()); continue; }
      const input = element("input", "matrix-input");
      input.type = "number";
      input.min = "-3";
      input.max = "3";
      input.step = "any";
      input.value = state.matrix[x][z].toFixed(2);
      input.setAttribute("aria-label", `Context ${ITEM_NAMES[z]} effect on target ${ITEM_NAMES[x]}`);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (input.value.trim() === "" || !Number.isFinite(value) || value < -3 || value > 3) {
          input.value = state.matrix[x][z].toFixed(2);
          input.setCustomValidity("Enter a number from -3 to 3.");
          input.reportValidity();
          input.setCustomValidity("");
          return;
        }
        state.matrix[x][z] = value;
        state.selectedCell = [x, z];
        input.value = value.toFixed(2);
        document.querySelectorAll("[data-preset]").forEach(button => button.classList.remove("selected"));
        updateMatrix();
      });
      grid.append(input);
    }
  }
}

function renderFactor(id, vectors, role) {
  const table = byId(id);
  table.replaceChildren();
  vectors.forEach((vector, item) => {
    const row = element("div", "factor-row");
    row.append(axis(ITEM_NAMES[item], "row"));
    vector.forEach(value => {
      const cell = element("span", `factor-number ${role}`, format(value));
      cell.title = value.toFixed(7);
      row.append(cell);
    });
    table.append(row);
  });
}

function renderReconstruction(fit) {
  const grid = byId("reconstructed-matrix");
  const result = reconstruct(fit.target, fit.context);
  grid.replaceChildren(axis("x / z", "corner"), ...ITEM_NAMES.map(name => axis(name)));
  for (let x = 0; x < 4; x++) {
    grid.append(axis(ITEM_NAMES[x], "row"));
    for (let z = 0; z < 4; z++) {
      if (x === z) { grid.append(diagonal()); continue; }
      const selected = state.selectedCell[0] === x && state.selectedCell[1] === z;
      const cell = element("button", `matrix-cell ${selected ? "selected" : ""}`, format(result[x][z]));
      cell.type = "button";
      cell.setAttribute("aria-pressed", String(selected));
      cell.setAttribute("aria-label", `Inspect target ${ITEM_NAMES[x]} and context ${ITEM_NAMES[z]} interaction ${format(result[x][z])}`);
      cell.addEventListener("click", () => {
        state.selectedCell = [x, z];
        renderReconstruction(fit);
      });
      grid.append(cell);
    }
  }
  const [x, z] = state.selectedCell;
  const products = fit.target[x].map((value, k) =>
    `${format(value)} × ${format(fit.context[z][k])}`,
  ).join(" + ");
  const predicted = dot(fit.target[x], fit.context[z]);
  byId("matrix-inspector").innerHTML =
    `<strong>Why is Û<sub>${ITEM_NAMES[x]}${ITEM_NAMES[z]}</sub> = ${format(predicted)}?</strong> ` +
    `<span class="mono">t<sub>${ITEM_NAMES[x]}</sub> · c<sub>${ITEM_NAMES[z]}</sub> ` +
    `= ${products} ≈ ${format(predicted)}</span>. Original U = ${format(state.matrix[x][z])}; ` +
    `absolute difference = ${format(Math.abs(state.matrix[x][z] - predicted))}. ` +
    `Displayed coordinates are rounded; calculations use full precision.`;
}

function renderErrors() {
  const list = byId("matrix-errors");
  list.replaceChildren();
  const maximum = Math.max(...state.fits.map(fit => fit.error), 0.01);
  state.fits.forEach((fit, index) => {
    const row = element("button", `error-row ${state.rank === index + 1 ? "selected" : ""}`);
    row.type = "button";
    row.setAttribute("aria-label", `Set rank ${index + 1}, RMSE ${format(fit.error)}`);
    const track = element("span", "error-track");
    const fill = element("span", "error-fill");
    fill.style.width = `${100 * fit.error / maximum}%`;
    track.append(fill);
    row.append(element("span", "error-label", `Rank ${index + 1}`), track,
      element("span", "error-value", format(fit.error)));
    row.addEventListener("click", () => setRank(index + 1));
    list.append(row);
  });
}

function probabilityRows(id, matrix, menu, approximate) {
  const container = byId(id);
  container.replaceChildren();
  const probabilities = choiceProbabilities(matrix, menu);
  const utilities = utilitiesFromMatrix(matrix, menu);
  menu.forEach((item, index) => {
    const row = element("div", `prob-row ${approximate ? "approx-prob" : ""}`);
    const track = element("span", "prob-bar");
    const fill = element("i");
    fill.style.width = `${probabilities[index] * 100}%`;
    track.append(fill);
    row.append(element("b", "", ITEM_NAMES[item]), track,
      element("strong", "", `${(probabilities[index] * 100).toFixed(1)}%`),
      element("span", "prob-utility", `utility ${format(utilities[index])}`));
    container.append(row);
  });
}

function oddsRatio(matrix, menu) {
  const probabilities = choiceProbabilities(matrix, menu);
  return probabilities[0] / probabilities[1];
}

function renderChoices() {
  const menu = [0, 1];
  if (byId("include-c").checked) menu.push(2);
  if (byId("include-d").checked) menu.push(3);
  const fit = state.fits[state.rank - 1];
  const approximation = reconstruct(fit.target, fit.context);
  byId("choice-rank").textContent = String(state.rank);
  probabilityRows("choice-original", state.matrix, menu, false);
  probabilityRows("choice-approximation", approximation, menu, true);
  const originalPair = oddsRatio(state.matrix, [0, 1]);
  const originalTriple = oddsRatio(state.matrix, [0, 1, 2]);
  const approximatePair = oddsRatio(approximation, [0, 1]);
  const approximateTriple = oddsRatio(approximation, [0, 1, 2]);
  byId("iia-panel").innerHTML =
    `<strong>IIA check · A/B odds when C is added</strong><br>` +
    `Original: ${format(originalPair, 2)} → ${format(originalTriple, 2)}. ` +
    `Rank ${state.rank}: ${format(approximatePair, 2)} → ${format(approximateTriple, 2)}. ` +
    `A change in odds is a context effect. This comparison always uses {A, B} and {A, B, C}.`;
}

function renderMatrixResults() {
  const fit = state.fits[state.rank - 1];
  byId("rank-slider").value = String(state.rank);
  byId("rank-badge").textContent = String(state.rank);
  byId("stat-rank").textContent = String(state.rank);
  byId("stat-rmse").textContent = format(fit.error);
  byId("stat-parameters").textContent = String(8 * state.rank);
  byId("target-shape").textContent = `T · 4 × ${state.rank}`;
  byId("context-shape").textContent = `C · 4 × ${state.rank}`;
  byId("rank-explanation").textContent = state.rank === 1
    ? "One coordinate per target and context: each effect is a single product. Simple, but often too restrictive."
    : `${state.rank} coordinates per vector: each effect is the sum of ${state.rank} products. Higher rank has more room to match the matrix.`;
  renderFactor("target-factors", fit.target, "target");
  renderFactor("context-factors", fit.context, "context");
  renderReconstruction(fit);
  renderErrors();
  renderChoices();
}

function updateMatrix() {
  state.fits = fitMatrixAtAllRanks(state.matrix);
  renderMatrixResults();
}

function setRank(rank) {
  state.rank = rank;
  renderMatrixResults();
}

function loadPreset(name) {
  state.matrix = name === "rankone" ? copyMatrix(RANK_ONE_MATRIX)
    : name === "blank" ? Array.from({ length: 4 }, () => Array(4).fill(0))
      : copyMatrix(EXAMPLE_MATRIX);
  state.selectedCell = [0, 1];
  document.querySelectorAll("[data-preset]").forEach(button =>
    button.classList.toggle("selected", button.dataset.preset === name),
  );
  renderSource();
  updateMatrix();
}

function readConfig() {
  const seed = Number(byId("seed-input").value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    throw new Error("Seed must be an integer from 0 to 4294967295.");
  }
  const source = byId("source-select").value;
  if (source === "uploaded" && !state.uploadedData) {
    throw new Error("Choose a valid choice CSV before running the experiment.");
  }
  return {
    source,
    n: source === "uploaded" ? state.uploadedData.labels.length : Number(byId("items-select").value),
    observations: source === "uploaded" ? state.uploadedData.rows.length : Number(byId("observations-select").value),
    menuMode: byId("menus-select").value,
    scale: Number(byId("scale-select").value),
    restarts: Number(byId("restarts-select").value),
    seed,
    observedData: source === "uploaded" ? state.uploadedData : null,
    labels: source === "uploaded" ? state.uploadedData.labels : null,
  };
}

function updateDataSource() {
  const uploaded = byId("source-select").value === "uploaded";
  byId("upload-field").classList.toggle("hidden", !uploaded);
  for (const id of ["items-select", "observations-select", "menus-select", "scale-select"]) {
    byId(id).disabled = uploaded;
  }
  if (uploaded) byId("run-progress").textContent = "Upload menu,chosen rows to fit your own choice data. Scaling needs synthetic truth.";
}

async function handleUpload(event) {
  state.uploadedData = null;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error("Choose a CSV smaller than 2 MB.");
    const data = parseChoiceCSV(await file.text());
    state.uploadedData = data;
    byId("upload-status").textContent = `${file.name}: ${data.rows.length} choices, ${data.labels.length} items (${data.labels.join(", ")}). Ready to run.`;
    byId("run-progress").textContent = "CSV loaded locally. The seed controls the train/validation/test shuffle and model initialization.";
  } catch (error) {
    byId("upload-status").textContent = error.message;
    byId("run-progress").textContent = "Fix the CSV format and choose the file again.";
  }
}

function setRunning(running) {
  byId("run-experiment").disabled = running;
  byId("run-scaling").disabled = running;
  byId("run-experiment").textContent = running ? "Fitting models…" : "Run rank comparison →";
  byId("cancel-experiment").classList.toggle("hidden", !running);
}

function startExperiment(task = "rank") {
  let config;
  try { config = readConfig(); }
  catch (error) { byId("run-progress").textContent = error.message; return; }
  if (task === "scaling" && (config.source === "mnl" || config.source === "uploaded")) {
    byId("run-progress").textContent = "Choose synthetic rank-2 or full CDM truth for the matrix recovery scaling study.";
    return;
  }
  state.result = null;
  byId("download-results").classList.add("hidden");
  byId("results-content").className = "empty-results";
  byId("results-content").innerHTML = task === "rank"
    ? "<span class='empty-icon' aria-hidden='true'>◌</span><h3>Running rank comparison</h3><p>Each model sees exactly the same generated choices and the same split.</p>"
    : "<span class='empty-icon' aria-hidden='true'>◌</span><h3>Running recovery scaling</h3><p>Three repeated trials at four nested sample sizes.</p>";
  setRunning(true);
  byId("run-progress").textContent = task === "rank"
    ? "Generating choices and fitting the MNL baseline…"
    : "Generating a fixed CDM truth and repeated choice samples…";
  try {
    state.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  } catch {
    setRunning(false);
    byId("run-progress").textContent = "Web Workers need an HTTP server. See the README to run this app locally.";
    return;
  }
  state.worker.onmessage = event => {
    const { type, progress, result, message } = event.data;
    if (type === "progress") {
      byId("run-progress").textContent = `${progress.completed}/${progress.total} fits complete · ${progress.label}`;
    } else if (type === "result") {
      state.result = result;
      state.worker.terminate(); state.worker = null;
      setRunning(false);
      byId("run-progress").textContent = result.type === "rank"
        ? "Complete. All ranks used the same data; test NLL was computed after validation selection."
        : "Complete. The plotted errors are means across three trials at each sample size.";
      if (result.type === "rank") renderResults(result);
      else renderScalingResults(result);
      byId("download-results").classList.remove("hidden");
    } else {
      state.worker.terminate(); state.worker = null;
      setRunning(false);
      byId("run-progress").textContent = `Run failed: ${message}`;
      byId("results-content").innerHTML = "<h3>Run stopped</h3><p>Adjust settings and try again.</p>";
    }
  };
  state.worker.onerror = () => {
    state.worker?.terminate(); state.worker = null;
    setRunning(false);
    byId("run-progress").textContent = "The computation worker could not start. Serve this folder over HTTP and try again.";
  };
  state.worker.postMessage({ task, config });
}

function cancelExperiment() {
  state.worker?.terminate(); state.worker = null;
  setRunning(false);
  byId("run-progress").textContent = "Run cancelled. Change settings and run again.";
  byId("results-content").innerHTML = "<h3>Run cancelled</h3><p>No results from this run were kept.</p>";
}

function chartSVG(result) {
  const ranks = result.models.filter(model => model.kind === "rank");
  const baseline = result.models.find(model => model.kind === "mnl").validation.nll;
  const values = [baseline, ...ranks.flatMap(model => [model.train.nll, model.validation.nll])];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max(0.025, (maximum - minimum) * 0.17);
  const lower = Math.max(0, minimum - padding);
  const upper = maximum + padding;
  const x = index => 67 + index * (590 / Math.max(1, ranks.length - 1));
  const y = value => 238 - (value - lower) / (upper - lower) * 195;
  const line = key => ranks.map((model, index) => `${index ? "L" : "M"}${x(index)},${y(model[key].nll)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => lower + (upper - lower) * i / 4);
  const grid = ticks.map(value =>
    `<line class="chart-grid" x1="61" y1="${y(value)}" x2="665" y2="${y(value)}"/>` +
    `<text class="chart-axis" x="55" y="${y(value) + 4}" text-anchor="end">${format(value, 2)}</text>`,
  ).join("");
  const points = ranks.map((model, index) =>
    `<circle cx="${x(index)}" cy="${y(model.train.nll)}" r="4" fill="#9aaab1"><title>Rank ${model.rank} train NLL ${format(model.train.nll)}</title></circle>` +
    `<circle class="${model.rank === result.selectedRank ? "chart-selected" : ""}" cx="${x(index)}" cy="${y(model.validation.nll)}" r="5" fill="#159789"><title>Rank ${model.rank} validation NLL ${format(model.validation.nll)}</title></circle>` +
    `<text class="chart-axis" x="${x(index)}" y="262" text-anchor="middle">rank ${model.rank}</text>`,
  ).join("");
  return `<svg class="nll-chart" viewBox="0 0 700 280" role="img" aria-label="Training and validation negative log-likelihood by rank, with MNL validation baseline">
    ${grid}<line x1="61" y1="${y(baseline)}" x2="665" y2="${y(baseline)}" stroke="#e5a556" stroke-width="2" stroke-dasharray="6 6"/>
    <path d="${line("train")}" fill="none" stroke="#9aaab1" stroke-width="2.5"/>
    <path d="${line("validation")}" fill="none" stroke="#159789" stroke-width="3"/>
    ${points}<text class="chart-axis" x="61" y="16">Lower NLL is better ↓</text>
  </svg>`;
}

function resultTable(result) {
  const rows = result.models.map(model => {
    const label = model.kind === "mnl" ? "MNL" : model.kind === "full" ? "Full CDM" : `Rank ${model.rank}`;
    const selected = model.kind === "rank" && model.rank === result.selectedRank;
    const count = model.kind === "mnl" ? result.config.n : model.kind === "full"
      ? result.config.n * (result.config.n - 1) : 2 * result.config.n * model.rank;
    return `<tr class="${selected ? "chosen" : ""}"><td>${label}${selected ? " · selected" : ""}</td>` +
      `<td>${count}</td><td>${format(model.train.nll)}</td><td>${format(model.validation.nll)}</td>` +
      `<td>${model.recoveryRMSE === null ? "—" : format(model.recoveryRMSE)}</td>` +
      `<td class="minor">${model.epochs}${model.restart === null ? "" : ` · #${model.restart + 1}`}</td></tr>`;
  }).join("");
  return `<div class="result-table-wrap"><table class="result-table"><thead><tr><th>Model</th><th>Raw parameters</th><th>Train NLL</th><th>Val NLL</th><th>Matrix RMSE</th><th>Epochs · restart</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderResults(result) {
  const { config, sizes, test } = result;
  const warning = config.menuMode === "pairs"
    ? `<p class="result-warning">Pairs only: CDM interactions cannot be uniquely identified from a single menu size. The L2 penalty picks one fitted solution. Predictive NLL can still be compared on these sampled pairs.</p>`
    : config.menuMode === "mixed"
      ? `<p class="result-warning">Pairs and triples provide two menu sizes, but this small experiment may not cover every set needed for identification. A low NLL does not prove the recovered matrix is unique.</p>`
      : "";
  const preview = result.preview.map((observation, index) =>
    `<p>${index + 1}. {${observation.menu.map(x => config.labels?.[x] ?? String.fromCharCode(65 + x)).join(", ")}} → ${config.labels?.[observation.chosen] ?? String.fromCharCode(65 + observation.chosen)}</p>`,
  ).join("");
  const selectedDelta = test.mnl.nll - test.selected.nll;
  const deltaWord = selectedDelta >= 0 ? "lower" : "higher";
  const container = byId("results-content");
  container.className = "";
  container.innerHTML =
    `<div class="result-summary"><div><span>Selected by validation</span><strong>Rank ${result.selectedRank}</strong></div>` +
    `<div><span>Selected test NLL</span><strong>${format(test.selected.nll)}</strong></div>` +
    `<div><span>MNL test NLL</span><strong>${format(test.mnl.nll)}</strong></div></div>` +
    `<p class="result-intro">${sizes.train} train · ${sizes.validation} validation · ${sizes.test} test choices. ` +
    `Data source: ${config.source === "mnl" ? "synthetic MNL" : config.source === "rank2" ? "synthetic rank-2 CDM" : config.source === "full" ? "synthetic full CDM" : "uploaded CSV"}; ` +
    `seed ${config.seed}. Click “Run” again after changing settings.</p>` + warning +
    `<div class="chart-key"><span>Validation</span><span class="train">Train</span><span class="baseline">MNL validation</span></div>` +
    chartSVG(result) + resultTable(result) +
    `<p class="result-footnote">“Raw parameters” counts stored coordinates, not identifiable degrees of freedom. Matrix RMSE is centered over used cells and appears only when a true CDM matrix exists.</p>` +
    `<div class="test-comparison">On untouched test choices, selected rank ${result.selectedRank} has NLL <strong>${format(test.selected.nll)}</strong>; ` +
    `this is <strong>${format(Math.abs(selectedDelta))} ${deltaWord}</strong> than MNL (${format(test.mnl.nll)}). ` +
    `Full CDM test NLL: <strong>${format(test.full.nll)}</strong>. Test accuracy of the selected rank: <strong>${(100 * test.selected.accuracy).toFixed(1)}%</strong>.</div>` +
    `<div class="observation-preview"><h3>Five generated observations (after shuffle)</h3>${preview}</div>`;
}

function scalingChart(result) {
  const points = result.points;
  const guide = points.map(point => points[0].mean * points[0].m / point.m);
  const low = Math.max(0, Math.min(...points.map(point => point.mean - point.se), ...guide) * 0.8);
  const high = Math.max(...points.map(point => point.mean + point.se), ...guide) * 1.16 + 1e-8;
  const x = index => 75 + index * 187;
  const y = value => 238 - (value - low) / (high - low) * 193;
  const ticks = Array.from({ length: 5 }, (_, i) => low + (high - low) * i / 4);
  const grid = ticks.map(value =>
    `<line class="chart-grid" x1="66" y1="${y(value)}" x2="655" y2="${y(value)}"/>` +
    `<text class="chart-axis" x="59" y="${y(value) + 4}" text-anchor="end">${format(value, 3)}</text>`,
  ).join("");
  const path = values => values.map((value, index) =>
    `${index ? "L" : "M"}${x(index)},${y(value)}`).join(" ");
  const marks = points.map((point, index) =>
    `<line x1="${x(index)}" y1="${y(Math.min(high, point.mean + point.se))}" x2="${x(index)}" y2="${y(Math.max(low, point.mean - point.se))}" stroke="#178f82" stroke-width="2"/>` +
    `<circle cx="${x(index)}" cy="${y(point.mean)}" r="5" fill="#178f82"><title>${point.m} choices: mean MSE ${format(point.mean, 4)}, SE ${format(point.se, 4)}</title></circle>` +
    `<text class="chart-axis" x="${x(index)}" y="262" text-anchor="middle">${point.m}</text>`,
  ).join("");
  return `<svg class="nll-chart" viewBox="0 0 700 280" role="img" aria-label="Mean centered matrix squared error across four training sample sizes, with a one over m guide">
    ${grid}<path d="${path(guide)}" fill="none" stroke="#e5a556" stroke-width="2" stroke-dasharray="6 6"/>
    <path d="${path(points.map(point => point.mean))}" fill="none" stroke="#178f82" stroke-width="3"/>
    ${marks}<text class="chart-axis" x="66" y="16">Mean centered matrix MSE ↓</text>
  </svg>`;
}

function renderScalingResults(result) {
  const { config, points } = result;
  const rows = points.map(point =>
    `<tr><td>${point.m}</td><td>${format(point.mean, 4)}</td><td>${format(point.se, 4)}</td>` +
    `<td>${point.trials.map(value => format(value, 4)).join(" · ")}</td></tr>`,
  ).join("");
  const container = byId("results-content");
  container.className = "";
  container.innerHTML =
    `<div class="result-summary"><div><span>True source</span><strong>${config.source === "rank2" ? "Rank 2" : "Full"}</strong></div>` +
    `<div><span>Items</span><strong>${config.n}</strong></div><div><span>Trials per size</span><strong>${result.trials}</strong></div></div>` +
    `<p class="result-intro">Fixed synthetic truth, seed ${config.seed}. Within each trial, larger training sets include the smaller ones. The CDM fit uses a separate validation set for stopping.</p>` +
    `<div class="chart-key"><span>Mean squared error</span><span class="baseline">1/m visual guide</span></div>` +
    scalingChart(result) +
    `<div class="result-table-wrap"><table class="result-table"><thead><tr><th>Train choices m</th><th>Mean centered MSE</th><th>SE over 3 trials</th><th>Individual trial MSE</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    `<p class="result-footnote">The dashed curve is anchored to the first observed mean and falls like 1/m. It is a visual reference, not a fitted rate or proof. A three-trial browser demonstration is too small to verify the paper's uniform guarantee.</p>`;
}

function downloadResults() {
  if (!state.result) return;
  const result = state.result;
  if (result.type === "scaling") {
    const lines = ["source,items,seed,train_choices,trial,matrix_mse"];
    result.points.forEach(point => point.trials.forEach((mse, trial) =>
      lines.push([result.config.source, result.config.n, result.config.seed, point.m, trial + 1, mse].join(",")),
    ));
    saveCSV(lines.join("\n") + "\n", `cdm-scaling-seed-${result.config.seed}.csv`);
    return;
  }
  const header = "source,items,choices,menu_mode,scale,seed,restarts,model,rank,selected,train_nll,validation_nll,matrix_rmse,epochs,restart,test_nll";
  const lines = result.models.map(model => {
    const selected = model.kind === "rank" && model.rank === result.selectedRank;
    const testNLL = selected ? result.test.selected.nll
      : model.kind === "mnl" ? result.test.mnl.nll
        : model.kind === "full" ? result.test.full.nll : "";
    return [result.config.source, result.config.n, result.config.observations,
      result.config.menuMode, result.config.scale, result.config.seed, result.config.restarts,
      model.kind, model.rank || "", selected, model.train.nll, model.validation.nll,
      model.recoveryRMSE ?? "", model.epochs, model.restart ?? "", testNLL].join(",");
  });
  saveCSV([header, ...lines].join("\n") + "\n", `cdm-experiment-seed-${result.config.seed}.csv`);
}

function saveCSV(content, filename) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelectorAll("[data-view]").forEach(button =>
  button.addEventListener("click", () => setView(button.dataset.view)),
);
document.querySelectorAll("[data-preset]").forEach(button =>
  button.addEventListener("click", () => loadPreset(button.dataset.preset)),
);
document.querySelectorAll("[data-scenario]").forEach(button => {
  button.addEventListener("click", () => {
    const scenario = button.dataset.scenario;
    byId("source-select").value = scenario === "iia" ? "mnl" : "rank2";
    byId("menus-select").value = scenario === "pairs" ? "pairs" : "all";
    byId("scale-select").value = scenario === "iia" ? "0.4" : "1.2";
    updateDataSource();
    document.querySelectorAll("[data-scenario]").forEach(item => item.classList.toggle("selected", item === button));
    byId("run-progress").textContent = "Scenario loaded. Run the experiment to generate new results.";
  });
});
byId("reset-matrix").addEventListener("click", () => loadPreset("asymmetric"));
byId("source-select").addEventListener("change", updateDataSource);
byId("choice-file").addEventListener("change", handleUpload);
byId("rank-slider").addEventListener("input", event => setRank(Number(event.target.value)));
byId("include-c").addEventListener("change", renderChoices);
byId("include-d").addEventListener("change", renderChoices);
byId("run-experiment").addEventListener("click", () => startExperiment("rank"));
byId("run-scaling").addEventListener("click", () => startExperiment("scaling"));
byId("cancel-experiment").addEventListener("click", cancelExperiment);
byId("download-results").addEventListener("click", downloadResults);

renderSource();
updateMatrix();
const startingView = location.hash.slice(1);
setView(["matrix", "experiment", "paper"].includes(startingView) ? startingView : "matrix");
