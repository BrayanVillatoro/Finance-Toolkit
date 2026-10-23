/* Investment growth calculator */
(function (FT) {
  const root = document.getElementById('investment');
  const C = FT.colors;
  const Y0 = new Date().getFullYear();

  const PER_YEAR = { week: 52, biweekly: 26, month: 12, year: 1 };

  // Monthly compounding; each contribution is added at the end of its period
  // (week, 2 weeks, month or year) using the equivalent per-period rate.
  function project(initial, contribution, perYear, annualRate, years, raise) {
    const rp = Math.pow(1 + annualRate / 12, 12 / perYear) - 1;
    let bal = initial, put = initial, c = contribution;
    const rows = [{ year: 0, bal, put }];
    for (let y = 1; y <= years; y++) {
      for (let p = 0; p < perYear; p++) {
        bal = bal * (1 + rp) + c;
        put += c;
      }
      rows.push({ year: y, bal, put });
      c *= 1 + raise;
    }
    return rows;
  }

  function calc() {
    const initial = FT.num('inv-initial');
    const contribution = FT.num('inv-monthly');
    const perYear = PER_YEAR[document.getElementById('inv-frequency').value] || 12;
    const fee = FT.num('inv-fee') / 100;
    const gross = FT.num('inv-rate') / 100, rate = gross - fee;
    const raise = FT.num('inv-increase') / 100, infl = FT.num('inv-inflation') / 100;
    const years = Math.max(1, Math.min(80, Math.round(FT.num('inv-years'))));

    const yearly = contribution * perYear;
    document.getElementById('inv-freq-hint').textContent = perYear === 12
      ? `${FT.fmt.usd(yearly)} a year`
      : `≈ ${FT.fmt.usd(yearly / 12)} a month · ${FT.fmt.usd(yearly)} a year`;

    const rows = project(initial, contribution, perYear, rate, years, raise);
    const last = rows[rows.length - 1];
    const growth = last.bal - last.put;
    const real = last.bal / Math.pow(1 + infl, years);

    const tiles = [
      { label: `Balance in ${Y0 + years}`, value: FT.fmt.usd(last.bal), sub: `after ${years} years`, hero: true },
      { label: 'Total you put in', value: FT.fmt.usd(last.put) },
      { label: 'Investment growth', value: FT.fmt.usd(growth), sub: last.bal > 0 ? `${FT.fmt.pct(growth / last.bal * 100, 0)} of your balance` : '' },
      { label: "In today's dollars", value: FT.fmt.usd(real), sub: `adjusted for ${FT.fmt.pct(infl * 100)} inflation` },
    ];
    if (fee > 0) {
      const noFee = project(initial, contribution, perYear, gross, years, raise)[years].bal;
      tiles.push({ label: 'Lost to fees', value: FT.fmt.usd(noFee - last.bal), tone: 'critical', sub: `${FT.fmt.pct(fee * 100, 2)} a year over ${years} years` });
    }
    FT.tiles(document.getElementById('inv-tiles'), tiles);
    FT.report('investment', {
      initial,
      monthly: yearly / 12,
      inflation: infl,
      balances: n => project(initial, contribution, perYear, rate, n, raise).map(r => r.bal),
    });

    const x = rows.map(r => r.year);
    const xFormat = y => String(Y0 + y);
    const xTooltip = y => `${Y0 + y} · year ${y}`;

    FT.chart.render(document.getElementById('inv-chart'), 'line', {
      label: 'Balance over time split into contributions and growth',
      x, xFormat, xTooltip, stacked: true, totalLabel: 'Balance',
      series: [
        { name: 'Contributions', color: C[0], values: rows.map(r => r.put) },
        { name: 'Growth', color: C[1], values: rows.map(r => r.bal - r.put) },
      ],
    });

    const scenarios = [rate - 0.02, rate, rate + 0.02];
    FT.chart.render(document.getElementById('inv-scenarios'), 'line', {
      label: 'Balance under lower, expected and higher returns',
      x, xFormat, xTooltip,
      series: scenarios.map((r, i) => ({
        name: `${FT.fmt.pct(r * 100)} return${i === 1 ? ' (yours)' : ''}`,
        color: C[i],
        dashed: i !== 1,
        values: project(initial, contribution, perYear, r - fee, years, raise).map(p => p.bal),
      })),
    });

    FT.table(document.getElementById('inv-table'),
      ['Year', 'Total contributed', 'Total growth', 'Balance', "Today's dollars"],
      rows.slice(1).map(r => [
        `${Y0 + r.year} (yr ${r.year})`,
        FT.fmt.usd(r.put),
        FT.fmt.usd(r.bal - r.put),
        FT.fmt.usd(r.bal),
        FT.fmt.usd(r.bal / Math.pow(1 + infl, r.year)),
      ]));
  }

  FT.persist(root, 'investment', calc);
  calc();
})(window.FT);
