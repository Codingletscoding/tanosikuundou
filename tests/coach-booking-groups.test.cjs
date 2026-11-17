const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('const groupCoachBookings ='), source.indexOf('const CoachPendingReminder =')) + '\nthis.group = groupCoachBookings;', ctx);
const group = (...args) => JSON.parse(JSON.stringify(ctx.group(...args)));
const booking = (extra = {}) => ({lineId:'family', studentId:'a', name:'王小明', status:'預約成功', bookingId:'one', ...extra});
const members = [{lineId:'family', studentId:'a', name:'王小明', nickname:'明明'}, {lineId:'family', studentId:'b', name:'王小美', nickname:'美美'}];
test('multiple courses for one student group together newest first without changing bookings', () => {
 const rows = [booking(), booking({name:'王小明 [1對2 - 場地A]', bookingId:'two', status:'審核中'})];
 const original = JSON.stringify(rows), groups = group(rows,members);
 assert.equal(groups.length,1); assert.equal(groups[0].name,'王小明'); assert.equal(groups[0].pendingCount,1);
 assert.deepEqual(groups[0].bookings.map(b=>b.bookingId),['two','one']); assert.equal(JSON.stringify(rows),original);
});
test('siblings and students with identical names never share a group', () => {
 const groups = group([booking(),booking({studentId:'b',name:'王小美'}),booking({studentId:'c'}),booking({lineId:'another'})],members);
 assert.equal(groups.length,4); assert.equal(new Set(groups.map(g=>g.key)).size,4);
 assert.equal(new Set(groups.map(g=>g.displayName)).size,4);
});
test('legacy bookings resolve only a unique roster match in the same account', () => {
 assert.equal(group([booking(),booking({studentId:'', name:'王小明 [1對1 - 場地A]'})],members).length,1);
 const ambiguous = [...members,{...members[0],studentId:'other-id'}];
 assert.equal(group([booking(),booking({studentId:''})],ambiguous).length,2);
 assert.equal(group([booking({lineId:''}),booking({lineId:'',bookingId:'two'})],members).length,2);
});
test('completed and cancelled remain hidden while partially completed monthly bookings and pending counts remain accurate', () => {
 const groups = group([booking({status:'已取消'}),booking({status:'已完課'}),booking({bookingId:'partial',monthlyCompletion:{completedDates:['2026-12-01'],remainingDates:['2026-12-08']}}),booking({bookingId:'pending',status:'審核中'})],members);
 assert.equal(groups.length,1); assert.equal(groups[0].bookings.length,2); assert.equal(groups[0].pendingCount,1);
 assert.deepEqual(group([booking({status:'已完課'})]),[]);
});
