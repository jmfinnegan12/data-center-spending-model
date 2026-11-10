// The Model page for this event. The maths is in model.js; the shared look and controls come from eventneutral.com/kit/v1.
Promise.all([
  fetch('inputs.json', { cache: 'no-cache' }).then((r) => r.json()),
  d3.csv('../data/first_prints.csv'),
  d3.csv('../data/census_now.csv'),
]).then(([cfg, fpRows, nowRows]) => {
  const parseMonth = d3.utcParse('%Y-%m');
  const fmtMonth = d3.utcFormat('%b %Y');
  const fmtShort = d3.utcFormat('%b');
  const b1 = (v) => `$${v.toFixed(1)}B`;
  const pc = (v) => `${Math.round(v * 100)}%`;
  const sgn = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);

  // first prints, $ billions; the unbroken run that ends at the latest month is what the model uses
  const allFirst = fpRows.filter((r) => r.first_print).map((r) => ({ month: r.reference_month, t: parseMonth(r.reference_month), value: +r.first_print / 1000 }));
  const run = [allFirst[allFirst.length - 1]];
  for (let i = allFirst.length - 2; i >= 0; i--) {
    if (d3.utcMonth.offset(allFirst[i].t, 1).getTime() === run[0].t.getTime()) run.unshift(allFirst[i]); else break;
  }
  const valueCol = nowRows.columns[1];
  const now = nowRows.map((r) => ({ t: parseMonth(r.reference_month), value: +r[valueCol] }));

  const M = window.ForecastModel.fromConfig(cfg, run);
  const tests = window.ForecastModel.backtest(run).map((d) => ({ ...d, t: parseMonth(d.month) }));
  const target = parseMonth(M.MONTH);
  const Z90 = 1.2815516; // 10% to 90% of a bell curve: centre ± 1.28 standard deviations

  // ---------- inputs ----------
  const INPUTS = [
    { key: 'CHANGE', label: 'Change carried forward from September', min: -10, max: 40, sliderMin: 0, sliderMax: 25, step: 0.1,
      note: `Added to September's first print. The last change, first print to first print, was ${b1(M.lastChange)}.` },
    { key: 'ADJUST', label: 'Adjustment for the current state', min: -30, max: 30, sliderMin: -15, sliderMax: 15, step: 0.1 },
    { key: 'SPREAD', label: 'Size of a typical miss', min: 0.2, max: 20, sliderMin: 0.5, sliderMax: 12, step: 0.1,
      note: 'One standard deviation. About two thirds of outcomes land within this distance of the centre.' },
  ];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let p = clone(M.DEFAULTS);
  let strike = M.STRIKES.reduce((a, b) => (Math.abs(b - M.centre(p)) < Math.abs(a - M.centre(p)) ? b : a));

  const root = document.getElementById('inputs');
  const fields = {};
  INPUTS.forEach((inp) => {
    const row = document.createElement('div');
    row.className = 'field';
    root.appendChild(row);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = inp.label;
    row.appendChild(name);
    const f = EN.sliderField({ value: p[inp.key], min: inp.min, max: inp.max, sliderMin: inp.sliderMin, sliderMax: inp.sliderMax, step: inp.step, unit: '$B', label: inp.label,
      onChange: (v) => { p[inp.key] = v; changed(); } });
    row.appendChild(f.range);
    row.appendChild(f.box.el);
    if (inp.note) { const n = document.createElement('p'); n.className = 'note'; n.textContent = inp.note; row.appendChild(n); }
    fields[inp.key] = f;
  });
  const resetBtn = document.getElementById('reset');
  resetBtn.textContent = `Reset to ${M.AS_OF} values`;
  resetBtn.addEventListener('click', () => { p = clone(M.DEFAULTS); INPUTS.forEach((inp) => fields[inp.key].set(p[inp.key])); changed(); });

  // ---------- chart 1: the series and the base rate ----------
  const series = EN.chart.frame(document.getElementById('series'), (w) => Math.max(260, Math.min(400, w * 0.5)), ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const m = { t: 20, r: 70, b: 30, l: 46 };
    const c = M.centre(p), lo = c - Z90 * p.SPREAD, hi = c + Z90 * p.SPREAD;
    const start = d3.utcMonth.offset(target, -13);
    const shown = now.filter((d) => d.t >= start);
    const firsts = allFirst.filter((d) => d.t >= start);
    const x = d3.scaleUtc([start, target], [m.l, width - m.r]);
    const y = d3.scaleLinear([0, Math.max(hi, d3.max(shown, (d) => d.value)) * 1.05], [height - m.b, m.t]).nice(5);
    svg.attr('aria-label', `Data center construction spending by month. September's first print ${b1(M.LAST.value)}; October base rate ${b1(M.baseRate(p))}; forecast centre ${b1(c)}.`);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat((v) => `$${v}B`)).call((g) => g.select('.domain').remove());
    const every = width < 520 ? 6 : 3;
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(d3.utcMonth.every(every)).tickSize(5).tickPadding(6).tickFormat(fmtMonth));
    svg.append('path').attr('fill', 'none').attr('stroke', 'var(--ink-faint)').attr('stroke-width', 1.75).attr('d', d3.line().x((d) => x(d.t)).y((d) => y(d.value))(shown));
    svg.append('path').attr('fill', 'none').attr('stroke', 'var(--s1)').attr('stroke-width', 2).attr('d', d3.line().x((d) => x(d.t)).y((d) => y(d.value))(run.filter((d) => d.t >= start)));
    svg.append('g').selectAll('circle').data(firsts).join('circle').attr('r', 3.5).attr('fill', 'var(--s1)').attr('cx', (d) => x(d.t)).attr('cy', (d) => y(d.value));
    // October: the 10%-90% range, the base rate and the centre
    const xo = x(target);
    svg.append('rect').attr('x', xo - 9).attr('width', 18).attr('y', y(hi)).attr('height', Math.max(1, y(lo) - y(hi))).attr('rx', 2).attr('fill', 'var(--s2)').attr('fill-opacity', 0.28);
    svg.append('line').attr('x1', x(M.LAST.t)).attr('y1', y(M.LAST.value)).attr('x2', xo).attr('y2', y(M.baseRate(p))).attr('stroke', 'var(--s2)').attr('stroke-width', 2).attr('stroke-dasharray', '5 4');
    svg.append('circle').attr('cx', xo).attr('cy', y(c)).attr('r', 5).attr('fill', 'var(--bg)').attr('stroke', 'var(--s2)').attr('stroke-width', 2.5);
    svg.append('text').attr('class', 'end-label').attr('x', xo + 12).attr('y', y(c)).attr('dy', '0.35em').style('fill', 'var(--s2)').text(b1(c));
    svg.append('text').attr('class', 'end-label').attr('x', x(M.LAST.t) - 8).attr('y', y(M.LAST.value) - 12).attr('text-anchor', 'end').style('fill', 'var(--s1)').text(b1(M.LAST.value));
  });

  // ---------- chart 2: the backtest ----------
  EN.chart.frame(document.getElementById('misses'), (w) => Math.max(220, Math.min(300, w * 0.38)), ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const m = { t: 22, r: 10, b: 30, l: 46 };
    const x = d3.scaleBand(tests.map((d) => d.month), [m.l, width - m.r]).padding(0.35);
    const lim = Math.max(3, d3.max(tests, (d) => Math.abs(d.miss)) * 1.15);
    const y = d3.scaleLinear([-lim, lim], [height - m.b, m.t]).nice(4);
    svg.attr('aria-label', 'Miss of the base rate by month: ' + tests.map((d) => `${fmtMonth(d.t)} ${sgn(d.miss)}`).join(', '));
    svg.append('rect').attr('x', m.l).attr('width', width - m.l - m.r).attr('y', y(1.25)).attr('height', y(-1.25) - y(1.25)).attr('fill', 'var(--band)');
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat((v) => (v > 0 ? '+' : v < 0 ? '−' : '') + `$${Math.abs(v)}B`)).call((g) => g.select('.domain').remove());
    svg.append('line').attr('x1', m.l).attr('x2', width - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--ink-faint)');
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).tickSize(0).tickPadding(8).tickFormat((d) => fmtShort(parseMonth(d)))).call((g) => g.select('.domain').remove());
    const bars = svg.append('g').selectAll('g').data(tests).join('g');
    bars.append('rect').attr('x', (d) => x(d.month)).attr('width', x.bandwidth()).attr('y', (d) => y(Math.max(0, d.miss))).attr('height', (d) => Math.abs(y(d.miss) - y(0)))
      .attr('rx', 1.5).attr('fill', (d) => (Math.abs(d.miss) <= 1.25 ? 'var(--ink-soft)' : 'var(--s2)'));
    bars.append('text').attr('class', 'note').attr('text-anchor', 'middle').attr('x', (d) => x(d.month) + x.bandwidth() / 2)
      .attr('y', (d) => (d.miss >= 0 ? y(d.miss) - 6 : y(d.miss) + 15)).style('fill', 'var(--ink)').text((d) => sgn(d.miss));
    const may = tests.find((d) => d.month.endsWith('-05') && d.miss > 3);
    if (may) svg.append('text').attr('class', 'note').attr('x', x(may.month) + x.bandwidth() + 6).attr('y', y(may.miss) + 4).text('yearly revision');
  });

  // ---------- chart 3: the distribution ----------
  const dist = EN.chart.frame(document.getElementById('dist'), (w) => Math.max(200, Math.min(280, w * 0.34)), ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const m = { t: 26, r: 14, b: 30, l: 46 };
    const c = M.centre(p);
    const xmin = Math.min(M.STRIKES[0] - 2.5, c - 3.5 * p.SPREAD), xmax = Math.max(M.STRIKES[M.STRIKES.length - 1] + 2.5, c + 3.5 * p.SPREAD);
    const x = d3.scaleLinear([xmin, xmax], [m.l, width - m.r]);
    const pts = d3.range(xmin, xmax + 0.001, (xmax - xmin) / 300).map((v) => [v, M.density(v, p)]);
    const y = d3.scaleLinear([0, d3.max(pts, (d) => d[1]) * 1.12], [height - m.b, m.t]);
    svg.attr('aria-label', `Spread of outcomes for October's first print, centred on ${b1(c)}. Chance above ${b1(strike)}: ${pc(M.above(strike, p))}.`);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(width < 520 ? 5 : 9).tickSize(5).tickPadding(6).tickFormat((v) => `$${v}B`));
    const area = d3.area().x((d) => x(d[0])).y0(y(0)).y1((d) => y(d[1]));
    svg.append('path').attr('fill', 'var(--band)').attr('d', area(pts));
    svg.append('path').attr('fill', 'var(--s2)').attr('fill-opacity', 0.35).attr('d', area(pts.filter((d) => d[0] >= strike)));
    svg.append('path').attr('fill', 'none').attr('stroke', 'var(--ink)').attr('stroke-width', 2).attr('d', d3.line().x((d) => x(d[0])).y((d) => y(d[1]))(pts));
    svg.append('g').selectAll('line').data(M.STRIKES).join('line').attr('x1', (s) => x(s)).attr('x2', (s) => x(s)).attr('y1', y(0)).attr('y2', m.t)
      .attr('stroke', (s) => (s === strike ? 'var(--s2)' : 'var(--line)')).attr('stroke-width', (s) => (s === strike ? 2 : 1));
    const xs = x(strike);
    svg.append('text').attr('class', 'note').attr('x', xs + (xs > width - 150 ? -6 : 6)).attr('y', m.t - 8).attr('text-anchor', xs > width - 150 ? 'end' : 'start')
      .style('fill', 'var(--s2)').text(`Above ${b1(strike)}: ${pc(M.above(strike, p))}`);
  });

  // ---------- chart 4: chance above each strike ----------
  const ladder = EN.chart.frame(document.getElementById('ladder'), (w) => Math.max(170, Math.min(230, w * 0.28)), ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const m = { t: 22, r: 14, b: 30, l: 46 };
    const x = d3.scaleBand(M.STRIKES, [m.l, width - m.r]).padding(0.25);
    const y = d3.scaleLinear([0, 1], [height - m.b, m.t]);
    svg.attr('aria-label', 'Chance above each strike: ' + M.STRIKES.map((s) => `${b1(s)} ${pc(M.above(s, p))}`).join(', '));
    const narrow = width < 560;
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`)
      .call(d3.axisBottom(x).tickValues(narrow ? M.STRIKES.filter((s, i) => i % 2 === 0) : M.STRIKES).tickSize(0).tickPadding(8).tickFormat((s) => (narrow ? `${s}` : `>${s}`))).call((g) => g.select('.domain').remove());
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(2).tickSize(0).tickPadding(8).tickFormat(d3.format('.0%'))).call((g) => g.select('.domain').remove());
    const g = svg.append('g').selectAll('g').data(M.STRIKES).join('g');
    g.append('rect').attr('class', 'bar').attr('x', (s) => x(s)).attr('width', x.bandwidth()).attr('y', (s) => y(M.above(s, p))).attr('height', (s) => y(0) - y(M.above(s, p))).attr('rx', 1.5)
      .attr('fill', (s) => (s === strike ? 'var(--s2)' : 'var(--ink-faint)')).attr('tabindex', 0).attr('role', 'button').attr('aria-label', (s) => `Above ${b1(s)}`)
      .on('click', (e, s) => { strike = s; paint(); })
      .on('keydown', (e, s) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); strike = s; paint(); } });
    g.append('text').attr('class', 'note').attr('text-anchor', 'middle').attr('x', (s) => x(s) + x.bandwidth() / 2).attr('y', (s) => y(M.above(s, p)) - 6)
      .style('fill', (s) => (s === strike ? 'var(--ink)' : 'var(--ink-soft)')).style('font-size', narrow ? '11px' : null)
      .text((s) => (narrow ? Math.round(M.above(s, p) * 100) : pc(M.above(s, p))));
    // a wide, invisible target over each column, so the short bars are easy to pick
    g.append('rect').attr('x', (s) => x(s) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', m.t).attr('height', height - m.t - m.b + 22)
      .attr('fill', 'transparent').style('cursor', 'pointer').on('click', (e, s) => { strike = s; paint(); });
  });

  function paint() {
    const c = M.centre(p);
    document.getElementById('base').innerHTML = `September ${b1(M.LAST.value)} + change ${b1(p.CHANGE)} = base rate <b>${b1(M.baseRate(p))}</b>` +
      (p.ADJUST ? `, adjusted ${sgn(p.ADJUST)} to <b>${b1(c)}</b>` : '');
    document.getElementById('say').innerHTML = `The chance October's first print is above <b>${b1(strike)}</b> is <b>${pc(M.above(strike, p))}</b>. ` +
      `The middle 80% of outcomes runs from ${b1(c - Z90 * p.SPREAD)} to ${b1(c + Z90 * p.SPREAD)}.`;
    series.redraw(); dist.redraw(); ladder.redraw();
  }
  function changed() {
    resetBtn.disabled = INPUTS.every((inp) => Math.abs(p[inp.key] - M.DEFAULTS[inp.key]) < 1e-9);
    INPUTS.forEach((inp) => fields[inp.key].box.input.classList.toggle('changed', Math.abs(p[inp.key] - M.DEFAULTS[inp.key]) > 1e-9));
    paint();
  }
  changed();
}).catch((e) => {
  document.getElementById('series').insertAdjacentHTML('afterbegin', '<p class="muted">The model could not be loaded. Reload the page.</p>');
  console.error(e);
});
