const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const ctx = {}; vm.createContext(ctx); vm.runInContext(source.slice(source.indexOf('const doesSlotMatchDate ='), source.indexOf('const fetchAPI =')) + '\nthis.matches=doesSlotMatchDate;', ctx);
test('student calendar uses revised individual dates, removes old dates and respects the explicit year', () => {
 const slot = { date: '2026-12-01, 2027-01-05', monthlySessions: [{ date: '2026-12-01' }, { date: '2027-01-05' }] };
 assert(ctx.matches(slot, '2026-12-01')); assert(ctx.matches(slot, '2027-01-05'));
 for (const day of ['2026-01-05', '2027-12-01', '2026-12-08']) assert.equal(ctx.matches(slot, day), false);
});
