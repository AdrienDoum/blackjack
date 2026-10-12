// Basic strategy (multi-deck) from blackjackapprenticeship.com.
// Columns follow DEALER_CARDS. H hit, S stand, D double else hit, Ds double else stand,
// Y split, N don't split, YN split only if DAS offered.
const DEALER_CARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const CHART = {
  hard: {
    17: 'S S S S S S S S S S',
    16: 'S S S S S H H H H H',
    15: 'S S S S S H H H H H',
    14: 'S S S S S H H H H H',
    13: 'S S S S S H H H H H',
    12: 'H H S S S H H H H H',
    11: 'D D D D D D D D D D',
    10: 'D D D D D D D D H H',
    9: 'H D D D D H H H H H',
    8: 'H H H H H H H H H H',
  },
  soft: {
    9: 'S S S S S S S S S S',
    8: 'S S S S Ds S S S S S',
    7: 'Ds Ds Ds Ds Ds S S H H H',
    6: 'H D D D D H H H H H',
    5: 'H H D D D H H H H H',
    4: 'H H D D D H H H H H',
    3: 'H H H D D H H H H H',
    2: 'H H H D D H H H H H',
  },
  pair: {
    A: 'Y Y Y Y Y Y Y Y Y Y',
    10: 'N N N N N N N N N N',
    9: 'Y Y Y Y Y N Y Y N N',
    8: 'Y Y Y Y Y Y Y Y Y Y',
    7: 'Y Y Y Y Y Y N N N N',
    6: 'YN Y Y Y Y N N N N N',
    5: 'N N N N N N N N N N',
    4: 'N N N YN YN N N N N N',
    3: 'YN YN Y Y Y Y N N N N',
    2: 'YN YN Y Y Y Y N N N N',
  },
};

const ROW_ORDER = {
  hard: [17, 16, 15, 14, 13, 12, 11, 10, 9, 8],
  soft: [9, 8, 7, 6, 5, 4, 3, 2],
  pair: ['A', 10, 9, 8, 7, 6, 5, 4, 3, 2],
};

const LEGEND = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double if allowed, otherwise hit',
  Ds: 'Double if allowed, otherwise stand',
  Y: 'Split the pair',
  N: "Don't split the pair",
  YN: 'Split only if DAS is offered',
};

function cardValue(rank) {
  if (rank === 'A') return 'A';
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

function handInfo(ranks) {
  const values = ranks.map(cardValue);
  const isPair = values[0] === values[1];
  const aces = values.filter((v) => v === 'A').length;
  const others = values.filter((v) => v !== 'A').reduce((a, b) => a + b, 0);
  const total = aces === 2 ? 12 : aces === 1 ? 11 + others : others;
  return {
    values,
    isPair,
    soft: aces > 0,
    total,
    pairOf: isPair ? values[0] : null,
    softCard: aces === 1 ? others : null,
  };
}

function cellOf(table, row, dealer) {
  return CHART[table][row].split(' ')[DEALER_CARDS.indexOf(dealer)];
}

// Returns { action, steps, info }. steps lists every chart cell consulted, in order.
function decide(ranks, dealer, opts) {
  const info = handInfo(ranks);
  const steps = [];

  if (info.isPair) {
    const cell = cellOf('pair', info.pairOf, dealer);
    steps.push({ table: 'pair', row: info.pairOf, cell });
    if (cell === 'Y' || (cell === 'YN' && opts.das)) return { action: 'split', steps, info };
  }

  if (info.soft) {
    const cell = cellOf('soft', info.softCard, dealer);
    steps.push({ table: 'soft', row: info.softCard, cell });
    const action = cell === 'H' ? 'hit' : cell === 'S' ? 'stand' : 'double';
    return { action, steps, info };
  }

  const row = Math.min(17, Math.max(8, info.total));
  const cell = cellOf('hard', row, dealer);
  steps.push({ table: 'hard', row, cell });
  const action = cell === 'H' ? 'hit' : cell === 'S' ? 'stand' : 'double';
  return { action, steps, info };
}
