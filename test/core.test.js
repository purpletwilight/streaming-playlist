const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../playlist-core.js');

test('detectService', () => {
  assert.equal(C.detectService('https://www.paramountplus.com/shows/video/abc/'), 'paramount');
  assert.equal(C.detectService('https://www.disneyplus.com/play/1234'), 'disney');
  assert.equal(C.detectService('https://play.max.com/video/watch/x/y'), 'max');
  assert.equal(C.detectService('https://play.hbomax.com/video/watch/x/y'), 'max');
  assert.equal(C.detectService('https://www.peacocktv.com/watch/playback/vod/GMO_1'), 'peacock');
  assert.equal(C.detectService('https://notmax.com/'), 'other');
  assert.equal(C.detectService('garbage'), 'other');
});

test('parseDuration', () => {
  assert.equal(C.parseDuration('42'), 42 * 60);
  assert.equal(C.parseDuration('42m'), 42 * 60);
  assert.equal(C.parseDuration('1h 58m'), 118 * 60);
  assert.equal(C.parseDuration('1h58m30s'), 118 * 60 + 30);
  assert.equal(C.parseDuration('1:58:00'), 118 * 60);
  assert.equal(C.parseDuration('58:30'), 58 * 60 + 30);
  assert.equal(C.parseDuration('90s'), 90);
  assert.equal(C.parseDuration('2 hours 5 min'), 125 * 60);
  assert.ok(Number.isNaN(C.parseDuration('')));
  assert.ok(Number.isNaN(C.parseDuration('soon')));
  assert.ok(Number.isNaN(C.parseDuration('1:75')));
  assert.ok(Number.isNaN(C.parseDuration('5m banana')));
});

test('formatTime', () => {
  assert.equal(C.formatTime(0), '0:00');
  assert.equal(C.formatTime(65), '1:05');
  assert.equal(C.formatTime(3725), '1:02:05');
  assert.equal(C.formatTime(NaN), '--:--');
});

test('effectiveDuration applies skip and buffer, with a floor', () => {
  assert.equal(C.effectiveDuration({ duration: 600, skip: 60 }, 0), 540);
  assert.equal(C.effectiveDuration({ duration: 600 }, -2), 480);
  assert.equal(C.effectiveDuration({ duration: 30 }, -5), 10);
});

test('shuffledOrder is a permutation that keeps first', () => {
  const o = C.shuffledOrder(10, 3);
  assert.equal(o[0], 3);
  assert.deepEqual([...o].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual([...C.shuffledOrder(5)].sort(), [0, 1, 2, 3, 4]);
});

test('guessTitle', () => {
  assert.equal(C.guessTitle('https://www.paramountplus.com/shows/star-trek-strange-new-worlds/'), 'Star Trek Strange New Worlds');
  assert.equal(C.guessTitle('https://x.com/play/3f2a9c1e-0000-4000-8000-123456789abc'), 'Untitled video');
});

test('normalizeImport', () => {
  const items = C.normalizeImport({ items: [{ url: 'https://www.peacocktv.com/watch/x', duration: '22m', title: 'Ep' }] });
  assert.equal(items[0].service, 'peacock');
  assert.equal(items[0].duration, 1320);
  assert.equal(items[0].skip, 0);
  assert.ok(items[0].id);
  assert.throws(() => C.normalizeImport({}), /items/);
  assert.throws(() => C.normalizeImport([{ url: 'nope', duration: 5 }]), /invalid url/);
  assert.throws(() => C.normalizeImport([{ url: 'https://a.com', duration: 'x' }]), /duration/);
});
