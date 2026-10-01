export const POSITIONS = ['Guard', 'Forward', 'Center'];
export const STATS = ['fpt', 'pir', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fd'];
const STAT_LABELS = { fpt: 'FPT', pir: 'PIR', pts: 'Pts', reb: 'Reb', ast: 'Ast', stl: 'Stl', blk: 'Blk', tov: 'Tov', fd: 'Fouls drawn' };
const COLUMNS = {
  id: 'ID', first: 'Name', last: 'Surname', pos: 'Position', team: 'Team', fpt: 'FPT', price: 'Quotation',
  pts: 'Pts', reb: 'Reb', ast: 'Ast', stl: 'Stl', tov: 'Tov', blk: 'Blk', blka: 'Blka', fd: 'Fd', pf: 'Pf',
  fgm: 'Fg missed', ftm: 'Ft missed',
};
const BOX = ['pts', 'reb', 'ast', 'stl', 'tov', 'blk', 'blka', 'fd', 'pf', 'fgm', 'ftm'];

export function pir(p) {
  return p.pts + p.reb + p.ast + p.stl + p.blk + p.fd - (p.fgm + p.ftm + p.tov + p.blka + p.pf);
}

export function parseSheet(rows) {
  const header = rows[0].map(cell => String(cell).trim());
  const index = {};
  for (const [key, name] of Object.entries(COLUMNS)) {
    index[key] = header.indexOf(name);
    if (index[key] < 0) throw new Error(`Missing column "${name}"`);
  }

  const footer = rows.map(row => String(row[0] ?? '')).find(text => text.startsWith('Reference matchdays'));
  const roundMatch = footer?.match(/Reference matchdays:\s*(\d+)\s*$/);
  if (!roundMatch) throw new Error(`Expected a single-round footer like "Reference matchdays: 1", got "${footer ?? 'nothing'}"`);

  const number = value => Number(value) || 0;
  const players = [];
  for (const row of rows.slice(1)) {
    const pos = row[index.pos];
    if (!POSITIONS.includes(pos)) continue;
    const player = {
      id: String(row[index.id]),
      name: `${row[index.first]} ${row[index.last]}`.trim(),
      pos,
      team: String(row[index.team]).trim(),
      fpt: number(row[index.fpt]),
      price: number(row[index.price]),
    };
    for (const stat of BOX) player[stat] = number(row[index[stat]]);
    if (BOX.every(stat => player[stat] === 0)) continue;
    players.push(player);
  }
  return { round: Number(roundMatch[1]), players };
}

export function parseFixtures(text, teams) {
  const fixtures = text.split('\n').map(line => line.trim()).filter(Boolean)
    .map(line => line.toUpperCase().split(/[^A-Z]+/).filter(Boolean));
  const seen = new Set();
  for (const fixture of fixtures) {
    if (fixture.length !== 2) throw new Error(`Bad line "${fixture.join(' ')}", use HOME-AWAY`);
    for (const team of fixture) {
      if (!teams.has(team)) throw new Error(`Unknown team ${team}`);
      if (seen.has(team)) throw new Error(`${team} listed twice`);
      seen.add(team);
    }
  }
  const missing = [...teams].filter(team => !seen.has(team));
  if (missing.length) throw new Error(`No fixture for ${missing.join(', ')}`);
  return fixtures;
}

export function dvp(rounds, stat, lastN = 0) {
  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const used = lastN ? roundNumbers.slice(-lastN) : roundNumbers;
  const value = player => (stat === 'pir' ? pir(player) : player[stat]);
  const table = {};

  for (const roundNumber of used) {
    const { fixtures, players } = rounds[roundNumber];
    for (const [home, away] of fixtures) {
      for (const [defender, attacker] of [[home, away], [away, home]]) {
        const row = (table[defender] ??= { team: defender, games: 0, Guard: 0, Forward: 0, Center: 0 });
        row.games++;
        for (const player of players) if (player.team === attacker) row[player.pos] += value(player);
      }
    }
  }

  return Object.values(table).map(row => {
    for (const pos of POSITIONS) row[pos] = row[pos] / row.games;
    return row;
  });
}

// ---- browser UI ----
if (typeof document !== 'undefined') {
  const STORAGE_KEY = 'el-dvp-data';
  const $ = id => document.getElementById(id);
  let data = { rounds: {} };
  let pending = null;
  let sort = { key: 'team', dir: 1 };

  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {} };
  const notice = text => { $('notice').textContent = text; };

  async function load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch {}
    try {
      const response = await fetch('data.json', { cache: 'no-store' });
      data = await response.json();
    } catch {
      notice('Could not load data.json (opened as a file?). Using browser copy.');
    }
    if (local && Object.keys(local.rounds).length > Object.keys(data.rounds).length) {
      data = local;
      notice('Showing unsaved imports from this browser. Download data.json to keep them.');
    }
    render();
  }

  function render() {
    const roundNumbers = Object.keys(data.rounds).sort((a, b) => a - b);
    $('rounds').textContent = roundNumbers.length ? `Rounds: ${roundNumbers.join(', ')}` : 'No rounds imported yet';

    const stat = $('stat').value;
    const rows = dvp(data.rounds, stat, Number($('lastN').value));
    const averages = {}, ranks = {};
    for (const pos of POSITIONS) {
      averages[pos] = rows.reduce((sum, row) => sum + row[pos], 0) / (rows.length || 1);
      [...rows].sort((a, b) => b[pos] - a[pos]).forEach((row, i) => { (ranks[row.team] ??= {})[pos] = i + 1; });
    }
    rows.sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir);

    $('thead').innerHTML = `<tr>${['team', 'games', ...POSITIONS].map(key =>
      `<th data-key="${key}" aria-sort="${sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">
        <button type="button">${{ team: 'Team', games: 'GP' }[key] ?? `${STAT_LABELS[$('stat').value]}/game vs ${key}`}${sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr>`;
    $('tbody').innerHTML = rows.map(row => `<tr><th scope="row">${row.team}</th><td>${row.games}</td>${POSITIONS.map(pos => {
      const delta = averages[pos] ? (row[pos] - averages[pos]) / Math.abs(averages[pos]) : 0;
      const strength = Math.min(Math.abs(delta) * 2, 1) * 0.55;
      const color = delta >= 0 ? `rgba(34,160,90,${strength})` : `rgba(220,60,60,${strength})`;
      return `<td style="background:${color}" title="${(delta * 100).toFixed(0)}% vs league avg">${row[pos].toFixed(1)} <small>#${ranks[row.team][pos]}</small></td>`;
    }).join('')}</tr>`).join('');
    $('avg').textContent = rows.length
      ? `League avg ${STAT_LABELS[stat]} allowed: ${POSITIONS.map(pos => `${pos} ${averages[pos].toFixed(1)}`).join(' · ')}`
      : '';
  }

  $('stat').innerHTML = STATS.map(stat => `<option value="${stat}">${STAT_LABELS[stat]}</option>`).join('');
  $('stat').onchange = render;
  $('lastN').onchange = render;
  $('thead').onclick = event => {
    const key = event.target.closest('th')?.dataset.key;
    if (!key) return;
    sort = { key, dir: sort.key === key ? -sort.dir : (key === 'team' ? 1 : -1) };
    render();
  };

  $('file').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
      pending = parseSheet(rows);
      const teams = [...new Set(pending.players.map(player => player.team))].sort();
      $('importInfo').textContent = `Round ${pending.round}: ${pending.players.length} players who played, ${teams.length} teams (${teams.join(' ')})`;
      $('fixtures').value = data.rounds[pending.round]?.fixtures.map(pair => pair.join('-')).join('\n') ?? '';
      $('importError').textContent = '';
    } catch (error) {
      pending = null;
      $('importError').textContent = error.message;
    }
  };

  $('importBtn').onclick = () => {
    if (!pending) return void ($('importError').textContent = 'Choose an Excel file first');
    try {
      const fixtures = parseFixtures($('fixtures').value, new Set(pending.players.map(player => player.team)));
      if (data.rounds[pending.round] && !confirm(`Round ${pending.round} already exists. Replace it?`)) return;
      data.rounds[pending.round] = { fixtures, players: pending.players };
      save();
      notice(`Round ${pending.round} imported. Download data.json and commit it to publish.`);
      $('importError').textContent = '';
      render();
    } catch (error) {
      $('importError').textContent = error.message;
    }
  };

  $('download').onclick = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    link.download = 'data.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  load();
}
