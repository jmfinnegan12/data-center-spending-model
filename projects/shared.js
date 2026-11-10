// Shared by the Projects page and the project table page: helpers, the sortable table, the capacity chart and the table.
window.EVP = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tone = (d) => (d === '+' ? 'var(--s1)' : d === '-' || d === 'mixed' ? 'var(--s2)' : 'var(--ink-faint)');
  const dcls = (d) => (d === '+' ? 'up' : d === '-' ? 'down' : 'mix');
  const dtxt = (d) => (d === '+' ? '↑' : d === '-' ? '↓' : d === 'mixed' ? '↕' : '–');
  const DIR = { '+': 3, mixed: 2, '0': 1, '-': 0 };
  const STRENGTH = { strong: 2, moderate: 1, weak: 0 };
  const QUALITY = { high: 2, medium: 1, low: 0 };

  // A table whose columns sort on click. cols: [{ label, cls, key(row) for sorting, html(row) }]. Empty values sort last.
  function sortable(el, cols, rows, start) {
    let by = start ? start[0] : null, dir = start ? start[1] : 1;
    function draw() {
      const sorted = by == null ? rows : rows.slice().sort((a, b) => {
        const x = cols[by].key(a), y = cols[by].key(b);
        if (x == null || x === '') return 1;
        if (y == null || y === '') return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
      el.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th class="${c.cls || ''}"${i === by ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" data-i="${i}">${c.label}</button></th>`).join('') +
        '</tr></thead><tbody>' + sorted.map((r) => '<tr>' + cols.map((c) => `<td class="${c.cls || ''}">${c.html(r)}</td>`).join('') + '</tr>').join('') + '</tbody>';
      el.querySelectorAll('th button').forEach((b) => b.addEventListener('click', () => {
        const i = +b.dataset.i;
        if (by === i) dir = -dir; else { by = i; dir = cols[i].desc ? -1 : 1; }
        draw();
      }));
    }
    draw();
  }


  // the capacity chart and its total line; needs #total and #bars on the page
  function chart(projects) {
  const withMw = projects.filter((p) => p.capacity_mw_high != null).sort((a, b) => b.capacity_mw_high - a.capacity_mw_high);
  const lo = d3.sum(withMw, (p) => p.capacity_mw_low) / 1000, hi = d3.sum(withMw, (p) => p.capacity_mw_high) / 1000;
  const nConf = withMw.filter((p) => p.capacity_basis === 'confirmed').length;
  document.getElementById('total').innerHTML = `${projects.length} projects; ${withMw.length} with a stated capacity (${nConf} confirmed), together <b>${lo.toFixed(1)}–${hi.toFixed(1)} GW</b> planned`;

  EN.chart.frame(document.getElementById('bars'), () => withMw.length * 24 + 34, ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const narrow = width < 560;
    const m = { t: 6, r: 96, b: 28, l: narrow ? 150 : 250 };
    const y = d3.scaleBand(withMw.map((p) => p.name), [m.t, height - m.b]).padding(0.25);
    const x = d3.scaleLinear([0, d3.max(withMw, (p) => p.capacity_mw_high)], [m.l, width - m.r]).nice();
    const fill = (p) => (p.capacity_basis === 'confirmed' ? 'var(--ink-soft)' : 'var(--s2)');
    const mw = (p) => (p.capacity_mw_low === p.capacity_mw_high ? d3.format(',')(p.capacity_mw_low) : `${d3.format(',')(p.capacity_mw_low)}–${d3.format(',')(p.capacity_mw_high)}`) + ' MW';
    svg.attr('aria-label', 'Planned capacity by project: ' + withMw.map((p) => `${p.name} ${mw(p)}, ${p.capacity_basis}`).join(', '));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(4).tickFormat((v) => `${d3.format(',')(v)} MW`));
    const g = svg.append('g').selectAll('g').data(withMw).join('g');
    g.append('text').attr('class', 'note').attr('x', m.l - 8).attr('y', (p) => y(p.name) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').style('fill', 'var(--ink)')
      .text((p) => (narrow && p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name));
    g.append('rect').attr('x', m.l).attr('y', (p) => y(p.name)).attr('height', y.bandwidth()).attr('width', (p) => x(p.capacity_mw_high) - m.l).attr('rx', 1.5).attr('fill', fill).attr('fill-opacity', 0.35);
    g.append('rect').attr('x', m.l).attr('y', (p) => y(p.name)).attr('height', y.bandwidth()).attr('width', (p) => x(p.capacity_mw_low) - m.l).attr('rx', 1.5).attr('fill', fill);
    g.append('text').attr('class', 'note').attr('x', (p) => x(p.capacity_mw_high) + 6).attr('y', (p) => y(p.name) + y.bandwidth() / 2).attr('dy', '0.35em').text(mw);
  });

  }

  // the full project table; needs #projects on the page
  function table(projects) {
  const range = (a, b, f) => (a == null ? '–' : a === b ? f(a) : `${f(a)}–${f(b)}`);
  const basis = (v) => (v ? v[0].toUpperCase() + v.slice(1) : '–');
  const usd = (v) => `$${v < 1 ? +v.toFixed(2) : +v.toFixed(1)}B`;
  const link = (url, text, title) => (url ? `<a href="${esc(url)}"${title ? ` title="${esc(title)}"` : ''}>${text}</a>` : text);
  const BASIS = { confirmed: 1, estimated: 0 };
  sortable(document.getElementById('projects'), [
    { label: 'Project', key: (p) => p.name.toLowerCase(), html: (p) => `<a href="${esc(p.sources[0])}">${esc(p.name)}</a>` },
    { label: 'Location', key: (p) => p.location.toLowerCase(), html: (p) => esc(p.location) },
    { label: 'Owner', key: (p) => (p.owner || '').toLowerCase() || null, html: (p) => esc(p.owner || '–') },
    { label: 'Builder', key: (p) => (p.builder || '').toLowerCase() || null, html: (p) => esc(p.builder || '–') },
    { label: 'Customer', key: (p) => (p.customer || '').toLowerCase() || null, html: (p) => esc(p.customer || '–') },
    { label: 'Financed by', key: (p) => (p.financers || '').toLowerCase() || null, html: (p) => esc(p.financers || '–') },
    { label: 'Capacity (MW)', cls: 'n', desc: true, key: (p) => p.capacity_mw_high,
      html: (p) => link(p.capacity_source, range(p.capacity_mw_low, p.capacity_mw_high, d3.format(',')), [p.capacity_scope, p.capacity_estimate_note].filter(Boolean).join('. ')) },
    { label: 'Capacity basis', desc: true, key: (p) => BASIS[p.capacity_basis], html: (p) => basis(p.capacity_basis) },
    { label: 'Measure', key: (p) => (p.capacity_mw_high == null ? null : p.capacity_measure), html: (p) => (p.capacity_mw_high == null ? '–' : esc(p.capacity_measure)) },
    { label: 'Investment', cls: 'n', desc: true, key: (p) => p.investment_usd_b_high,
      html: (p) => link(p.investment_source, range(p.investment_usd_b_low, p.investment_usd_b_high, usd), p.investment_note) },
    { label: 'Investment basis', desc: true, key: (p) => BASIS[p.investment_basis], html: (p) => basis(p.investment_basis) },
    { label: 'Investment includes chips and servers', key: (p) => (p.investment_includes_it == null ? null : p.investment_includes_it ? 1 : 0),
      html: (p) => (p.investment_includes_it == null ? (p.investment_usd_b_high == null ? '–' : 'Unclear') : p.investment_includes_it ? 'Yes' : 'No') },
    { label: 'Started', key: (p) => p.construction_start, html: (p) => esc(p.construction_start || '–') },
    { label: 'Status', key: (p) => p.status.toLowerCase(), html: (p) => esc(p.status) },
    { label: 'Latest news', desc: true, key: (p) => DIR[p.direction], html: (p) => `<span class="${dcls(p.direction)}" style="font-weight:700">${dtxt(p.direction)}</span> ${esc(p.latest_signal)}` },
  ], projects, [6, -1]);

  }

  return { esc, tone, dcls, dtxt, DIR, STRENGTH, QUALITY, sortable, chart, table };
})();
