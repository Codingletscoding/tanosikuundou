const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const code=html.slice(html.indexOf('const formatTrainingDate ='),html.indexOf('const getDayOfWeek ='))+'\nthis.format = formatTrainingDate;';
const context={Intl,Date};vm.createContext(context);vm.runInContext(code,context);const format=context.format;
test('spreadsheet midnight in Taiwan displays the logged calendar date',()=>{
 assert.equal(format('2026-11-03T16:00:00.000Z'),'2026-11-04');
 assert.equal(format('2026-11-04T00:00:00+08:00'),'2026-11-04');
});
test('Taiwan midnight boundaries are not handled by truncating the UTC date',()=>{
 assert.equal(format('2026-11-03T15:59:59.999Z'),'2026-11-03');
 assert.equal(format('2026-11-03T16:00:00.000Z'),'2026-11-04');
 assert.equal(format('2026-12-31T16:00:00.000Z'),'2027-01-01');
 assert.equal(format('2024-02-28T16:00:00.000Z'),'2024-02-29');
});
test('date-only and existing text are preserved without a timezone shift',()=>{
 for(const value of ['2026-11-04','2026/11/4','舊版日期','2026-11-03T16:00:00'])assert.equal(format(value),value);
});
test('missing and malformed dates do not break log rendering',()=>{
 for(const value of [null,undefined,''])assert.equal(format(value),'');
 assert.equal(format('2026-13-40T00:00:00Z'),'2026-13-40T00:00:00Z');
});
test('the browser or host timezone does not change the Taiwan training date',()=>{
 const previous=process.env.TZ;
 try{for(const zone of ['UTC','Asia/Taipei','America/Los_Angeles','Pacific/Honolulu']){process.env.TZ=zone;assert.equal(format('2026-11-03T16:00:00.000Z'),'2026-11-04',zone);}}
 finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
