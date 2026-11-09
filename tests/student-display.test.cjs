const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const source=html.slice(html.indexOf('const studentNickname ='),html.indexOf('const validateAccountRecord ='));
const ctx={};vm.createContext(ctx);vm.runInContext(source+'\nthis.display=studentNickname;',ctx);
test('student display uses only the trimmed nickname',()=>assert.equal(ctx.display({name:'真實姓名',nickname:' 小龍 '}),'小龍'));
test('legacy students without nicknames never fall back to real names',()=>{
 for(const nickname of ['',null,undefined,'  '])assert.equal(ctx.display({name:'真實姓名',nickname},2),'學員 3');
 assert.equal(ctx.display(null),'學員 1');
});
