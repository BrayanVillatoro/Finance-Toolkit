/* Net worth: what you own minus what you owe, including balances from the other tabs */
(function (FT) {
  const root = document.getElementById('networth');
  const C = FT.colors;
  const $ = id => document.getElementById(id);

  const TYPES = [
    { key: 'cash', name: 'Cash & savings' },
    { key: 'investments', name: 'Investments' },
    { key: 'retirement', name: 'Retirement' },
    { key: 'home', name: 'Real estate' },
    { key: 'vehicle', name: 'Vehicles' },
    { key: 'other', name: 'Other' },
  ];
  const TYPE_NAME = Object.fromEntries(TYPES.map(t => [t.key, t.name]));
  // Debts at or above this rate are worth paying off before investing.
  const HIGH_RATE = 8;

  const assets = FT.store.get('networth-assets') || [];
  const debts = FT.store.get('networth-debts') || [];
  const save = () => { FT.store.set('networth-assets', assets); FT.store.set('networth-debts', debts); };

  // One editable row. `fields` maps item keys to the selectors that edit them.
  function rowEl(list, item, html, fields) {
    const row = document.createElement('div');
    row.className = 'nw-row';
    row.innerHTML = html + '<button type="button" class="icon-btn" aria-label="Remove" title="Remove">&times;</button>';
    const q = sel => row.querySelector(sel);
    Object.keys(fields).forEach(k => { q(fields[k]).value = item[k]; });
    const update = () => {
      Object.keys(fields).forEach(k => {
        const el = q(fields[k]);
        item[k] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
      save();
    };
    row.addEventListener('input', update);
    row.addEventListener('change', update);
    q('.icon-btn').addEventListener('click', () => {
      list.splice(list.indexOf(item), 1);
      row.remove();
      save();
      calc();
    });
    return row;
  }

  const assetRow = a => rowEl(assets, a,
    '<input class="nw-name" type="text" placeholder="e.g. Savings account" aria-label="Name">' +
    '<div class="input"><span class="pre">$</span><input class="nw-amt" type="number" min="0" step="100" aria-label="Value"></div>' +
    '<select class="nw-type" aria-label="Type">' + TYPES.map(t => `<option value="${t.key}">${t.name}</option>`).join('') + '</select>',
    { name: '.nw-name', value: '.nw-amt', type: '.nw-type' });

  const debtRow = d => rowEl(debts, d,
    '<input class="nw-name" type="text" placeholder="e.g. Credit card" aria-label="Name">' +
    '<div class="input"><span class="pre">$</span><input class="nw-amt" type="number" min="0" step="100" aria-label="Balance owed"></div>' +
    '<div class="input"><input class="nw-rate" type="number" min="0" step="0.1" aria-label="Interest rate"><span class="suf">% APR</span></div>',
    { name: '.nw-name', balance: '.nw-amt', rate: '.nw-rate' });

  function addRow(list, item, make, container) {
    list.push(item);
    save();
    const row = make(item);
    $(container).appendChild(row);
    row.querySelector('.nw-name').focus();
    calc();
  }
  $('nw-add-asset').addEventListener('click', () => addRow(assets, { name: '', value: 0, type: 'cash' }, assetRow, 'nw-assets'));
  $('nw-add-debt').addEventListener('click', () => addRow(debts, { name: '', balance: 0, rate: 0 }, debtRow, 'nw-debts'));

  // Read-only rows for balances that live on other tabs.
  function linkedRows(el, items) {
    el.innerHTML = items.map(i =>
      '<div class="nw-row linked">' +
        `<span>${FT.esc(i.name)} <a href="#${i.tab}">from ${FT.esc(i.from)} tab</a></span>` +
        `<span class="nw-num">${FT.fmt.usd(i.amount)}</span>` +
        `<span class="nw-meta">${FT.esc(i.meta)}</span><span></span>` +
      '</div>').join('');
  }

  function calc() {
    const { investment: inv, retirement: ret, mortgage: mtg, auto } = FT.summary;
    if (!inv || !ret || !mtg || !auto) return;

    const linkedAssets = [
      { name: 'Investment account', amount: inv.initial, type: 'investments', tab: 'investment', from: 'Investment' },
      ...ret.accounts.map(a => ({ name: a.name, amount: a.balance, type: 'retirement', tab: 'retirement', from: 'Retirement' })),
      { name: mtg.status === 'paidoff' ? 'Home (paid off)' : 'Home', amount: mtg.homeValue, type: 'home', tab: 'mortgage', from: 'Mortgage' },
      { name: auto.status === 'paidoff' ? 'Car (paid off)' : 'Car', amount: auto.carValue, type: 'vehicle', tab: 'auto', from: 'Auto loan' },
    ].filter(a => a.amount > 0).map(a => Object.assign(a, { meta: TYPE_NAME[a.type] }));
    const linkedDebts = [
      { name: 'Mortgage', amount: mtg.balances[0], rate: mtg.rate * 100, tab: 'mortgage', from: 'Mortgage' },
      { name: 'Auto loan', amount: auto.balances[0], rate: auto.rate * 100, tab: 'auto', from: 'Auto loan' },
    ].filter(d => d.amount > 0).map(d => Object.assign(d, { meta: FT.fmt.pct(d.rate, 2) + ' APR' }));
    linkedRows($('nw-assets-linked'), linkedAssets);
    linkedRows($('nw-debts-linked'), linkedDebts);
    $('nw-debts-empty').hidden = debts.length + linkedDebts.length > 0;

    const byType = Object.fromEntries(TYPES.map(t => [t.key, 0]));
    linkedAssets.forEach(a => { byType[a.type] += a.amount; });
    assets.forEach(a => { byType[a.type] += a.value || 0; });
    const own = Object.values(byType).reduce((s, v) => s + v, 0);
    const userDebt = debts.reduce((s, d) => s + (d.balance || 0), 0);
    const owe = userDebt + linkedDebts.reduce((s, d) => s + d.amount, 0);
    const net = own - owe;

    const costs = FT.monthlyCosts();
    const cash = byType.cash;
    const months = costs && costs.living > 0 ? cash / costs.living : null;
    const highRate = debts.filter(d => d.balance > 0 && d.rate >= HIGH_RATE);

    FT.tiles($('nw-tiles'), [
      { label: 'Net worth', value: (net < 0 ? '-' : '') + FT.fmt.usd(Math.abs(net)), tone: net < 0 ? 'critical' : undefined, sub: 'what you own minus what you owe', hero: true },
      { label: 'What you own', value: FT.fmt.usd(own) },
      { label: 'What you owe', value: FT.fmt.usd(owe), sub: highRate.length ? `${FT.fmt.usd(highRate.reduce((s, d) => s + d.balance, 0))} at ${HIGH_RATE}%+ interest` : '' },
      {
        label: 'Emergency fund', value: FT.fmt.usd(cash),
        sub: months === null ? 'cash & savings' : `${months.toFixed(1)} months of expenses · aim for 3–6`,
        tone: months !== null && months < 1 ? 'critical' : undefined,
      },
    ]);

    FT.chart.render($('nw-own-chart'), 'donut', {
      label: 'What you own by type',
      centerLabel: 'You own',
      centerValue: FT.fmt.usd(own),
      items: TYPES.map((t, i) => ({ name: t.name, color: C[i % C.length], value: byType[t.key] })),
    });
    const debtItems = linkedDebts.map(d => ({ name: d.name, value: d.amount }))
      .concat(debts.map(d => ({ name: d.name || 'Unnamed debt', value: d.balance || 0 })));
    FT.chart.render($('nw-owe-chart'), 'donut', {
      label: 'What you owe by loan',
      centerLabel: 'You owe',
      centerValue: FT.fmt.usd(owe),
      items: debtItems.map((d, i) => ({ name: d.name, color: C[i % C.length], value: d.value })),
    });

    FT.report('networth', {
      net, own, owe, cash, months, highRate,
      // For the Overview projection: items held at today's value, vehicles that lose value, and other debts.
      fixedAssets: own - byType.vehicle - inv.initial - ret.balance,
      vehicles: byType.vehicle,
      otherDebt: userDebt,
    });
  }

  assets.forEach(a => $('nw-assets').appendChild(assetRow(a)));
  debts.forEach(d => $('nw-debts').appendChild(debtRow(d)));
  root.addEventListener('input', calc);
  root.addEventListener('change', calc);
  // Re-run when another tab changes, since linked balances and expenses come from them.
  FT.onReport(key => { if (key !== 'networth') calc(); });
  calc();
})(window.FT);
