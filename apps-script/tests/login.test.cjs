const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../complete/Code.gs'),'utf8').replace('U3a76953e63578ec8607297044ac54e5a','coach');
function run(id, actor=id){const ctx={
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'channel'})},
 UrlFetchApp:{fetch:url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:'channel',expires_in:3600}:{userId:actor})})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>null})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}};
 vm.createContext(ctx);vm.runInContext(source,ctx);return JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({action:'checkUser',lineId:id,accessToken:'mock'})}}).text);}
test('configured coach can log in without member sheet or new management helpers',()=>{const result=run('coach');assert.equal(result.status,'success');assert.equal(result.isAdmin,true);});
test('other IDs never gain coach access when the member sheet is unavailable',()=>{const result=run('other');assert.equal(result.status,'error');assert.notEqual(result.isAdmin,true);});

test('claiming the configured admin ID without its LINE identity never grants admin access',()=>{const result=run('coach','other');assert.equal(result.status,'error');assert.notEqual(result.isAdmin,true);});
