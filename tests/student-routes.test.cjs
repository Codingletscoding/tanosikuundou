const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const source=html.slice(html.indexOf('const STUDENT_ROUTES ='),html.indexOf('const StudentDashboard ='));
function setup(hash=''){
 const storage=new Map(),replacements=[];
 const ctx={sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},window:{location:{hash,pathname:'/',search:'?from=line'},history:{state:null,replaceState:(_,__,url)=>replacements.push(url)}}};
 vm.createContext(ctx);vm.runInContext(source+'\nthis.routes={rememberStudentRoute,restoreStudentRoute,studentTabFromHash};',ctx);return {...ctx,storage,replacements};
}
test('booking and training logs resolve to distinct student views',()=>{
 const {routes}=setup();assert.equal(routes.studentTabFromHash('#/booking'),'booking');assert.equal(routes.studentTabFromHash('#/training-logs'),'records');assert.equal(routes.studentTabFromHash(''),'booking');
});
test('training log destination survives LINE removing the hash during login',()=>{
 const f=setup('#/training-logs');f.routes.rememberStudentRoute();f.window.location.hash='';f.routes.restoreStudentRoute();assert.deepEqual(f.replacements,['/?from=line#/training-logs']);assert.equal(f.storage.size,0);
});
test('an explicit current route overrides a saved login destination',()=>{
 const f=setup('#/training-logs');f.routes.rememberStudentRoute();f.window.location.hash='#/booking';f.routes.restoreStudentRoute();assert.deepEqual(f.replacements,[]);assert.equal(f.storage.size,0);
});
test('external or invalid pending destinations are ignored',()=>{
 const f=setup();f.storage.set('badminton.studentRoute','https://other.example');f.routes.restoreStudentRoute();assert.deepEqual(f.replacements,[]);assert.equal(f.storage.size,0);
});
