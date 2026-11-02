const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(options={}) {
 let sequence=0, locked=false, appends=0;
 const rows={
  '會員資料':[['LINE_ID','姓名','年齡','電話','註冊時間','等級']],
  '預約名單':[['時間','課程','LINE_ID','姓名','金額','狀態','付款','訂單']],
  '可用時段':[['headers'],['slot','團課','2026-12-01','19:00 - 20:00','場地',5,options.remaining??5,300,294,285,270,264]],
  '訓練日誌':[['headers']]
 };
 const sheets={};
 const sheet=name=>!rows[name]?null:sheets[name] ||= {
  getDataRange:()=>({getValues:()=>rows[name].map(row=>row.slice())}),
  appendRow:row=>{assert(locked);if(name==='預約名單' && ++appends===options.failAppend)throw Error('write failed');rows[name].push(row.slice());},
  deleteRow:index=>{assert(locked);rows[name].splice(index-1,1);},
  getRange:(row,column)=>({setValue:value=>{assert(locked);rows[name][row-1][column-1]=value;},setValues:values=>{assert(locked);values.forEach((cells,y)=>cells.forEach((value,x)=>rows[name][row-1+y][column-1+x]=value));}})
 };
 const ss={getSheetByName:sheet};
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'channel'})},UrlFetchApp:{fetch:url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:'channel',expires_in:3600}:{userId:options.otherUser?'other':'account'})})},SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true;},releaseLock:()=>{locked=false;}})},Utilities:{getUuid:()=>`id-${++sequence}`},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}};
 vm.createContext(context);
 vm.runInContext(['complete/Code.gs'].map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n'),context);
 const run=payload=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({lineId:'account',...payload})}}).text);
 const register=(count=2,extra={})=>run({action:'registerUser',students:Array.from({length:count},(_,i)=>({name:'學生'+i,nickname:'暱稱'+i,gender:'女',age:10+i})),phone:'0912345678',idNumber:'A123456789',...extra});
 return {rows,run,register,context};
}
for(const count of [1,2,3]) test(`register and book ${count} students with server prices and independent IDs`,()=>{
 const f=fixture();assert.equal(f.register(count).status,'success');
 const user=f.run({action:'checkUser'}).user;assert.equal(user.students.length,count);assert.equal(new Set(user.students.map(s=>s.id)).size,count);assert.equal(user.idNumber,undefined);
 assert.equal(f.run({action:'bookClass',slotId:'slot',paidPrice:1,students:[],accountBooking:true}).status,'success');
 assert.equal(f.rows['預約名單'].length,count+1);assert.equal(f.rows['可用時段'][1][6],5-count);
 assert.equal(f.rows['預約名單'].slice(1).reduce((total,row)=>total+row[4],0),300*count);
 assert.deepEqual(f.rows['預約名單'].slice(1).map(row=>row[9]),user.students.map(s=>s.id));
});
test('reject invalid counts, identity checksum and incomplete students without registration',()=>{
 const f=fixture();for(const count of [0,4])assert.equal(f.register(count).status,'error');
 assert.equal(f.register(2,{idNumber:'A123456788'}).status,'error');
 assert.equal(f.register(1,{students:[{name:'學生',age:10,gender:'女'}]}).status,'error');
 assert.equal(f.rows['會員資料'].length,1);
});
test('duplicate registration cannot overwrite or add students',()=>{const f=fixture();f.register();assert.equal(f.register(3).status,'error');assert.equal(f.rows['會員資料'].length,2);});
test('insufficient seats leaves all bookings unchanged',()=>{const f=fixture({remaining:1});f.register();assert.equal(f.run({action:'bookClass',slotId:'slot'}).status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],1);});
test('partial append failure rolls back all students and capacity',()=>{const f=fixture({failAppend:2});f.register(3);assert.equal(f.run({action:'bookClass',slotId:'slot'}).status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],5);});
test('student log and completion affect only selected student even with identical names',()=>{
 const f=fixture();f.register();const students=JSON.parse(f.rows['會員資料'][1][6]);students[1].name=students[0].name;f.rows['會員資料'][1][6]=JSON.stringify(students);
 f.run({action:'bookClass',slotId:'slot'});
 const booking=f.rows['預約名單'][2];
 assert.equal(f.run({action:'addLog',bookingId:booking[7],name:'wrong',date:'2026-12-01',stats:{clears:1},note:'第二位紀錄'}).status,'success');
 assert.equal(f.rows['預約名單'][1][5],'審核中');assert.equal(booking[5],'已完課');
 const first=f.run({action:'getStudentStats',studentId:students[0].id});const second=f.run({action:'getStudentStats',studentId:students[1].id});
 assert.equal(first.totalClasses,0);assert.equal(first.bookings.length,1);assert.equal(second.totalClasses,1);assert.equal(second.logs[0].note,'第二位紀錄');assert.equal(second.bookings.length,0);
 assert.equal(f.run({action:'getStudentStats',studentId:'someone-else'}).status,'error');
 const members=f.run({action:'getCoachData'}).members;assert.deepEqual(members.map(m=>m.totalClasses),[0,1]);
});
test('unbooked logs require a student and reject mismatched account booking',()=>{const f=fixture();f.register();f.run({action:'bookClass',slotId:'slot'});assert.equal(f.run({action:'addLog',stats:{}}).status,'error');assert.equal(f.run({action:'addLog',lineId:'other',bookingId:f.rows['預約名單'][1][7],stats:{}}).status,'error');assert.equal(f.rows['訓練日誌'].length,1);});
test('legacy single account retains historical logs and bookings',()=>{const f=fixture();f.rows['會員資料'].push(['account','舊學生',20,'0912345678',0,1]);f.rows['訓練日誌'].push([0,'account','舊學生','2026-01-01',1,0,0,0,0,0,0,0,0,'舊紀錄']);assert.equal(f.run({action:'getStudentStats'}).totalClasses,1);assert.equal(f.run({action:'bookClass',slotId:'slot'}).status,'success');assert.equal(f.rows['可用時段'][1][6],4);});
test('private coach price uses stored level and multiplies through per-student orders',()=>{const f=fixture();f.register(3);f.rows['會員資料'][1][5]=2;f.rows['可用時段'][1][1]='[專屬教練課] 1v1:1000|1v2:1500';assert.equal(f.run({action:'bookClass',slotId:'slot',coachType:'1對2',paidPrice:0}).status,'success');assert.equal(f.rows['預約名單'].slice(1).reduce((sum,row)=>sum+row[4],0),4410);assert(f.rows['預約名單'].slice(1).every(row=>row[6]==='現場現金'));});
test('reserved custom columns are never overwritten by account registration',()=>{const f=fixture();f.rows['會員資料'][0][6]='自訂欄位';assert.equal(f.register().status,'error');assert.equal(f.rows['會員資料'].length,1);assert.equal(f.rows['會員資料'][0][6],'自訂欄位');});
test('cancel and delete restore only each student seat and preserve siblings',()=>{
 const f=fixture();f.register(3);f.run({action:'bookClass',slotId:'slot'});
 f.context.monthlyVerifyCoach_=()=>{};f.context.verifyBookingDeletionCoach_=()=>{};
 const orders=f.rows['預約名單'].slice(1);
 assert.equal(f.run({action:'cancelBooking',bookingId:orders[0][7]}).status,'success');
 assert.equal(f.rows['可用時段'][1][6],3);assert.equal(orders[1][5],'審核中');
 assert.equal(f.run({action:'deleteBooking',bookingId:orders[1][7]}).status,'success');
 assert.equal(f.rows['可用時段'][1][6],4);assert(f.rows['預約名單'].some(row=>row[7]===orders[2][7]));
});

test('repair upgrades a legacy account to three students and preserves level and original records',()=>{
 const f=fixture();f.rows['會員資料'].push(['account','舊姓名',20,'0912345678','original-date',3]);
 f.rows['訓練日誌'].push([0,'account','舊姓名','2026-01-01',1,0,0,0,0,0,0,0,0,'原有紀錄']);
 f.rows['預約名單'].push([0,'slot','account','舊姓名',285,'預約成功','','old-booking']);
 assert.equal(f.run({action:'checkUser'}).user.registrationComplete,false);
 const students=[1,2,3].map(i=>({name:'學生'+i,nickname:'暱稱'+i,gender:'男',age:12}));
 const result=f.run({action:'completeAccountRegistration',accessToken:'mock',students,phone:'0912345678',idNumber:'A123456789'});
 assert.equal(result.status,'success');assert.equal(result.user.students.length,3);assert.equal(result.user.registrationComplete,true);
 assert.equal(f.rows['會員資料'].length,2);assert.equal(f.rows['會員資料'][1][4],'original-date');assert.equal(result.user.level,3);
 assert.equal(f.run({action:'getStudentStats',studentId:''}).totalClasses,1);
 assert.equal(f.run({action:'getStudentStats',studentId:result.user.students[1].id}).totalClasses,0);
 assert.equal(f.run({action:'bookClass',slotId:'slot'}).status,'success');assert.equal(f.rows['可用時段'][1][6],2);
 assert.equal(f.rows['預約名單'].slice(2).reduce((sum,row)=>sum+row[4],0),855);
 assert.equal(f.run({action:'completeAccountRegistration',accessToken:'mock',students,phone:'0912345678',idNumber:'A123456789'}).status,'error');
});
test('repair rejects another LINE user and leaves existing profile untouched',()=>{
 const f=fixture({otherUser:true});f.rows['會員資料'].push(['account','舊姓名',20,'0912345678',0,1]);
 const result=f.run({action:'completeAccountRegistration',accessToken:'mock',students:[{name:'新學生',nickname:'暱稱',gender:'女',age:10}],phone:'0912345678',idNumber:'A123456789'});
 assert.equal(result.status,'error');assert.equal(f.rows['會員資料'][1][1],'舊姓名');assert.equal(f.rows['會員資料'][1][6],undefined);
});
