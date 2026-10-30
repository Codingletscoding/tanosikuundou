const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const full=fs.readFileSync(path.join(__dirname,'../complete/Code.gs'),'utf8').replace('U3a76953e63578ec8607297044ac54e5a','coach');
const helper=fs.readFileSync(path.join(__dirname,'../MonthlyLeave.gs'),'utf8');
const now=Date.parse('2026-11-01T10:00:00+08:00');
function fixture(options={}){
 let count=0,locked=false,failLeave=!!options.leaveWriteError;
 const rows={
  '會員資料':[['id','name'],['student','學生']],
  '訓練日誌':[['headers']],
  '預約名單':[['headers'],[new Date('2026-10-01'), 'monthly','student','學生',1200,options.status||'預約成功','','original']],
  '可用時段':[['headers'],['monthly',options.nonMonthly?'單堂團課':'[月繳3堂] 初階團課','2026年 11/15, 11/22, 11/29 (週日)','10:00 - 12:00','場地',5,3,300,294],['target',options.targetTitle||'補課團課',options.targetDate||'2026-11-16 (週一)','10:00 - 12:00','補課場地',5,options.remaining??1,300,294]]
 };
 if(!options.noLeaveSheet)rows['請假補課']=[['headers']];
 const sheets={};
 function sheet(name){
  if(!rows[name])return null;
  return sheets[name]||(sheets[name]={
   getDataRange:()=>({getValues:()=>rows[name].map(r=>r.slice())}),
   appendRow:r=>{assert(locked,'writes hold shared lock');if(name==='預約名單'&&options.appendError)throw Error('append');rows[name].push(r.slice());},
   deleteRow:i=>{assert(locked);rows[name].splice(i-1,1);},
   getRange:(r,c,h=1,w=1)=>({setValue:v=>{assert(locked);rows[name][r-1][c-1]=v;},setValues:values=>{assert(locked);if(name==='請假補課'&&failLeave){failLeave=false;throw Error('leave write');}for(let y=0;y<h;y++)for(let x=0;x<w;x++)rows[name][r+y-1][c+x-1]=values[y][x];}})
  });
 }
 const ss={getSheetByName:sheet,insertSheet:name=>{rows[name]=[];return sheet(name);}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now+(options.clockOffset||0);}}
 const ctx={Date:Clock,console,SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}},
  LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true;},releaseLock:()=>{locked=false;}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'channel'})},
  UrlFetchApp:{fetch:url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:'channel',expires_in:3600}:{userId:options.notCoach?'student':'coach'})})},
  Utilities:{getUuid:()=> 'uuid-'+(++count),formatDate:(date,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}
 };
 vm.createContext(ctx);vm.runInContext(full+'\n'+helper+'\n'+fs.readFileSync(path.join(__dirname,'../CoachManagement.gs'),'utf8'),ctx);
 const run=payload=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({accessToken:'mock-token',...payload})}}).text);
 const register=(extra={})=>run({action:'registerMonthlyLeave',bookingId:'original',originalDate:'2026-11-15',reason:'家庭活動',...extra});
 const arrange=(extra={})=>run({action:'arrangeMonthlyMakeup',leaveId:'uuid-1',slotId:'target',...extra});
 return {rows,run,register,arrange,isLocked:()=>locked};
}
test('exactly 14 days notice accepted; duplicate blocked; monthly capacity stays reserved',()=>{
 const f=fixture();assert.equal(f.register().status,'success');assert.equal(f.rows['請假補課'].length,2);
 assert.equal(f.rows['可用時段'][1][6],3);assert.equal(f.rows['預約名單'].length,2);
 assert.equal(f.register().status,'error');assert.equal(f.rows['請假補課'].length,2);assert.equal(f.isLocked(),false);
});
test('one millisecond inside the 14 day cutoff is rejected',()=>{
 const f=fixture({clockOffset:1});assert.equal(f.register().status,'error');assert.equal(f.rows['請假補課'].length,1);
});
for(const [label,options,extra] of [
 ['non-coach',{notCoach:true},{}],['non-monthly',{nonMonthly:true},{}],['pending',{status:'審核中'},{}],['completed',{status:'已完課'},{}],
 ['not in schedule',{}, {originalDate:'2026-11-16'}],['wrong year',{}, {originalDate:'2027-11-15'}],['invalid date',{}, {originalDate:'2026-11-31'}],['empty reason',{}, {reason:' '}]
])test('rejects '+label,()=>{const f=fixture(options);assert.equal(f.register(extra).status,'error');assert.equal(f.rows['請假補課'].length,1);});
test('first valid registration creates the ledger with headers',()=>{const f=fixture({noLeaveSheet:true});assert.equal(f.register().status,'success');assert.equal(f.rows['請假補課'][0][0],'編號');});
test('makeup creates one approved no-charge booking, links ledger, uses last seat, blocks repeat',()=>{
 const f=fixture();f.register();assert.equal(f.arrange().status,'success');
 const b=f.rows['預約名單'][2];assert.equal(b[1],'target');assert.equal(b[2],'student');assert.equal(b[4],0);assert.equal(b[5],'預約成功');assert.equal(b[8],'uuid-1');
 assert.equal(f.rows['可用時段'][2][6],0);assert.equal(f.rows['可用時段'][1][6],3);assert.equal(f.rows['請假補課'][1][9],'已安排');
 assert.equal(f.arrange().status,'error');assert.equal(f.rows['預約名單'].length,3);
 const stats=f.run({action:'getStudentStats',lineId:'student'});assert.equal(stats.monthlyLeaves[0].makeupBookingId,b[7]);
 assert(stats.bookings.some(row=>row.bookingId===b[7]));
});
for(const [label,options] of [['full',{remaining:0}],['past',{targetDate:'2026-10-31'}],['same leave day',{targetDate:'2026-11-15'}],['monthly target',{targetTitle:'[月繳3堂] 團課'}],['private target',{targetTitle:'[專屬教練課] 1v1:1000'}]]){
 test('rejects makeup '+label,()=>{const f=fixture(options);f.register();assert.equal(f.arrange().status,'error');assert.equal(f.rows['預約名單'].length,2);assert.equal(f.rows['請假補課'][1][9],'待補課');});
}
test('prevents duplicate student enrollment in the target',()=>{const f=fixture();f.register();f.rows['預約名單'].push([0,'target','student','學生',300,'預約成功','','other']);assert.equal(f.arrange().status,'error');assert.equal(f.rows['可用時段'][2][6],1);});
for(const option of ['appendError','leaveWriteError'])test('rolls back makeup when '+option,()=>{
 const f=fixture({[option]:true});f.register();assert.equal(f.arrange().status,'error');
 assert.equal(f.rows['預約名單'].length,2);assert.equal(f.rows['可用時段'][2][6],1);assert.equal(f.rows['請假補課'][1][9],'待補課');
});
test('linked source and makeup bookings cannot be deleted and lose their tracking',()=>{
 const f=fixture();f.register();assert.equal(f.run({action:'deleteBooking',bookingId:'original'}).status,'error');f.arrange();
 assert.equal(f.run({action:'deleteBooking',bookingId:f.rows['預約名單'][2][7]}).status,'error');
});
test('normal booking cannot take a seat already consumed by makeup',()=>{
 const f=fixture();f.register();f.arrange();assert.equal(f.run({action:'bookClass',slotId:'target',lineId:'another'}).status,'error');assert.equal(f.rows['預約名單'].length,3);
});
test('student view contains only their own leave records',()=>{
 const f=fixture();f.register();const other=f.run({action:'getStudentStats',lineId:'another'});assert.deepEqual(other.monthlyLeaves,[]);
});
test('coach ledger read is authenticated and returns latest assignment',()=>{
 const f=fixture();f.register();f.arrange();const result=f.run({action:'getMonthlyLeaves'});assert.equal(result.status,'success');assert.equal(result.leaves[0].status,'已安排');
 const denied=fixture({notCoach:true});assert.equal(denied.run({action:'getMonthlyLeaves'}).status,'error');
});

test('existing leave credit remains usable after original monthly order is completed',()=>{
 const f=fixture();f.register();f.rows['預約名單'][1][5]='已完課';
 assert.equal(f.arrange().status,'success');assert.equal(f.rows['請假補課'][1][9],'已安排');
});

test('does not overwrite an existing custom booking column',()=>{
 const f=fixture();f.register();f.rows['預約名單'][0][8]='其他用途';
 assert.equal(f.arrange().status,'error');assert.equal(f.rows['可用時段'][2][6],1);
 assert.equal(f.rows['預約名單'].length,2);
});

for (const status of ['審核中','預約成功']) test('cancel '+status+' keeps row and restores seat once',()=>{
 const f=fixture({status});assert.equal(f.run({action:'cancelBooking',bookingId:'original'}).status,'success');
 assert.equal(f.rows['預約名單'].length,2);assert.equal(f.rows['預約名單'][1][5],'已取消');assert.equal(f.rows['可用時段'][1][6],4);
 assert.equal(f.run({action:'cancelBooking',bookingId:'original'}).status,'error');assert.equal(f.rows['可用時段'][1][6],4);
 for(const action of ['approveBooking','updatePayment','addLog'])assert.equal(f.run({action,bookingId:'original'}).status,'error');
});
test('cannot cancel completed or linked orders',()=>{
 const completed=fixture({status:'已完課'});assert.equal(completed.run({action:'cancelBooking',bookingId:'original'}).status,'error');
 const linked=fixture();linked.register();assert.equal(linked.run({action:'cancelBooking',bookingId:'original'}).status,'error');
});
function editPayload(f,extra={}){const r=f.rows['可用時段'][2];return {action:'updateSlot',slotId:'target',title:r[1],date:r[2],time:r[3],location:r[4],capacity:6,prices:{1:300,2:294,3:285,4:270,5:264},...extra};}
test('edit preserves enrollment and paid amounts',()=>{
 const f=fixture();assert.equal(f.run(editPayload(f,{title:'更新團課'})).status,'success');assert.equal(f.rows['可用時段'][2][5],6);assert.equal(f.rows['可用時段'][2][6],2);assert.equal(f.rows['預約名單'][1][4],1200);
});
test('edit rejects capacity below enrolled and invalid prices/time',()=>{
 for(const extra of [{capacity:3},{prices:{1:-1}},{time:'25:00 - 26:00'},{date:'2026-02-30'}]){const f=fixture();assert.equal(f.run(editPayload(f,extra)).status,'error');assert.equal(f.rows['可用時段'][2][5],5);}
});
test('non-coaches cannot cancel or edit',()=>{const f=fixture({notCoach:true});assert.equal(f.run({action:'cancelBooking',bookingId:'original'}).status,'error');assert.equal(f.run(editPayload(f)).status,'error');});
test('linked course schedule cannot change, capacity and prices can',()=>{
 const f=fixture();f.register();f.arrange();assert.equal(f.run(editPayload(f,{title:'改名'})).status,'error');assert.equal(f.run(editPayload(f)).status,'success');
});

test('coach cash booking always starts unpaid even if caller claims received',()=>{
 const f=fixture({targetTitle:'[專屬教練課] 1v1:1000|1v2:1500'});
 assert.equal(f.run({action:'bookClass',slotId:'target',lineId:'student',name:'學生',paidPrice:1000,paymentCode:'現金已收'}).status,'success');
 const row=f.rows['預約名單'][2];assert.equal(row[6],'現場現金');assert.equal(row[5],'審核中');
});
test('cash collection requires approval and is idempotent; student payment edits cannot change it',()=>{
 const f=fixture();const row=f.rows['預約名單'][1];row[6]='現場現金';row[5]='審核中';
 assert.equal(f.run({action:'confirmCashPayment',bookingId:'original'}).status,'error');row[5]='預約成功';
 assert.equal(f.run({action:'updatePayment',bookingId:'original',paymentCode:'12345'}).status,'error');
 assert.equal(f.run({action:'confirmCashPayment',bookingId:'original'}).status,'success');assert.equal(row[6],'現金已收');
 assert.equal(f.run({action:'confirmCashPayment',bookingId:'original'}).status,'success');
});
test('non-coach cannot confirm cash collection',()=>{const f=fixture({notCoach:true});f.rows['預約名單'][1][6]='現場現金';assert.equal(f.run({action:'confirmCashPayment',bookingId:'original'}).status,'error');assert.equal(f.rows['預約名單'][1][6],'現場現金');});
