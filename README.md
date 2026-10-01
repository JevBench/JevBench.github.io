# jevbench.github.io

The website of [JevBench](https://github.com/JevBench/jevbench): coherence tests for Jev-compatible
typed decision models. It shows the leaderboard (by dimension or by group), radar profiles, the findings and the
models, and hosts every evaluation report.

| Path | Content |
|---|---|
| `index.html`, `assets/` | the page; it reads everything it shows from `data/` |
| `data/leaderboard.json` | scores (dimensions, groups, relations), intervals, rank ranges and accuracy of every model and reference model |
| `data/agreement.json` | how jevbench-mini reproduces jevbench-240 |
| `data/models.json`, `data/taxonomy.json` | the models and the relations |
| `data/results/<suite>/<model>.json.gz` | the full report of each model: every answer, outcome and score |
| `data/results/reference/<suite>/<name>.json.gz` | the reference models (uniform, random, Luce toy scorers) |
| `report/` | the technical report |

A report opens with the package: `jevbench.Report.load("data/results/jevbench-mini/open-jev-9b.json.gz")`.
The `data/*.json` files are written by `bench/analysis/site_data.py` in the
[jevbench repository](https://github.com/JevBench/jevbench), from the reports in `data/results`.

To view the site locally: `python -m http.server` in this directory, then open http://localhost:8000.
