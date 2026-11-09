const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const start=source.indexOf('const validateAccountRecord =');
const end=source.indexOf('const RegisterView =',start);
const ctx={};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nthis.validate = validateAccountRecord;',ctx);
test('missing backend student data cannot silently become a single student',()=>{
 for(const user of [null,{name:'代表'},{students:[]},{students:[{},{},{},{}]}])assert.throws(()=>ctx.validate(user),/Apps Script/);
});
test('three registered students must remain three after save and login',()=>{
 const user={students:[{id:'a'},{id:'b'},{id:'c'}],studentCount:3,registrationComplete:true};assert.equal(ctx.validate(user,3),user);
 assert.throws(()=>ctx.validate({...user,students:[{id:'a'}],studentCount:1},3),/尚未完整儲存/);
});
test('inconsistent backend count and incomplete registration are rejected',()=>{
 assert.throws(()=>ctx.validate({students:[{id:'a'}],studentCount:3}),/不一致/);
 assert.throws(()=>ctx.validate({students:[{id:'a'}],registrationComplete:false},1),/尚未完整儲存/);
});
test('legacy profile with an explicit student list remains readable before repair',()=>{
 const legacy={students:[{id:'',name:'舊學生'}],studentCount:1,registrationComplete:false};assert.equal(ctx.validate(legacy),legacy);
});

vm.runInContext('this.balance = rebalanceLessonStyle; this.birthday = registrationBirthday;',ctx);
test('birthday selection rejects invalid, incomplete and future dates while accepting leap years',()=>{
 assert.equal(ctx.birthday({birthYear:'2000',birthMonth:'2',birthDay:'29'},'2026-11-04'),'2000-02-29');
 for(const [birthYear,birthMonth,birthDay] of [['2023','2','29'],['2024','4','31'],['2027','1','1'],['','1','1'],['2020','','1'],['2020','1',''],['1900','1','1']])assert.throws(()=>ctx.birthday({birthYear,birthMonth,birthDay},'2026-11-04'),/出生年月日/);
});
test('moving any style slider preserves integer percentages and a total of 100, including endpoints',()=>{
 let style={theory:34,multiball:33,correction:33};
 for(const key of ['theory','multiball','correction'])for(const value of [0,100,0,1,99,50,10,90,33]){
  style=ctx.balance(style,key,value);assert.equal(style[key],value);assert.equal(Object.values(style).reduce((sum,n)=>sum+n,0),100);assert(Object.values(style).every(n=>Number.isInteger(n)&&n>=0&&n<=100));
 }
});
