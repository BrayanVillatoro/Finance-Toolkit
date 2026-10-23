/* Roth IRA / retirement accounts (several at once) with Roth vs Traditional vs taxable comparison */
(function (FT) {
  const root = document.getElementById('retirement');
  const C = FT.colors;
  const $ = id => document.getElementById(id);

  // 2026 IRS contribution limits. Update these each year (irs.gov announces them in the fall).
  const LIMITS = {
    year: 2026,
    ira: { base: 7500, catchup50: 1100 },
    k401: { base: 24500, catchup50: 8000, catchup60to63: 11250 },
    // Roth IRA income phase-out ranges (modified AGI)
    rothIncome: { single: [153000, 168000], married: [242000, 252000] },
  };

  const NAMES = { 'roth-ira': 'Roth IRA', 'trad-ira': 'Traditional IRA', 'roth-401k': 'Roth 401(k)', 'trad-401k': 'Traditional 401(k)' };
  const is401k = a => a.type.endsWith('401k');
  const isRoth = a => a.type.startsWith('roth');

  function limitFor(k401, age) {
    if (!k401) return LIMITS.ira.base + (age >= 50 ? LIMITS.ira.catchup50 : 0);
    if (age >= 60 && age <= 63) return LIMITS.k401.base + LIMITS.k401.catchup60to63;
    return LIMITS.k401.base + (age >= 50 ? LIMITS.k401.catchup50 : 0);
  }

  // Saved accounts, or the single account the tab used to hold before it supported several.
  let accounts = FT.store.get('retirement-accounts');
  if (!accounts) {
    const old = FT.store.get('retirement') || {};
    const acct = { type: old['ret-type'] || 'trad-401k', balance: +old['ret-balance'] || 0, contrib: +old['ret-contrib'] || 0, employer: +old['ret-employer'] || 0 };
    accounts = acct.balance || acct.contrib || acct.employer ? [acct] : [];
  }
  const saveAccounts = () => FT.store.set('retirement-accounts', accounts);
  const list = $('ret-accounts');

  // Account names, numbered when you have more than one of the same type.
  const names = () => accounts.map(a => {
    const same = accounts.filter(b => b.type === a.type);
    return NAMES[a.type] + (same.length > 1 ? ' ' + (same.indexOf(a) + 1) : '');
  });

  function rowEl(acct) {
    const row = document.createElement('div');
    row.className = 'exp-row ret-row';
    const money = (cls, label) =>
      `<div class="input"><span class="pre">$</span><input class="${cls}" type="number" min="0" step="100" placeholder="${label}" aria-label="${label}"></div>`;
    row.innerHTML =
      '<select class="exp-name ret-acct-type" aria-label="Account type">' +
        Object.keys(NAMES).map(k => `<option value="${k}">${NAMES[k]}</option>`).join('') +
      '</select>' +
      money('ret-acct-bal', 'Balance now') +
      money('ret-acct-contrib', 'You add / yr') +
      money('ret-acct-employer', 'Employer / yr') +
      '<button type="button" class="icon-btn exp-del" aria-label="Remove account" title="Remove">&times;</button>';
    const q = sel => row.querySelector(sel);
    q('.ret-acct-type').value = acct.type;
    q('.ret-acct-bal').value = acct.balance || '';
    q('.ret-acct-contrib').value = acct.contrib || '';
    q('.ret-acct-employer').value = acct.employer || '';
    // Employer money only goes into a 401(k).
    const showEmployer = () => { q('.ret-acct-employer').parentNode.classList.toggle('ret-na', !is401k(acct)); };
    showEmployer();
    // Runs before the section-level listener re-calculates.
    const update = () => {
      acct.type = q('.ret-acct-type').value;
      acct.balance = parseFloat(q('.ret-acct-bal').value) || 0;
      acct.contrib = parseFloat(q('.ret-acct-contrib').value) || 0;
      acct.employer = parseFloat(q('.ret-acct-employer').value) || 0;
      showEmployer();
      saveAccounts();
    };
    row.addEventListener('input', update);
    row.addEventListener('change', update);
    q('.exp-del').addEventListener('click', () => {
      accounts.splice(accounts.indexOf(acct), 1);
      row.remove();
      saveAccounts();
      calc();
    });
    return row;
  }

  $('ret-add').addEventListener('click', () => {
    const acct = { type: accounts.some(a => a.type === 'roth-ira') ? 'trad-401k' : 'roth-ira', balance: 0, contrib: 0, employer: 0 };
    accounts.push(acct);
    saveAccounts();
    const row = rowEl(acct);
    list.appendChild(row);
    row.querySelector('select').focus();
    calc();
  });

  function calc() {
    $('ret-accounts-empty').hidden = accounts.length > 0;

    const age = Math.round(FT.num('ret-age'));
    const retireAge = Math.max(age + 1, Math.round(FT.num('ret-retire-age')));
    const rate = FT.num('ret-rate') / 100, raise = FT.num('ret-increase') / 100;
    const taxNow = FT.num('ret-tax-now') / 100, taxLater = FT.num('ret-tax-later') / 100, cg = FT.num('ret-cg') / 100;
    const withdraw = FT.num('ret-withdraw') / 100;
    const acctNames = names();
    const any401k = accounts.some(is401k);

    // Each account grows on its own: monthly compounding, contributions spread across the year.
    const rm = rate / 12;
    const sims = accounts.map(a => {
      let bal = a.balance, basis = a.balance, match = 0, c = a.contrib, e = is401k(a) ? a.employer : 0;
      const out = [{ bal, basis, match }];
      for (let y = age + 1; y <= retireAge; y++) {
        for (let m = 0; m < 12; m++) {
          bal = bal * (1 + rm) + c / 12;
          basis += c / 12;
          match = match * (1 + rm) + e / 12;
        }
        out.push({ bal, basis, match });
        c *= 1 + raise;
        e *= 1 + raise;
      }
      return out;
    });

    // Totals across accounts for each age. Employer money is always pre-tax, even in a Roth 401(k).
    const rows = Array.from({ length: retireAge - age + 1 }, (_, i) => {
      const r = { age: age + i, bal: 0, basis: 0, match: 0, afterTax: 0, each: [] };
      sims.forEach((s, j) => {
        const { bal, basis, match } = s[i];
        r.bal += bal; r.basis += basis; r.match += match;
        r.afterTax += isRoth(accounts[j]) ? bal + match * (1 - taxLater) : (bal + match) * (1 - taxLater);
        r.each.push(bal + match);
      });
      // The same money as if it were all in one kind of account.
      r.roth = r.bal + r.match * (1 - taxLater);
      r.trad = (r.bal + r.match) * (1 - taxLater);
      r.taxable = r.bal - Math.max(0, r.bal - r.basis) * cg;
      return r;
    });

    const startBal = accounts.reduce((s, a) => s + a.balance, 0);
    const last = rows[rows.length - 1];
    const yourContribs = last.basis - startBal;
    const upfrontSavings = yourContribs * taxNow;
    const diff = last.roth - last.trad;
    const roths = accounts.filter(isRoth).length;
    const taxNote = !roths ? `taxed at ${FT.fmt.pct(taxLater * 100, 0)} when withdrawn`
      : roths === accounts.length ? 'Roth withdrawals are tax-free'
      : `Roth tax-free, Traditional taxed at ${FT.fmt.pct(taxLater * 100, 0)}`;

    FT.tiles($('ret-tiles'), [
      { label: `Retirement savings at age ${retireAge}`, value: FT.fmt.usd(last.bal + last.match), sub: accounts.length > 1 ? `${accounts.length} accounts, before taxes` : 'before taxes', hero: true },
      { label: 'After taxes', value: FT.fmt.usd(last.afterTax), sub: taxNote },
      { label: 'Monthly retirement income', value: FT.fmt.usd(last.afterTax * withdraw / 12), sub: `${FT.fmt.pct(withdraw * 100)} withdrawal rate, after tax` },
      {
        label: 'Roth vs. Traditional',
        value: Math.abs(diff) < 1 ? 'About even' : `${diff > 0 ? 'Roth' : 'Traditional'} +${FT.fmt.usd(Math.abs(diff))}`,
        sub: `Traditional saves ~${FT.fmt.usd(upfrontSavings)} in taxes up front`,
      },
    ]);

    FT.report('retirement', {
      age, retireAge, withdraw,
      balance: startBal,
      accounts: accounts.map((a, i) => ({ name: acctNames[i], balance: a.balance })),
      // IRA contributions come out of take-home pay; 401(k) contributions come out of the paycheck first.
      iraContrib: accounts.filter(a => !is401k(a)).reduce((s, a) => s + a.contrib, 0),
      has401k: any401k,
      hasRothIra: accounts.some(a => a.type === 'roth-ira'),
      rothIncomeLimit: LIMITS.rothIncome.single[0],
      monthlyIncome: last.afterTax * withdraw / 12,
      balances: rows.map(r => r.bal + r.match),
    });

    // Contribution limits are shared by every account of the same kind.
    let note = '';
    [false, true].forEach(k401 => {
      const group = accounts.filter(a => is401k(a) === k401);
      if (accounts.length && !group.length) return;
      const kind = k401 ? '401(k)' : 'IRA', limit = limitFor(k401, age);
      const total = group.reduce((s, a) => s + a.contrib, 0);
      note += `<p>${LIMITS.year} ${kind} limit at age ${age}: <b>${FT.fmt.usd(limit)}</b>/yr${group.length > 1 ? ` across your ${kind}s` : ''}.</p>`;
      if (total > limit) note += `<p class="warn">Your ${FT.fmt.usd(total)} is over the limit.</p>`;
    });
    if (accounts.some(a => a.type === 'roth-ira')) {
      const s = LIMITS.rothIncome.single, mj = LIMITS.rothIncome.married;
      note += `<p>Roth IRA eligibility phases out at ${FT.fmt.compact(s[0])}–${FT.fmt.compact(s[1])} income (single) or ${FT.fmt.compact(mj[0])}–${FT.fmt.compact(mj[1])} (married filing jointly).</p>`;
    }
    note += '<p>Verify current limits at irs.gov.</p>';
    $('ret-limit-note').innerHTML = note;

    const x = rows.map(r => r.age);
    const xFormat = a => String(a);
    const xTooltip = a => `Age ${a}`;

    const balSeries = [
      { name: 'Your contributions', color: C[0], values: rows.map(r => r.basis) },
      { name: 'Growth', color: C[1], values: rows.map(r => r.bal - r.basis) },
    ];
    if (last.match > 0) balSeries.push({ name: 'Employer match + growth', color: C[2], values: rows.map(r => r.match) });
    FT.chart.render($('ret-chart'), 'line', {
      label: 'Account balance by age', x, xFormat, xTooltip, stacked: true, totalLabel: 'Balance', series: balSeries,
    });

    FT.chart.render($('ret-compare'), 'line', {
      label: 'After-tax value of Roth, Traditional and taxable accounts by age', x, xFormat, xTooltip,
      series: [
        { name: 'Roth (tax-free)', color: C[0], values: rows.map(r => r.roth) },
        { name: 'Traditional (after tax)', color: C[1], values: rows.map(r => r.trad) },
        { name: 'Taxable brokerage (after tax)', color: C[2], values: rows.map(r => r.taxable) },
      ],
    });

    const perAccount = accounts.length > 1;
    FT.table($('ret-table'),
      ['Age', 'Contributed', 'Growth', any401k ? 'Employer' : null].concat(perAccount ? acctNames : [], ['Total balance', 'After taxes']).filter(Boolean),
      rows.slice(1).map(r => [
        String(r.age),
        FT.fmt.usd(r.basis),
        FT.fmt.usd(r.bal - r.basis),
        any401k ? FT.fmt.usd(r.match) : null,
      ].concat(perAccount ? r.each.map(FT.fmt.usd) : [], [FT.fmt.usd(r.bal + r.match), FT.fmt.usd(r.afterTax)]).filter(v => v !== null)));
  }

  accounts.forEach(a => list.appendChild(rowEl(a)));
  FT.persist(root, 'retirement', calc);
  calc();
})(window.FT);
