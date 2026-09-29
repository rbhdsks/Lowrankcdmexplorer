"use strict";

// U[x][z]: the effect of context z on target x. The diagonal is undefined.
const EXAMPLE = [
  [0, 1.2, 0.5, -0.8],
  [-0.7, 0, 1.1, 0.3],
  [0.9, -0.4, 0, 1.4],
  [0.2, 0.8, -1.0, 0],
];
const ITEMS = ["A", "B", "C", "D"];
let matrix = EXAMPLE.map(row => row.slice());
let rank = 1;
let selected = [0, 1];
let fits = [];
const $ = id => document.getElementById(id);
const number = n => Math.abs(n) < 0.00005 ? "0.000" : n.toFixed(3);
const dot = (a, b) => a.reduce((sum, v, k) => sum + v * b[k], 0);
const clone = a => a.map(row => row.slice());

// Solve a tiny regularized least-squares problem by Gaussian elimination.
function solve(gram, rhs) {
  const n = rhs.length;
  const a = gram.map((row, i) => [...row, rhs[i]]);
  for (let j = 0; j < n; j++) {
    let p = j;
    for (let i = j + 1; i < n; i++) if (Math.abs(a[i][j]) > Math.abs(a[p][j])) p = i;
    [a[j], a[p]] = [a[p], a[j]];
    const d = a[j][j];
    for (let k = j; k <= n; k++) a[j][k] /= d;
    for (let i = 0; i < n; i++) if (i !== j) {
      const scale = a[i][j];
      for (let k = j; k <= n; k++) a[i][k] -= scale * a[j][k];
    }
  }
  return a.map(row => row[n]);
}

function fitError(target, context) {
  let squared = 0;
  for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) if (x !== z) {
    squared += (matrix[x][z] - dot(target[x], context[z])) ** 2;
  }
  return Math.sqrt(squared / 12);
}

function rng(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function alternate(target, context, r) {
  const ridge = 1e-7;
  for (let sweep = 0; sweep < 100; sweep++) {
    for (let x = 0; x < 4; x++) {
      const gram = Array.from({length:r}, (_, i) => Array.from({length:r}, (_, j) =>
        context.reduce((sum, c, z) => sum + (x === z ? 0 : c[i] * c[j]), i === j ? ridge : 0)));
      const rhs = Array.from({length:r}, (_, i) => context.reduce((sum, c, z) => sum + (x === z ? 0 : matrix[x][z] * c[i]), 0));
      target[x] = solve(gram, rhs);
    }
    for (let z = 0; z < 4; z++) {
      const gram = Array.from({length:r}, (_, i) => Array.from({length:r}, (_, j) =>
        target.reduce((sum, t, x) => sum + (x === z ? 0 : t[i] * t[j]), i === j ? ridge : 0)));
      const rhs = Array.from({length:r}, (_, i) => target.reduce((sum, t, x) => sum + (x === z ? 0 : matrix[x][z] * t[i]), 0));
      context[z] = solve(gram, rhs);
    }
  }
  return {target, context, error: fitError(target, context)};
}

function exactRankThree() {
  // Every 3 of these 4 target rows are independent; each context has 3 observed entries.
  const target = [[1,0,0],[0,1,0],[0,0,1],[1,1,1]];
  const context = Array.from({length:4}, (_, z) => {
    const rows = target.filter((_, x) => x !== z);
    const values = matrix.map((row, x) => row[z]).filter((_, x) => x !== z);
    const gram = Array.from({length:3}, (_, i) => Array.from({length:3}, (_, j) => rows.reduce((s, row) => s + row[i]*row[j], i===j?1e-12:0)));
    const rhs = Array.from({length:3}, (_, i) => rows.reduce((s, row, k) => s + row[i]*values[k], 0));
    return solve(gram, rhs);
  });
  return {target, context, error:fitError(target, context)};
}

function refit() {
  fits = [];
  for (let r = 1; r <= 2; r++) {
    let best = null;
    for (let restart = 0; restart < 10; restart++) {
      const random = rng(1234 + restart * 127 + r * 997);
      let target = Array.from({length:4}, () => Array.from({length:r}, () => (random()-.5)*2));
      let context = Array.from({length:4}, () => Array.from({length:r}, () => (random()-.5)*2));
      if (r === 2 && restart === 0) {
        target = fits[0].target.map(row => [row[0], 0]);
        context = fits[0].context.map(row => [row[0], 0]);
      }
      const fit = alternate(target, context, r);
      if (!best || fit.error < best.error) best = fit;
    }
    if (r === 2 && best.error > fits[0].error) {
      best = {
        target: fits[0].target.map(row => [row[0], 0]),
        context: fits[0].context.map(row => [row[0], 0]),
        error: fits[0].error,
      };
    }
    fits.push(best);
  }
  fits.push(exactRankThree());
  const target = ITEMS.map((_, x) => ITEMS.map((_, j) => x===j ? 1 : 0));
  const context = ITEMS.map((_, z) => ITEMS.map((_, x) => matrix[x][z]));
  fits.push({target, context, error:0});
}

function renderSource() {
  const grid = $("source-matrix");
  grid.replaceChildren();
  grid.append(axis("target / context", "corner"));
  ITEMS.forEach(item => grid.append(axis(item)));
  for (let x=0; x<4; x++) {
    grid.append(axis(ITEMS[x], "target"));
    for (let z=0; z<4; z++) {
      if (x===z) { grid.append(empty()); continue; }
      const input = document.createElement("input");
      input.className = "matrix-input";
      input.type = "number"; input.step = "0.1"; input.min = "-3"; input.max = "3";
      input.value = matrix[x][z].toFixed(1);
      input.setAttribute("aria-label", `Effect of context ${ITEMS[z]} on target ${ITEMS[x]}`);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (input.value.trim()==="" || !Number.isFinite(value) || value < -3 || value > 3) {
          input.value = matrix[x][z].toFixed(1);
          input.setCustomValidity("Enter a number from −3 to 3."); input.reportValidity(); input.setCustomValidity(""); return;
        }
        matrix[x][z] = value;
        input.value = value.toFixed(1);
        selected = [x,z]; update();
      });
      grid.append(input);
    }
  }
}
function axis(label, cls="") { const el=document.createElement("span"); el.className=`axis ${cls}`; el.textContent=label; return el; }
function empty() { const el=document.createElement("span"); el.className="matrix-empty"; el.textContent="—"; el.setAttribute("aria-label","Unused diagonal"); return el; }

function renderFactor(id, vectors, context=false) {
  const grid=$(id); grid.replaceChildren();
  vectors.forEach((row,x) => {
    const line=document.createElement("div"); line.className="factor-row"; line.append(axis(ITEMS[x]));
    row.forEach(value => { const cell=document.createElement("span"); cell.className=`factor-cell ${context?"context-cell":""}`; cell.textContent=number(value); cell.title=value.toFixed(6); line.append(cell); });
    grid.append(line);
  });
}

function renderResult(fit) {
  const grid=$("reconstructed-matrix"); grid.replaceChildren();
  grid.append(axis("x / z", "corner")); ITEMS.forEach(item=>grid.append(axis(item)));
  for (let x=0;x<4;x++) {
    grid.append(axis(ITEMS[x],"target"));
    for(let z=0;z<4;z++) {
      if (x===z) { grid.append(empty()); continue; }
      const cell=document.createElement("button"); cell.type="button";
      cell.className="matrix-value"+(selected[0]===x&&selected[1]===z?" active":"");
      cell.textContent=number(dot(fit.target[x],fit.context[z]));
      cell.setAttribute("aria-label",`Inspect reconstructed effect of context ${ITEMS[z]} on target ${ITEMS[x]}`);
      cell.setAttribute("aria-pressed",selected[0]===x&&selected[1]===z?"true":"false");
      cell.addEventListener("click",()=>{ selected=[x,z]; renderResult(fit); renderExplanation(fit); });
      grid.append(cell);
    }
  }
}

function renderExplanation(fit) {
  const [x,z]=selected;
  const product=fit.target[x].map((v,k)=>`${number(v)} × ${number(fit.context[z][k])}`).join(" + ");
  const prediction=dot(fit.target[x],fit.context[z]);
  $("cell-explanation").innerHTML=`<strong>Target ${ITEMS[x]} ← context ${ITEMS[z]}</strong><br>t<sub>${ITEMS[x]}</sub> · c<sub>${ITEMS[z]}</sub> = ${product} ≈ <strong>${number(prediction)}</strong>. Original U<sub>${ITEMS[x]}${ITEMS[z]}</sub> = ${number(matrix[x][z])}; difference = ${number(Math.abs(matrix[x][z]-prediction))}. Values shown are rounded.`;
}

function renderChart() {
  const chart=$("error-chart"); chart.replaceChildren();
  const scale=Math.max(...fits.map(f=>f.error),0.01);
  fits.forEach((fit,i)=>{
    const row=document.createElement("button"); row.type="button"; row.className=`chart-row ${rank===i+1?"selected":""}`;
    row.setAttribute("aria-label",`Choose rank ${i+1}; reconstruction RMSE ${number(fit.error)}`);
    const title=document.createElement("span"); title.className="chart-name"; title.textContent=`Rank ${i+1}`;
    const track=document.createElement("span"); track.className="chart-track";
    const fill=document.createElement("span"); fill.className="chart-fill"; fill.style.display="block"; fill.style.width=`${fit.error/scale*100}%`; track.append(fill);
    const value=document.createElement("span"); value.className="chart-number"; value.textContent=number(fit.error);
    row.append(title,track,value); row.addEventListener("click",()=>setRank(i+1)); chart.append(row);
  });
}

function render() {
  const fit=fits[rank-1];
  $("rank").value=String(rank); $("rank-value").textContent=String(rank);
  $("rank-description").textContent=rank===1 ? "One number per target and one per context. Every effect is one product." : `${rank} numbers per vector. Each interaction adds ${rank} products.`;
  $("t-shape").textContent=`4 × ${rank}`; $("c-shape").textContent=`4 × ${rank}`;
  $("selected-error").textContent=number(fit.error);
  renderFactor("target-matrix",fit.target);
  renderFactor("context-matrix",fit.context,true);
  renderResult(fit); renderExplanation(fit); renderChart();
}
function update() { refit(); render(); }
function setRank(next) { rank=next; render(); }
$("rank").addEventListener("input",e=>setRank(Number(e.target.value)));
$("reset").addEventListener("click",()=>{ matrix=clone(EXAMPLE); rank=1; selected=[0,1]; renderSource(); update(); });

// When supported, expose the same two primary controls to browser agents.
if (document.modelContext?.registerTool) {
  const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{}); } catch {} };
  register({name:"set_cdm_rank",title:"Set CDM rank",description:"Choose rank 1–4 and update the factor matrices and error comparison.",inputSchema:{type:"object",properties:{rank:{type:"integer",minimum:1,maximum:4}},required:["rank"],additionalProperties:false},annotations:{readOnlyHint:false},execute:({rank:next})=>{if(!Number.isInteger(next)||next<1||next>4) throw Error("Rank must be 1–4.");setRank(next);return {rank,error:fits[next-1].error};}});
  register({name:"set_cdm_interactions",title:"Set CDM interactions",description:"Update one or more off-diagonal interactions, then refit all ranks and refresh the display.",inputSchema:{type:"object",properties:{cells:{type:"array",minItems:1,items:{type:"object",properties:{target:{type:"string",enum:ITEMS},context:{type:"string",enum:ITEMS},value:{type:"number",minimum:-3,maximum:3}},required:["target","context","value"],additionalProperties:false}}},required:["cells"],additionalProperties:false},annotations:{readOnlyHint:false},execute:({cells})=>{if(!Array.isArray(cells)||!cells.length||cells.some(c=>!ITEMS.includes(c.target)||!ITEMS.includes(c.context)||c.target===c.context||!Number.isFinite(c.value)||c.value < -3||c.value > 3))throw Error("Use distinct target/context items and values from −3 to 3.");cells.forEach(c=>{matrix[ITEMS.indexOf(c.target)][ITEMS.indexOf(c.context)]=c.value;});selected=[ITEMS.indexOf(cells.at(-1).target),ITEMS.indexOf(cells.at(-1).context)];renderSource();update();return {updated:cells.length,rank,error:fits[rank-1].error};}});
}
renderSource(); update();
