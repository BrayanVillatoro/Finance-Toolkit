/* Extra income streams (side gig, second job, rental...) shared by the Salary and Budget tabs */
(function (FT) {
  const $ = id => document.getElementById(id);
  const PER_YEAR = { week: 52, biweekly: 26, month: 12, year: 1 };
  const TYPES = [
    { key: 'wages', name: 'Second job (W-2)' },
    { key: 'self', name: 'Side gig (1099)' },
    { key: 'other', name: 'Rental / other' },
    { key: 'untaxed', name: 'Not taxed' },
  ];

  const streams = FT.store.get('income-streams') || [];
  const views = [], listeners = [];

  // Save, refresh the other tab's copy of the list, and let both calculators recalculate.
  function changed(from) {
    FT.store.set('income-streams', streams);
    views.forEach(v => { if (v !== from) render(v); });
    listeners.forEach(fn => fn());
  }

  function rowEl(view, s) {
    const row = document.createElement('div');
    row.className = 'exp-row';
    row.innerHTML =
      '<input class="exp-name" type="text" placeholder="e.g. Freelance design" aria-label="Income name">' +
      '<div class="input"><span class="pre">$</span><input class="exp-amt" type="number" min="0" step="1" aria-label="Amount"></div>' +
      '<select class="exp-freq" aria-label="How often">' +
        '<option value="month">per month</option><option value="year">per year</option>' +
        '<option value="biweekly">every 2 weeks</option><option value="week">per week</option>' +
      '</select>' +
      '<select class="exp-cat" aria-label="Tax type">' + TYPES.map(t => `<option value="${t.key}">${t.name}</option>`).join('') + '</select>' +
      '<button type="button" class="icon-btn exp-del" aria-label="Remove income" title="Remove">&times;</button>';
    const q = sel => row.querySelector(sel);
    q('.exp-name').value = s.name;
    q('.exp-amt').value = s.amount;
    q('.exp-freq').value = s.freq;
    q('.exp-cat').value = s.type;
    const update = () => {
      s.name = q('.exp-name').value;
      s.amount = parseFloat(q('.exp-amt').value) || 0;
      s.freq = q('.exp-freq').value;
      s.type = q('.exp-cat').value;
      changed(view);
    };
    row.addEventListener('input', update);
    row.addEventListener('change', update);
    q('.exp-del').addEventListener('click', () => {
      streams.splice(streams.indexOf(s), 1);
      changed(null);
    });
    return row;
  }

  function render(view) {
    view.list.innerHTML = '';
    streams.forEach(s => view.list.appendChild(rowEl(view, s)));
    view.empty.hidden = streams.length > 0;
  }

  FT.income = {
    // Show an editable copy of the list; every copy edits the same streams.
    mount(listId, emptyId, addId) {
      const view = { list: $(listId), empty: $(emptyId) };
      views.push(view);
      $(addId).addEventListener('click', () => {
        streams.push({ name: '', amount: 0, freq: 'month', type: 'self' });
        changed(null);
        view.list.lastChild.querySelector('.exp-name').focus();
      });
      render(view);
    },
    onChange: fn => listeners.push(fn),
    // Yearly totals by tax treatment.
    yearly() {
      const t = { wages: 0, self: 0, other: 0, untaxed: 0 };
      streams.forEach(s => { t[s.type] += (s.amount || 0) * PER_YEAR[s.freq]; });
      return t;
    },
  };
})(window.FT);
