# Context Lab — low-rank CDM explorer

An interactive, dependency-free research teaching app for the context-dependent random utility model (CDM) in [Seshadri, Peysakhovich, and Ugander (ICML 2019)](https://proceedings.mlr.press/v97/seshadri19a.html).

It has three parts:

1. **Matrix studio:** Edit a four-item directed interaction matrix, move rank 1–4, inspect target and context factors, click a reconstructed cell to see its dot product, compare off-diagonal RMSE, and see how the choice set changes softmax probabilities and A/B odds.
2. **Experiment lab:** Generate seeded synthetic choices from MNL, rank-2 CDM, or a full CDM; fit MNL, ranks 1–4, and a full CDM on identical data; compare training and validation NLL; select rank by validation and report test NLL. A second button runs a three-trial recovery scaling study over four nested sample sizes, with a `1/m` visual guide. You can also upload a small choice CSV in the documented format. Change items, sample count, choice-set sampling, effect scale, restarts, and seed. Download a run's summary as CSV.
3. **Paper guide:** Short equations and boundaries of the demonstration.

## Run locally

This is plain HTML, CSS, and JavaScript with no installation step. The experiment uses a Web Worker, so serve the folder over HTTP. From the project root:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. On a Mac, press `Control+C` in the terminal to stop the server.

The project also works as a static website on GitHub Pages. No backend, API key, or external JavaScript package is used.

## Push to GitHub

Create an **empty private repository** on GitHub. From this folder, replace the example remote URL:

```bash
git init
git add .
git commit -m "Build interactive CDM research lab"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

**Privacy:** A private personal GitHub repository does not make its GitHub Pages website private. GitHub's documentation says Pages websites are publicly available even when the repository is private, except for specific enterprise access-control setups. Keep Pages disabled until you intentionally approve a public website. The earlier private Sites version is independent of this repository.

When you *do* want public GitHub Pages hosting: in the repository, open **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then **Save**. `index.html` is already at the root. See [GitHub's current Pages instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## What is the model doing?

The matrix entry `U[x][z]` measures **context z's effect on target x**. Rows are targets; columns are contexts. For a choice set `S`, CDM adds the contributions from all other available items:

```text
utility(x | S) = sum(U[x][z] for z in S if z != x)
P(x | S) = exp(utility(x | S)) / sum(exp(utility(y | S)) for y in S)
```

In the low-rank model, every item receives a target vector `t[x]` and a context vector `c[z]`, each with `r` coordinates:

```text
U[x][z] ≈ dot(t[x], c[z])
matrix form: U ≈ T × Cᵀ
```

The diagonal is undefined for choice probabilities. In the matrix studio, the fitting objective is `sqrt(sum((U[x][z] − reconstructed[x][z])² for x != z) / 12)`. Ranks 1–2 use alternating least squares with twelve seeded starts. They may find a local optimum. For four items, rank 3 can match all twelve used entries exactly because diagonal entries are free; rank 4 uses an explicit exact factorization. The factors are not unique.

**The experiment lab solves a different problem.** It generates menus and chosen winners, then estimates parameters by minimizing average choice negative log-likelihood (NLL) with Adam and a small L2 penalty. The same generated data and 70/15/15 split are used for every model. Each low-rank restart changes initialization, not the data. Best restart at each rank is chosen by validation NLL, and rank is selected on validation. The test split is evaluated afterward for the selected rank, MNL, and full CDM. Matrix recovery RMSE is displayed only when the synthetic truth actually has a CDM matrix; it centers both matrices because a common off-diagonal shift leaves choice probabilities unchanged.

The controls use small item counts so the experiment runs in a browser. “Pairs only” deliberately demonstrates the identification caveat: one menu size does not uniquely determine a CDM interaction matrix. With sparse observations, even the mixed or all-set settings may not cover every needed choice set.

### Use your own choice data

Select **Upload choice CSV**. The app reads the file locally in the browser; it does not send it anywhere. It expects exactly two columns, `menu,chosen`, with menu items separated by `|`:

```csv
menu,chosen
Walk|Bus,Walk
Walk|Bus|Bike,Bus
Bus|Bike,Bike
```

Each chosen item must appear in its menu. Use at least 60 rows, 3–8 distinct item labels, and at most 10,000 rows (under 2 MB). Labels may contain letters, numbers, spaces, `_`, `.`, or `-`. The app maps labels to item indices, shuffles once using your seed, and applies the same 70/15/15 split and fitting workflow. It cannot compute true matrix recovery error because real observed choices do not reveal the true matrix.

The paper's original dataset files are not in this simple two-column format. Preprocess availability and chosen item fields into this format before upload, and verify that the conversion preserves each observed choice set. This upload is for exploration, not a claim of reproducing the published numbers.

In the scaling study, the true CDM matrix is held fixed, each trial samples new choices, and the training sets are nested across sizes. A full CDM is fit at each size, and the graph shows mean centered squared matrix error across three trials, with standard error. The dashed `1/m` line is anchored at the first observed mean and is only a visual guide. This small study cannot establish a theoretical convergence rate.

## Relationship to the paper

The paper studies synthetic data and compares held-out NLL for MNL and CDMs of varying rank on SFWork, SFShop, and nature-photo choices. This app explores the same *model ideas and experimental questions*. It **does not reproduce the published figures or numbers**: it does not bundle those datasets, the paper's exact preprocessing and baselines, or its repeated-trial hypothesis test. Use a research notebook with the original data and protocol for a numerical reproduction.

## Project map

| File | Purpose |
| --- | --- |
| `index.html` | Structure and beginner explanations |
| `styles.css` | Responsive visual design |
| `src/app.js` | UI state, controls, charts, CSV export |
| `src/math.js` | Stable softmax, seeded random numbers, small linear solver |
| `src/matrix.js` | Off-diagonal matrix factorization and reconstruction |
| `src/choice.js` | Menus, synthetic truth, choices, splits |
| `src/fit.js` | Adam fits, NLL, rank selection, test evaluation |
| `src/worker.js` | Background experiment computation |
| `src/upload.js` | Strict local choice CSV parsing |
| `tests/model.test.js` | Mathematical and reproducibility checks |

## Check the calculations

If Node.js is installed:

```bash
npm test
```

The app itself needs no Node.js to run. The tests use Node's built-in test runner and install no packages.
