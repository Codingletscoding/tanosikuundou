const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../../complete/Code.gs'),'utf8');
const ADMIN='U3a76953e63578ec8607297044ac54e5a';
function fixture(options={}){
 let locked=false,sequence=0,sheetReads=0,failFlush=false,bookAppends=0;
 const students=[{id:'a',name:'王小明',nickname:'甲',age:20},{id:'b',name:'王小美',nickname:'乙',age:18}];
 const rows={
  '會員資料':[['LINE_ID','姓名','年齡','電話','註冊時間','等級','帳號學生資料'],['account','王小明',20,'0912345678',0,2,JSON.stringify(students)],['other','另一位',30,'0912345678',0,1,JSON.stringify([{id:'a',name:'另一位',nickname:'丙',age:30}])]],
  '可用時段':[['id','title','date','time','location','capacity','remaining','1','2','3','4','5','授課教練編號'],['group','團課','2026-12-01','19:00 - 20:00','場地A',5,5,300,294,285,270,159,'teacher'],['private','[專屬教練課] 1v1:1000|1v2:1500','2026-12-01','19:00 - 20:00','coach_loc:場地A,場地B',1,1,1000,980,950,900,880,'teacher'],['monthly','[月繳4堂] 團課','2026年 12/1, 12/8, 12/15, 12/22','19:00 - 20:00','場地A',5,5,1000,980,950,900,530,'teacher']],
  '預約名單':[['時間','課程','LINE_ID','姓名','金額','狀態','付款','訂單','來源請假編號','學生編號','專屬教練課預約組別']],
  '訓練日誌':[['時間','LINE_ID','姓名','日期','高遠','平抽','挑球','切球','小球','撲球','殺球','防守','組合','日誌','學生編號']],
  '授課教練':[['教練編號','教練姓名'],['teacher','測試教練']]
 };
 const sheet=name=>!rows[name]?null:{getDataRange:()=>({getValues:()=>rows[name].map(r=>r.slice())}),appendRow:row=>{assert(locked);if(name==='預約名單'&&++bookAppends===options.failBookingAppend)throw Error('append failed');rows[name].push(row.slice());},deleteRow:index=>{assert(locked);rows[name].splice(index-1,1);},getRange:(r,c)=>({setValue:value=>{assert(locked);rows[name][r-1][c-1]=value;},setValues:values=>{assert(locked);values.forEach((cells,y)=>cells.forEach((value,x)=>rows[name][r+y-1][c+x-1]=value));}})};
 const ss={getSheetByName:name=>{sheetReads++;return sheet(name);},insertSheet:name=>{assert(locked);assert(!rows[name]);rows[name]=[];return sheet(name);}};
 const now=Date.parse(options.now||'2026-11-09T12:00:00+08:00');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const tokens={user:'account',other:'other',coach:ADMIN,fresh:'fresh'};
 const network=[];
 const ctx={Date:Clock,Intl,SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush:()=>{if(failFlush){failFlush=false;throw Error('flush failed');}}},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'channel'})},LockService:{getScriptLock:()=>({tryLock:()=>{if(options.busy)return false;assert(!locked);locked=true;return true;},releaseLock:()=>{assert(locked);locked=false;}})},Utilities:{getUuid:()=>`fixture-id-${++sequence}`,formatDate:(date,zone)=>{assert.equal(zone,'Asia/Taipei');return new Date(date.getTime()+8*3600000).toISOString().slice(0,10);}},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},UrlFetchApp:{fetch:(url,config)=>{
  network.push({kind:url.includes('/verify?')?'verify':'profile',locked});
  const token=url.includes('/verify?')?decodeURIComponent(url.split('access_token=')[1]):String(config.headers.Authorization).slice(7);
  return {getResponseCode:()=>tokens[token]||['expired','wrong-channel'].includes(token)?200:401,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:token==='wrong-channel'?'wrong':'channel',expires_in:token==='expired'?0:3600}:{userId:tokens[token]||'account'})};
 }}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 const run=(payload,token='user')=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({accessToken:token,...payload})}}).text);
 return {rows,context:ctx,run,students,network,state:()=>({locked,sheetReads}),failNextFlush:()=>{failFlush=true;}};
}
module.exports={fixture,ADMIN};
