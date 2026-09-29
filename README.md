# Low-rank CDM explorer

A small, browser-only learning tool for the low-rank context-dependent model (CDM) in [Seshadri, Peysakhovich & Ugander (2019)](https://proceedings.mlr.press/v97/seshadri19a.html). No packages, account, server code, or API key are needed.

## Run it

Open `index.html` in a browser. Alternatively, from this folder run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## What to try

1. In the 4 × 4 matrix, change an off-diagonal number. Row A, column B means the effect of B being present on A's utility.
2. Move the rank slider from 1 to 4. Rank `r` gives each item `r` target coordinates and `r` context coordinates.
3. Click a reconstructed cell to see the dot product that produced it.
4. Compare RMSE across ranks, then press **Reset example**.

The model uses `U[x][z] ≈ dot(target[x], context[z])`, written as `Û = T × Cᵀ`. The diagonal is never used because an item cannot be context for itself in a choice set. RMSE here is `sqrt(sum((U[x][z] - Û[x][z])² for x ≠ z) / 12)`.

This is a matrix reconstruction demonstration, **not** model training on observed choices. Ranks 1 and 2 use alternating least squares from ten seeded starting points, keeping the best result found; that numerical procedure does not guarantee the global optimum. With four items and an unused diagonal, rank 3 can reproduce all 12 used cells exactly. Rank 4 uses an explicit exact factorization. The factor coordinates themselves are not unique.

## Files

- `index.html` — page structure and short explanations
- `style.css` — layout, colors, and mobile styles
- `app.js` — matrix state, factorization, reconstruction, and interactions

## Push to a new GitHub repository

Create an **empty private repository** on GitHub first. Then run inside this folder, replacing the example URL with your repository URL:

```bash
git init
git add .
git commit -m "Add low-rank CDM explorer"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Keeping the GitHub repository private is separate from the existing private Sites deployment. Do not enable GitHub Pages if you want the website itself to remain private.
