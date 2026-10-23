/* Budget planner: income -> recommended budget, compared against your own expenses */
(function (FT) {
  const root = document.getElementById('budget');
  const C = FT.colors;
  const $ = id => document.getElementById(id);

  const PER_MONTH = { month: 1, year: 1 / 12, week: 52 / 12, biweekly: 26 / 12 };
  const CATS = [
    { key: 'needs', name: 'Needs' },
    { key: 'wants', name: 'Wants' },
    { key: 'savings', name: 'Savings & debt' },
  ];
  const HOUSING = /rent|mortgage|housing/i;
  const CAR_LOAN = /car (payment|loan|note)|auto loan|vehicle payment/i;

  const expenses = FT.store.get('budget-expenses') || [];
  const saveExpenses = () => FT.store.set('budget-expenses', expenses);
  const list = $('bud-expenses');

  function rowEl(exp) {
    const row = document.createElement('div');
    row.className = 'exp-row';
    row.innerHTML =
      '<input class="exp-name" type="text" placeholder="e.g. Gym" aria-label="Expense name">' +
      '<div class="input"><span class="pre">$</span><input class="exp-amt" type="number" min="0" step="1" aria-label="Amount"></div>' +
      '<select class="exp-freq" aria-label="How often">' +
        '<option value="month">per month</option><option value="year">per year</option>' +
        '<option value="biweekly">every 2 weeks</option><option value="week">per week</option>' +
      '</select>' +
      '<select class="exp-cat" aria-label="Category">' +
        CATS.map(c => `<option value="${c.key}">${c.name}</option>`).join('') +
      '</select>' +
      '<button type="button" class="icon-btn exp-del" aria-label="Remove expense" title="Remove">&times;</button>';
    const q = sel => row.querySelector(sel);
    q('.exp-name').value = exp.name;
    q('.exp-amt').value = exp.amount;
    q('.exp-freq').value = exp.freq;
    q('.exp-cat').value = exp.cat;
    // Runs before the section-level listener re-calculates.
    const update = () => {
      exp.name = q('.exp-name').value;
      exp.amount = parseFloat(q('.exp-amt').value) || 0;
      exp.freq = q('.exp-freq').value;
      exp.cat = q('.exp-cat').value;
      saveExpenses();
    };
    row.addEventListener('input', update);
    row.addEventListener('change', update);
    q('.exp-del').addEventListener('click', () => {
      expenses.splice(expenses.indexOf(exp), 1);
      row.remove();
      saveExpenses();
      renderEmpty();
      calc();
    });
    return row;
  }

  function renderEmpty() {
    const empty = list.querySelector('.exp-empty');
    if (!expenses.length && !empty) list.insertAdjacentHTML('beforeend', '<div class="exp-empty">No expenses yet. Add your rent, bills, and anything else you pay regularly.</div>');
    if (expenses.length && empty) empty.remove();
  }

  $('bud-add').addEventListener('click', () => {
    const exp = { name: '', amount: 0, freq: 'month', cat: 'needs' };
    expenses.push(exp);
    saveExpenses();
    const row = rowEl(exp);
    list.appendChild(row);
    renderEmpty();
    row.querySelector('.exp-name').focus();
    calc();
  });

  function calc() {
    const type = $('bud-type').value;
    $('bud-tax-field').hidden = type === 'net';
    const incomeMonthly = FT.num('bud-income') * PER_MONTH[$('bud-freq').value];
    const taxRate = type === 'gross' ? FT.num('bud-tax') / 100 : 0;
    // Other income streams: after-tax amount comes from the Salary tab's estimate when it has run.
    const ex = FT.income.yearly();
    const exGross = (ex.wages + ex.self + ex.other + ex.untaxed) / 12;
    const sal = FT.summary.salary;
    const exNet = sal ? sal.extraNet / 12 : (exGross - ex.untaxed / 12) * (1 - FT.num('bud-tax') / 100) + ex.untaxed / 12;
    $('bud-streams-hint').textContent = exGross > 0
      ? `Adds ${FT.fmt.usd(exNet)}/mo to your take-home (${FT.fmt.usd(exGross)}/mo before tax). Taxes are estimated on the Salary & taxes tab, including self-employment tax on side gigs.`
      : '';
    const net = incomeMonthly * (1 - taxRate) + exNet;
    const gross = type === 'gross' ? incomeMonthly + exGross : null;
    const split = $('bud-rule').value.split('-').map(Number);

    const actual = { needs: 0, wants: 0, savings: 0 };
    let housing = 0, car = 0;
    expenses.forEach(e => {
      const m = (e.amount || 0) * PER_MONTH[e.freq];
      actual[e.cat] += m;
      if (HOUSING.test(e.name)) housing += m;
      if (CAR_LOAN.test(e.name)) car += m;
    });
    const spent = actual.needs + actual.wants + actual.savings;
    const left = net - spent;
    const recommended = CATS.map((c, i) => net * split[i] / 100);

    // Rule of thumb: housing at most 30% of gross pay (roughly 35% of take-home).
    const maxHousing = gross !== null ? gross * 0.30 : net * 0.35;
    const housingBase = gross !== null ? gross : net;
    const housingPct = housingBase ? housing / housingBase * 100 : 0;

    FT.tiles($('bud-tiles'), [
      {
        label: 'Monthly take-home', value: FT.fmt.usd(net), hero: true,
        sub: (gross !== null ? `${FT.fmt.usd(gross)} before taxes` : 'after taxes') + (exNet > 0 ? ` · incl. ${FT.fmt.usd(exNet)} other income` : ''),
      },
      { label: 'Monthly expenses', value: FT.fmt.usd(spent), sub: net ? `${FT.fmt.pct(spent / net * 100, 0)} of take-home` : '' },
      left >= 0
        ? { label: 'Left over each month', value: '▲ ' + FT.fmt.usd(left), tone: 'good', sub: 'Surplus. Consider saving or investing it.' }
        : { label: 'Over budget each month', value: '▼ ' + FT.fmt.usd(-left), tone: 'critical', sub: 'Spending is more than take-home pay' },
      {
        label: 'Max recommended rent',
        value: FT.fmt.usd(maxHousing),
        sub: housing
          ? `Yours: ${FT.fmt.usd(housing)} (${FT.fmt.pct(housingPct, 0)} of ${gross !== null ? 'gross' : 'take-home'})`
          : (gross !== null ? '30% of gross income' : '35% of take-home'),
      },
    ]);

    FT.report('budget', { net, gross, actual, left, housing, car });

    FT.chart.render($('bud-bars'), 'bar', {
      label: 'Recommended budget vs your spending by category',
      categories: CATS.map(c => c.name),
      series: [
        { name: `Recommended (${split.join('/')})`, color: C[0], values: recommended },
        { name: 'Your spending', color: C[1], values: CATS.map(c => actual[c.key]) },
      ],
    });

    FT.chart.render($('bud-donut'), 'donut', {
      label: 'Where your take-home pay goes',
      centerLabel: left >= 0 ? 'Take-home' : 'Spending',
      centerValue: FT.fmt.usd(Math.max(net, spent)),
      items: [
        { name: 'Needs', color: C[0], value: actual.needs },
        { name: 'Wants', color: C[1], value: actual.wants },
        { name: 'Savings & debt', color: C[2], value: actual.savings },
        { name: 'Unassigned', color: 'var(--axis)', value: Math.max(0, left) },
      ],
    });

    FT.table($('bud-table'), ['Category', 'Target', 'Recommended', 'You spend', 'Difference'],
      CATS.map((c, i) => {
        const d = recommended[i] - actual[c.key];
        // For savings, falling short is the problem; for needs/wants, going over is.
        const bad = c.key === 'savings' ? d > 0.5 : d < -0.5;
        const text = Math.abs(d) < 0.5 ? 'On target'
          : c.key === 'savings'
            ? (d > 0 ? `▼ ${FT.fmt.usd(d)} short` : `▲ ${FT.fmt.usd(-d)} extra`)
            : (d > 0 ? `▲ ${FT.fmt.usd(d)} under` : `▼ ${FT.fmt.usd(-d)} over`);
        return [
          c.name,
          `${split[i]}%`,
          FT.fmt.usd(recommended[i]),
          FT.fmt.usd(actual[c.key]),
          { text, className: bad ? 'tone-critical' : 'tone-good' },
        ];
      }));
  }

  expenses.forEach(e => list.appendChild(rowEl(e)));
  renderEmpty();
  FT.income.mount('bud-streams', 'bud-streams-empty', 'bud-add-stream');
  FT.income.onChange(calc);
  // The Salary tab estimates taxes on other income; recalculate when it does.
  FT.onReport(key => { if (key === 'salary') calc(); });
  FT.persist(root, 'budget', calc);
  calc();
})(window.FT);
