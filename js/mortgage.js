/* Mortgage calculator with PITI breakdown, PMI, extra payments and amortization */
(function (FT) {
  const root = document.getElementById('mortgage');
  const C = FT.colors;
  const $ = id => document.getElementById(id);

  const monthDate = (start, k) => new Date(start.getFullYear(), start.getMonth() + k - 1, 1);

  // Keep the $ and % down payment fields in sync.
  function syncDown(ev) {
    const id = ev && ev.target && ev.target.id;
    const price = FT.num('mtg-price');
    if (id === 'mtg-down-amt') {
      $('mtg-down-pct').value = price ? +(FT.num('mtg-down-amt') / price * 100).toFixed(2) : 0;
    } else if (id === 'mtg-down-pct' || id === 'mtg-price') {
      $('mtg-down-amt').value = Math.round(price * FT.num('mtg-down-pct') / 100);
    }
  }

  function schedule(loan, rm, n, payment, extra, price, pmiMonthly) {
    const months = [];
    let bal = loan, totInt = 0, totPmi = 0;
    for (let k = 1; k <= n && bal > 0.005; k++) {
      const interest = bal * rm;
      const principal = Math.max(0, Math.min(payment - interest + extra, bal));
      const pmi = pmiMonthly > 0 && bal > price * 0.78 ? pmiMonthly : 0;
      bal -= principal;
      totInt += interest;
      totPmi += pmi;
      months.push({ k, interest, principal, pmi, bal: Math.max(0, bal) });
    }
    return { months, totInt, totPmi };
  }

  function calc(ev) {
    syncDown(ev);
    const price = FT.num('mtg-price'), down = Math.min(price, FT.num('mtg-down-amt'));
    const rate = FT.num('mtg-rate') / 100, years = +$('mtg-term').value;
    const loan = Math.max(0, price - down), n = years * 12, rm = rate / 12;
    const pi = FT.pmt(rm, n, loan);
    const taxM = price * FT.num('mtg-tax-pct') / 100 / 12;
    const insM = FT.num('mtg-ins') / 12;
    const hoa = FT.num('mtg-hoa');
    const extra = FT.num('mtg-extra');
    const needsPmi = loan > 0 && down < price * 0.2;
    const pmiM = needsPmi ? loan * FT.num('mtg-pmi') / 100 / 12 : 0;
    const total = pi + taxM + insM + pmiM + hoa;
    const start = FT.monthInput('mtg-start');

    const s = schedule(loan, rm, n, pi, extra, price, pmiM);
    const months = s.months;
    const payoff = months.length ? monthDate(start, months.length) : start;

    let payoffSub = `${years}-year loan`;
    if (extra > 0) {
      const base = schedule(loan, rm, n, pi, 0, price, pmiM);
      const saved = base.months.length - months.length;
      payoffSub = `${Math.floor(saved / 12)} yr ${saved % 12} mo sooner · saves ${FT.fmt.usd(base.totInt - s.totInt)} interest`;
    }

    FT.tiles($('mtg-tiles'), [
      { label: 'Monthly payment', value: FT.fmt.usd2(total), sub: `Principal & interest ${FT.fmt.usd2(pi)}`, hero: true },
      { label: 'Loan amount', value: FT.fmt.usd(loan), sub: price ? `${FT.fmt.pct(down / price * 100)} down` : '' },
      { label: 'Total interest', value: FT.fmt.usd(s.totInt), sub: s.totPmi ? `plus ${FT.fmt.usd(s.totPmi)} PMI` : 'no PMI' },
      { label: 'Payoff date', value: FT.fmt.month(payoff), sub: payoffSub },
    ]);

    FT.chart.render($('mtg-donut'), 'donut', {
      label: 'Monthly payment breakdown',
      centerLabel: 'Per month',
      centerValue: FT.fmt.usd(total),
      valueFormat: FT.fmt.usd2,
      items: [
        { name: 'Principal & interest', color: C[0], value: pi },
        { name: 'Property tax', color: C[1], value: taxM },
        { name: 'Home insurance', color: C[2], value: insM },
        { name: 'PMI', color: C[3], value: pmiM },
        { name: 'HOA', color: C[4], value: hoa },
      ],
    });

    // Year-end snapshots for the chart
    const pts = [{ y: 0, bal: loan, prin: 0, int: 0 }];
    let cumP = 0, cumI = 0;
    months.forEach(mo => {
      cumP += mo.principal;
      cumI += mo.interest;
      if (mo.k % 12 === 0 || mo.k === months.length) pts.push({ y: Math.ceil(mo.k / 12), bal: mo.bal, prin: cumP, int: cumI });
    });
    // If the first payment is in the past, the Overview and Net worth use today's balance, not the original loan.
    const paid = FT.monthsPaid(start);
    const balAt = k => (k <= 0 ? loan : k <= months.length ? months[k - 1].bal : 0);
    const owedNow = balAt(paid);
    $('mtg-start-hint').textContent = !paid ? 'In the future, so nothing is paid yet.'
      : owedNow > 0 ? `${paid} payments made so far · ${FT.fmt.usd(owedNow)} still owed` : 'Paid off by now, based on this date.';

    const st = FT.loanStatus('mtg-status', 'mtg-status-hint', 'home');
    FT.report('mortgage', {
      status: st.status,
      payment: st.paying && owedNow > 0 ? total : 0,
      homeValue: st.owned ? price : 0,
      rate,
      balances: st.paying ? Array.from({ length: Math.ceil(Math.max(0, months.length - paid) / 12) + 1 }, (_, y) => balAt(paid + y * 12)) : [0],
    });

    const Y0 = start.getFullYear();
    FT.chart.render($('mtg-chart'), 'line', {
      label: 'Remaining balance and cumulative principal and interest paid',
      x: pts.map(p => p.y),
      xFormat: y => String(Y0 + y),
      xTooltip: y => (y === 0 ? 'Start' : `End of year ${y}`),
      series: [
        { name: 'Remaining balance', color: C[0], values: pts.map(p => p.bal), area: true },
        { name: 'Principal paid', color: C[1], values: pts.map(p => p.prin) },
        { name: 'Interest paid', color: C[2], values: pts.map(p => p.int) },
      ],
    });

    // Amortization table
    if ($('mtg-table-mode').value === 'month') {
      FT.table($('mtg-table'), ['Month', 'Payment', 'Principal', 'Interest', 'PMI', 'Balance'],
        months.map(mo => [
          FT.fmt.month(monthDate(start, mo.k)),
          FT.fmt.usd2(mo.principal + mo.interest),
          FT.fmt.usd2(mo.principal),
          FT.fmt.usd2(mo.interest),
          FT.fmt.usd2(mo.pmi),
          FT.fmt.usd2(mo.bal),
        ]));
    } else {
      const rows = [];
      for (let i = 0; i < months.length; i += 12) {
        const chunk = months.slice(i, i + 12);
        const end = chunk[chunk.length - 1];
        const sum = key => chunk.reduce((a, mo) => a + mo[key], 0);
        rows.push([
          `Year ${i / 12 + 1} (${FT.fmt.month(monthDate(start, end.k))})`,
          FT.fmt.usd(sum('principal')),
          FT.fmt.usd(sum('interest')),
          FT.fmt.usd(sum('pmi')),
          FT.fmt.usd(end.bal),
        ]);
      }
      FT.table($('mtg-table'), ['Year (ending)', 'Principal', 'Interest', 'PMI', 'Balance'], rows);
    }
  }

  FT.persist(root, 'mortgage', calc);
  calc();
})(window.FT);
