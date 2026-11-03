const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const validation=html.slice(html.indexOf('const validateAccountRecord ='),html.indexOf('const RegisterView ='));
const loader=html.slice(html.indexOf('const loadStudentAccountForCoach ='),html.indexOf('const CoachDashboard ='));
function setup(response){const calls=[];const ctx={fetchAPI:async payload=>{calls.push(payload);return response;}};vm.createContext(ctx);vm.runInContext(validation+'\n'+loader+'\nthis.load=loadStudentAccountForCoach;',ctx);return {...ctx,calls};}
const user={students:[{id:'s1',nickname:'甲'},{id:'s2',nickname:'乙'}],studentCount:2};
test('coach opens full account data instead of passing a summary to student dashboard',async()=>{const f=setup({status:'success',isRegistered:true,user});const result=await f.load({lineId:'account',studentId:'s2',name:'summary'});assert.equal(result.userRecord,user);assert.equal(result.studentId,'s2');assert.equal(f.calls[0].action,'checkUser');assert.equal(f.calls[0].lineId,'account');});
test('legacy member summary without an ID selects the first account student',async()=>{const f=setup({status:'success',isRegistered:true,user});assert.equal((await f.load({lineId:'account'})).studentId,'s1');});
test('a removed student or a deleted account cannot open another student by accident',async()=>{await assert.rejects(setup({status:'success',isRegistered:true,user}).load({lineId:'account',studentId:'removed'}),/已不在帳號內/);await assert.rejects(setup({status:'success',isRegistered:false,user:null}).load({lineId:'account'}),/尚未完成註冊/);});
test('loading failures and incomplete account responses become recoverable errors',async()=>{await assert.rejects(setup({status:'error',message:'暫時無法讀取'}).load({lineId:'account'}),/暫時無法讀取/);await assert.rejects(setup(null).load({lineId:'account'}),/讀取失敗/);await assert.rejects(setup({status:'success',isRegistered:true,user:{name:'summary'}}).load({lineId:'account'}),/完整學生資料/);});
test('missing account ID does not send a request',async()=>{const f=setup({});await assert.rejects(f.load({}),/缺少帳號資料/);assert.equal(f.calls.length,0);});
