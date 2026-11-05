const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=source.slice(source.indexOf('const formatTrainingDate ='),source.indexOf('const getDayOfWeek ='))+source.slice(source.indexOf('const coachCalendarDateKey ='),source.indexOf('const CoachCourseCalendar ='))+'\nthis.calendar={coachSlotDates,coachCalendarMonthData};';
const context={Date,Intl};vm.createContext(context);vm.runInContext(code,context);const {coachSlotDates:dates,coachCalendarMonthData:month}=context.calendar;
const slot=(extra={})=>({id:'one',title:'團課',date:'2026-11-04 (週三)',time:'9:00 - 10:00',capacity:5,remaining:5,...extra});
test('single dates, slash dates and sheet UTC timestamps resolve to the actual Taiwan day',()=>{
 for(const value of ['2026-11-04 (週三)','2026/11/4','2026-11-03T16:00:00.000Z'])assert.deepEqual(Array.from(dates(slot({date:value}))),['2026-11-04']);
});
test('monthly dates expand every session in their explicit year without duplicating days',()=>{
 const s=slot({date:'2026年 11/4, 11/11, 11/11, 11/18, 11/25 (週三)'});
 assert.deepEqual(Array.from(dates(s)),['2026-11-04','2026-11-11','2026-11-18','2026-11-25']);assert.equal(month([s],[],'2027-11').days.some(d=>d.courses.length),false);
});
test('the calendar distinguishes opened courses from booked courses and excludes cancelled orders',()=>{
 const result=month([slot(),slot({id:'two'})],[{slotId:'one',status:'審核中'},{slotId:'one',status:'已完課'},{slotId:'two',status:'已取消'},{slotId:'deleted',status:'預約成功'}],'2026-11');
 const day=result.days.find(d=>d.date==='2026-11-04');assert.equal(day.courses.length,2);assert.equal(day.reservedCount,1);assert.equal(day.courses[0].orders.length,2);assert.equal(day.courses[1].orders.length,0);
});
test('capacity occupation also identifies historical reservations with missing order rows',()=>{
 const result=month([slot({remaining:3})],[],'2026-11').days[3];assert.equal(result.reservedCount,1);assert.equal(result.courses[0].occupied,2);
});
test('calendar weekdays, leap years and class ordering are correct',()=>{
 const nov=month([slot(),slot({id:'early',time:'8:30 - 9:30'}),slot({id:'late',time:'10:00 - 11:00'})],[],'2026-11');assert.equal(nov.leading,0);assert.equal(nov.days.length,30);assert.deepEqual(Array.from(nov.days[3].courses,c=>c.slot.id),['early','one','late']);
 assert.equal(month([],[],'2024-02').days.length,29);assert.equal(month([],[],'2025-02').days.length,28);
});
test('unreadable dates are flagged without guessing a year or silently moving invalid dates',()=>{
 const data=month([slot({date:'11/4, 11/11'}),slot({id:'bad',date:'2026-02-30'})],[],'2026-11');assert.equal(data.unparsed,2);assert.equal(data.days.some(d=>d.courses.length),false);assert.throws(()=>month([],[],'2026-13'),/有效月份/);
});
test('calendar carries each assigned coach and lists distinct names for each day',()=>{
 const result=month([slot({teachingCoachId:'a',teachingCoachName:'王教練'}),slot({id:'two',teachingCoachId:'b',teachingCoachName:'佐藤'}),slot({id:'three',teachingCoachId:'a',teachingCoachName:'王教練'})],[],'2026-11');
 const day=result.days[3];assert.deepEqual(Array.from(day.teachingCoachNames),['王教練','佐藤']);
 assert.equal(day.courses[1].slot.teachingCoachId,'b');assert.equal(day.courses[1].slot.teachingCoachName,'佐藤');
 const legacy=month([slot()],[],'2026-11');assert.deepEqual(Array.from(legacy.days[3].teachingCoachNames),[]);
});
