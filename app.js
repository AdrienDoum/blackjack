const ACTIONS = ['hit', 'stand', 'double', 'split', 'surrender'];
const ACTION_LABEL = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender' };
const ACTION_KEY = { hit: 'H', stand: 'S', double: 'D', split: 'P', surrender: 'R' };
const KEY_ACTION = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' };
const SUITS = ['♠', '♥', '♦', '♣'];
const CELL_CLASS = { H: 'white', S: 'yellow', D: 'green', Ds: 'teal', Y: 'green', N: 'white', YN: 'teal', SUR: 'green', '-': 'blank' };
const CELL_TEXT = { YN: 'Y/N', '-': '' };
const TABLE_NAME = { hard: 'Hard totals', soft: 'Soft totals', pair: 'Pair splitting', surrender: 'Surrender' };
const STORAGE_KEY = 'blackjack-trainer-v1';

const state = {
  settings: { das: true, surrender: true },
  stats: freshStats(),
  hand: null,
  result: null,
};

const el = {};
for (const id of ['dealer-cards', 'player-cards', 'hand-label', 'actions', 'feedback', 'stat-hands', 'stat-accuracy', 'stat-streak', 'stat-best', 'categories', 'weak', 'reset', 'chart', 'opt-das', 'opt-surrender']) {
  el[id.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
}

function freshStats() {
  return {
    hands: 0,
    correct: 0,
    streak: 0,
    best: 0,
    tables: { hard: { n: 0, c: 0 }, soft: { n: 0, c: 0 }, pair: { n: 0, c: 0 }, surrender: { n: 0, c: 0 } },
    situations: {},
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.stats) state.stats = { ...freshStats(), ...saved.stats };
    if (saved && saved.settings) state.settings = { ...state.settings, ...saved.settings };
  } catch (e) {
    /* storage unavailable: run without persistence */
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stats: state.stats, settings: state.settings }));
  } catch (e) {
    /* ignore */
  }
}

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

function pairName(v) {
  return v === 'A' ? 'aces' : v === 10 ? 'tens' : `${v}s`;
}

// Every decision row of the chart, with the concrete two-card combos that produce it.
// Trivial rows (always hit / always stand) get a lower weight so training time goes to real decisions.
function buildSituations() {
  const list = [];
  for (let t = 5; t <= 19; t++) {
    const combos = [];
    for (let a = 2; a <= 10; a++) {
      const b = t - a;
      if (b > a && b <= 10) combos.push([a, b]);
    }
    list.push({ key: `hard-${t}`, table: 'hard', label: `Hard ${t}`, combos, weight: t <= 7 || t >= 17 ? 0.2 : 1 });
  }
  for (let x = 2; x <= 9; x++) {
    list.push({ key: `soft-${x}`, table: 'soft', label: `Soft ${11 + x} (A,${x})`, combos: [['A', x]], weight: 1 });
  }
  for (const v of ROW_ORDER.pair) {
    list.push({ key: `pair-${v}`, table: 'pair', label: `Pair of ${pairName(v)}`, combos: [[v, v]], weight: v === 5 || v === 10 ? 0.5 : 1 });
  }
  return list;
}

const SITUATIONS = buildSituations();

// Missed situations come back more often until answered correctly 3 times in a row.
function weightOf(row, key) {
  const sit = state.stats.situations[key];
  const boost = sit && sit.wrong > 0 && sit.streak < 3 ? 1 + 2 * Math.min(sit.wrong, 5) : 1;
  return row.weight * boost;
}

function pickSituation() {
  const candidates = [];
  let total = 0;
  for (const row of SITUATIONS) {
    for (const dealer of DEALER_CARDS) {
      const key = `${row.key}-vs-${dealer}`;
      if (state.hand && state.hand.key === key) continue;
      const w = weightOf(row, key);
      total += w;
      candidates.push({ row, dealer, key, w });
    }
  }
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.w;
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

function toRank(value) {
  if (value === 'A') return 'A';
  if (Number(value) === 10) return pick(['10', 'J', 'Q', 'K']);
  return String(value);
}

function deal() {
  const { row, dealer, key } = pickSituation();
  const combo = pick(row.combos);
  const suits = [...SUITS].sort(() => Math.random() - 0.5);
  state.hand = {
    row,
    dealer,
    key,
    cards: combo.map((v, i) => ({ rank: toRank(v), suit: suits[i] })),
    dealerCard: { rank: toRank(dealer), suit: pick(SUITS) },
  };
  state.result = null;
  el.dealerCards.innerHTML = cardHtml(state.hand.dealerCard) + '<div class="card back"></div>';
  el.playerCards.innerHTML = state.hand.cards.map(cardHtml).join('');
  render();
  if (isPhone()) window.scrollTo({ top: 0, behavior: 'smooth' });
}

const isPhone = () => window.matchMedia('(max-width: 760px)').matches;

function available(action) {
  if (action === 'split') return state.hand.row.table === 'pair';
  if (action === 'surrender') return state.settings.surrender;
  return true;
}

function answer(action) {
  if (state.result || !available(action)) return;
  const { hand, stats } = state;
  const decision = decide(hand.cards.map((c) => c.rank), hand.dealer, state.settings);
  const correct = action === decision.action;
  const category = decision.action === 'surrender' ? 'surrender' : decision.steps[0].table;

  stats.hands++;
  if (correct) {
    stats.correct++;
    stats.streak++;
    stats.best = Math.max(stats.best, stats.streak);
  } else {
    stats.streak = 0;
  }
  stats.tables[category].n++;
  if (correct) stats.tables[category].c++;

  const sit = stats.situations[hand.key] || (stats.situations[hand.key] = { n: 0, wrong: 0, streak: 0, label: hand.row.label, dealer: hand.dealer });
  sit.n++;
  if (correct) sit.streak++;
  else {
    sit.wrong++;
    sit.streak = 0;
  }

  state.result = { action, decision, correct };
  save();
  render();
  if (isPhone()) el.feedback.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function cardHtml(card) {
  const red = card.suit === '♥' || card.suit === '♦';
  return `<div class="card${red ? ' red' : ''}"><span class="corner">${card.rank}<br>${card.suit}</span><span class="pip">${card.suit}</span></div>`;
}

function describeHand(info, cards) {
  const list = cards.map((c) => c.rank + c.suit).join(' ');
  if (info.isPair) return `Pair of ${pairName(info.pairOf)} (${list})`;
  return `${info.soft ? 'Soft' : 'Hard'} ${info.total} (${list})`;
}

function rowName(table, row) {
  if (table === 'soft') return `A,${row}`;
  if (table === 'pair') return row === 'A' ? 'A,A' : row === 10 ? 'T,T' : `${row},${row}`;
  return String(row);
}

function explainStep(step, decision, dealer) {
  const { info } = decision;
  const vs = `vs ${dealer}`;
  const code = `<b>${CELL_TEXT[step.cell] ?? step.cell}</b>`;
  if (step.table === 'pair') {
    let tail = '';
    if (step.cell === 'YN') tail = state.settings.das ? ' DAS is on, so split.' : ` DAS is off, so play it as hard ${info.total}.`;
    if (step.cell === 'N') tail = ` Play it as ${info.soft ? 'soft' : 'hard'} ${info.total}.`;
    return `Pair of ${pairName(info.pairOf)} ${vs}: ${code} ${LEGEND[step.cell]}.${tail}`;
  }
  if (step.table === 'soft') return `Soft ${info.total} (A,${step.row}) ${vs}: ${code} ${LEGEND[step.cell]}.`;
  if (step.table === 'surrender') return `Hard ${info.total} ${vs}: ${code} ${LEGEND[step.cell]}.`;
  let tail = '';
  if (info.total >= 17) tail = ' 17 and up always stands.';
  if (info.total <= 8) tail = ' 8 and under always hits.';
  return `Hard ${info.total} ${vs}: ${code} ${LEGEND[step.cell]}.${tail}`;
}

function cellTd(cell, extra = '') {
  return `<td class="c-${CELL_CLASS[cell]}${extra}">${CELL_TEXT[cell] ?? cell}</td>`;
}

function rowStrip(step, dealer) {
  const di = DEALER_CARDS.indexOf(dealer);
  const cells = CHART[step.table][step.row].split(' ');
  return `<table class="strip">
    <thead><tr><th>${TABLE_NAME[step.table]}</th>${DEALER_CARDS.map((d, i) => `<th${i === di ? ' class="hl"' : ''}>${d}</th>`).join('')}</tr></thead>
    <tbody><tr><th>${rowName(step.table, step.row)}</th>${cells.map((c, i) => cellTd(c, i === di ? ' hl' : '')).join('')}</tr></tbody>
  </table>`;
}

function renderChart() {
  const tables = Object.keys(TABLE_NAME).map((table) => `
    <div class="scroll"><table class="grid">
      <caption>${TABLE_NAME[table]}</caption>
      <thead><tr><th></th>${DEALER_CARDS.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
      <tbody>${ROW_ORDER[table].map((row) => `<tr><th>${rowName(table, row)}</th>${CHART[table][row].split(' ').map((c, i) => `<td id="cell-${table}-${row}-${i}" class="c-${CELL_CLASS[c]}">${CELL_TEXT[c] ?? c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`);
  const legend = Object.keys(LEGEND).map((k) => `<li><span class="swatch c-${CELL_CLASS[k]}">${CELL_TEXT[k] ?? k}</span>${LEGEND[k]}</li>`).join('');
  el.chart.innerHTML = tables.join('') + `<ul class="legend">${legend}</ul>`;
}

function renderChartHighlights() {
  for (const td of el.chart.querySelectorAll('td.hl')) td.classList.remove('hl');
  if (!state.result) return;
  const di = DEALER_CARDS.indexOf(state.hand.dealer);
  for (const step of state.result.decision.steps) {
    const td = document.getElementById(`cell-${step.table}-${step.row}-${di}`);
    if (td) td.classList.add('hl');
  }
}

function renderFeedback() {
  const { hand, result } = state;
  if (!result) {
    el.feedback.hidden = true;
    return;
  }
  const { decision, correct, action } = result;
  const verdict = correct
    ? `Correct: ${ACTION_LABEL[action]}`
    : `Wrong. You chose ${ACTION_LABEL[action]}, the book says ${ACTION_LABEL[decision.action]}.`;
  el.feedback.hidden = false;
  el.feedback.className = `feedback ${correct ? 'ok' : 'bad'}`;
  el.feedback.innerHTML = `
    <div class="verdict">${verdict}</div>
    <ol class="steps">${decision.steps.map((s) => `<li>${explainStep(s, decision, hand.dealer)}</li>`).join('')}</ol>
    ${decision.steps.map((s) => rowStrip(s, hand.dealer)).join('')}`;
}

function renderStats() {
  const s = state.stats;
  el.statHands.textContent = s.hands;
  el.statAccuracy.textContent = s.hands ? `${Math.round((100 * s.correct) / s.hands)}%` : '–';
  el.statStreak.textContent = s.streak;
  el.statBest.textContent = s.best;

  el.categories.innerHTML = Object.keys(TABLE_NAME).map((k) => {
    const t = s.tables[k];
    const pct = t.n ? Math.round((100 * t.c) / t.n) : null;
    return `<li><span>${TABLE_NAME[k]}</span><span class="bar"><i style="width:${pct ?? 0}%"></i></span><span class="pct">${pct === null ? '–' : `${pct}%`} <small>${t.n}</small></span></li>`;
  }).join('');

  const weak = Object.values(s.situations)
    .filter((x) => x.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.streak - b.streak)
    .slice(0, 6);
  el.weak.innerHTML = weak.length
    ? weak.map((x) => `<li${x.streak >= 3 ? ' class="fixed"' : ''}><span>${x.label} vs ${x.dealer}</span><span>${x.wrong}/${x.n} missed${x.streak >= 3 ? ' · fixed' : ''}</span></li>`).join('')
    : '<li class="empty">No misses yet.</li>';
}

function render() {
  const { hand, result } = state;
  el.handLabel.textContent = result ? describeHand(result.decision.info, hand.cards) : 'What do you do?';
  el.actions.innerHTML = ACTIONS.map((a) => {
    const attrs = [`data-action="${a}"`];
    if (result || !available(a)) attrs.push('disabled');
    if (result && a === result.decision.action) attrs.push('data-correct');
    if (result && a === result.action && !result.correct) attrs.push('data-wrong');
    return `<button class="action" ${attrs.join(' ')}><span>${ACTION_LABEL[a]}</span><kbd>${ACTION_KEY[a]}</kbd></button>`;
  }).join('');
  el.actions.classList.toggle('answered', !!result);
  if (result) {
    const verdict = result.correct ? `Correct: ${ACTION_LABEL[result.action]}` : `Wrong: the book says ${ACTION_LABEL[result.decision.action]}`;
    el.actions.insertAdjacentHTML('beforeend', `<div class="bar-verdict${result.correct ? '' : ' bad'}">${verdict}</div><button class="next" data-action="next">Next hand <kbd>↵</kbd></button>`);
  }
  renderFeedback();
  renderStats();
  renderChartHighlights();
}

el.actions.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  button.blur();
  if (button.dataset.action === 'next') deal();
  else answer(button.dataset.action);
});

let resetArmed = null;
el.reset.addEventListener('click', () => {
  if (resetArmed) {
    clearTimeout(resetArmed);
    resetArmed = null;
    state.stats = freshStats();
    save();
    el.reset.textContent = 'Reset stats';
    render();
    return;
  }
  el.reset.textContent = 'Click again to confirm';
  resetArmed = setTimeout(() => {
    resetArmed = null;
    el.reset.textContent = 'Reset stats';
  }, 3000);
});

load();
for (const [input, key] of [[el.optDas, 'das'], [el.optSurrender, 'surrender']]) {
  input.checked = state.settings[key];
  input.addEventListener('change', () => {
    state.settings[key] = input.checked;
    save();
    render();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY', 'A'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (state.result && (k === 'enter' || k === ' ' || k === 'n')) {
    e.preventDefault();
    deal();
    return;
  }
  const action = KEY_ACTION[k];
  if (action && !state.result) {
    e.preventDefault();
    answer(action);
  }
});

renderChart();
deal();
