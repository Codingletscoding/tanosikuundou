const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
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
