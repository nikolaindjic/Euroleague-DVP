import assert from 'node:assert/strict';
import { pir, parseSheet, parseFixtures, dvp } from './app.js';

const header = ['ID', 'Name', 'Surname', 'Active', 'Position', 'Team', 'FPT', 'Quotation', 'Plus', 'Pts', 'Reb', 'Ast', 'Stl', 'Tov', 'Blk', 'Blka', 'Fd', 'Pf', 'Fg missed', 'Ft missed'];
const rows = [
  header,
  ['13369', 'Carlik', 'Jones', 1, 'Guard', 'PAR', 36.3, 13.6, 0, 20, 4, 10, 0, 0, 0, 0, 5, 1, 5, 0],
  ['2', 'Big', 'Man', 1, 'Center', 'PAR', 10, 8, 0, 6, 8, 0, 0, 1, 1, 0, 2, 3, 2, 1],
  ['3', 'Other', 'Guard', 1, 'Guard', 'DUB', 12, 9, 0, 10, 2, 2, 1, 2, 0, 0, 1, 2, 4, 0],
  ['4', 'Bench', 'Guy', 1, 'Forward', 'DUB', 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ['-', 'Coach', 'X', 1, 'Head Coach', 'DUB', 5, 5, 0, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'],
  ['Reference matchdays: 1'],
];

const { round, players } = parseSheet(rows);
assert.equal(round, 1);
assert.equal(players.length, 3, 'DNP and coach rows dropped');
assert.equal(pir(players[0]), 33);

assert.throws(() => parseSheet([header, ['Reference matchdays: 1-2']]), /single-round/);
assert.throws(() => parseFixtures('PAR-XXX', new Set(['PAR', 'DUB'])), /Unknown/);
assert.throws(() => parseFixtures('', new Set(['PAR'])), /No fixture/);

const fixtures = parseFixtures('par - dub', new Set(['PAR', 'DUB']));
const round2 = { fixtures, players: players.map(player => ({ ...player, fpt: player.fpt * 2 })) };
const rounds = { 1: { fixtures, players }, 2: round2 };

const byTeam = Object.fromEntries(dvp(rounds, 'fpt').map(row => [row.team, row]));
assert.equal(byTeam.DUB.games, 2);
assert.equal(byTeam.DUB.Guard, (36.3 + 72.6) / 2, 'DUB allowed PAR guard avg');
assert.equal(byTeam.DUB.Center, 15);
assert.equal(byTeam.PAR.Guard, 18);
assert.equal(byTeam.PAR.Forward, 0);
assert.equal(dvp(rounds, 'fpt', 1).find(row => row.team === 'DUB').Guard, 72.6, 'lastN uses latest round');
assert.equal(dvp(rounds, 'pir').find(row => row.team === 'DUB').Guard, 33);

console.log('ok');
