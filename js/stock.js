/* Stock profit calculator: a what-if for one buy and sell. It doesn't report to the Overview or Net worth. */
(function (FT) {
  const root = document.getElementById('inv-stock');

  // Sell-price moves shown in the table, relative to the buy price.
  const MOVES = [-0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 1];

  function calc() {
    const buy = FT.num('stk-buy'), sell = FT.num('stk-sell'), fees = FT.num('stk-fees');
    const qty = FT.num('stk-qty');
    const inDollars = document.getElementById('stk-qty-type').value === 'usd';
    const shares = inDollars ? (buy > 0 ? qty / buy : 0) : qty;
    const cost = shares * buy;

    const fmtShares = n => n.toLocaleString('en-US', { maximumFractionDigits: 4 });
    document.getElementById('stk-qty-hint').textContent = inDollars
      ? `≈ ${fmtShares(shares)} shares at ${FT.fmt.usd2(buy)}`
      : `Costs ${FT.fmt.usd2(cost)} at ${FT.fmt.usd2(buy)} a share`;

    const profitAt = price => shares * price - cost - fees;
    const profit = profitAt(sell);
    const ret = cost + fees > 0 ? profit / (cost + fees) * 100 : 0;
    const tone = v => (v > 0 ? 'good' : v < 0 ? 'critical' : undefined);
    const breakEven = shares > 0 ? (cost + fees) / shares : 0;

    FT.tiles(document.getElementById('stk-tiles'), [
      { label: profit < 0 ? 'Loss' : 'Profit', value: FT.fmt.usd2(profit), tone: tone(profit), hero: true,
        sub: `${fmtShares(shares)} shares from ${FT.fmt.usd2(buy)} to ${FT.fmt.usd2(sell)}` },
      { label: 'Return', value: (ret > 0 ? '+' : '') + FT.fmt.pct(ret), tone: tone(ret), sub: fees > 0 ? 'after fees' : '' },
      { label: 'You pay', value: FT.fmt.usd2(cost + fees), sub: fees > 0 ? `includes ${FT.fmt.usd2(fees)} in fees` : '' },
      { label: 'You get back', value: FT.fmt.usd2(shares * sell) },
      { label: 'Break-even price', value: FT.fmt.usd2(breakEven), sub: 'sell price to not lose money' },
    ]);

    // The sell prices to compare: moves from the buy price plus the one you entered, without duplicates.
    const prices = MOVES.map(m => buy * (1 + m));
    if (!prices.some(p => Math.abs(p - sell) < 0.005)) prices.push(sell);
    prices.sort((a, b) => a - b);

    FT.table(document.getElementById('stk-table'),
      ['Sell price', 'Change', 'Sale value', 'Profit / loss', 'Return'],
      prices.map(p => {
        const pl = profitAt(p);
        const change = buy > 0 ? (p / buy - 1) * 100 : 0;
        const plRet = cost + fees > 0 ? pl / (cost + fees) * 100 : 0;
        const toneClass = tone(pl) ? 'tone-' + tone(pl) : '';
        return {
          className: Math.abs(p - sell) < 0.005 ? 'selected' : '',
          cells: [
            FT.fmt.usd2(p) + (Math.abs(p - sell) < 0.005 ? ' (yours)' : ''),
            (change > 0 ? '+' : '') + FT.fmt.pct(change, 0),
            FT.fmt.usd2(shares * p),
            { text: FT.fmt.usd2(pl), className: toneClass },
            { text: (plRet > 0 ? '+' : '') + FT.fmt.pct(plRet), className: toneClass },
          ],
        };
      }));
  }

  FT.persist(root, 'stock', calc);
  calc();
})(window.FT);
