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
test('private coach charges one account price for two students and consumes one slot',()=>{
 const f=fixture({remaining:1});f.register(2);f.rows['會員資料'][1][5]=2;f.rows['可用時段'][1][5]=1;f.rows['可用時段'][1][1]='[專屬教練課] 1v1:1000|1v2:1500';
 assert.equal(f.run({action:'bookClass',slotId:'slot',coachType:'1對2',paidPrice:0}).status,'success');
 const orders=f.rows['預約名單'].slice(1);assert.equal(orders.reduce((sum,row)=>sum+row[4],0),1470);assert.equal(orders.length,2);assert(orders.every(row=>row[6]==='現場現金'));assert.equal(orders[0][10],orders[1][10]);assert.equal(f.rows['可用時段'][1][6],0);
 assert.equal(f.run({action:'bookClass',slotId:'slot',coachType:'1對2'}).status,'error');
});
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

function sharedCoach(options={}) {
 const f=fixture({remaining:1,...options});f.register(2);f.rows['可用時段'][1][5]=1;f.rows['可用時段'][1][1]='[專屬教練課] 1v1:1001|1v2:1500';
 f.context.monthlyVerifyCoach_=()=>{};f.context.verifyBookingDeletionCoach_=()=>{};
 return f;
}
test('shared coach slot is restored only after both students cancel',()=>{
 const f=sharedCoach();f.run({action:'bookClass',slotId:'slot',coachType:'1對1'});const orders=f.rows['預約名單'].slice(1);
 assert.equal(orders.reduce((sum,row)=>sum+row[4],0),1001);
 assert.equal(f.run({action:'cancelBooking',bookingId:orders[0][7]}).status,'success');assert.equal(f.rows['可用時段'][1][6],0);
 assert.equal(f.run({action:'cancelBooking',bookingId:orders[1][7]}).status,'success');assert.equal(f.rows['可用時段'][1][6],1);
 assert.equal(f.run({action:'cancelBooking',bookingId:orders[1][7]}).status,'error');
});
test('deleting one shared coach order keeps slot reserved until the final order is deleted',()=>{
 const f=sharedCoach();f.run({action:'bookClass',slotId:'slot',coachType:'1對2'});const ids=f.rows['預約名單'].slice(1).map(row=>row[7]);
 assert.equal(f.run({action:'deleteBooking',bookingId:ids[0]}).status,'success');assert.equal(f.rows['可用時段'][1][6],0);
 assert.equal(f.run({action:'deleteBooking',bookingId:ids[1]}).status,'success');assert.equal(f.rows['可用時段'][1][6],1);
});
test('shared coach partial write rolls back both student orders and the slot',()=>{
 const f=sharedCoach({failAppend:2});assert.equal(f.run({action:'bookClass',slotId:'slot',coachType:'1對2'}).status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],1);
});
test('completed sibling still reserves a shared coach slot',()=>{
 const f=sharedCoach();f.run({action:'bookClass',slotId:'slot',coachType:'1對2'});f.rows['預約名單'][1][5]='已完課';assert.equal(f.run({action:'cancelBooking',bookingId:f.rows['預約名單'][2][7]}).status,'success');assert.equal(f.rows['可用時段'][1][6],0);
});
test('three-student accounts cannot book one-to-two private lessons',()=>{
 const f=fixture();f.register(3);f.rows['可用時段'][1][1]='[專屬教練課] 1v1:1000|1v2:1500';assert.equal(f.run({action:'bookClass',slotId:'slot',coachType:'1對2'}).status,'error');assert.equal(f.rows['預約名單'].length,1);
});

function monthlyCoach(options={}) {
 const f=fixture(options);f.register(3);f.rows['會員資料'][1][5]=2;f.rows['可用時段'][1][1]='[月繳4堂] 團課';f.rows['可用時段'][1][8]=980;
 const admin=vm.runInContext('ADMIN_LINE_IDS[0]',f.context);
 f.context.UrlFetchApp.fetch=url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:'channel',expires_in:3600}:{userId:admin})});
 const students=f.run({action:'checkUser'}).user.students;
 const enroll=(extra={})=>f.run({action:'coachRegisterMonthly',slotId:'slot',studentIds:[students[0].id,students[2].id],accessToken:'mock',...extra});
 return {...f,students,enroll};
}
test('authenticated coach enrolls selected students in monthly class using stored prices',()=>{
 const f=monthlyCoach();const result=f.enroll({paidPrice:1,level:1});assert.equal(result.status,'success');assert.equal(result.registeredCount,2);assert.equal(result.totalPrice,1960);
 const orders=f.rows['預約名單'].slice(1);assert.deepEqual(orders.map(row=>row[9]),[f.students[0].id,f.students[2].id]);assert(orders.every(row=>row[4]===980&&row[5]==='審核中'));assert.equal(f.rows['可用時段'][1][6],3);
 assert.equal(f.run({action:'getStudentStats',studentId:f.students[1].id}).bookings.length,0);
});
test('ordinary student cannot use coach monthly enrollment',()=>{
 const f=fixture();f.register();f.rows['可用時段'][1][1]='[月繳4堂] 團課';const ids=f.run({action:'checkUser'}).user.students.map(s=>s.id);assert.equal(f.run({action:'coachRegisterMonthly',slotId:'slot',studentIds:ids,accessToken:'mock'}).status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],5);
});
test('coach monthly enrollment rejects duplicates and keeps quota unchanged on repeat',()=>{
 const f=monthlyCoach();assert.equal(f.enroll().status,'success');assert.equal(f.enroll().status,'error');assert.equal(f.rows['預約名單'].length,3);assert.equal(f.rows['可用時段'][1][6],3);
});
test('coach monthly enrollment rejects invalid or foreign students and nonmonthly slots',()=>{
 const f=monthlyCoach();for(const ids of [[],['foreign'],[f.students[0].id,f.students[0].id]])assert.equal(f.enroll({studentIds:ids}).status,'error');f.rows['可用時段'][1][1]='單堂團課';assert.equal(f.enroll().status,'error');assert.equal(f.rows['預約名單'].length,1);
});
test('coach enrollment refuses insufficient seats without partial writes',()=>{
 const f=monthlyCoach({remaining:1});assert.equal(f.enroll().status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],1);
});
test('coach enrollment rolls back all orders if the second student append fails',()=>{
 const f=monthlyCoach({failAppend:2});assert.equal(f.enroll().status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],5);
});

function registrationProfile(count=2) {
 return {action:'registerUser',registrationProfileVersion:2,students:Array.from({length:count},(_,i)=>({name:['王小明','陳小美','林小華'][i],nickname:['小明','小美','小華'][i],birthDate:i===0?'2000-02-29':'2015-12-31',phone:i===0?'0912-345-678':'',emergencyPhone:i===0?'(02) 2345-6789':'',injuryHistory:i===0?'右膝舊傷':'',learningGoals:'學習正確發力，避免受傷',lessonStyle:{theory:20,multiball:50,correction:30}}))};
}
test('new registration persists individual profiles and returns a compatible account without private notes',()=>{
 const f=fixture(),payload=registrationProfile(3);
 assert.equal(f.run({action:'checkUser'}).registrationProfileVersion,2);
 const result=f.run(payload);assert.equal(result.status,'success',result.message);
 const stored=JSON.parse(f.rows['會員資料'][1][6]);assert.equal(stored.length,3);
 for(let i=0;i<3;i++){
  assert.equal(stored[i].birthDate,payload.students[i].birthDate);
  assert.equal(stored[i].injuryHistory,payload.students[i].injuryHistory);
  assert.equal(stored[i].learningGoals,payload.students[i].learningGoals);
  assert.deepEqual(stored[i].lessonStyle,payload.students[i].lessonStyle);
 }
 assert.equal(stored[0].phone,'0912345678');assert.equal(stored[0].emergencyPhone,'0223456789');assert.equal(stored[1].phone,'');
 assert.equal(f.rows['會員資料'][1][3],'0912345678');assert.equal(f.rows['會員資料'][1][7],'');
 const read=f.run({action:'checkUser'});assert.equal(read.user.registrationProfileVersion,2);
 for(const response of [result,read,f.run({action:'getCoachData'}),f.run({action:'getStudentStats'})])for(const key of ['birthDate','injuryHistory','emergencyPhone','learningGoals','lessonStyle'])assert(!JSON.stringify(response).includes('"'+key+'"'),key+' leaked');
 assert.equal(f.run({action:'bookClass',slotId:'slot',accountBooking:true}).status,'success');
 assert.equal(f.rows['預約名單'].length,4);assert.equal(f.rows['可用時段'][1][6],2);
});
test('new registration rejects incomplete/invalid fields atomically',()=>{
 const cases=[
  p=>p.students[0].name='John',p=>p.students[0].nickname=' ',
  p=>p.students[0].birthDate='2023-02-29',p=>p.students[0].birthDate='2024-04-31',p=>p.students[0].birthDate='9999-01-01',p=>p.students[0].birthDate='1900-01-01',
  p=>p.students[0].phone='',p=>p.students[0].emergencyPhone='',p=>p.students[0].learningGoals=' ',
  p=>p.students[1].phone='123',p=>p.students[1].emergencyPhone='123',
  p=>p.students[0].lessonStyle={theory:40,multiball:40,correction:40},
  p=>p.students[0].lessonStyle={theory:-1,multiball:51,correction:50},
  p=>p.students[0].lessonStyle={theory:10.5,multiball:39.5,correction:50},
  p=>p.students[0].lessonStyle={theory:20,multiball:80},
  p=>p.students[0].injuryHistory='傷'.repeat(2001),p=>p.students[0].learningGoals={value:'目標'},
  p=>p.registrationProfileVersion=3
 ];
 for(const mutate of cases){const f=fixture(),payload=registrationProfile();mutate(payload);const r=f.run(payload);assert.equal(r.status,'error',JSON.stringify(payload));assert.equal(f.rows['會員資料'].length,1);assert.equal(f.rows['會員資料'][0].length,6);}
});
test('optional secondary contacts and optional injury history are accepted; style endpoints are valid',()=>{
 const f=fixture(),payload=registrationProfile();
 payload.students[0].injuryHistory='';payload.students[0].lessonStyle={theory:0,multiball:100,correction:0};
 payload.students[1].phone='0987654321';payload.students[1].emergencyPhone='0912345678';
 assert.equal(f.run(payload).status,'success');const students=JSON.parse(f.rows['會員資料'][1][6]);
 assert.equal(students[0].injuryHistory,'');assert.equal(students[1].phone,'0987654321');assert.equal(students[1].emergencyPhone,'0912345678');
});
test('new birthday-derived age handles birthdays and accepts real leap days',()=>{
 const f=fixture(),payload=registrationProfile(1);assert.equal(f.run(payload).status,'success');
 const today=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
 const expected=Number(today.slice(0,4))-2000-(today.slice(5)<'02-29'?1:0);
 assert.equal(f.rows['會員資料'][1][2],expected);
});
test('new profile repair preserves legacy identity, membership, timestamps and bookings',()=>{
 const f=fixture();f.rows['會員資料'].push(['account','舊學生',20,'0912345678','original-date',4,'','A123456789']);
 f.rows['訓練日誌'].push([0,'account','舊學生','2026-01-01',1,0,0,0,0,0,0,0,0,'原有紀錄']);
 const payload={...registrationProfile(),action:'completeAccountRegistration',accessToken:'mock'};
 const result=f.run(payload);assert.equal(result.status,'success',result.message);
 assert.equal(result.user.students[0].id,'');assert.equal(result.user.level,4);assert.equal(f.rows['會員資料'][1][4],'original-date');assert.equal(f.rows['會員資料'][1][7],'A123456789');
 assert.equal(f.run({action:'getStudentStats',studentId:''}).totalClasses,1);
 const again=f.run(payload);assert.equal(again.status,'error');
});

function monthlyCoachWithoutChannelProperty(options={}) {
 const f=monthlyCoach();
 f.context.PropertiesService.getScriptProperties=()=>({getProperty:()=>null});
 const configured=vm.runInContext('DEFAULT_LINE_LOGIN_CHANNEL_ID',f.context);
 const admin=vm.runInContext('ADMIN_LINE_IDS[0]',f.context);
 f.context.UrlFetchApp.fetch=url=>({getResponseCode:()=>options.expired?401:200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:options.clientId||configured,expires_in:3600}:{userId:options.notCoach?'student':admin})});
 return f;
}
test('coach monthly registration succeeds with confirmed server channel when script property is missing',()=>{
 const f=monthlyCoachWithoutChannelProperty();const result=f.enroll();
 assert.equal(result.status,'success',result.message);assert.equal(result.registeredCount,2);assert.equal(result.totalPrice,1960);
 assert.equal(f.rows['預約名單'].length,3);assert.equal(f.rows['可用時段'][1][6],3);
});
test('missing channel property never accepts a different channel, expired token or noncoach',()=>{
 for(const options of [{clientId:'attacker-channel'},{expired:true},{notCoach:true}]){
  const f=monthlyCoachWithoutChannelProperty(options);const result=f.enroll({channelId:'attacker-channel',isAdmin:true});
  assert.equal(result.status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],5);
 }
});

function coachProfileFixture(count=2) {
 const f=fixture();const registration=f.run(registrationProfile(count));assert.equal(registration.status,'success');
 const students=registration.user.students,admin=vm.runInContext('ADMIN_LINE_IDS[0]',f.context);
 f.context.UrlFetchApp.fetch=url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:'channel',expires_in:3600}:{userId:admin})});
 const read=(extra={})=>f.run({action:'getStudentProfile',studentId:students[0].id,accessToken:'mock',...extra});
 return {...f,students,read};
}
test('authenticated coach can read all registration fields for exactly the selected student',()=>{
 const f=coachProfileFixture(),rowsBefore=JSON.stringify(f.rows),result=f.read();assert.equal(result.status,'success',result.message);
 assert.equal(result.profile.name,'王小明');assert.equal(result.profile.birthDate,'2000-02-29');assert.equal(result.profile.phone,'0912345678');assert.equal(result.profile.emergencyPhone,'0223456789');assert.equal(result.profile.injuryHistory,'右膝舊傷');assert.equal(result.profile.learningGoals,'學習正確發力，避免受傷');assert.deepEqual(result.profile.lessonStyle,{theory:20,multiball:50,correction:30});assert.equal(result.profile.isRepresentative,true);
 assert.equal(JSON.stringify(f.rows),rowsBefore);assert.equal(result.profile.idNumber,undefined);
 const second=f.read({studentId:f.students[1].id});assert.equal(second.status,'success');assert.equal(second.profile.name,'陳小美');assert.equal(second.profile.birthDate,'2015-12-31');assert.equal(second.profile.phone,'');assert.equal(second.profile.emergencyPhone,'');assert.equal(second.profile.isRepresentative,false);assert.equal(second.profile.representativePhone,'0912345678');
});
test('private student profiles reject missing tokens, students, expired sessions and other channels',()=>{
 for(const mode of ['missing','student','expired','wrong-channel']){
  const f=coachProfileFixture();
  if(mode==='student')f.context.UrlFetchApp.fetch=url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:'channel',expires_in:3600}:{userId:'account'})});
  if(mode==='expired')f.context.UrlFetchApp.fetch=()=>({getResponseCode:()=>401,getContentText:()=> '{}'});
  if(mode==='wrong-channel')f.context.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({client_id:'other',expires_in:3600})});
  const result=f.read({accessToken:mode==='missing'?'':'mock',isAdmin:true,coachId:'spoofed'});assert.equal(result.status,'error');assert.equal(result.profile,undefined);assert(!JSON.stringify(result).includes('右膝舊傷'));
 }
});
test('profile lookup rejects wrong accounts, missing selectors, foreign IDs and duplicate accounts',()=>{
 const f=coachProfileFixture();
 for(const extra of [{lineId:'other'},{studentId:'foreign'},{studentId:undefined},{lineId:undefined}]){const r=f.read(extra);assert.equal(r.status,'error');assert.equal(r.profile,undefined);}
 f.rows['會員資料'].push(f.rows['會員資料'][1].slice());assert.equal(f.read().status,'error');
});
test('legacy profiles retain known fields without inventing new registration information',()=>{
 const f=fixture();f.rows['會員資料'].push(['account','舊學員',25,'0912345678',0,1]);
 const admin=vm.runInContext('ADMIN_LINE_IDS[0]',f.context);f.context.UrlFetchApp.fetch=url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:'channel',expires_in:3600}:{userId:admin})});
 const result=f.run({action:'getStudentProfile',studentId:'',accessToken:'mock'});assert.equal(result.status,'success');assert.equal(result.profile.name,'舊學員');assert.equal(result.profile.age,25);assert.equal(result.profile.phone,'0912345678');assert.equal(result.profile.birthDate,'');assert.equal(result.profile.lessonStyle,null);assert.equal(result.profile.injuryHistory,'');
});

test('monthly enrollment works with the previous wrong channel property and the current LIFF token',()=>{
 const f=monthlyCoachWithoutChannelProperty();
 f.context.PropertiesService.getScriptProperties=()=>({getProperty:()=> '2012115242'});
 const result=f.enroll();assert.equal(result.status,'success',result.message);assert.equal(result.registeredCount,2);assert.equal(f.rows['預約名單'].length,3);assert.equal(f.rows['可用時段'][1][6],3);
});

function singleCoach(options={}) {
 const f=monthlyCoach(options);f.rows['可用時段'][1][1]='單堂團課';f.rows['可用時段'][1][8]=294;
 const enrollSingle=(extra={})=>f.enroll({action:'coachRegisterSingle',...extra});return {...f,enrollSingle};
}
test('coach single registration uses stored membership prices and selected students under the shared lock',()=>{
 const f=singleCoach();assert.equal(f.run({action:'getSlots'}).coachSingleRegistrationVersion,1);
 const result=f.enrollSingle({paidPrice:1,level:1,status:'預約成功',paymentCode:'現金已收'});assert.equal(result.status,'success',result.message);assert.equal(result.registeredCount,2);assert.equal(result.totalPrice,588);
 const orders=f.rows['預約名單'].slice(1);assert.deepEqual(orders.map(row=>row[9]),[f.students[0].id,f.students[2].id]);assert(orders.every(row=>row[4]===294&&row[5]==='審核中'&&row[6]===''));assert.equal(f.rows['可用時段'][1][6],3);
});
test('single registration rejects missing coach authentication and ordinary students without writes',()=>{
 for(const mode of ['missing','student','expired','channel']){
  const f=singleCoach();if(mode==='student')f.context.UrlFetchApp.fetch=url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:'channel',expires_in:3600}:{userId:'account'})});
  if(mode==='expired')f.context.UrlFetchApp.fetch=()=>({getResponseCode:()=>401,getContentText:()=> '{}'});
  if(mode==='channel')f.context.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({client_id:'other',expires_in:3600})});
  assert.equal(f.enrollSingle({accessToken:mode==='missing'?'':'mock',isAdmin:true}).status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],5);
 }
});
test('single registration rejects monthly packages and private coaching, including padded titles',()=>{
 for(const title of ['[月繳4堂] 團課','[專屬教練課] 1v1:1000|1v2:1500','  [月繳4堂] 團課',' [專屬教練課] 1v1:1000|1v2:1500']){
  const f=singleCoach();f.rows['可用時段'][1][1]=title;assert.equal(f.enrollSingle().status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],5);
 }
});
test('single registration rejects invalid students and repeat enrollment but allows an unbooked sibling',()=>{
 const f=singleCoach();for(const studentIds of [[],['foreign'],[f.students[0].id,f.students[0].id]])assert.equal(f.enrollSingle({studentIds}).status,'error');
 assert.equal(f.enrollSingle().status,'success');assert.equal(f.enrollSingle().status,'error');assert.equal(f.rows['可用時段'][1][6],3);
 assert.equal(f.enrollSingle({studentIds:[f.students[1].id]}).status,'success');assert.equal(f.rows['預約名單'].length,4);assert.equal(f.rows['可用時段'][1][6],2);
});
test('single registration leaves seats and bookings unchanged on shortage or partial write failure',()=>{
 for(const options of [{remaining:1},{failAppend:2}]){const f=singleCoach(options);assert.equal(f.enrollSingle().status,'error');assert.equal(f.rows['預約名單'].length,1);assert.equal(f.rows['可用時段'][1][6],options.remaining??5);}
});
