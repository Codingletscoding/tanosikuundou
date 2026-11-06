const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../complete/Code.gs'), 'utf8');
function fixture(options = {}) {
  let sequence=0, locked=false, failAppend=!!options.failAppend, failFlush=!!options.failFlush;
  const students=[{id:'a',name:'同名學員',nickname:'甲',age:20},{id:'b',name:'同名學員',nickname:'乙',age:22}];
  const rows={
    '會員資料':[['headers'],['account','同名學員',20,'0912345678',0,1,JSON.stringify(students)],['other','另一位',30,'0912345678',0,1,JSON.stringify([{id:'b',name:'另一位',age:30}])]],
    '可用時段':[['headers'],['live','新課程','2026-12-01','19:00 - 20:00','場地',5,5,300,294,285,270,264]],
    '預約名單':[['headers']], '訓練日誌':[['headers']]
  };
  const sheet=name=>!rows[name]?null:{
    getDataRange:()=>({getValues:()=>rows[name].map(row=>row.slice())}),
    appendRow:row=>{assert(locked);if(name==='歷史預約紀錄'&&rows[name].length&&failAppend){failAppend=false;throw Error('append failed');}rows[name].push(row.slice());},
    getRange:(r,c)=>({setValue:v=>{assert(locked);rows[name][r-1][c-1]=v;},setValues:values=>{assert(locked);values.forEach((cells,y)=>cells.forEach((v,x)=>rows[name][r+y-1][c+x-1]=v));}})
  };
  const ss={getSheetByName:sheet,insertSheet:name=>{assert(locked);rows[name]=[];return sheet(name);}};
  const now=Date.parse('2026-11-06T16:00:00+08:00');
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const context={Date:Clock,SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){if(failFlush){failFlush=false;throw Error('flush failed');}}},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(options.busy)return false;assert(!locked);locked=true;return true;},releaseLock:()=>{assert(locked);locked=false;}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'channel'})},
    UrlFetchApp:{fetch:url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:options.wrongChannel?'other':'channel',expires_in:options.expired?0:3600}:{userId:options.notCoach?'student':'U3a76953e63578ec8607297044ac54e5a'})})},
    Utilities:{getUuid:()=>`uuid-${++sequence}`,formatDate:(date,zone)=>{assert.equal(zone,'Asia/Taipei');return new Date(date.getTime()+8*3600000).toISOString().slice(0,10);}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}
  };
  vm.createContext(context);vm.runInContext(source,context);
  const run=payload=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({accessToken:'mock',...payload})}}).text);
  const payload=extra=>({action:'coachAddHistoricalBooking',lineId:'account',studentId:'b',title:'歷史團課',date:'2026-10-20',startTime:'19:00',endTime:'20:00',location:'舊場地',teachingCoachName:'舊教練',amount:'350.50',paymentStatus:'paid',bookingDate:'2026-09-30',status:'已完課',requestId:'historical-request-0001',...extra});
  const add=extra=>run(payload(extra));
  return {rows,context,run,payload,add,isLocked:()=>locked};
}
test('backfills one exact student, preserves live bookings/seats/logs, and returns completed history',()=>{
  const f=fixture(),live=JSON.stringify([f.rows['可用時段'],f.rows['預約名單'],f.rows['訓練日誌']]);
  assert.equal(f.add({name:'偽造姓名',paidPrice:1}).status,'success');
  const coach=f.run({action:'getCoachData'});
  assert.equal(coach.bookings.length,0);assert.equal(coach.historicalBookings.length,1);
  const booking=coach.historicalBookings[0];assert.equal(booking.name,'同名學員');assert.equal(booking.studentId,'b');assert.equal(booking.paidPrice,350.5);assert.equal(booking.timestamp,'2026-09-30');assert.equal(booking.recordedAt,'2026-11-06T08:00:00.000Z');
  for(const [lineId,studentId,count] of [['account','a',0],['account','b',1],['other','b',0]]){
    const stats=f.run({action:'getStudentStats',lineId,studentId});assert.equal(stats.bookingHistory.length,count);assert.equal(stats.bookings.length,0);assert.equal(stats.totalClasses,0);assert.equal(stats.logs.length,0);
  }
  assert.equal(JSON.stringify([f.rows['可用時段'],f.rows['預約名單'],f.rows['訓練日誌']]),live);assert.equal(f.isLocked(),false);
});
for(const options of [{notCoach:true},{wrongChannel:true},{expired:true},{busy:true}])test('rejects protected historical write '+JSON.stringify(options),()=>{
  const f=fixture(options),before=JSON.stringify(f.rows);assert.equal(f.add().status,'error');assert.equal(JSON.stringify(f.rows),before);assert.equal(f.isLocked(),false);
  if(!options.busy)assert.equal(f.run({action:'getHistoricalBookingOptions'}).status,'error');
});
test('requires a real token and an exact existing account/student pair, including legacy empty IDs',()=>{
  const f=fixture();for(const extra of [{accessToken:''},{studentId:'foreign'},{studentId:''},{studentId:null},{lineId:'missing'}])assert.equal(f.add(extra).status,'error');
  f.rows['會員資料'].push(['legacy','舊學員',40,'0912345678',0,1]);
  assert.equal(f.add({lineId:'legacy',studentId:''}).status,'success');
  assert.equal(f.run({action:'getStudentStats',lineId:'legacy'}).bookingHistory.length,1);
});
test('does not expose unrelated registration details in historical options or records',()=>{
  const f=fixture();const result=f.run({action:'getHistoricalBookingOptions'});
  assert.deepEqual(Object.keys(result).sort(),['historicalBookingVersion','status','teachingCoaches']);assert.equal(f.rows['歷史預約紀錄'],undefined);
  f.add();const record=f.run({action:'getStudentStats',lineId:'account',studentId:'b'}).bookingHistory[0];
  for(const key of ['phone','birthDate','injuryHistory','accessToken','requestId'])assert.equal(record[key],undefined);
});
test('rejects future, invalid, unfinished and reversed times or reservation dates',()=>{
  const f=fixture();
  for(const extra of [{date:'2026-11-07'},{date:'2026-02-30'},{date:'11/4'},{date:'1899-11-01'},{date:'2026-11-06',startTime:'15:30',endTime:'16:01'},{startTime:'20:00',endTime:'19:00'},{startTime:'19:00:00'},{endTime:'24:00'},{bookingDate:'2026-10-21'},{bookingDate:'2026-02-30'}])assert.equal(f.add(extra).status,'error',JSON.stringify(extra));
  assert.equal(f.rows['歷史預約紀錄'],undefined);
  assert.equal(f.add({date:'2026-11-06',startTime:'15:00',endTime:'16:00',bookingDate:''}).status,'success');
});
test('rejects invalid amounts, formula input, statuses, identity keys and missing fields',()=>{
  const f=fixture();
  for(const extra of [{amount:''},{amount:'-1'},{amount:'1.001'},{amount:'NaN'},{amount:'1e3'},{title:'=formula'},{location:'bad\nplace'},{teachingCoachName:'=secret'},{title:''},{paymentStatus:'unknown'},{status:'成功'},{requestId:'short'}])assert.equal(f.add(extra).status,'error',JSON.stringify(extra));
  assert.equal(f.rows['歷史預約紀錄'],undefined);
  assert.equal(f.add({amount:0,paymentStatus:'unpaid'}).status,'success');
});
test('retrying a request is idempotent, including sheet date cells, and changed payloads are rejected',()=>{
  const f=fixture(),first=f.add();assert.equal(first.created,true);
  const second=f.add();assert.equal(second.bookingId,first.bookingId);assert.equal(second.created,false);assert.equal(f.rows['歷史預約紀錄'].length,2);
  f.rows['歷史預約紀錄'][1][6]=new f.context.Date('2026-10-20T00:00:00+08:00');f.rows['歷史預約紀錄'][1][13]=new f.context.Date('2026-09-30T00:00:00+08:00');
  assert.equal(f.add().created,false);assert.equal(f.add({amount:999}).status,'error');
});
test('duplicate enrollment is prevented across separate requests and ordinary past bookings',()=>{
  const f=fixture();f.add();assert.equal(f.add({requestId:'historical-request-0002'}).status,'error');
  assert.equal(f.add({studentId:'a',requestId:'historical-request-0003'}).status,'success');
  const native=fixture();native.rows['可用時段'][1]=['old','歷史團課','2026-10-20 (週二)','19:00 - 20:00','舊場地',5,4];native.rows['預約名單'].push([0,'old','account','同名學員',350,'已完課','','native','','b']);
  assert.equal(native.add().status,'error');assert.equal(native.rows['歷史預約紀錄'],undefined);
});
test('complete history includes native completed orders while the tracking list remains unchanged',()=>{
  const f=fixture();f.rows['預約名單'].push([0,'live','account','同名學員',300,'已完課','','done','','b'],[0,'live','account','同名學員',300,'審核中','','pending','','b']);
  const result=f.run({action:'getStudentStats',lineId:'account',studentId:'b'});
  assert.equal(result.bookingHistory.length,2);assert.equal(result.bookings.length,1);assert.equal(result.bookings[0].bookingId,'pending');
});
test('an existing unrelated sheet is not overwritten',()=>{
  const f=fixture();f.rows['歷史預約紀錄']=[['my custom columns'],['existing data']];const before=JSON.stringify(f.rows);
  assert.equal(f.add().status,'error');assert.equal(JSON.stringify(f.rows),before);
});
test('append failures preserve existing data and a lost response after flush can be retried once',()=>{
  const f=fixture({failAppend:true});assert.equal(f.add().status,'error');assert.equal(f.rows['歷史預約紀錄'].length,1);assert.equal(f.isLocked(),false);assert.equal(f.add().status,'success');
  const g=fixture({failFlush:true});assert.equal(g.add().status,'error');assert.equal(g.rows['歷史預約紀錄'].length,2);assert.equal(g.add().created,false);assert.equal(g.rows['歷史預約紀錄'].length,2);assert.equal(g.isLocked(),false);
});
