/* Salary & taxes: estimated federal income tax, FICA and state tax on a salary plus other income */
(function (FT) {
  const root = document.getElementById('salary');
  const C = FT.colors;
  const $ = id => document.getElementById(id);

  // 2026 federal figures (IRS Rev. Proc. 2025-32; SSA wage base). Update these each year.
  const TAX = {
    year: 2026,
    rates: [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37],
    // Top of each bracket in taxable income; the 37% bracket has no top.
    brackets: {
      single: [12400, 50400, 105700, 201775, 256225, 640600],
      married: [24800, 100800, 211400, 403550, 512450, 768700],
      hoh: [17700, 67450, 105700, 201750, 256200, 640600],
    },
    standard: { single: 16100, married: 32200, hoh: 24150 },
    ssRate: 0.062, ssWageBase: 184500,
    medicareRate: 0.0145, addlMedicareRate: 0.009,
    addlMedicareAt: { single: 200000, married: 250000, hoh: 200000 },
    // Self-employment tax applies to 92.35% of net side-gig earnings.
    seShare: 0.9235,
  };
  const PAYCHECKS = { week: 52, biweekly: 26, semimonthly: 24, month: 12 };
  const NO_EXTRA = { wages: 0, self: 0, other: 0, untaxed: 0 };

  // ex: yearly other income by type (see income.js).
  function taxes(salary, status, k401, health, stateRate, ex) {
    // 401(k) contributions still owe Social Security and Medicare; payroll health premiums and HSA don't.
    const ficaWages = Math.max(0, salary - health) + ex.wages;
    // Side gigs pay both halves of Social Security and Medicare; Social Security stops at the wage base.
    const seBase = ex.self * TAX.seShare;
    const seTax = Math.min(seBase, Math.max(0, TAX.ssWageBase - ficaWages)) * TAX.ssRate * 2 + seBase * TAX.medicareRate * 2;
    // Half of self-employment tax is deductible.
    const agi = Math.max(0, salary - k401 - health) + ex.wages + ex.self - seTax / 2 + ex.other;
    const taxable = Math.max(0, agi - TAX.standard[status]);
    const tops = TAX.brackets[status];
    const bands = TAX.rates.map((rate, i) => {
      const lo = i ? tops[i - 1] : 0, hi = i < tops.length ? tops[i] : Infinity;
      const amount = Math.max(0, Math.min(taxable, hi) - lo);
      return { rate, lo, hi, amount, tax: amount * rate };
    });
    const federal = bands.reduce((s, b) => s + b.tax, 0);
    const marginal = (bands.filter(b => b.amount > 0).pop() || bands[0]).rate;
    const ss = Math.min(ficaWages, TAX.ssWageBase) * TAX.ssRate;
    const medicare = ficaWages * TAX.medicareRate + Math.max(0, ficaWages + seBase - TAX.addlMedicareAt[status]) * TAX.addlMedicareRate;
    const state = agi * stateRate;
    const total = federal + ss + medicare + seTax + state;
    const income = salary + ex.wages + ex.self + ex.other + ex.untaxed;
    return { agi, taxable, bands, federal, marginal, ss, medicare, seTax, state, total, income, takeHome: income - k401 - health - total };
  }

  function inputs() {
    const salary = Math.max(0, FT.num('sal-income'));
    const k401 = Math.min(salary, Math.max(0, FT.num('sal-401k')));
    const health = Math.min(salary - k401, Math.max(0, FT.num('sal-health')));
    return { salary, k401, health, status: $('sal-status').value, stateRate: FT.num('sal-state') / 100, n: PAYCHECKS[$('sal-pay').value] };
  }

  function calc() {
    const { salary, k401, health, status, stateRate, n } = inputs();
    const ex = FT.income.yearly();
    const t = taxes(salary, status, k401, health, stateRate, ex);
    // The same salary with no other income: what each paycheck looks like, and what the extra income really adds.
    const base = taxes(salary, status, k401, health, stateRate, NO_EXTRA);
    const extraGross = t.income - salary, extraNet = t.takeHome - base.takeHome;
    const raise = taxes(salary + 1000, status, k401, health, stateRate, ex).takeHome - t.takeHome;
    const pctOf = v => (t.income ? FT.fmt.pct(v / t.income * 100) : '0%');

    const tiles = [
      { label: 'Take-home pay per year', value: FT.fmt.usd(t.takeHome), sub: `${FT.fmt.usd2(base.takeHome / n)} per paycheck · ${FT.fmt.usd(t.takeHome / 12)}/month in all`, hero: true },
      { label: 'Total taxes', value: FT.fmt.usd(t.total), sub: `${pctOf(t.total)} of your income` },
      { label: 'Federal tax bracket', value: FT.fmt.pct(t.marginal * 100, 0), sub: `you actually pay ${pctOf(t.federal)} federal overall` },
      { label: 'Kept from a $1,000 raise', value: FT.fmt.usd(raise), sub: 'after all taxes' },
    ];
    if (extraGross > 0) {
      tiles.push({ label: 'Other income per year', value: FT.fmt.usd(extraGross), sub: `you keep ${FT.fmt.usd(extraNet)} (${FT.fmt.pct(extraNet / extraGross * 100, 0)}) after tax` });
    }
    FT.tiles($('sal-tiles'), tiles);

    FT.chart.render($('sal-donut'), 'donut', {
      label: 'Where your income goes',
      centerLabel: extraGross > 0 ? 'Total income' : 'Salary',
      centerValue: FT.fmt.usd(t.income),
      items: [
        { name: 'Take-home pay', color: C[2], value: t.takeHome },
        { name: 'Federal income tax', color: C[0], value: t.federal },
        { name: 'Social Security', color: C[1], value: t.ss },
        { name: 'Medicare', color: C[3], value: t.medicare },
        { name: 'Self-employment tax', color: 'var(--critical-text)', value: t.seTax },
        { name: 'State income tax', color: C[4], value: t.state },
        { name: '401(k), health & HSA', color: 'var(--axis)', value: k401 + health },
      ],
    });

    // Take-home and taxes across a range of salaries around yours (other income held the same).
    // Rounded so axis labels land on even amounts.
    const top = Math.ceil(Math.max(100000, salary * 2) / 40000) * 40000, step = top / 20;
    const xs = Array.from({ length: 21 }, (_, i) => Math.round(i * step));
    const runs = xs.map(s => taxes(s, status, Math.min(s, k401), Math.min(Math.max(0, s - k401), health), stateRate, ex));
    FT.chart.render($('sal-curve'), 'line', {
      label: 'Take-home pay and total taxes at different salaries',
      x: xs,
      xFormat: FT.fmt.compact,
      xTooltip: s => `${FT.fmt.usd(s)} salary`,
      series: [
        { name: 'Take-home pay', color: C[2], values: runs.map(r => Math.max(0, r.takeHome)) },
        { name: 'Total taxes', color: C[1], values: runs.map(r => r.total) },
      ],
    });

    $('sal-taxable').textContent =
      `Taxable income: ${FT.fmt.usd(t.agi)} of income after pre-tax deductions${t.seTax ? ' and half of self-employment tax' : ''}` +
      ` − ${FT.fmt.usd(TAX.standard[status])} standard deduction = ${FT.fmt.usd(t.taxable)}. Each rate only applies to the slice of income inside its bracket.`;
    FT.table($('sal-table'), ['Rate', 'Taxable income range', 'Your income here', 'Tax'],
      t.bands.map(b => ({
        className: b.rate === t.marginal && t.taxable > 0 ? 'selected' : '',
        cells: [
          FT.fmt.pct(b.rate * 100, 0),
          b.hi === Infinity ? `over ${FT.fmt.usd(b.lo)}` : `${FT.fmt.usd(b.lo)} – ${FT.fmt.usd(b.hi)}`,
          FT.fmt.usd(b.amount),
          FT.fmt.usd(b.tax),
        ],
      })).concat([
        { className: 'selected', cells: ['Total federal', '', FT.fmt.usd(t.taxable), FT.fmt.usd(t.federal)] },
      ]));

    $('sal-note').innerHTML =
      `<p>Uses ${TAX.year} federal brackets and the standard deduction. Social Security is 6.2% up to ${FT.fmt.usd(TAX.ssWageBase)}; Medicare is 1.45%, plus 0.9% above ${FT.fmt.usd(TAX.addlMedicareAt[status])}. Side-gig income also owes 15.3% self-employment tax.</p>` +
      '<p>Assumes one earner and no credits (like the child tax credit) or side-gig business deductions, so your real bill may be lower. Verify at irs.gov.</p>';

    FT.report('salary', { extraNet });
  }

  // Copy this salary into the Budget tab, with taxes and pre-tax deductions as its "Taxes & deductions" rate.
  // Other income is left out of the rate: the Budget adds it separately at its after-tax value.
  $('sal-to-budget').addEventListener('click', () => {
    const { salary, k401, health, status, stateRate } = inputs();
    const t = taxes(salary, status, k401, health, stateRate, NO_EXTRA);
    $('bud-income').value = Math.round(salary);
    $('bud-freq').value = 'year';
    $('bud-type').value = 'gross';
    $('bud-tax').value = salary ? Math.round((t.total + k401 + health) / salary * 100) : 0;
    $('bud-tax').dispatchEvent(new Event('change', { bubbles: true }));
    location.hash = 'budget';
  });

  FT.income.mount('sal-streams', 'sal-streams-empty', 'sal-add-stream');
  FT.income.onChange(calc);
  FT.persist(root, 'salary', calc);
  calc();
})(window.FT);
