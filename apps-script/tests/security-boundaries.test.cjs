const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {fixture,ADMIN}=require('./helpers/backend-fixture.cjs');
test('every API action rejects missing or invalid LINE credentials before reading or writing sheets',()=>{
 const f=fixture(),actions=vm.runInContext('ADMIN_API_ACTIONS.concat(MEMBER_API_ACTIONS)',f.context),before=JSON.stringify(f.rows);
 for(const action of actions)for(const token of ['',null,'bad','expired','wrong-channel']){const result=f.run({action,lineId:ADMIN,isAdmin:true,accessToken:token});assert.equal(result.status,'error',action);assert.equal(result.securityVersion,2);}
 assert.equal(f.state().sheetReads,0);assert.equal(JSON.stringify(f.rows),before);
});
test('all management actions require the verified coach rather than caller role flags',()=>{
 const f=fixture(),actions=vm.runInContext('ADMIN_API_ACTIONS.slice()',f.context),before=JSON.stringify(f.rows);
 for(const action of actions){const result=f.run({action,lineId:ADMIN,isAdmin:true,coachId:ADMIN});assert.equal(result.status,'error',action);assert.match(result.message,/僅教練/);}
 assert.equal(f.state().sheetReads,0);assert.equal(JSON.stringify(f.rows),before);
});
test('member operations cannot access other accounts, even with a valid personal token',()=>{
 const f=fixture();for(const action of ['checkUser','getSlots','getStudentStats','getBookingQuote','bookClass','registerUser','completeAccountRegistration']){const result=f.run({action,lineId:'other',slotId:'group',isAdmin:true});assert.equal(result.status,'error',action);assert.match(result.message,/自己帳號/);}
 assert.equal(f.state().sheetReads,0);
});
test('verified coach can inspect an account, while own-account login remains the only admin bootstrap',()=>{
 const f=fixture();assert.equal(f.run({action:'checkUser',lineId:ADMIN},'coach').isAdmin,true);
 const target=f.run({action:'checkUser',lineId:'account'},'coach');assert.equal(target.isAdmin,false);assert.equal(target.user.students.length,2);
 assert.equal(f.run({action:'checkUser',lineId:ADMIN}).status,'error');
 assert.equal(f.run({action:'registerUser',lineId:'other'},'coach').status,'error');
});
test('student listings contain server prices without full tier tables or private base tariffs',()=>{
 const f=fixture();const result=f.run({action:'getSlots'});assert.equal(result.status,'success');assert.equal(result.slots[0].prices,undefined);
 assert.equal(result.slots[0].priceQuote.totalPrice,588);assert.equal(result.slots[0].priceQuote.regularTotalPrice,600);
 const privateSlot=result.slots.find(s=>s.id==='private');assert.equal(privateSlot.title,'[專屬教練課]');assert.equal(privateSlot.priceQuote.coachPlans['1對2'],1470);assert.deepEqual(privateSlot.availableLocations,['場地A','場地B']);
 assert.ok(f.run({action:'getSlots'},'coach').slots[0].prices);
});
test('forged paidPrice, membership level, names and seat counts never change the stored charge',()=>{
 const f=fixture(),result=f.run({action:'bookClass',slotId:'group',lineId:'account',paidPrice:1,level:5,name:'spoof',studentCount:0,seats:0});
 assert.equal(result.status,'success');assert.equal(result.totalPrice,588);assert.equal(f.rows['預約名單'].length,3);assert.equal(f.rows['可用時段'][1][6],3);
 assert.deepEqual(f.rows['預約名單'].slice(1).map(row=>row[4]),[294,294]);assert.deepEqual(f.rows['預約名單'].slice(1).map(row=>row[3]),['王小明','王小美']);
 assert.equal(f.run({action:'bookClass',slotId:'group'}).status,'error');
 assert(f.network.every(call=>call.locked===false),'LINE verification completes before holding the write lock');
});
test('a stale quote is rejected without changing seats or orders',()=>{
 const f=fixture(),quote=f.run({action:'getBookingQuote',slotId:'group'}).quote;f.rows['可用時段'][1][8]=299;
 const before=JSON.stringify(f.rows);const result=f.run({action:'bookClass',slotId:'group',expectedTotalPrice:quote.totalPrice});assert.equal(result.status,'error');assert.match(result.message,/價格已有變更/);assert.equal(JSON.stringify(f.rows),before);
});
test('private plans, allowed venue, shared seats and student charge allocation are server-owned',()=>{
 const f=fixture();assert.equal(f.run({action:'getBookingQuote',slotId:'private',coachType:'1對2',location:'foreign'}).status,'error');
 const quote=f.run({action:'getBookingQuote',slotId:'private',coachType:'1對2',location:'場地B'}).quote;assert.equal(quote.totalPrice,1470);
 assert.equal(f.run({action:'bookClass',slotId:'private',coachType:'1對2',location:'場地B',paidPrice:1,expectedTotalPrice:1470,paymentCode:'現金已收'}).status,'success');
 assert.equal(f.rows['可用時段'][2][6],0);assert.deepEqual(f.rows['預約名單'].slice(1).map(row=>row[4]),[735,735]);assert(f.rows['預約名單'].slice(1).every(row=>row[6]==='現場現金'));
});
test('unregistered identities cannot use the old caller-priced booking fallback',()=>{
 const f=fixture(),before=JSON.stringify(f.rows);assert.equal(f.run({action:'bookClass',slotId:'group',paidPrice:0,name:'fresh'},'fresh').status,'error');assert.equal(JSON.stringify(f.rows),before);
});
test('new registrations cannot choose their membership level or administrator role',()=>{
 const f=fixture();const result=f.run({action:'registerUser',level:5,isAdmin:true,students:[{name:'新學員',nickname:'新同學',gender:'女',age:20}],phone:'0912345678',idNumber:'A123456789'},'fresh');
 assert.equal(result.status,'success');assert.equal(result.user.level,1);assert.equal(f.run({action:'checkUser'},'fresh').isAdmin,false);
 assert.equal(f.run({action:'getBookingQuote',slotId:'group',paidPrice:1,level:5},'fresh').quote.totalPrice,300);
});
test('coach subset quotes and writes use target membership and selected IDs',()=>{
 const f=fixture();const request={lineId:'account',slotId:'monthly',studentIds:['b'],kind:'monthly'};
 assert.equal(f.run({action:'getBookingQuote',...request}).status,'error');
 const quote=f.run({action:'getBookingQuote',...request},'coach').quote;assert.equal(quote.totalPrice,980);
 const result=f.run({action:'coachRegisterMonthly',...request,expectedTotalPrice:quote.totalPrice},'coach');assert.equal(result.status,'success');assert.equal(f.rows['預約名單'][1][9],'b');assert.equal(f.rows['預約名單'][1][4],980);
});
test('payment notes require ownership and five digits; only coach can approve or confirm receipt',()=>{
 const f=fixture();f.run({action:'bookClass',slotId:'group'});const id=f.rows['預約名單'][1][7];
 assert.equal(f.run({action:'updatePayment',bookingId:id,paymentCode:'12345'},'other').status,'error');
 for(const paymentCode of ['現金已收','1234','123456','=12345'])assert.equal(f.run({action:'updatePayment',bookingId:id,paymentCode}).status,'error');
 assert.equal(f.run({action:'updatePayment',bookingId:id,paymentCode:'12345'}).status,'success');
 assert.equal(f.run({action:'approveBooking',bookingId:id}).status,'error');assert.equal(f.run({action:'approveBooking',bookingId:id},'coach').status,'success');
 assert.equal(f.run({action:'updatePayment',bookingId:id,paymentCode:'54321'}).status,'error');
});
test('initial booking notes and legacy signup names cannot inject spreadsheet formulas',()=>{
 const f=fixture(),before=JSON.stringify(f.rows);
 for(const paymentCode of ['=IMPORTXML("url")','arbitrary','1234'])assert.equal(f.run({action:'bookClass',slotId:'group',paymentCode}).status,'error');
 assert.equal(JSON.stringify(f.rows),before);
 const result=f.run({action:'registerUser',students:[{name:'=formula',nickname:'暱稱',gender:'女',age:20}],phone:'0912345678',idNumber:'A123456789'},'fresh');
 assert.equal(result.status,'error');assert.equal(JSON.stringify(f.rows),before);
});
test('only coach may write valid logs after approval; failures roll back logs and completion together',()=>{
 const f=fixture();f.run({action:'bookClass',slotId:'group'});const id=f.rows['預約名單'][1][7];
 const log={action:'addLog',lineId:'account',bookingId:id,date:'2026-11-09',stats:{clears:1/12},note:'正常日誌'};
 assert.equal(f.run(log).status,'error');assert.equal(f.run(log,'coach').status,'error');
 f.run({action:'approveBooking',bookingId:id},'coach');
 assert.equal(f.run({...log,stats:{clears:0.01}},'coach').status,'error');assert.equal(f.run({...log,stats:{clears:3}},'coach').status,'error');
 f.failNextFlush();assert.equal(f.run(log,'coach').status,'error');assert.equal(f.rows['訓練日誌'].length,1);assert.equal(f.rows['預約名單'][1][5],'預約成功');
 assert.equal(f.run(log,'coach').status,'success');assert.equal(f.rows['預約名單'][1][5],'已完課');assert.equal(f.run(log,'coach').status,'error');assert.equal(f.rows['訓練日誌'].length,2);
});
test('pricing suggestions and payment summaries are authenticated coach-only computations',()=>{
 const f=fixture();assert.equal(f.run({action:'getPricingPreview',mode:'single',startTime:'19:00',endTime:'20:00'}).status,'error');
 const preview=f.run({action:'getPricingPreview',mode:'single',startTime:'19:00',endTime:'20:00',basePrice:100,level:99},'coach');assert.deepEqual(preview.prices,{'1':100,'2':98,'3':95,'4':90,'5':53});
 f.run({action:'bookClass',slotId:'group'});const id=f.rows['預約名單'][1][7];f.run({action:'approveBooking',bookingId:id},'coach');
 const summary=f.run({action:'getPaymentSummary',month:'2026-11'},'coach').paymentSummary;assert.equal(summary.monthlyTotal,294);assert.deepEqual(summary.studentTotals,[[JSON.stringify(['account','a']),294]]);
 assert.equal(f.run({action:'getPaymentSummary',month:'2026-11'}).status,'error');
});
test('failed multi-student booking restores every order and the server seat counter',()=>{
 const f=fixture({failBookingAppend:2}),before=JSON.stringify(f.rows);assert.equal(f.run({action:'bookClass',slotId:'group'}).status,'error');assert.equal(JSON.stringify(f.rows),before);assert.equal(f.state().locked,false);
});
test('LINE failures do not echo tokens, and frontend contains no financial policy implementations',()=>{
 const f=fixture();f.context.UrlFetchApp.fetch=()=>{throw Error('sensitive-token-in-url');};const result=f.run({action:'checkUser',accessToken:'sensitive-token-in-url'});assert.equal(result.status,'error');assert(!JSON.stringify(result).includes('sensitive-token-in-url'));
 const front=fs.readFileSync(path.join(__dirname,'../../script.js'),'utf8');for(const name of ['getVIPDiscount','groupTariff','slotGroupTariff','calculateCoachPayments'])assert(!new RegExp('const '+name+'\\s*=').test(front),name+' must reside on the backend');
});
