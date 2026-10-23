/* Shared helpers: formatting, input reading, persistence, tiles and tables. */
window.FT = window.FT || {};

(function (FT) {
  const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });

  FT.fmt = {
    usd: v => usd0.format(Math.round(v) || 0),
    usd2: v => usd2.format(v || 0),
    // Short axis labels: $1.2K, $350K, $1.5M
    compact: v => {
      const a = Math.abs(v), s = v < 0 ? '-' : '';
      if (a >= 1e6) return s + '$' + +(a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e3) return s + '$' + +(a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
      return s + '$' + Math.round(a);
    },
    pct: (v, d = 1) => (isFinite(v) ? v : 0).toFixed(d) + '%',
    month: d => monthFmt.format(d),
  };

  FT.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Read a numeric input by id; blank or invalid reads as 0.
  FT.num = id => {
    const v = parseFloat(document.getElementById(id).value);
    return isFinite(v) ? v : 0;
  };

  // Standard loan payment for a monthly rate, number of payments and principal.
  FT.pmt = (rateMonthly, n, principal) => {
    if (n <= 0 || principal <= 0) return 0;
    if (rateMonthly === 0) return principal / n;
    return principal * rateMonthly / (1 - Math.pow(1 + rateMonthly, -n));
  };

  FT.store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem('ft:' + key)); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem('ft:' + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
    remove(key) {
      try { localStorage.removeItem('ft:' + key); } catch (e) { /* storage unavailable */ }
    },
  };

  // Each calculator publishes its latest results here so the Overview and Net worth tabs can combine them.
  FT.summary = {};
  const listeners = [];
  FT.report = function (key, data) {
    FT.summary[key] = data;
    listeners.forEach(fn => fn(key));
  };
  FT.onReport = fn => listeners.push(fn);

  // Rough yearly loss in value for cars, used to estimate what a vehicle is worth now and later.
  FT.VEHICLE_DEPRECIATION = 0.15;

  // A <input type="month"> value as the 1st of that month; defaults to next month when empty.
  FT.monthInput = id => {
    const el = document.getElementById(id);
    if (!el.value) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      el.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    const [y, m] = el.value.split('-').map(Number);
    return new Date(y, m - 1, 1);
  };

  // Monthly payments already made by this month, given the month of the first payment.
  FT.monthsPaid = start => {
    const now = new Date();
    return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1);
  };

  // Mortgage / auto loan status: whether the loan and the thing it bought count toward the Overview and Net worth.
  FT.loanStatus = function (selectId, hintId, thing) {
    const status = document.getElementById(selectId).value;
    document.getElementById(hintId).textContent = {
      active: `The loan, its payment and the ${thing} count toward your Overview and Net worth.`,
      paidoff: `The ${thing} counts toward your net worth; there's no loan or payment. The calculator below still works for trying numbers.`,
      planning: 'Not counted in your Overview or Net worth. Use the calculator to try out numbers.',
    }[status];
    return { status, owned: status !== 'planning', paying: status === 'active' };
  };

  // Monthly living costs and what's left over, treating the Mortgage and Auto tabs as your
  // real loans: they replace matching budget lines (rent, car payment) rather than adding to them.
  FT.monthlyCosts = function () {
    const { budget: bud, mortgage: mtg, auto } = FT.summary;
    if (!bud || !mtg || !auto) return null;
    const replacedRent = mtg.payment ? bud.housing : 0;
    const replacedCar = auto.payment ? bud.car : 0;
    const loans = mtg.payment + auto.payment - replacedRent - replacedCar;
    return {
      replacedRent, replacedCar,
      living: bud.actual.needs + bud.actual.wants + loans,
      left: bud.left - loans,
    };
  };

  // Restore every input/select with an id inside `root`, save on change, and call onChange(event).
  FT.persist = function (root, key, onChange) {
    const fields = root.querySelectorAll('input[id], select[id]');
    const saved = FT.store.get(key) || {};
    fields.forEach(f => {
      if (!(f.id in saved)) return;
      if (f.type === 'checkbox') f.checked = !!saved[f.id];
      else f.value = saved[f.id];
    });
    const save = () => {
      const data = {};
      fields.forEach(f => { data[f.id] = f.type === 'checkbox' ? f.checked : f.value; });
      FT.store.set(key, data);
    };
    const handler = ev => { onChange(ev); save(); };
    root.addEventListener('input', handler);
    root.addEventListener('change', handler);
  };

  // tiles: [{ label, value, sub?, tone?: 'good' | 'critical', hero? }]
  FT.tiles = function (el, tiles) {
    el.innerHTML = tiles.map(t =>
      `<div class="tile${t.hero ? ' hero' : ''}">` +
        `<div class="tile-label">${FT.esc(t.label)}</div>` +
        `<div class="tile-value${t.tone ? ' tone-' + t.tone : ''}">${FT.esc(t.value)}</div>` +
        (t.sub ? `<div class="tile-sub">${FT.esc(t.sub)}</div>` : '') +
      '</div>'
    ).join('');
  };

  // rows: arrays of cell strings, or { cells, className } objects. Cells may be { text, className }.
  FT.table = function (el, headers, rows) {
    const cell = c => (c && typeof c === 'object')
      ? `<td class="${c.className || ''}">${FT.esc(c.text)}</td>`
      : `<td>${FT.esc(c)}</td>`;
    el.innerHTML = '<table><thead><tr>' + headers.map(h => `<th>${FT.esc(h)}</th>`).join('') + '</tr></thead><tbody>' +
      rows.map(r => {
        const cells = Array.isArray(r) ? r : r.cells;
        return `<tr class="${(!Array.isArray(r) && r.className) || ''}">` + cells.map(cell).join('') + '</tr>';
      }).join('') +
      '</tbody></table>';
  };
})(window.FT);
