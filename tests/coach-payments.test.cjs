const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/complete/Code.gs'),'utf8');
const ctx={Intl,Date};vm.createContext(ctx);vm.runInContext(source+'\nglobalThis.payments={calculateCoachPayments:calculateCoachPayments_,taipeiMonth:taipeiMonth_,studentPaymentKey:studentPaymentKey_};',ctx);
const {calculateCoachPayments:sum,taipeiMonth:month,studentPaymentKey:key}=ctx.payments;
const order=(extra={})=>({bookingId:'one',lineId:'student',paidPrice:300,status:'預約成功',timestamp:'2026-10-01T00:00:00+08:00',slotDate:'2026-10-01',...extra});
test('counts approved and completed, excludes pending and cancelled',()=>{const result=sum(['預約成功','已完課','審核中','已取消'].map((status,i)=>order({status,bookingId:String(i)})),'2026-10');assert.equal(result.monthlyTotal,600);assert.equal(result.studentTotals.get(key('student','')),600);});
test('Taipei month boundary is UTC+8',()=>{assert.equal(month('2026-09-30T16:00:00Z'),'2026-10');assert.equal(month('2026-09-30T15:59:59Z'),'2026-09');assert.equal(month('2026-10-31T16:00:00Z'),'2026-11');});
test('member lifetime total spans months while monthly total does not',()=>{const result=sum([order(),order({bookingId:'two',timestamp:'2026-10-01T00:00:00+08:00',slotDate:'2026-09-01',paidPrice:500})],'2026-10');assert.equal(result.monthlyTotal,300);assert.equal(result.studentTotals.get(key('student','')),800);});
test('same names never merge different LINE identities',()=>{const result=sum([order({name:'同名'}),order({bookingId:'two',lineId:'other',name:'同名',paidPrice:200})],'2026-10');assert.equal(result.studentTotals.get(key('student','')),300);assert.equal(result.studentTotals.get(key('other','')),200);});
test('zero-charge makeup and duplicate IDs do not inflate totals',()=>{const result=sum([order(),order(),order({bookingId:'makeup',paidPrice:0})],'2026-10');assert.equal(result.monthlyTotal,300);assert.equal(result.duplicateOrders,1);});
test('missing date contributes lifetime total but is flagged and excluded from month',()=>{const result=sum([order({slotDate:''})],'2026-10');assert.equal(result.monthlyTotal,0);assert.equal(result.studentTotals.get(key('student','')),300);assert.equal(result.missingDates,1);});
test('invalid amounts do not silently become valid payments',()=>{const result=sum(['',null,'wrong',-1,Infinity].map((paidPrice,i)=>order({paidPrice,bookingId:String(i)})),'2026-10');assert.equal(result.monthlyTotal,0);assert.equal(result.invalidAmounts,5);});
test('legacy approved statuses and decimal money use cent arithmetic',()=>{const result=sum([order({paidPrice:0.1,status:'成功'}),order({bookingId:'two',paidPrice:0.2,status:'已完成'})],'2026-10');assert.equal(result.monthlyTotal,0.3);});

test('cash reservations count only after coach confirms receipt',()=>{const pending=sum([order({paymentCode:'現場現金'})],'2026-10');assert.equal(pending.monthlyTotal,0);assert.equal(pending.studentTotals.size,0);const paid=sum([order({paymentCode:'現金已收'})],'2026-10');assert.equal(paid.monthlyTotal,300);});
test('historical backfills require paid status and use the course month for the selected student',()=>{
 const roster=[{lineId:'family',studentId:'a'},{lineId:'family',studentId:'b'}];
 const historical=extra=>order({bookingId:'hist',lineId:'family',studentId:'b',isHistorical:true,status:'已完課',paidPrice:350.5,paymentStatus:'paid',timestamp:'2026-08-15',slotDate:'2026-09-30',...extra});
 const rows=[historical(),historical({bookingId:'unpaid',paymentStatus:'unpaid'}),historical({bookingId:'unknown',paymentStatus:undefined}),historical({bookingId:'cancelled',status:'已取消'}),order({bookingId:'normal',lineId:'family',studentId:'a',paidPrice:100})];
 const october=sum(rows,'2026-10',roster);assert.equal(october.studentTotals.get(key('family','a')),100);assert.equal(october.studentTotals.get(key('family','b')),350.5);assert.equal(october.monthlyTotal,100);
 assert.equal(sum(rows,'2026-09',roster).monthlyTotal,350.5);
});

test('two students in one account have independent lifetime totals even with identical names',()=>{
 const roster=[{lineId:'family',studentId:'a',name:'同名'},{lineId:'family',studentId:'b',name:'同名'}];
 const result=sum([order({lineId:'family',studentId:'a',name:'同名',paidPrice:900}),order({bookingId:'two',lineId:'family',studentId:'b',name:'同名',paidPrice:350})],'2026-10',roster);
 assert.equal(result.studentTotals.get(key('family','a')),900);assert.equal(result.studentTotals.get(key('family','b')),350);assert.equal(result.monthlyTotal,1250);assert.equal(result.unmatchedStudents,0);
});
test('student IDs are scoped to the account and composite keys never collide',()=>{
 const result=sum([order({lineId:'one',studentId:'same',paidPrice:100}),order({bookingId:'two',lineId:'two',studentId:'same',paidPrice:200})],'2026-10');
 assert.equal(result.studentTotals.get(key('one','same')),100);assert.equal(result.studentTotals.get(key('two','same')),200);
 assert.notEqual(key('a|b','c'),key('a','b|c'));
});
test('legacy orders stay with the explicit original student after an account adds a sibling',()=>{
 const roster=[{lineId:'family',studentId:''},{lineId:'family',studentId:'new'}];
 const result=sum([order({lineId:'family',paidPrice:1000}),order({bookingId:'new',lineId:'family',studentId:'new',paidPrice:300})],'2026-10',roster);
 assert.equal(result.studentTotals.get(key('family','')),1000);assert.equal(result.studentTotals.get(key('family','new')),300);assert.equal(result.unmatchedStudents,0);
});
test('a missing legacy student ID can be resolved only for a single-student account',()=>{
 const result=sum([order({lineId:'single',paidPrice:500})],'2026-10',[{lineId:'single',studentId:'only'}]);
 assert.equal(result.studentTotals.get(key('single','only')),500);assert.equal(result.studentTotals.size,1);assert.equal(result.unmatchedStudents,0);
});
test('ambiguous old orders are not copied to siblings or inferred from a name',()=>{
 const roster=[{lineId:'family',studentId:'a',name:'名字'},{lineId:'family',studentId:'b',name:'別人'}];
 const result=sum([order({lineId:'family',name:'名字',paidPrice:1000}),order({bookingId:'a',lineId:'family',studentId:'a',paidPrice:300})],'2026-10',roster);
 assert.equal(result.studentTotals.get(key('family','a')),300);assert.equal(result.studentTotals.get(key('family','b')),undefined);assert.equal(result.studentTotals.size,1);assert.equal(result.unmatchedStudents,1);assert.equal(result.monthlyTotal,1300);
});
test('unknown student IDs and duplicate roster IDs never reassign payments to another member',()=>{
 for(const roster of [[{lineId:'student',studentId:'only'}],[{lineId:'student',studentId:'removed'},{lineId:'student',studentId:'removed'}]]){
  const result=sum([order({studentId:'removed'})],'2026-10',roster);assert.equal(result.studentTotals.size,0);assert.equal(result.unmatchedStudents,1);assert.equal(result.monthlyTotal,300);
 }
});
test('shared private lesson rows use their existing per-student amounts without splitting twice',()=>{
 const roster=[{lineId:'family',studentId:'a'},{lineId:'family',studentId:'b'}];
 const result=sum([order({lineId:'family',studentId:'a',paidPrice:500.5,paymentCode:'現金已收'}),order({bookingId:'b',lineId:'family',studentId:'b',paidPrice:500.51,paymentCode:'現金已收'})],'2026-10',roster);
 assert.equal(result.studentTotals.get(key('family','a')),500.5);assert.equal(result.studentTotals.get(key('family','b')),500.51);assert.equal(result.monthlyTotal,1001.01);
});
test('each student retains the existing approval, cancellation and cash-receipt rules',()=>{
 const roster=[{lineId:'family',studentId:'a'},{lineId:'family',studentId:'b'}];
 const rows=[order({lineId:'family',studentId:'a',paidPrice:80}),order({bookingId:'b',lineId:'family',studentId:'b',paidPrice:120,paymentCode:'現金已收'})];
 for(const [i,extra] of [{status:'審核中'},{status:'已取消'},{paymentCode:'現場現金'}].entries())rows.push(order({bookingId:'excluded-'+i,lineId:'family',studentId:i%2?'b':'a',paidPrice:999,...extra}));
 const result=sum(rows,'2026-10',roster);assert.equal(result.studentTotals.get(key('family','a')),80);assert.equal(result.studentTotals.get(key('family','b')),120);assert.equal(result.monthlyTotal,200);
});
