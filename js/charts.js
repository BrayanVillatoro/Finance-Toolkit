/* Tiny dependency-free SVG charts: line/area, grouped bar, donut.
   Usage: FT.chart.render(element, 'line' | 'bar' | 'donut', config)
   Charts redraw automatically when their container is resized or shown. */
(function (FT) {
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function label(svg, x, y, str, anchor, baseline) {
    const t = svgEl('text', { x, y, class: 'tick', 'text-anchor': anchor || 'start' }, svg);
    if (baseline) t.setAttribute('dominant-baseline', baseline);
    t.textContent = str;
    return t;
  }

  function niceTicks(min, max, count) {
    if (max <= min) max = min + 1;
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const ticks = [];
    for (let v = Math.floor(min / step) * step; v <= max + step * 0.999; v += step) ticks.push(Math.round(v / step) * step);
    return ticks;
  }

  function legend(el, items) {
    const lg = document.createElement('div');
    lg.className = 'legend';
    items.forEach(s => {
      const it = document.createElement('span');
      it.className = 'legend-item';
      it.innerHTML = `<i class="swatch" style="background:${s.color}"></i>`;
      it.appendChild(document.createTextNode(s.name));
      lg.appendChild(it);
    });
    el.appendChild(lg);
  }

  function tooltip(el) {
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.hidden = true;
    el.appendChild(tip);
    return {
      show(html, x, y) {
        tip.innerHTML = html;
        tip.hidden = false;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        let left = x + 14;
        if (left + w > el.clientWidth) left = x - 14 - w;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = Math.max(0, y - h / 2) + 'px';
      },
      hide() { tip.hidden = true; },
    };
  }

  const tipRow = (color, name, value) =>
    `<div class="tip-row"><i class="swatch" style="background:${color}"></i><span>${FT.esc(name)}</span><b>${FT.esc(value)}</b></div>`;

  /* ---------- Line / stacked area ----------
     { x: [...], xFormat, xTooltip, series: [{ name, color, values, area?, dashed? }],
       stacked?, totalLabel?, yFormat?, valueFormat?, height?, label? } */
  function drawLine(el, cfg, W) {
    const series = cfg.series, n = cfg.x.length;
    if (series.length > 1) legend(el, series);
    const H = cfg.height || 300, m = { t: 12, r: 16, b: 30, l: 60 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;

    const tops = series.map(s => s.values.slice());
    if (cfg.stacked) for (let i = 1; i < tops.length; i++) for (let j = 0; j < n; j++) tops[i][j] += tops[i - 1][j];
    let lo = 0, hi = 0;
    tops.forEach(t => t.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
    const ticks = niceTicks(lo, hi, 5), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const xs = i => m.l + (n > 1 ? i * iw / (n - 1) : iw / 2);
    const ys = v => m.t + ih - (v - y0) / (y1 - y0) * ih;
    const yFmt = cfg.yFormat || FT.fmt.compact, vFmt = cfg.valueFormat || FT.fmt.usd, xFmt = cfg.xFormat || String;

    const svg = svgEl('svg', { width: W, height: H, role: 'img', 'aria-label': cfg.label || '' }, el);
    ticks.forEach(t => {
      if (t !== 0) svgEl('line', { x1: m.l, x2: W - m.r, y1: ys(t), y2: ys(t), class: 'grid' }, svg);
      label(svg, m.l - 8, ys(t), yFmt(t), 'end', 'middle');
    });
    const maxTicks = Math.max(2, Math.floor(iw / 64));
    const step = Math.max(1, Math.ceil((n - 1) / (maxTicks - 1)));
    for (let i = 0; i < n; i += step) label(svg, xs(i), H - 10, xFmt(cfg.x[i]), 'middle');

    const pts = arr => arr.map((v, j) => `${xs(j).toFixed(1)},${ys(v).toFixed(1)}`);
    series.forEach((s, i) => {
      if (!s.area && !cfg.stacked) return;
      const base = cfg.stacked && i > 0 ? tops[i - 1] : new Array(n).fill(0);
      const d = 'M' + pts(tops[i]).join('L') + 'L' + pts(base).reverse().join('L') + 'Z';
      svgEl('path', { d, class: 'area', style: `fill:${s.color}` }, svg);
    });
    svgEl('line', { x1: m.l, x2: W - m.r, y1: ys(0), y2: ys(0), class: 'axis' }, svg);
    series.forEach((s, i) => svgEl('path', {
      d: 'M' + pts(tops[i]).join('L'),
      class: 'line' + (s.dashed ? ' dashed' : ''),
      style: `stroke:${s.color}`,
    }, svg));

    // Hover: crosshair + dots + tooltip
    const cross = svgEl('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' }, svg);
    const dots = series.map(s => svgEl('circle', { r: 4.5, class: 'dot', style: `fill:${s.color}`, visibility: 'hidden' }, svg));
    const tip = tooltip(el);
    const hit = svgEl('rect', { x: m.l, y: 0, width: iw, height: m.t + ih, fill: 'transparent' }, svg);
    const order = cfg.stacked ? series.map((s, i) => i).reverse() : series.map((s, i) => i);
    hit.addEventListener('pointermove', ev => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round((ev.clientX - r.left - m.l) / (n > 1 ? iw / (n - 1) : 1))));
      const x = xs(i);
      cross.setAttribute('x1', x);
      cross.setAttribute('x2', x);
      cross.setAttribute('visibility', 'visible');
      dots.forEach((d, k) => {
        d.setAttribute('cx', x);
        d.setAttribute('cy', ys(tops[k][i]));
        d.setAttribute('visibility', 'visible');
      });
      let html = `<div class="tip-head">${FT.esc((cfg.xTooltip || xFmt)(cfg.x[i]))}</div>`;
      order.forEach(k => { html += tipRow(series[k].color, series[k].name, vFmt(series[k].values[i])); });
      if (cfg.stacked && series.length > 1) {
        html += `<div class="tip-row tip-total"><span>${FT.esc(cfg.totalLabel || 'Total')}</span><b>${FT.esc(vFmt(tops[tops.length - 1][i]))}</b></div>`;
      }
      const yTop = Math.min.apply(null, tops.map(t => ys(t[i])));
      tip.show(html, x, svg.offsetTop + Math.max(yTop, m.t + 40));
    });
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      dots.forEach(d => d.setAttribute('visibility', 'hidden'));
      tip.hide();
    });
  }

  /* ---------- Grouped bar ----------
     { categories: [...], series: [{ name, color, values }], yFormat?, valueFormat?, height?, label? } */
  function barPath(x, y, w, h, up) {
    if (h <= 0.5) return '';
    const r = Math.min(4, w / 2, h);
    if (up) return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
  }

  function drawBar(el, cfg, W) {
    const series = cfg.series, cats = cfg.categories;
    if (series.length > 1) legend(el, series);
    const H = cfg.height || 280, m = { t: 12, r: 16, b: 30, l: 60 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    let lo = 0, hi = 0;
    series.forEach(s => s.values.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
    const ticks = niceTicks(lo, hi, 5), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const ys = v => m.t + ih - (v - y0) / (y1 - y0) * ih;
    const yFmt = cfg.yFormat || FT.fmt.compact, vFmt = cfg.valueFormat || FT.fmt.usd;

    const svg = svgEl('svg', { width: W, height: H, role: 'img', 'aria-label': cfg.label || '' }, el);
    ticks.forEach(t => {
      if (t !== 0) svgEl('line', { x1: m.l, x2: W - m.r, y1: ys(t), y2: ys(t), class: 'grid' }, svg);
      label(svg, m.l - 8, ys(t), yFmt(t), 'end', 'middle');
    });

    const band = iw / cats.length, gap = 2;
    const bw = Math.max(4, Math.min(56, (band * 0.7 - gap * (series.length - 1)) / series.length));
    const groupW = bw * series.length + gap * (series.length - 1);
    const tip = tooltip(el);
    cats.forEach((c, ci) => {
      const bx = m.l + ci * band, gx = bx + (band - groupW) / 2;
      label(svg, bx + band / 2, H - 10, c, 'middle');
      series.forEach((s, si) => {
        const v = s.values[ci], x = gx + si * (bw + gap);
        const yTop = ys(Math.max(v, 0)), yBot = ys(Math.min(v, 0));
        svgEl('path', { d: barPath(x, yTop, bw, yBot - yTop, v >= 0), style: `fill:${s.color}` }, svg);
      });
      const hit = svgEl('rect', { x: bx, y: m.t, width: band, height: ih, class: 'hit' }, svg);
      hit.addEventListener('pointermove', () => {
        hit.classList.add('active');
        let html = `<div class="tip-head">${FT.esc(c)}</div>`;
        series.forEach(s => { html += tipRow(s.color, s.name, vFmt(s.values[ci])); });
        tip.show(html, gx + groupW, svg.offsetTop + m.t + ih / 3);
      });
      hit.addEventListener('pointerleave', () => { hit.classList.remove('active'); tip.hide(); });
    });
    svgEl('line', { x1: m.l, x2: W - m.r, y1: ys(0), y2: ys(0), class: 'axis' }, svg);
  }

  /* ---------- Donut ----------
     { items: [{ name, color, value }], centerLabel?, centerValue?, valueFormat?, label? } */
  function arcPath(c, R, r, a1, a2) {
    const large = a2 - a1 > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${(c + rad * Math.cos(ang)).toFixed(2)},${(c + rad * Math.sin(ang)).toFixed(2)}`;
    return `M${p(R, a1)}A${R},${R} 0 ${large} 1 ${p(R, a2)}L${p(r, a2)}A${r},${r} 0 ${large} 0 ${p(r, a1)}Z`;
  }

  function drawDonut(el, cfg) {
    const items = cfg.items.filter(it => it.value > 0);
    const total = items.reduce((a, b) => a + b.value, 0);
    const vFmt = cfg.valueFormat || FT.fmt.usd;
    if (!total) {
      el.innerHTML = '<div class="empty">Nothing to show yet.</div>';
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'donut-wrap';
    el.appendChild(wrap);
    const S = 200, c = S / 2, R = 96, r = 64;
    const svg = svgEl('svg', { width: S, height: S, viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': cfg.label || '' }, wrap);
    const tip = tooltip(el);

    let a = -Math.PI / 2;
    items.forEach(it => {
      const frac = it.value / total;
      const seg = items.length === 1
        ? svgEl('circle', { cx: c, cy: c, r: (R + r) / 2, fill: 'none', style: `stroke:${it.color};stroke-width:${R - r}` }, svg)
        : svgEl('path', { d: arcPath(c, R, r, a, a + frac * Math.PI * 2), class: 'seg', style: `fill:${it.color}` }, svg);
      a += frac * Math.PI * 2;
      seg.addEventListener('pointermove', ev => {
        const box = el.getBoundingClientRect();
        tip.show(`<div class="tip-head">${FT.esc(it.name)}</div>` +
          tipRow(it.color, FT.fmt.pct(frac * 100) + ' of total', vFmt(it.value)), ev.clientX - box.left, ev.clientY - box.top);
      });
      seg.addEventListener('pointerleave', () => tip.hide());
    });
    if (cfg.centerLabel) {
      const t1 = svgEl('text', { x: c, y: c - 8, 'text-anchor': 'middle', class: 'donut-center-label' }, svg);
      t1.textContent = cfg.centerLabel;
      const t2 = svgEl('text', { x: c, y: c + 16, 'text-anchor': 'middle', class: 'donut-center-value' }, svg);
      t2.textContent = cfg.centerValue || vFmt(total);
    }

    const list = document.createElement('ul');
    list.className = 'donut-legend';
    items.forEach(it => {
      const li = document.createElement('li');
      li.innerHTML = `<i class="swatch" style="background:${it.color}"></i><span>${FT.esc(it.name)}</span>` +
        `<b>${FT.esc(vFmt(it.value))}</b><small>${FT.fmt.pct(it.value / total * 100, 0)}</small>`;
      list.appendChild(li);
    });
    wrap.appendChild(list);
  }

  /* ---------- Render + auto-resize ---------- */
  const drawers = { line: drawLine, bar: drawBar, donut: drawDonut };

  function draw(el) {
    const w = el.clientWidth;
    el._w = w;
    if (!w) return; // hidden tab: draw when it becomes visible
    el.innerHTML = '';
    drawers[el._chart.type](el, el._chart.cfg, w);
  }

  const ro = new ResizeObserver(entries => entries.forEach(en => {
    const el = en.target, w = el.clientWidth;
    if (!w) { el._w = 0; return; }
    if (w !== el._w) draw(el);
  }));

  FT.chart = {
    render(el, type, cfg) {
      el._chart = { type, cfg };
      if (!el._observed) { ro.observe(el); el._observed = true; }
      draw(el);
    },
  };

  FT.colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
})(window.FT);
