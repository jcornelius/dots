(function () {
  'use strict';

  var STORAGE_KEY = 'sticksAndSteaks_play';

  var HOLE_CATEGORIES = [
    { id: 'skin',      name: 'Skin',            dots: 1 },
    { id: 'ctp',       name: 'Closest to Pin',  dots: 1 },
    { id: 'greenie',   name: 'Greenie',          dots: 1 },
    { id: 'barky',     name: 'Barky',            dots: 1 },
    { id: 'sandy',     name: 'Sandy',            dots: 1 },
    { id: 'poley',     name: 'Poley',            dots: 1 },
    { id: 'chippy',    name: 'Chippy',           dots: 2 },
    { id: 'birdie',    name: 'Birdie',           dots: 2 },
    { id: 'wetDream',  name: 'Wet Dream',        dots: 2 },
    { id: 'eagle',     name: 'Eagle',            dots: 3 },
    { id: 'ace',       name: 'Ace',              dots: 4 },
    { id: 'albatross', name: 'Albatross',        dots: 4 },
    { id: 'mulligan',  name: 'Mulligan',         dots: -1 },
  ];

  var NINE_CATEGORIES = [
    { id: 'lowPutts', name: 'Low Putts', dots: 2 },
    { id: 'lowGross', name: 'Low Gross', dots: 2 },
    { id: 'lowNet',   name: 'Low Net',   dots: 2 },
  ];

  var state;

  function defaultState() {
    return {
      players: [],
      dotValue: 0.25,
      rounds: [],
      screen: 'setup',
      activeRound: null,
      currentHole: 1,
    };
  }

  function load() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      state = saved ? JSON.parse(saved) : defaultState();
    } catch (e) {
      state = defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getActiveRound() {
    if (state.activeRound !== null && state.rounds[state.activeRound]) {
      return state.rounds[state.activeRound];
    }
    return null;
  }

  function initRoundDots(numHoles, numPlayers) {
    var dots = {};
    for (var h = 1; h <= numHoles; h++) {
      dots[h] = {};
      HOLE_CATEGORIES.forEach(function (cat) {
        dots[h][cat.id] = new Array(numPlayers).fill(0);
      });
    }
    return dots;
  }

  function initPer9(numPlayers) {
    var per9 = {};
    [9, 18].forEach(function (nine) {
      per9[nine] = {};
      NINE_CATEGORIES.forEach(function (cat) {
        per9[nine][cat.id] = new Array(numPlayers).fill(0);
      });
    });
    return per9;
  }

  function calcRoundTotals(round) {
    var totals = new Array(state.players.length).fill(0);
    for (var h = 1; h <= round.holes; h++) {
      if (!round.dots[h]) continue;
      HOLE_CATEGORIES.forEach(function (cat) {
        var arr = round.dots[h][cat.id];
        if (!arr) return;
        arr.forEach(function (val, pi) {
          totals[pi] += val * cat.dots;
        });
      });
    }
    var nines = round.holes === 18 ? [9, 18] : [9];
    nines.forEach(function (nine) {
      if (!round.per9 || !round.per9[nine]) return;
      NINE_CATEGORIES.forEach(function (cat) {
        var arr = round.per9[nine][cat.id];
        if (!arr) return;
        arr.forEach(function (val, pi) {
          totals[pi] += val * cat.dots;
        });
      });
    });
    return totals;
  }

  function calcCumulativeTotals(rounds) {
    var totals = new Array(state.players.length).fill(0);
    rounds.forEach(function (round) {
      var rt = calcRoundTotals(round);
      rt.forEach(function (v, i) { totals[i] += v; });
    });
    return totals;
  }

  function calcSettlement(totals, dotValue) {
    var n = totals.length;
    return totals.map(function (t, i) {
      var net = 0;
      for (var j = 0; j < n; j++) {
        if (i !== j) net += (t - totals[j]) * dotValue;
      }
      return net;
    });
  }

  function calcPairwise(totals, dotValue) {
    var pairs = [];
    for (var i = 0; i < totals.length; i++) {
      for (var j = i + 1; j < totals.length; j++) {
        var diff = totals[i] - totals[j];
        if (diff !== 0) {
          pairs.push({
            from: diff < 0 ? i : j,
            to: diff < 0 ? j : i,
            amount: Math.abs(diff) * dotValue,
          });
        }
      }
    }
    pairs.sort(function (a, b) { return b.amount - a.amount; });
    return pairs;
  }

  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function dotPips(n) {
    if (n > 0) return Array(n).fill('<span class="pip"></span>').join('');
    if (n < 0) return '<span class="pip pip--neg"></span>';
    return '';
  }

  // ── Rendering ─────────────────────────────────────────────

  function app() { return document.getElementById('play-app'); }

  function render() {
    switch (state.screen) {
      case 'setup':   renderSetup(); break;
      case 'play':    renderPlay(); break;
      case 'summary': renderSummary(); break;
    }
    save();
  }

  // ── Setup Screen ──────────────────────────────────────────

  function renderSetup() {
    var completedRounds = state.rounds.filter(function (r) { return r.completed; });
    var activeRound = state.rounds.find(function (r) { return !r.completed; });

    var playersHtml = state.players.map(function (p, i) {
      return '<div class="player-item">' +
        '<span class="player-name">' + esc(p) + '</span>' +
        '<button class="player-remove" data-index="' + i + '" aria-label="Remove ' + esc(p) + '">&times;</button>' +
        '</div>';
    }).join('');

    var dotOptions = [0.25, 0.50, 1.00].map(function (v) {
      var isActive = state.dotValue === v;
      return '<button class="setup-option ' +
        (isActive ? 'setup-option--active' : '') +
        '" data-value="' + v + '" aria-pressed="' + isActive + '">$' + v.toFixed(2) + '</button>';
    }).join('');

    var roundsHtml = '';
    if (completedRounds.length > 0) {
      var roundItems = completedRounds.map(function (r, i) {
        var totals = calcRoundTotals(r);
        var maxDots = Math.max.apply(null, totals);
        var leader = state.players[totals.indexOf(maxDots)];
        return '<div class="round-item">' +
          '<span>Round ' + (i + 1) + ' (' + r.holes + ' holes)</span>' +
          '<span class="round-leader">' + esc(leader) + ' &mdash; ' + maxDots + ' dots</span>' +
          '</div>';
      }).join('');

      roundsHtml = '<div class="setup-section">' +
        '<h3 class="setup-label">Completed Rounds</h3>' +
        '<div class="rounds-list">' + roundItems + '</div>' +
        '<div class="setup-actions" style="margin-top:1rem">' +
        '<button class="btn btn-primary" id="view-summary-btn">View Summary</button>' +
        '<button class="btn btn-danger" id="reset-btn">Reset All</button>' +
        '</div></div>';
    }

    var resumeHtml = '';
    if (activeRound) {
      resumeHtml = '<div class="setup-section">' +
        '<div class="setup-actions">' +
        '<button class="btn btn-primary" id="resume-btn">Resume Round</button>' +
        '<button class="btn btn-danger" id="reset-btn">Reset All</button>' +
        '</div></div>';
    }

    app().innerHTML =
      '<div class="play-setup">' +
      '<div class="setup-section">' +
      '<h3 class="setup-label" id="players-label">Players</h3>' +
      '<div class="player-list" role="list" aria-labelledby="players-label">' + playersHtml + '</div>' +
      '<div class="player-add-row">' +
      '<label for="player-input" class="sr-only">Player name</label>' +
      '<input type="text" id="player-input" class="player-input" placeholder="Player name" maxlength="20" autocomplete="off">' +
      '<button class="btn btn-small" id="add-player-btn">Add</button>' +
      '</div></div>' +
      '<div class="setup-section">' +
      '<h3 class="setup-label" id="dot-value-label">Dot Value</h3>' +
      '<div class="setup-options" id="dot-value-options" role="group" aria-labelledby="dot-value-label">' + dotOptions + '</div>' +
      '</div>' +
      (activeRound ? '' :
        '<div class="setup-section">' +
        '<h3 class="setup-label">Start a Round</h3>' +
        '<div class="setup-options" id="hole-options">' +
        '<button class="setup-option setup-option--wide" data-holes="9">9 Holes</button>' +
        '<button class="setup-option setup-option--wide" data-holes="18">18 Holes</button>' +
        '</div></div>') +
      resumeHtml +
      roundsHtml +
      '</div>';

    bindSetupEvents();
  }

  function bindSetupEvents() {
    var input = document.getElementById('player-input');
    var addBtn = document.getElementById('add-player-btn');

    function addPlayer() {
      var name = input.value.trim();
      if (name && state.players.indexOf(name) === -1) {
        state.players.push(name);
        render();
        setTimeout(function () {
          var inp = document.getElementById('player-input');
          if (inp) inp.focus();
        }, 0);
      }
    }

    if (addBtn) addBtn.addEventListener('click', addPlayer);
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addPlayer();
    });

    document.querySelectorAll('.player-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.players.splice(parseInt(btn.dataset.index), 1);
        render();
      });
    });

    document.querySelectorAll('#dot-value-options .setup-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.dotValue = parseFloat(btn.dataset.value);
        render();
      });
    });

    document.querySelectorAll('#hole-options .setup-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (state.players.length < 2) return;
        var holes = parseInt(btn.dataset.holes);
        var round = {
          id: Date.now().toString(),
          holes: holes,
          dots: initRoundDots(holes, state.players.length),
          per9: initPer9(state.players.length),
          completed: false,
        };
        state.rounds.push(round);
        state.activeRound = state.rounds.length - 1;
        state.currentHole = 1;
        state.screen = 'play';
        render();
      });
    });

    var resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', function () {
      var idx = state.rounds.findIndex(function (r) { return !r.completed; });
      if (idx >= 0) {
        state.activeRound = idx;
        state.screen = 'play';
        render();
      }
    });

    var summaryBtn = document.getElementById('view-summary-btn');
    if (summaryBtn) summaryBtn.addEventListener('click', function () {
      state.screen = 'summary';
      state.activeRound = null;
      render();
    });

    var resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (confirm('Reset all rounds and start fresh?')) {
        var players = state.players.slice();
        var dotValue = state.dotValue;
        state = defaultState();
        state.players = players;
        state.dotValue = dotValue;
        render();
      }
    });
  }

  // ── Play Screen ───────────────────────────────────────────

  function renderPlay() {
    var round = getActiveRound();
    if (!round) { state.screen = 'setup'; render(); return; }

    var hole = state.currentHole;
    var isLast = hole === round.holes;
    var showPer9 = (hole === 9) || (hole === round.holes && round.holes === 18);
    var nineGroup = hole <= 9 ? 9 : 18;

    // Build category rows
    var categories = HOLE_CATEGORIES.slice();
    if (showPer9) {
      categories.push({ id: '_divider', name: 'Per 9 Awards', dots: 0, isDivider: true });
      NINE_CATEGORIES.forEach(function (c) {
        categories.push({ id: c.id, name: c.name, dots: c.dots, isPer9: true, nineGroup: nineGroup });
      });
    }

    var playerHeaders = state.players.map(function (p) {
      return '<th class="play-matrix-player">' + esc(p) + '</th>';
    }).join('');

    var rows = categories.map(function (cat) {
      if (cat.isDivider) {
        return '<tr class="play-matrix-divider"><td colspan="' + (state.players.length + 1) + '">' + cat.name + '</td></tr>';
      }

      var cells = state.players.map(function (p, pi) {
        var val;
        if (cat.isPer9) {
          val = (round.per9[cat.nineGroup] && round.per9[cat.nineGroup][cat.id] && round.per9[cat.nineGroup][cat.id][pi]) || 0;
        } else {
          val = (round.dots[hole] && round.dots[hole][cat.id] && round.dots[hole][cat.id][pi]) || 0;
        }
        return '<td class="play-matrix-cell ' + (val ? 'play-matrix-cell--active' : '') + '" ' +
          'role="checkbox" aria-checked="' + (val ? 'true' : 'false') + '" ' +
          'aria-label="' + esc(cat.name) + ' for ' + esc(p) + '" tabindex="0" ' +
          'data-player="' + pi + '" data-cat="' + cat.id + '"' +
          (cat.isPer9 ? ' data-per9="' + cat.nineGroup + '"' : '') + '>' +
          '</td>';
      }).join('');

      return '<tr>' +
        '<td class="play-matrix-cat">' +
        '<div class="play-matrix-cat-inner">' +
        '<span class="cat-pips">' + dotPips(cat.dots) + '</span>' +
        '<span class="cat-name">' + cat.name + '</span>' +
        '</div></td>' + cells + '</tr>';
    }).join('');

    // Running totals
    var roundTotals = calcRoundTotals(round);
    var totalsHtml = state.players.map(function (p, pi) {
      return '<div class="hpt">' +
        '<span class="hpt-name">' + esc(p) + '</span>' +
        '<span class="hpt-dots">' + roundTotals[pi] + '</span>' +
        '</div>';
    }).join('');

    // Progress dots
    var progressHtml = '';
    for (var h = 1; h <= round.holes; h++) {
      var hasData = false;
      if (round.dots[h]) {
        HOLE_CATEGORIES.some(function (cat) {
          var arr = round.dots[h][cat.id];
          if (arr && arr.some(function (v) { return v > 0; })) { hasData = true; return true; }
        });
      }
      var dotLabel = 'Go to hole ' + h;
      if (h === hole) dotLabel = 'Hole ' + h + ' (current)';
      progressHtml += '<button class="progress-dot ' +
        (h === hole ? 'progress-dot--current' : '') +
        (hasData ? ' progress-dot--filled' : '') +
        '" aria-label="' + dotLabel + '"' +
        (h === hole ? ' aria-current="step"' : '') +
        '>' + h + '</button>';
    }

    app().innerHTML =
      '<div class="play-round">' +
      '<div class="play-hole-header">' +
      '<button class="play-nav-btn ' + (hole === 1 ? 'play-nav-btn--disabled' : '') + '" id="prev-hole" aria-label="Previous hole"' + (hole === 1 ? ' aria-disabled="true"' : '') + '>&larr;</button>' +
      '<div class="play-hole-title">' +
      '<span class="play-hole-num">Hole ' + hole + '</span>' +
      '<span class="play-hole-of">of ' + round.holes + '</span>' +
      '</div>' +
      '<button class="play-nav-btn ' + (isLast ? 'play-nav-btn--disabled' : '') + '" id="next-hole" aria-label="Next hole"' + (isLast ? ' aria-disabled="true"' : '') + '>&rarr;</button>' +
      '</div>' +
      '<div class="play-progress" role="navigation" aria-label="Hole navigation">' + progressHtml + '</div>' +
      '<div class="play-matrix-wrap">' +
      '<table class="play-matrix">' +
      '<thead><tr><th class="play-matrix-corner"></th>' + playerHeaders + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
      '<div class="play-running-totals">' + totalsHtml + '</div>' +
      '<div class="play-actions">' +
      '<button class="btn btn-secondary" id="back-setup-btn">Back</button>' +
      '<button class="btn btn-primary" id="finish-round-btn">' + (isLast ? 'Finish Round' : 'Finish Early') + '</button>' +
      '</div></div>';

    bindPlayEvents(round);
  }

  function bindPlayEvents(round) {
    document.getElementById('prev-hole').addEventListener('click', function () {
      if (state.currentHole > 1) { state.currentHole--; render(); }
    });

    document.getElementById('next-hole').addEventListener('click', function () {
      if (state.currentHole < round.holes) { state.currentHole++; render(); }
    });

    // Progress dot tap to jump
    document.querySelectorAll('.progress-dot').forEach(function (dot) {
      dot.addEventListener('click', function () {
        state.currentHole = parseInt(dot.textContent.trim());
        render();
      });
    });

    // Matrix cell toggle
    function toggleCell(cell) {
      var pi = parseInt(cell.dataset.player);
      var catId = cell.dataset.cat;
      var per9 = cell.dataset.per9;

      if (per9) {
        var nine = parseInt(per9);
        if (!round.per9[nine]) round.per9[nine] = {};
        if (!round.per9[nine][catId]) round.per9[nine][catId] = new Array(state.players.length).fill(0);
        round.per9[nine][catId][pi] = round.per9[nine][catId][pi] ? 0 : 1;
      } else {
        var hole = state.currentHole;
        if (!round.dots[hole]) round.dots[hole] = {};
        if (!round.dots[hole][catId]) round.dots[hole][catId] = new Array(state.players.length).fill(0);
        round.dots[hole][catId][pi] = round.dots[hole][catId][pi] ? 0 : 1;
      }
      render();
    }

    document.querySelectorAll('.play-matrix-cell').forEach(function (cell) {
      cell.addEventListener('click', function () { toggleCell(cell); });
      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCell(cell);
        }
      });
    });

    document.getElementById('back-setup-btn').addEventListener('click', function () {
      state.screen = 'setup';
      render();
    });

    document.getElementById('finish-round-btn').addEventListener('click', function () {
      round.completed = true;
      state.screen = 'summary';
      render();
    });

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyNav);
  }

  function handleKeyNav(e) {
    if (state.screen !== 'play') {
      document.removeEventListener('keydown', handleKeyNav);
      return;
    }
    var round = getActiveRound();
    if (!round) return;
    if (e.key === 'ArrowLeft' && state.currentHole > 1) { state.currentHole--; render(); }
    if (e.key === 'ArrowRight' && state.currentHole < round.holes) { state.currentHole++; render(); }
  }

  // ── Summary Screen ────────────────────────────────────────

  function renderSummary() {
    var completedRounds = state.rounds.filter(function (r) { return r.completed; });
    if (completedRounds.length === 0) { state.screen = 'setup'; render(); return; }

    var totals = calcCumulativeTotals(completedRounds);
    var nets = calcSettlement(totals, state.dotValue);
    var pairs = calcPairwise(totals, state.dotValue);

    // Per-round breakdown
    var roundBreakdownHtml = completedRounds.map(function (r, ri) {
      var rt = calcRoundTotals(r);
      var cells = state.players.map(function (p, pi) {
        return '<td class="st-dots">' + rt[pi] + '</td>';
      }).join('');
      return '<tr><td class="st-player">Round ' + (ri + 1) + ' (' + r.holes + ')</td>' + cells + '</tr>';
    }).join('');

    var playerHeaders = state.players.map(function (p) {
      return '<th>' + esc(p) + '</th>';
    }).join('');

    var totalCells = state.players.map(function (p, i) {
      return '<td class="st-dots st-dots--total">' + totals[i] + '</td>';
    }).join('');

    var netCells = state.players.map(function (p, i) {
      var cls = nets[i] > 0 ? 'st-net--pos' : nets[i] < 0 ? 'st-net--neg' : '';
      return '<td class="st-net ' + cls + '">' +
        (nets[i] > 0 ? '+' : '') + '$' + nets[i].toFixed(2) + '</td>';
    }).join('');

    var pairsHtml = pairs.length > 0
      ? pairs.map(function (p) {
          return '<div class="pair-item">' +
            '<span class="pair-from">' + esc(state.players[p.from]) + '</span>' +
            '<span class="pair-arrow">pays</span>' +
            '<span class="pair-to">' + esc(state.players[p.to]) + '</span>' +
            '<span class="pair-amount">$' + p.amount.toFixed(2) + '</span>' +
            '</div>';
        }).join('')
      : '<p class="summary-tied">All tied up!</p>';

    app().innerHTML =
      '<div class="play-summary">' +
      '<h2 class="summary-title">Settlement</h2>' +
      '<p class="summary-subtitle">' + completedRounds.length + ' round' +
      (completedRounds.length > 1 ? 's' : '') + ' &middot; $' + state.dotValue.toFixed(2) + '/dot</p>' +
      '<div class="summary-table-wrap">' +
      '<table class="summary-table">' +
      '<thead><tr><th></th>' + playerHeaders + '</tr></thead>' +
      '<tbody>' + roundBreakdownHtml +
      '<tr class="st-total-row"><td class="st-player">Total</td>' + totalCells + '</tr>' +
      '<tr class="st-net-row"><td class="st-player">Net</td>' + netCells + '</tr>' +
      '</tbody></table></div>' +
      '<div class="summary-pairs">' +
      '<h3 class="summary-pairs-title">Who Pays Whom</h3>' +
      pairsHtml + '</div>' +
      '<div class="play-actions">' +
      '<button class="btn btn-primary" id="new-round-btn">New Round</button>' +
      '<button class="btn btn-secondary" id="back-setup-btn">Setup</button>' +
      '</div></div>';

    document.getElementById('new-round-btn').addEventListener('click', function () {
      state.screen = 'setup';
      state.activeRound = null;
      render();
    });

    document.getElementById('back-setup-btn').addEventListener('click', function () {
      state.screen = 'setup';
      state.activeRound = null;
      render();
    });
  }

  // ── Init ──────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    load();
    render();
  });
})();
