/* Auto loan calculator with trade-in, taxes/fees and term comparison */
(function (FT) {
  const root = document.getElementById('auto');
  const C = FT.colors;
  const $ = id => document.getElementById(id);
  const TERMS = [36, 48, 60, 72, 84];

  function calc() {
    const price = FT.num('auto-price'), down = FT.num('auto-down');
    const trade = FT.num('auto-trade'), owed = FT.num('auto-owed');
    const rm = FT.num('auto-rate') / 100 / 12, term = +$('auto-term').value;
    const salesTax = Math.max(0, price - trade) * FT.num('auto-tax') / 100;
    const fees = FT.num('auto-fees');
    const include = $('auto-include').checked;

    const netTrade = trade - owed; // negative equity gets rolled into the loan
    const loan = Math.max(0, price + (include ? salesTax + fees : 0) - down - netTrade);
    const upfront = down + (include ? 0 : salesTax + fees);
    const payment = FT.pmt(rm, term, loan);
    const totalPaid = payment * term;
    const interest = totalPaid - loan;

    FT.tiles($('auto-tiles'), [
      { label: 'Monthly payment', value: FT.fmt.usd2(payment), sub: `${term} months`, hero: true },
      { label: 'Amount financed', value: FT.fmt.usd(loan), sub: netTrade < 0 ? `includes ${FT.fmt.usd(-netTrade)} negative equity` : '' },
      { label: 'Total interest', value: FT.fmt.usd(interest) },
      { label: 'Total cost', value: FT.fmt.usd(totalPaid + upfront + Math.max(0, netTrade)), sub: `${FT.fmt.usd(upfront)} due at signing, incl. down payment` },
    ]);

    // Remaining balance at the end of each year, for the Overview tab
    const balAfter = k => rm ? loan * Math.pow(1 + rm, k) - payment * (Math.pow(1 + rm, k) - 1) / rm : loan - payment * k;
    // Where the loan and the car stand today, from the first payment date. Blank "value now" = estimate.
    const paid = Math.min(term, FT.monthsPaid(FT.monthInput('auto-start')));
    const owedNow = Math.max(0, balAfter(paid));
    const estValue = price * Math.pow(1 - FT.VEHICLE_DEPRECIATION, paid / 12);
    $('auto-value').placeholder = `about ${Math.round(estValue)}`;
    const valueNow = $('auto-value').value === '' ? estValue : FT.num('auto-value');
    $('auto-now-hint').textContent = !paid
      ? "First payment is in the future, so nothing is paid yet. Leave the car's value blank to estimate it."
      : `${paid} of ${term} payments made · ${FT.fmt.usd(owedNow)} still owed · ${FT.fmt.usd(valueNow - owedNow)} equity. ` +
        `Value is ${$('auto-value').value === '' ? `estimated at ${FT.fmt.pct(FT.VEHICLE_DEPRECIATION * 100, 0)} loss a year; enter what it's really worth if you know` : 'what you entered'}.`;

    const st = FT.loanStatus('auto-status', 'auto-status-hint', 'car');
    FT.report('auto', {
      status: st.status,
      payment: st.paying && owedNow > 0 ? payment : 0,
      carValue: st.owned ? valueNow : 0,
      rate: rm * 12,
      balances: st.paying ? Array.from({ length: Math.ceil((term - paid) / 12) + 1 }, (_, y) => Math.max(0, balAfter(Math.min(term, paid + y * 12)))) : [0],
    });

    FT.chart.render($('auto-donut'), 'donut', {
      label: 'Total of loan payments split into principal and interest',
      centerLabel: 'Total paid',
      items: [
        { name: 'Principal', color: C[0], value: loan },
        { name: 'Interest', color: C[1], value: interest },
      ],
    });

    const byTerm = TERMS.map(t => {
      const p = FT.pmt(rm, t, loan);
      return { t, p, interest: p * t - loan };
    });

    FT.chart.render($('auto-terms'), 'bar', {
      label: 'Total interest for each loan term',
      categories: byTerm.map(b => `${b.t} mo`),
      series: [{ name: 'Total interest', color: C[0], values: byTerm.map(b => b.interest) }],
    });

    FT.table($('auto-table'), ['Term', 'Monthly payment', 'Total interest', 'Total of payments'],
      byTerm.map(b => ({
        className: b.t === term ? 'selected' : '',
        cells: [
          `${b.t} months${b.t === term ? ' (selected)' : ''}`,
          FT.fmt.usd2(b.p),
          FT.fmt.usd(b.interest),
          FT.fmt.usd(b.p * b.t),
        ],
      })));
  }

  FT.persist(root, 'auto', calc);
  calc();
})(window.FT);
