// JevBench website: everything below is computed from data/*.json (bench/analysis/site_data.py).
(async function () {
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
  const [lb, agree, models, tax] = await Promise.all([
    get("data/leaderboard.json"), get("data/agreement.json"), get("data/models.json"), get("data/taxonomy.json"),
  ]);
  const DIMS = tax.dimensions.map((d) => d.id);
  const pct = (v, d = 1) => (v === null || v === undefined ? "–" : (100 * v).toFixed(d));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const name = (m) => (models[m] ? models[m].display : m);
  const rows = lb.models;
  const FAMILIES = ["Decoder, trained scorer head", "Decoder, pointer head", "Decoder, answer-letter logits",
    "Encoder, option markers", "Encoder, bi-encoder", "Encoder, cross-encoder", "Contrastive embeddings"];
  const COLOURS = ["#1b7837", "#2b6a99", "#5aae61", "#c2185b", "#e08214", "#8c510a", "#762a83"];
  const famColour = (f) => COLOURS[Math.max(0, FAMILIES.indexOf(f))];
  // radar chart: axes [{label}], series [{name, colour, values (0..1 or null), dash}]
  const PALETTE = ["#E8603F", "#2b6a99", "#1b7837", "#762a83", "#e08214", "#c2185b", "#5aae61", "#8c510a"];
  function radar(axes, series, { size = 520, pad = 92, labels = true, font = 11 } = {}) {
    const n = axes.length, c = size / 2, R = c - pad;
    const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [c + R * v * Math.cos(a), c + R * v * Math.sin(a)]; };
    let s = "";
    [0.2, 0.4, 0.6, 0.8, 1].forEach((v) => {
      s += `<polygon class="ring" points="${axes.map((_, i) => pt(i, v).join(",")).join(" ")}"/>`;
    });
    if (labels) [0.2, 0.6, 1].forEach((v) => { const [x, y] = pt(0, v); s += `<text class="ax" x="${x + 4}" y="${y + 3}" style="font-size:${font - 2}px">${v * 100}</text>`; });
    axes.forEach((a, i) => {
      const [x, y] = pt(i, 1); s += `<line class="spoke" x1="${c}" y1="${c}" x2="${x}" y2="${y}"/>`;
      if (labels) {
        const [lx, ly] = pt(i, 1.13), anchor = Math.abs(lx - c) < 8 ? "middle" : lx > c ? "start" : "end";
        s += `<text class="ax" x="${lx}" y="${ly + 4}" text-anchor="${anchor}" style="font-size:${font}px">${esc(a.label)}</text>`;
      }
    });
    series.forEach((se) => {
      const pts = se.values.map((v, i) => pt(i, v === null || v === undefined ? 0 : v).join(",")).join(" ");
      s += `<polygon points="${pts}" fill="${se.colour}" fill-opacity="${se.dash ? 0 : 0.10}" stroke="${se.colour}" stroke-width="${se.dash ? 1.4 : 2}" ${se.dash ? 'stroke-dasharray="4 4"' : ""}><title>${esc(se.name)}</title></polygon>`;
    });
    return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img">${s}</svg>`;
  }
  const AXES = {
    dimensions: { title: "5 dimensions", axes: () => tax.dimensions.map((d) => ({ id: d.id, label: d.id + " " + d.title.split(" ")[0] })),
      get: (r, id) => r.dimensions[id] },
    groups: { title: "11 groups", axes: () => tax.groups.map((g) => ({ id: g.id, label: g.title })), get: (r, id) => r.groups[id] },
  };

  const REFNAME = { uniform: "Uniform (ignores the input)", random: "Random (unrelated answers)",
    luce: "Luce toy scorer", "luce-biased": "Luce toy scorer, biased" };

  // theme toggle (remembered per browser)
  const root = document.documentElement;
  try { const t = localStorage.getItem("jb-theme"); if (t) root.dataset.theme = t; } catch (e) { /* private mode */ }
  document.getElementById("theme").onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("jb-theme", root.dataset.theme); } catch (e) { /* ignore */ }
    drawScatter();
  };

  // hero stats
  document.getElementById("stats").innerHTML = [
    [rows.length, "openly released models"], [tax.relations.length, "metamorphic relations"],
    ["12,000", "frozen tests (1,200 reported)"], ["12", "decision domains"],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join("");

  // ---------------------------------------------------------------- leaderboard
  const cellColour = (v) => {
    if (v === null || v === undefined) return "transparent";
    const t = Math.max(0, Math.min(1, v));
    const a = t < 0.5 ? 0.30 * (1 - t / 0.5) + 0.04 : 0.04 + 0.22 * ((t - 0.5) / 0.5);
    return t < 0.5 ? `rgba(232,96,63,${a.toFixed(3)})` : `rgba(43,106,153,${a.toFixed(3)})`;
  };
  const segment = (el, opts, cur, on) => {
    el.innerHTML = opts.map(([k, t]) => `<button data-k="${k}" class="${k === cur ? "on" : ""}">${t}</button>`).join("");
    el.querySelectorAll("button").forEach((b) => (b.onclick = () => on(b.dataset.k)));
  };
  let sortKey = "overall", asc = false, family = null, showRef = true, open = null, view = "dimensions";
  // the score columns: the five dimensions, or the eleven groups under their dimensions
  const scoreKeys = () => (view === "groups" ? tax.groups.map((g) => g.id) : DIMS);
  const scoreOf = (r, k) => (k.includes(".") ? r.groups[k] : r.dimensions[k]);
  const cols = () => [
    { k: "rank", t: "#", num: true }, { k: "range", t: "Range" }, { k: "name", t: "Model" },
    { k: "overall", t: "Overall", num: true },
    ...scoreKeys().map((k) => ({ k, t: k.includes(".") ? tax.groups.find((g) => g.id === k).title : k, num: true, score: true })),
    { k: "full", t: "240", num: true, title: "jevbench-240, the full benchmark" },
    { k: "accuracy", t: "Accuracy", num: true },
  ];
  const value = (r, k) => {
    if (k === "overall" || k === "rank") return r.overall;
    if (k === "full") return r.full;
    if (k === "accuracy") return r.accuracy ? r.accuracy.accuracy : null;
    if (k === "name") return name(r.model).toLowerCase();
    if (k === "range") return r.rank_range ? r.rank_range[0] : 99;
    return scoreOf(r, k);
  };
  const fams = [...new Set(rows.map((r) => models[r.model].family))].sort((a, b) => FAMILIES.indexOf(a) - FAMILIES.indexOf(b));
  const famBox = document.getElementById("families");
  const drawChips = () => {
    famBox.innerHTML = `<div class="seg" id="view"></div><span class="sep"></span>` +
      `<button class="chip ${family ? "" : "on"}" data-f="">All families</button>` +
      fams.map((f) => `<button class="chip ${family === f ? "on" : ""}" data-f="${esc(f)}"><span style="color:${famColour(f)}">●</span> ${esc(f)}</button>`).join("") +
      `<span class="sep"></span><label class="toggle"><input type="checkbox" id="showref" ${showRef ? "checked" : ""}> reference models</label>`;
    segment(document.getElementById("view"), [["dimensions", "5 dimensions"], ["groups", "11 groups"]], view, (k) => {
      view = k; if (sortKey.length <= 3 || sortKey.includes(".")) { if (!["overall", "full", "accuracy", "name", "range"].includes(sortKey)) sortKey = "overall"; }
      drawChips(); drawTable(); });
    famBox.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { family = c.dataset.f || null; drawChips(); drawTable(); }));
    document.getElementById("showref").onchange = (e) => { showRef = e.target.checked; drawTable(); };
  };
  const lo = 40, hi = 100;
  const bar = (r) => {
    const x = (v) => Math.max(0, Math.min(100, ((100 * v - lo) / (hi - lo)) * 100));
    const ci = r.ci ? `<i style="left:${x(r.ci[0])}%;width:${x(r.ci[1]) - x(r.ci[0])}%"></i>` : "";
    return `<div class="bar">${ci}<em style="left:calc(${x(r.overall)}% - 1px)"></em></div>`;
  };
  const rankOf = Object.fromEntries(rows.map((r, i) => [r.model, i + 1]));
  const th = (c, extra = "") => `<th data-k="${c.k}" class="${c.num ? "num" : ""} ${c.score && view === "groups" ? "small" : ""} ${sortKey === c.k ? "sorted" + (asc ? " asc" : "") : ""} ${extra}" ${c.title ? `title="${esc(c.title)}"` : ""}>${esc(c.t)}</th>`;
  const gstart = (k) => view === "groups" && tax.groups.some((g, i) => g.id === k && (i === 0 || tax.groups[i - 1].id.split(".")[0] !== k.split(".")[0]));
  function drawTable() {
    const t = document.getElementById("lb"), cs = cols();
    let head;
    if (view === "groups") {   // two header rows: each dimension over its groups
      const fixed = cs.filter((c) => !c.score);
      const spans = DIMS.map((d) => [d, tax.groups.filter((g) => g.id.startsWith(d + ".")).length]);
      head = "<tr>" + fixed.slice(0, 4).map((c) => th(c, "").replace("<th ", '<th rowspan="2" ')).join("") +
        spans.map(([d, n]) => `<th class="dimhead" colspan="${n}">${d}</th>`).join("") +
        fixed.slice(4).map((c) => th(c).replace("<th ", '<th rowspan="2" ')).join("") + "</tr><tr>" +
        cs.filter((c) => c.score).map((c) => th(c, gstart(c.k) ? "gstart" : "")).join("") + "</tr>";
    } else {
      head = "<tr>" + cs.map((c) => th(c)).join("") + "</tr>";
    }
    let list = rows.filter((r) => !family || models[r.model].family === family);
    list = [...list].sort((a, b) => {
      const va = value(a, sortKey), vb = value(b, sortKey);
      if (va === vb) return 0; if (va === null || va === undefined) return 1; if (vb === null || vb === undefined) return -1;
      return (va < vb ? -1 : 1) * (asc ? 1 : -1) * (sortKey === "name" || sortKey === "range" ? -1 : 1);
    });
    const scoreCells = (r, colour) => scoreKeys().map((k) => `<td class="cell ${gstart(k) ? "gstart" : ""}"><span style="background:${colour ? cellColour(scoreOf(r, k)) : "transparent"}">${pct(scoreOf(r, k))}</span></td>`).join("");
    const body = list.map((r) => {
      const m = models[r.model];
      const star = m.serving ? "<sup>*</sup>" : "";
      const range = r.rank_range[0] === r.rank_range[1] ? r.rank_range[0] : `${r.rank_range[0]}–${r.rank_range[1]}`;
      const tr = `<tr class="model" data-m="${r.model}">
        <td class="rank">${rankOf[r.model]}</td><td class="range">${range}</td>
        <td class="name"><b>${esc(m.display)}</b>${star}<small><span style="color:${famColour(m.family)}">●</span> ${esc(m.developer)}</small></td>
        <td class="overall"><span class="ov">${pct(r.overall)}</span> <span class="ci">${pct(r.ci[0])}–${pct(r.ci[1])}</span>${bar(r)}</td>
        ${scoreCells(r, true)}
        <td class="num">${pct(r.full)}</td><td class="num">${r.accuracy ? pct(r.accuracy.accuracy) : "–"}</td></tr>`;
      return tr + (open === r.model ? detail(r, cs.length) : "");
    }).join("");
    const refs = showRef && !family ? lb.reference.map((r) => `<tr class="ref"><td></td><td></td>
        <td class="name">${esc(REFNAME[r.model] || r.model)}<small>reference</small></td>
        <td class="overall"><span class="ov">${pct(r.overall)}</span> <span class="ci">${r.ci ? pct(r.ci[0]) + "–" + pct(r.ci[1]) : ""}</span></td>
        ${scoreCells(r, false)}
        <td></td><td class="num">${r.accuracy ? pct(r.accuracy.accuracy) : "–"}</td></tr>`).join("") : "";
    t.innerHTML = `<thead>${head}</thead><tbody>${body}${refs}</tbody>`;
    t.querySelectorAll("th[data-k]").forEach((h) => (h.onclick = () => {
      const k = h.dataset.k === "rank" ? "overall" : h.dataset.k;
      if (sortKey === k) asc = !asc; else { sortKey = k; asc = k === "name" || k === "range"; }
      drawTable();
    }));
    t.querySelectorAll("tr.model").forEach((tr) => (tr.onclick = () => { open = open === tr.dataset.m ? null : tr.dataset.m; drawTable(); }));
  }
  function detail(r, span) {
    const m = models[r.model];
    const g = tax.groups.map((x) => {
      const v = r.groups[x.id];
      return `<div class="g"><span>${x.id.split(".")[0]} · ${esc(x.title)}</span><span class="gb"><i style="width:${v === null ? 0 : 100 * v}%"></i></span><b>${pct(v, 0)}</b></div>`;
    }).join("");
    const files = `<a href="data/results/jevbench-mini/${r.model}.json.gz">jevbench-mini report</a>` +
      (r.full !== null ? ` · <a href="data/results/jevbench-240/${r.model}.json.gz">jevbench-240 report</a>` : "");
    const time = m.mini_minutes ? ` · a jevbench-mini run takes ${m.mini_minutes < 1 ? "under a minute" : Math.round(m.mini_minutes) + " min"} on one ${r.model.startsWith("jevhome") ? "CPU server" : "A100"}` : "";
    const ax = AXES.groups.axes(), uni = lb.reference.find((x) => x.model === "uniform");
    const mini = radar(ax, [{ name: "uniform", colour: "#8a94a6", values: ax.map((a) => uni.groups[a.id]), dash: true },
      { name: m.display, colour: famColour(m.family), values: ax.map((a) => r.groups[a.id]) }], { size: 300, pad: 62, font: 10 });
    return `<tr class="detail"><td colspan="${span}"><div class="mini-radar">${mini}</div><div class="groups">${g}</div>
      <div class="meta"><b>${esc(m.display)}</b> · ${esc(m.base)} · ${esc(m.readout)} · ${esc(m.params)} · ${esc(m.license)} ·
      <a href="${esc(m.url)}">source</a>${time}<br>${m.serving ? "<sup>*</sup> " + esc(m.serving) + "<br>" : ""}
      Accuracy ${pct(r.accuracy.accuracy)}% (95% interval ${pct(r.accuracy.ci[0])}–${pct(r.accuracy.ci[1])}) over ${r.accuracy.n.toLocaleString()} questions. Full reports with every answer: ${files}.</div></td></tr>`;
  }
  document.getElementById("lbnote").innerHTML = rows.filter((r) => models[r.model].serving)
    .map((r) => `<sup>*</sup> <b>${esc(name(r.model))}</b>: ${esc(models[r.model].serving)}.`).join("<br>") +
    "<br>NeoHorse-Jev-4B was run but is not scored: its server refuses requests with more questions than its own limit, so one relation has no answers.";
  drawChips();
  drawTable();

  // ---------------------------------------------------------------- profiles (radar charts)
  let axesKey = "dimensions", picked = ["open-jev-9b", "jevany-gemma-4b", "von", "clm"].filter((m) => models[m]), refOn = false;
  function drawProfiles() {
    const A = AXES[axesKey], ax = A.axes();
    segment(document.getElementById("axes"), Object.entries(AXES).map(([k, v]) => [k, v.title]), axesKey, (k) => {
      axesKey = k; drawProfiles(); });
    const pk = document.getElementById("picker");
    pk.innerHTML = rows.map((r) => { const on = picked.includes(r.model);
      const col = on ? PALETTE[picked.indexOf(r.model) % PALETTE.length] : famColour(models[r.model].family);
      return `<button class="chip ${on ? "on" : ""}" data-m="${r.model}"><span style="color:${col}">●</span> ${esc(name(r.model))}</button>`; }).join("");
    pk.querySelectorAll(".chip").forEach((c) => (c.onclick = () => {
      const m = c.dataset.m;
      if (picked.includes(m)) picked = picked.filter((x) => x !== m); else if (picked.length < 6) picked = [...picked, m];
      drawProfiles();
    }));
    const series = picked.map((m, i) => { const r = rows.find((x) => x.model === m);
      return { name: name(m), colour: PALETTE[i % PALETTE.length], values: ax.map((a) => A.get(r, a.id)) }; });
    const uni = lb.reference.find((r) => r.model === "uniform");
    if (refOn && uni) series.unshift({ name: "uniform (reference)", colour: "#8a94a6", values: ax.map((a) => A.get(uni, a.id)), dash: true });
    document.getElementById("radar").outerHTML = radar(ax, series, { size: 560, pad: axesKey === "dimensions" ? 96 : 118 }).replace("<svg ", '<svg id="radar" ');
    document.getElementById("radarlegend").innerHTML = series.map((s) => `<div><span style="background:${s.colour};${s.dash ? "opacity:.6" : ""}"></span>${esc(s.name)}</div>`).join("") ||
      '<div class="note">Pick models above.</div>';
    // one small radar per family, its members overlaid
    const grid = document.getElementById("famradars");
    grid.innerHTML = fams.map((f) => {
      const members = rows.filter((r) => models[r.model].family === f);
      if (!members.length) return "";
      const se = members.map((r, i) => ({ name: name(r.model), colour: PALETTE[i % PALETTE.length], values: ax.map((a) => A.get(r, a.id)) }));
      return `<div class="figure"><h4><span style="color:${famColour(f)}">●</span> ${esc(f)}</h4>${radar(ax, se, { size: 300, pad: axesKey === "dimensions" ? 52 : 66, font: 9 })}
        <div class="who">${se.map((s) => `<span style="color:${s.colour}">■</span> ${esc(s.name)}`).join(" &nbsp;")}</div></div>`;
    }).join("");
  }
  document.getElementById("refradar").onchange = (e) => { refOn = e.target.checked; drawProfiles(); };
  drawProfiles();

  // ---------------------------------------------------------------- scatter
  function drawScatter() {
    const svg = document.getElementById("scatter");
    const W = 520, H = 400, L = 52, R = 16, T = 16, B = 46;
    const x = (v) => L + ((100 * v - 35) / (95 - 35)) * (W - L - R);
    const y = (v) => H - B - ((100 * v - 30) / (95 - 30)) * (H - T - B);
    let s = "";
    for (let v = 40; v <= 90; v += 10) {
      s += `<line class="axis" x1="${x(v / 100)}" x2="${x(v / 100)}" y1="${T}" y2="${H - B}"/><text x="${x(v / 100)}" y="${H - B + 16}" text-anchor="middle">${v}</text>`;
      s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v / 100)}" y2="${y(v / 100)}"/><text x="${L - 8}" y="${y(v / 100) + 4}" text-anchor="end">${v}</text>`;
    }
    s += `<text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">Accuracy of the unchanged answers (%)</text>`;
    s += `<text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Coherence, JevBench-mini</text>`;
    const label = new Set(["open-jev-9b", "von", "jevhome-e", "clm", "openthai-systemone", "bespoke-nimble-9b", "laya"]);
    rows.forEach((r) => {
      const cx = x(r.accuracy.accuracy), cy = y(r.overall);
      s += `<circle cx="${cx}" cy="${cy}" r="5" fill="${famColour(models[r.model].family)}" opacity=".9"><title>${esc(name(r.model))}: coherence ${pct(r.overall)}, accuracy ${pct(r.accuracy.accuracy)}%</title></circle>`;
      if (label.has(r.model)) {
        const left = r.accuracy.accuracy > 0.8;   // near the right edge: label on the left of the point
        s += `<text class="lbl" x="${left ? cx - 8 : cx + 7}" y="${cy + (r.model === "openthai-systemone" ? 14 : 4)}" text-anchor="${left ? "end" : "start"}">${esc(name(r.model).split(" (")[0])}</text>`;
      }
    });
    lb.reference.forEach((r) => {
      const cx = x(r.accuracy.accuracy), cy = y(r.overall);
      s += `<path d="M${cx - 5} ${cy - 5}L${cx + 5} ${cy + 5}M${cx - 5} ${cy + 5}L${cx + 5} ${cy - 5}" stroke="currentColor" stroke-width="1.6" style="color:var(--muted)"/>`;
      s += `<text x="${cx + 8}" y="${cy + 4}">${esc({ uniform: "uniform", random: "random", luce: "Luce", "luce-biased": "Luce, biased" }[r.model] || r.model)}</text>`;
    });
    svg.innerHTML = s;
  }
  drawScatter();
  const uni = lb.reference.find((r) => r.model === "uniform");
  const dec = rows.filter((r) => models[r.model].family.startsWith("Decoder"));
  const span = (xs) => `${pct(Math.min(...xs))}–${pct(Math.max(...xs))}`;
  const put = { uniform: pct(uni.overall), uniformAcc: pct(uni.accuracy.accuracy) + "%",
    decAcc: span(dec.map((r) => r.accuracy.accuracy)) + "%", decCoh: span(dec.map((r) => r.overall)) };
  document.querySelectorAll("[data-v]").forEach((el) => (el.textContent = put[el.dataset.v]));

  // ---------------------------------------------------------------- findings
  const meaLowest = rows.every((r) => DIMS.every((d) => r.dimensions.MEA <= r.dimensions[d]));
  const meaMean = rows.reduce((s, r) => s + r.dimensions.MEA, 0) / rows.length;
  const compBest = Math.max(...rows.map((r) => r.groups["MEA.complement"]));
  const negMean = rows.reduce((s, r) => s + r.relations.negation_wrapper, 0) / rows.length;
  const batFail = rows.filter((r) => r.dimensions.BAT < 0.995);
  const top = rows[0], bottom = rows[rows.length - 1];
  const items = [
    `<b>Scores range from ${pct(bottom.overall)} to ${pct(top.overall)}.</b> ${esc(name(top.model))} is first; of the other models, only
     ${esc(name(rows[1].model))} has an interval that overlaps its own; the rank ranges in the table show which of the others are separated.`,
    `<b>Answers do not add up.</b> Probability-measure coherence (MEA) is ${meaLowest ? "the lowest dimension of every model" : "the weakest dimension"},
     with a mean of ${pct(meaMean)}. No model scores above ${pct(compBest)} on complements, and a templated negation (e.g. "Is it false that the answer to the following question is yes?")
     sums to one with its question in ${pct(negMean, 0)}% of tests on average: models largely ignore the negation.`,
    `<b>Batch independence mostly holds.</b> ${rows.length - batFail.length} of ${rows.length} models keep every batch law. The two that do not,
     ${batFail.map((r) => esc(name(r.model))).join(" and ")}, read the other questions of a request when answering one, by design.`,
    `<b>Coherence is not accuracy.</b> A model that ignores its input scores ${pct(uni.overall)}, above every real model, at chance accuracy
     (${pct(uni.accuracy.accuracy)}%). Among the ${dec.length} decoders accuracy spans ${put.decAcc}, coherence ${put.decCoh}.`,
    `<b>The reported suite closely reproduces the full one.</b> On the ${agree.models.length} models run on both, JevBench-mini and JevBench-240 agree
     (Spearman ${agree.spearman.toFixed(3)}, at most ${agree.max_abs_diff.toFixed(1)} points apart), and ${agree.separated_pairs_same_order === agree.separated_pairs ? "all " + agree.separated_pairs : agree.separated_pairs_same_order + " of the " + agree.separated_pairs} pairs of models that
     JevBench-240 separates are ordered the same way, with intervals about ${(agree.mean_ci_width["jevbench-mini"] / agree.mean_ci_width["jevbench-240"]).toFixed(1)} times as wide.`,
  ];
  document.getElementById("findinglist").innerHTML = items.map((t) => `<li>${t}</li>`).join("");

  // ---------------------------------------------------------------- models
  const mt = document.getElementById("modeltable");
  const ordered = [...rows].sort((a, b) => FAMILIES.indexOf(models[a.model].family) - FAMILIES.indexOf(models[b.model].family) || name(a.model).localeCompare(name(b.model)));
  mt.innerHTML = "<thead><tr><th>Model</th><th>Developer</th><th>Family</th><th>Base model</th><th>Readout and training</th><th>Params</th><th>License</th></tr></thead><tbody>" +
    ordered.map((r) => { const m = models[r.model]; return `<tr><td><a href="${esc(m.url)}">${esc(m.display)}</a>${m.serving ? "<sup>*</sup>" : ""}</td>
      <td>${esc(m.developer)}</td><td class="fam"><span style="color:${famColour(m.family)}">●</span> ${esc(m.family)}</td><td>${esc(m.base)}</td>
      <td>${esc(m.readout)}</td><td>${esc(m.params)}</td><td>${esc(m.license)}</td></tr>`; }).join("") + "</tbody>";
})().catch((e) => {
  document.body.insertAdjacentHTML("afterbegin", `<p style="padding:12px;background:#fde;margin:0">Could not load the results (${e.message}). Open the page through a web server, not as a file.</p>`);
});
