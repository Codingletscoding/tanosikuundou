const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../complete/Code.gs'), 'utf8');
function fixture(options = {}) {
  let sequence = 0, locked = false, locks = 0, failWrite = !!options.failWrite;
  const rows = {
    '可用時段': [['headers'], ['legacy', '團課', '2026-12-01 (週二)', '19:00 - 21:00', '場地', 5, 5, 300, 294, 285, 270, 264]],
    '預約名單': [['headers']], '會員資料': [['headers']], '訓練日誌': [['headers']]
  };
  const sheets = {};
  const sheet = name => !rows[name] ? null : sheets[name] ||= {
    getDataRange: () => ({getValues: () => rows[name].map(row => row.slice())}),
    appendRow: row => { assert(locked); rows[name].push(row.slice()); },
    deleteRow: index => { assert(locked); rows[name].splice(index - 1, 1); },
    getRange: (r, c) => ({
      setValue: value => { assert(locked); rows[name][r - 1][c - 1] = value; },
      setValues: values => {
        assert(locked);
        values.forEach((cells, y) => cells.forEach((value, x) => { rows[name][r + y - 1][c + x - 1] = value; }));
        if (name === '可用時段' && failWrite) { failWrite = false; throw Error('write failed after partial update'); }
      }
    })
  };
  const ss = {getSheetByName: sheet, insertSheet: name => { assert(locked); assert(!rows[name]); rows[name] = []; return sheet(name); }};
  class Clock extends Date { static now() { return Date.parse('2026-11-01T00:00:00+08:00'); } }
  const context = {
    Date: Clock, SpreadsheetApp: {getActiveSpreadsheet: () => ss, flush() {}},
    PropertiesService: {getScriptProperties: () => ({getProperty: () => 'channel'})},
    LockService: {getScriptLock: () => ({tryLock: () => { assert(!locked); locks++; if (options.busy) return false; locked = true; return true; }, releaseLock: () => { assert(locked); locked = false; }})},
    Utilities: {getUuid: () => 'uuid-' + (++sequence), formatDate: date => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10)},
    UrlFetchApp: {fetch: url => ({getResponseCode: () => 200, getContentText: () => JSON.stringify(url.includes('/verify?') ? {client_id: options.wrongChannel ? 'other' : 'channel', expires_in: options.expired ? 0 : 3600} : {userId: options.notCoach ? 'student' : 'U3a76953e63578ec8607297044ac54e5a'})})},
    ContentService: {MimeType: {JSON: 'json'}, createTextOutput: text => ({text, setMimeType() {return this;}})}
  };
  vm.createContext(context); vm.runInContext(source, context);
  const run = payload => JSON.parse(context.doPost({postData: {contents: JSON.stringify({accessToken: 'mock', ...payload})}}).text);
  const add = name => run({action: 'addTeachingCoach', name});
  const slotPayload = extra => ({action: 'addSlot', title: '團課', date: '2026-12-01 (週二)', time: '19:00 - 21:00', location: '場地', capacity: 5, prices: {1:300,2:294,3:285,4:270,5:264}, ...extra});
  const edit = extra => run({...slotPayload(), action: 'updateSlot', slotId: 'legacy', ...extra});
  return {rows, context, run, add, edit, slotPayload, state: () => ({locked, locks})};
}
test('legacy course reads need no new sheet, and disclose no unrelated custom column', () => {
  const f = fixture(); f.rows['可用時段'][0][12] = '原有自訂欄'; f.rows['可用時段'][1][12] = 'secret';
  const result = f.run({action:'getSlots'});
  assert.equal(result.status, 'success'); assert.equal(result.teachingCoachesVersion, 1);
  assert.deepEqual(result.teachingCoaches, []); assert.equal(result.slots[0].teachingCoachId, ''); assert.equal(result.slots[0].teachingCoachName, '');
  assert.equal(f.rows['授課教練'], undefined);
});
test('coach can add and rename instructors without changing account authorization or existing orders', () => {
  const f = fixture(), beforeAdmins = vm.runInContext('JSON.stringify(ADMIN_LINE_IDS)', f.context);
  const a = f.add('  王教練  '), b = f.add('佐藤');
  assert.equal(a.status, 'success'); assert.equal(a.coach.name, '王教練'); assert.notEqual(a.coach.id, b.coach.id);
  assert.deepEqual(Array.from(f.rows['授課教練'][0]), ['教練編號','教練姓名']);
  assert.equal(f.run(f.slotPayload({teachingCoachId:a.coach.id})).status, 'success');
  const id = f.rows['可用時段'][2][0];
  f.rows['預約名單'].push([0,id,'student','學生',300,'審核中']);
  const orders = JSON.stringify(f.rows['預約名單']);
  assert.equal(f.run({action:'updateTeachingCoach',teachingCoachId:a.coach.id,name:'王老師'}).status, 'success');
  const result = f.run({action:'getSlots'});
  assert.equal(result.slots.find(slot=>slot.id===id).teachingCoachName, '王老師');
  assert.equal(result.slots.find(slot=>slot.id===id).teachingCoachId, a.coach.id);
  assert.equal(JSON.stringify(f.rows['預約名單']), orders); assert.equal(vm.runInContext('JSON.stringify(ADMIN_LINE_IDS)', f.context), beforeAdmins);
  assert.equal(f.state().locked, false);
});
for (const options of [{notCoach:true},{wrongChannel:true},{expired:true},{busy:true}]) test('protected instructor writes and course creation reject ' + JSON.stringify(options), () => {
  const f = fixture(options), before = JSON.stringify(f.rows);
  for (const action of ['addTeachingCoach','updateTeachingCoach','addSlot']) assert.equal(f.run({action,name:'test',teachingCoachId:'fake'}).status,'error');
  assert.equal(JSON.stringify(f.rows),before); assert.equal(f.state().locked,false);
});
test('claimed coach IDs without access token do not grant instructor editing rights', () => {
  const f = fixture(); assert.equal(f.run({action:'addTeachingCoach',name:'teacher',lineId:'U3a76953e63578ec8607297044ac54e5a',accessToken:''}).status,'error');
  assert.equal(f.rows['授課教練'],undefined);
});
test('blank, long, formula, control characters, duplicate names and unknown IDs are rejected', () => {
  const f = fixture();
  for (const name of ['', ' ', 'a'.repeat(61), '=IMPORTXML("url")', '+formula', '王\n教練']) assert.equal(f.add(name).status,'error');
  const a = f.add('Alex').coach, b = f.add('另一位').coach;
  assert.equal(f.add(' alex ').status,'error');
  assert.equal(f.run({action:'updateTeachingCoach',teachingCoachId:b.id,name:'ALEX'}).status,'error');
  assert.equal(f.run({action:'updateTeachingCoach',teachingCoachId:'missing',name:'new'}).status,'error');
  assert.equal(f.run({action:'updateTeachingCoach',teachingCoachId:a.id,name:' Alex '}).status,'success');
});
test('existing malformed instructor sheets and duplicate IDs are preserved', () => {
  for (const rows of [[['original','custom'],['secret','data']],[['教練編號','教練姓名'],['same','王'],['same','李']]]) {
    const f=fixture();f.rows['授課教練']=rows;const before=JSON.stringify(f.rows);
    assert.equal(f.add('教練').status,'error');assert.equal(f.run({action:'getSlots'}).status,'error');assert.equal(JSON.stringify(f.rows),before);
  }
});
test('new slots require an existing instructor ID; caller-provided names are ignored', () => {
  const f=fixture(),coach=f.add('王教練').coach;
  for(const teachingCoachId of [undefined,'','missing'])assert.equal(f.run(f.slotPayload({teachingCoachId})).status,'error');
  assert.equal(f.rows['可用時段'].length,2);
  assert.equal(f.run(f.slotPayload({teachingCoachId:coach.id,teachingCoachName:'偽造姓名'})).status,'success');
  assert.equal(f.rows['可用時段'][0][12],'授課教練編號'); assert.equal(f.rows['可用時段'][2][12],coach.id);
  assert.equal(f.run({action:'getSlots'}).slots[1].teachingCoachName,'王教練');
});
test('custom column M headers or values prevent overwrites on creation and editing', () => {
  for(const header of ['', '自訂欄位']){
    const f=fixture(),coach=f.add('王').coach;
    f.rows['可用時段'][0][12]=header;f.rows['可用時段'][1][12]='existing-data';const before=JSON.stringify(f.rows['可用時段']);
    assert.equal(f.run(f.slotPayload({teachingCoachId:coach.id})).status,'error');assert.equal(f.edit({teachingCoachId:coach.id}).status,'error');
    assert.equal(JSON.stringify(f.rows['可用時段']),before);
  }
});
test('legacy slots can remain unassigned or be assigned and reassigned without changing bookings', () => {
  const f=fixture(),a=f.add('王').coach,b=f.add('李').coach;
  assert.equal(f.edit({teachingCoachId:''}).status,'success');
  f.rows['可用時段'][1][6]=3;f.rows['預約名單'].push([0,'legacy','student','學生',300,'審核中']);
  const before=JSON.stringify(f.rows['預約名單']);
  for(const id of [a.id,b.id]){assert.equal(f.edit({teachingCoachId:id}).status,'success');assert.equal(f.rows['可用時段'][1][12],id);assert.equal(f.rows['可用時段'][1][6],3);}
  assert.equal(f.edit({teachingCoachId:''}).status,'error');assert.equal(f.edit({teachingCoachId:'missing'}).status,'error');
  assert.equal(f.edit({title:'重新命名課程'}).status,'success');assert.equal(f.rows['可用時段'][1][12],b.id,'old clients preserve assigned instructor');
  assert.equal(JSON.stringify(f.rows['預約名單']),before);
});
test('a failed course write restores all original fields including its instructor', () => {
  const f=fixture({failWrite:true}),a=f.add('王').coach,b=f.add('李').coach;
  f.rows['可用時段'][0][12]='授課教練編號';f.rows['可用時段'][1][12]=a.id;
  const before=JSON.stringify(f.rows['可用時段'][1]);
  assert.equal(f.edit({teachingCoachId:b.id,title:'新課名'}).status,'error');assert.equal(JSON.stringify(f.rows['可用時段'][1]),before);assert.equal(f.state().locked,false);
});
test('single, monthly and independent private hours retain the selected instructor', () => {
  const f=fixture(),coach=f.add('王').coach;
  for(const title of ['單堂團課','[月繳4堂] 團課','[專屬教練課] 1v1:1000|1v2:1500']){
    assert.equal(f.run(f.slotPayload({title,teachingCoachId:coach.id,...(title.startsWith('[月繳')?{date:'2026年 12/1, 12/8, 12/15, 12/22'}:{}),...(title.startsWith('[專屬教練課]')?{time:'19:00 - 20:00',capacity:1}:{})})).status,'success');
  }
  assert.ok(f.run({action:'getSlots'}).slots.slice(1).every(slot=>slot.teachingCoachId===coach.id&&slot.teachingCoachName===coach.name));
});
