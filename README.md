# Context Lab: An Interactive Low-Rank CDM Explorer

**A browser-based research teaching tool for understanding how choice-set context changes preferences.** Edit directed interactions, inspect low-rank target and context vectors, fit models on synthetic or uploaded choices, and trace a small worked example from factor values to choice probabilities.

[**Launch the explorer**](https://rbhdsks.github.io/Lowrankcdmexplorer/#matrix) · [Experiment lab](https://rbhdsks.github.io/Lowrankcdmexplorer/#experiment) · [Paper guide](https://rbhdsks.github.io/Lowrankcdmexplorer/#paper) · [Code notes](NOTES.md)

This project is an **independent educational companion** to the context-dependent random utility model (CDM) of [Seshadri, Peysakhovich, and Ugander (ICML 2019)](https://proceedings.mlr.press/v97/seshadri19a.html). Its browser experiments are deliberately small and do not reproduce the paper's published figures or real-data results.

## What you can explore

| View | Question | What changes when you interact? |
| --- | --- | --- |
| **Matrix Studio** | How do target and context vectors approximate directed item interactions? | Edit a four-item interaction matrix, choose rank 1–4, inspect factor vectors and reconstructed cells, compare off-diagonal RMSE, and change a choice set to see probabilities and A/B odds. |
| **Experiment Lab** | Can model parameters be learned from observed winners? | Generate reproducible MNL/CDM choices or upload a CSV. Fit MNL, low-rank CDM, and full CDM on the same split; compare validation NLL and inspect final test NLL. Run a small matrix-recovery scaling study. |
| **Paper Guide** | How do the equations connect to actual calculations? | Switch ranks 1–3 and six Chai–Coffee–Juice observations from Nitesh's study notes. Follow initial factors → interaction matrix → menu scores → choice probabilities → illustrative mean NLL. |

### A two-minute tour

1. Open [Matrix Studio](https://rbhdsks.github.io/Lowrankcdmexplorer/#matrix). Change `U[A][B]`: this is **B's context effect on A**, not A's effect on B. Compare rank 1 with rank 3 and click a reconstructed cell to see its dot product.
2. Add C to the choice set and watch A/B odds. Context effects can change those odds.
3. Open [Paper Guide](https://rbhdsks.github.io/Lowrankcdmexplorer/#paper). Select **Rank 2**, then **Observation 6** to follow the same calculation on a three-item example.
4. Open [Experiment Lab](https://rbhdsks.github.io/Lowrankcdmexplorer/#experiment). Keep the default seed, run a rank comparison, and read the **validation** and **test** columns separately.

## The model, in brief

Let `S` be the set of available items. A CDM entry `u[x,z]` measures the effect of **context item `z`** on **target item `x`**. The diagonal is unused because an item is not its own context.

$$
s_x(S)=\sum_{z\in S\setminus\{x\}}u_{xz},
\qquad
P(x\mid S)=\frac{e^{s_x(S)}}{\sum_{y\in S}e^{s_y(S)}}.
$$

In the low-rank construction, each item has a target vector `t[x]` and a context vector `c[x]`, both of length `r`:

$$
u_{xz}=t_x^{\mathsf T}c_z
=\sum_{k=1}^{r}t_{xk}c_{zk},
\qquad T,C\in\mathbb{R}^{n\times r},\quad TC^{\mathsf T}\in\mathbb{R}^{n\times n}.
$$

`r` is the number of coordinates in each vector. The **factor product** has rank at most `r`; masking or replacing its diagonal can change the ordinary matrix rank. Factor vectors themselves are not uniquely determined by the interaction product.

## Run locally

The application is plain HTML, CSS, and JavaScript. **There is no build step, backend, account, API key, or `npm install` requirement.** A local HTTP server is needed for ES modules and the experiment Web Worker.

```bash
git clone https://github.com/rbhdsks/Lowrankcdmexplorer.git
cd Lowrankcdmexplorer
python3 -m http.server 8000
```

Visit <http://localhost:8000/#matrix>. Use `#experiment` or `#paper` for the other views. Press `Control+C` in the terminal to stop the server. If port 8000 is in use, choose another port and update the local URL accordingly.

To run the mathematical checks, install a recent Node.js version with the built-in test runner and execute:

```bash
npm test
```

The tests use only Node's standard library; the website does not depend on Node at runtime. Opening `index.html` directly with `file://` may prevent module workers from starting.

## What each calculation means

### Matrix Studio: reconstruct a supplied matrix

The four-item source matrix is editable. For each rank, the app finds target/context factors and reconstructs `Û = T Cᵀ`. Its error is measured **only on the 12 off-diagonal entries**:

$$
\operatorname{RMSE}_{\mathrm{off}}=
\sqrt{\frac{1}{12}\sum_{x\ne z}(U_{xz}-\widehat U_{xz})^2}.
$$

Ranks 1–2 use alternating least squares with 12 fixed-seed starts; a local optimum is possible. For four items, rank 3 is constructed to match the 12 used entries exactly because the four diagonal entries are unconstrained. Rank 4 uses an exact identity-based factorization. A small reconstruction error means the supplied matrix was matched; it does **not** measure prediction on unseen choices.

### Experiment Lab: learn from chosen items

The data are rows of **available menu → chosen item**. Target vectors, context vectors, and interaction values are **not observed** in these rows. The lab generates or imports choices, then uses average negative log-likelihood (NLL) to estimate model parameters:

$$
\operatorname{NLL}(D)=-\frac{1}{|D|}\sum_{(S,y)\in D}\log P(y\mid S).
$$

The same shuffled **70% train / 15% validation / 15% test** split is used for every model in a run. The app fits MNL, ranks 1–4 (up to the number of items), and full CDM. It uses Adam, a small L2 penalty, validation checks, and up to 240 epochs. Each rank may have multiple seeded starts; the restart and then the rank are chosen using **validation NLL**. The selected rank, MNL, and full CDM are evaluated on the test split after selection. The test set does not select the rank.

The displayed raw parameter counts describe stored values, not identifiable degrees of freedom. Matrix recovery RMSE appears only for synthetic CDM data with a known true matrix. It is centered over off-diagonal cells because a common shift to those interactions leaves the choice probabilities unchanged. Uploaded or MNL-generated choices do not provide a true CDM matrix for this comparison.

### Recovery scaling: a small exploratory study

With synthetic rank-2 or full CDM truth, the scaling button keeps the true matrix fixed, takes four nested training sizes, and repeats the sampling three times. It fits a full CDM, reports **mean centered matrix squared error** and standard error across trials, and draws an anchored `1/m` visual reference. Three browser trials and four sizes are not evidence for a convergence theorem or a reproduction of the paper's guarantee.

## Bring your own choices

Choose **Upload choice CSV** in the Experiment Lab. Use exactly two columns, `menu,chosen`; separate items within a menu by `|`:

```csv
menu,chosen
Chai|Coffee,Chai
Chai|Coffee,Coffee
Chai|Coffee|Juice,Coffee
```

This is a **format example**, not a sufficient dataset. The app accepts **60–10,000 observations**, **3–8 distinct items**, and a file smaller than **2 MB**. Every chosen item must be present in its menu; a menu needs at least two distinct items. Item labels may contain letters, numbers, spaces, `_`, `.` and `-` (up to 40 characters). Do not put commas inside labels. The file is parsed locally in your browser and is not uploaded to a server.

The seed controls both the deterministic data shuffle and parameter initialization for uploaded data. `Download CSV` exports a summary of the latest run. For rank comparisons, the `test_nll` column is populated for the selected rank, MNL, and full CDM; the unselected low-rank models are not evaluated on test by that export. For the scaling study, each exported row is one trial at one training size.

## Reproducibility and interpretation

- The default seed is `20260831`. With the same inputs and browser implementation, synthetic data generation and randomized initializations repeat deterministically.
- A **restart** changes initial factor values, not the observed choices or split. Initialization is a seeded pseudorandom calculation, described in [NOTES.md](NOTES.md).
- `Pairs only` intentionally exposes an identifiability limitation. Mixed or all-set sampling provides more menu variation, but a small sample may still lack the coverage needed to identify every interaction.
- Training NLL describes fit to observed training choices; validation NLL selects a model; test NLL estimates predictive fit on held-out choices. Reconstruction RMSE answers a different question.
- Runs use browser-scale item counts and simplified protocols. Do not treat a single seeded result as a general empirical conclusion.

## Repository map

| Path | Role |
| --- | --- |
| `index.html` | Three views, semantic markup, controls, explanatory text |
| `styles.css` | Responsive layout and visual states |
| `src/app.js` | UI state, events, rendering, worker lifecycle, charts, CSV export |
| `src/paper-example.js` | Nitesh's six-choice example, factors, derived probabilities, guide controls |
| `src/math.js` | Seeded RNG, normal draws, dot product, stable softmax, linear solver |
| `src/matrix.js` | Matrix presets, off-diagonal RMSE, alternating least squares, reconstruction |
| `src/choice.js` | Choice-set sampling, synthetic truth, chosen-item sampling, 70/15/15 split |
| `src/fit.js` | MNL/CDM optimization, evaluation, validation rank selection, scaling study |
| `src/upload.js` | Strict local CSV parsing and item indexing |
| `src/worker.js` | Runs experiments away from the UI thread and reports progress |
| `tests/model.test.js` | Model arithmetic, reproducibility, upload, worked-example checks |
| `NOTES.md` | Architecture, every function's role, equations, and extension guide |

See [NOTES.md](NOTES.md) for a detailed code walkthrough and a function-by-function reference.

## Provenance and scope

The interactive **Chai–Coffee–Juice** worked example, its six toy observations, and the displayed starting factors are adapted from the original explanatory notes of **Nitesh Kumar Shah**, developed under the supervision of **Prof. Suryanarayana Sankagiri**, Indian Institute of Technology Madras. The notes and this application explain the CDM introduced by **Seshadri, Peysakhovich, and Ugander**; they do not claim authorship of the underlying model.

The original paper is [*Discovering Context Effects from Raw Choice Data* (ICML 2019)](https://proceedings.mlr.press/v97/seshadri19a.html). This site does not bundle SFWork, SFShop, nature-photo datasets, the paper's exact preprocessing, mixed-MNL baseline, or its full repeated-trial protocol. Its toy example and synthetic outputs are **not the paper's reported numerical results**.

**Project author:** Nitesh Kumar Shah, M.Tech (Data Science and Artificial Intelligence), IIT Madras.  
**Academic supervision:** Prof. Suryanarayana Sankagiri, IIT Madras.
