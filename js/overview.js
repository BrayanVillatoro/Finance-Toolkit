/* Overview: combines every calculator into one picture of how you're doing */
(function (FT) {
  const C = FT.colors;
  const $ = id => document.getElementById(id);
  const Y0 = new Date().getFullYear();
  const ICONS = { good: '✓', warn: '!', bad: '✕' };
  const TAB_NAMES = { investment: 'Investment', retirement: 'Retirement', mortgage: 'Mortgage', auto: 'Auto loan', budget: 'Budget', networth: 'Net worth' };
  const VEHICLE_DEPRECIATION = FT.VEHICLE_DEPRECIATION;

  // Value for year y; past the end of a schedule the last value carries on.
  const at = (arr, y) => (arr.length ? arr[Math.min(y, arr.length - 1)] : 0);
  // good when ratio <= ok, warn up to `high`, bad above.
  const grade = (ratio, ok, high) => (ratio <= ok ? 'good' : ratio <= high ? 'warn' : 'bad');
  const signedUsd = v => (v < 0 ? '-' : '') + FT.fmt.usd(Math.abs(v));

  function render() {
    const { investment: inv, retirement: ret, mortgage: mtg, auto, budget: bud, networth: nw } = FT.summary;
    if (!inv || !ret || !mtg || !auto || !bud || !nw) return;
    const costs = FT.monthlyCosts();

    const years = Math.max(1, ret.retireAge - ret.age);
    const deflate = Math.pow(1 + inv.inflation, years);
    const invBal = inv.balances(years);
    const x = Array.from({ length: years + 1 }, (_, y) => y);
    const savings = x.map(y => invBal[y] + at(ret.balances, y));
    const debt = x.map(y => at(mtg.balances, y) + at(auto.balances, y) + nw.otherDebt);
    const worth = x.map(y => savings[y] + nw.fixedAssets + nw.vehicles * Math.pow(1 - VEHICLE_DEPRECIATION, y) - debt[y]);

    const net = bud.net, gross = bud.gross;
    const base = gross !== null ? gross : net;
    const baseName = gross !== null ? 'gross income' : 'take-home pay';
    const debtPay = mtg.payment + auto.payment;
    const saveRate = net ? bud.actual.savings / net : 0;
    const left = costs.left;
    // Monthly amount the Investment and Retirement tabs assume you put in from take-home pay.
    // 401(k) contributions come out of the paycheck before take-home, so the budget never sees them.
    const fromTakeHome = ret.iraContrib > 0;
    const planned = inv.monthly + ret.iraContrib / 12;
    // Both accounts drawn down at the retirement tab's withdrawal rate, in today's dollars.
    const retIncome = (ret.monthlyIncome + invBal[years] * ret.withdraw / 12) / deflate;

    const leftWhat = debtPay ? 'after your budget and loan payments' : 'after your budget expenses';
    FT.tiles($('ov-tiles'), [
      { label: `Saved by age ${ret.retireAge}`, value: FT.fmt.usd(savings[years]), sub: `≈ ${FT.fmt.usd(savings[years] / deflate)} in today's dollars`, hero: true },
      { label: 'Net worth today', value: signedUsd(nw.net), tone: nw.net < 0 ? 'critical' : undefined, sub: `${FT.fmt.usd(nw.own)} owned − ${FT.fmt.usd(nw.owe)} owed` },
      left >= 0
        ? { label: 'Left over each month', value: '▲ ' + FT.fmt.usd(left), tone: 'good', sub: leftWhat }
        : { label: 'Short each month', value: '▼ ' + FT.fmt.usd(-left), tone: 'critical', sub: leftWhat },
      { label: 'Savings rate', value: FT.fmt.pct(saveRate * 100, 0), sub: `${FT.fmt.usd(bud.actual.savings)}/mo of take-home` },
      debtPay
        ? { label: 'Loan payments', value: FT.fmt.usd(debtPay) + '/mo', sub: base ? `${FT.fmt.pct(debtPay / base * 100, 0)} of ${baseName}` : 'mortgage + car' }
        : { label: 'Retirement income', value: FT.fmt.usd(retIncome) + '/mo', sub: `at age ${ret.retireAge}, in today's dollars` },
    ]);

    const checks = [];
    // Explain how the loan tabs were combined with the budget so the leftover number isn't a mystery.
    let how = '';
    if (costs.replacedRent) how += ` The Mortgage tab's payment is used in place of the ${FT.fmt.usd(costs.replacedRent)} housing line in your budget`;
    if (auto.payment) how += (how ? ', and the' : ' The') + (costs.replacedCar ? " Auto loan tab's payment in place of your budget's car payment" : ' car payment is added on top of your budget');
    if (how) how += '.';
    checks.push(left >= 0
      ? { status: 'good', tab: 'budget', title: 'Spending fits your income', detail: `You have ${FT.fmt.usd(left)} a month left ${leftWhat}.${how}` }
      : { status: 'bad', tab: 'budget', title: 'Spending is more than you take home', detail: `You're ${FT.fmt.usd(-left)} a month short ${leftWhat}.${how}` });

    if (nw.months !== null) {
      const lo = costs.living * 3, hi = costs.living * 6;
      checks.push({
        status: nw.months >= 3 ? 'good' : nw.months >= 1 ? 'warn' : 'bad', tab: 'networth',
        title: `Emergency fund covers ${nw.months.toFixed(1)} months`,
        detail: `${FT.fmt.usd(nw.cash)} in cash & savings vs. ${FT.fmt.usd(costs.living)}/mo in living costs. ` +
          (nw.months >= 6 ? 'Fully funded.' : `Aim for 3–6 months (${FT.fmt.usd(lo)}–${FT.fmt.usd(hi)}).`),
      });
    }

    if (nw.highRate.length) {
      const total = nw.highRate.reduce((s, d) => s + d.balance, 0);
      checks.push({
        status: 'bad', tab: 'networth',
        title: `${FT.fmt.usd(total)} of high-interest debt`,
        detail: `${nw.highRate.map(d => `${d.name || 'Unnamed'} at ${FT.fmt.pct(d.rate, 1)}`).join(', ')}. Paying this off beats almost any investment return.`,
      });
    }

    checks.push({
      status: saveRate >= 0.2 ? 'good' : saveRate >= 0.1 ? 'warn' : 'bad', tab: 'budget',
      title: `Saving ${FT.fmt.pct(saveRate * 100, 0)} of take-home pay`,
      detail: 'Aim for 20% or more toward savings, investing and extra debt payments.',
    });

    const gap = planned - bud.actual.savings;
    if (planned > 0) {
      checks.push(gap < 1
        ? { status: 'good', tab: 'budget', title: 'Your budget pays for your investing plan', detail: `The ${FT.fmt.usd(planned)}/mo your ${fromTakeHome ? 'Investment and Retirement tabs assume' : 'Investment tab assumes'} fits inside the ${FT.fmt.usd(bud.actual.savings)}/mo your budget saves.` }
        : {
          status: gap <= Math.max(0, left) ? 'warn' : 'bad', tab: 'budget',
          title: `Your plans need ${FT.fmt.usd(gap)}/mo more than your budget saves`,
          detail: `${fromTakeHome ? 'Investment and Retirement assume' : 'Investment assumes'} ${FT.fmt.usd(planned)}/mo, but your budget sets aside ${FT.fmt.usd(bud.actual.savings)}` +
            (ret.has401k ? ' (your 401(k) comes out of your paycheck, so it isn\'t counted here). ' : '. ') +
            (gap <= Math.max(0, left) ? 'You have room: add it to your budget so the projections hold.' : "You don't have that much left over, so the projections are too optimistic."),
        });
    }

    const housing = mtg.payment || bud.housing;
    if (mtg.status === 'paidoff' && bud.housing) {
      checks.push({
        status: 'warn', tab: 'budget',
        title: `Your budget still lists ${FT.fmt.usd(bud.housing)} rent`,
        detail: 'Your home is marked paid off on the Mortgage tab. Remove the rent from your budget (keep property tax and insurance) so your numbers are right.',
      });
    } else if (housing && base) {
      const r = housing / base, limit = gross !== null ? 0.28 : 0.35;
      checks.push({
        status: grade(r, limit, limit + 0.05), tab: mtg.payment ? 'mortgage' : 'budget',
        title: `${mtg.payment ? 'Mortgage payment' : 'Rent'} is ${FT.fmt.pct(r * 100, 0)} of ${baseName}`,
        detail: `${FT.fmt.usd(housing)} a month. Keep housing at or under ${FT.fmt.pct(limit * 100, 0)} (${FT.fmt.usd(base * limit)}).`,
      });
    }

    if (auto.payment && net) {
      const r = auto.payment / net;
      checks.push({
        status: grade(r, 0.10, 0.15), tab: 'auto',
        title: `Car payment is ${FT.fmt.pct(r * 100, 0)} of take-home pay`,
        detail: `${FT.fmt.usd(auto.payment)} a month. Try to keep it at or under 10% (${FT.fmt.usd(net * 0.1)}).`,
      });
    }

    if (debtPay && base) {
      const r = debtPay / base;
      checks.push({
        status: grade(r, 0.36, 0.43), tab: 'mortgage',
        title: `Loan payments are ${FT.fmt.pct(r * 100, 0)} of ${baseName}`,
        detail: 'Lenders like total debt payments at or under 36%; above 43% makes new loans hard to get.',
      });
    }

    if (net) {
      const r = retIncome / net;
      checks.push({
        status: r >= 0.7 ? 'good' : r >= 0.5 ? 'warn' : 'bad', tab: 'retirement',
        title: `Retirement income ≈ ${FT.fmt.pct(r * 100, 0)} of today's take-home`,
        detail: `About ${FT.fmt.usd(retIncome)} a month at age ${ret.retireAge} in today's dollars, from your retirement and investment accounts. Aim for 70–80%.`,
      });
    }

    if (ret.hasRothIra && gross !== null && gross * 12 > ret.rothIncomeLimit) {
      checks.push({
        status: 'warn', tab: 'retirement',
        title: 'You may earn too much for a Roth IRA',
        detail: `Your ${FT.fmt.usd(gross * 12)} income is above the ${FT.fmt.usd(ret.rothIncomeLimit)} single-filer limit where Roth IRA contributions start phasing out. Check your eligibility, or look at a backdoor Roth or Roth 401(k).`,
      });
    }

    const onTrack = checks.filter(c => c.status === 'good').length;
    $('ov-score').textContent = `${onTrack} of ${checks.length} on track`;
    $('ov-score').className = 'score ' + (onTrack === checks.length ? 'good' : checks.some(c => c.status === 'bad') ? 'bad' : 'warn');

    $('ov-checks').innerHTML = checks.map(c =>
      `<li class="ov-check ${c.status}">` +
        `<span class="ov-check-icon" aria-hidden="true">${ICONS[c.status]}</span>` +
        `<div class="ov-check-text"><b>${FT.esc(c.title)}</b><span>${FT.esc(c.detail)}</span></div>` +
        `<a class="ov-check-link" href="#${c.tab}">${TAB_NAMES[c.tab]} →</a>` +
      '</li>'
    ).join('');

    const hasDebt = debt.some(v => v > 0);
    $('ov-chart-title').textContent = hasDebt ? 'Savings, loans and net worth until retirement' : 'Savings and net worth until retirement';
    $('ov-chart-hint').textContent =
      'Savings are your investment and retirement accounts. Net worth also counts everything on the Net worth tab: ' +
      `homes and other items at today's value, and vehicles losing about ${FT.fmt.pct(VEHICLE_DEPRECIATION * 100, 0)} a year.` +
      (hasDebt ? ' Mortgage and car loans shrink as you pay them; other debts stay as they are today.' : '');
    const series = [{ name: 'Savings & investments', color: C[0], values: savings, area: true }];
    if (hasDebt) series.push({ name: 'Loans owed', color: C[1], values: debt });
    series.push({ name: 'Net worth', color: C[2], values: worth, dashed: true });
    FT.chart.render($('ov-chart'), 'line', {
      label: 'Projected savings, loans and net worth until retirement',
      x,
      xFormat: y => String(Y0 + y),
      xTooltip: y => `${Y0 + y} · age ${ret.age + y}`,
      series,
    });
  }

  FT.onReport(render);
  render();
})(window.FT);
