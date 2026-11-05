const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('const TRAINING_STEP_MINUTES ='),html.indexOf('const LOCATIONS_LIST ='))+'\nthis.metrics={normalizeTrainingMinutes,estimateTrainingRepetitions};';
const context={};vm.createContext(context);vm.runInContext(code,context);const {normalizeTrainingMinutes:normalize,estimateTrainingRepetitions:reps}=context.metrics;
test('training sliders select 5-minute increments within the existing two-hour limit',()=>{
 for(const [input,minutes] of [[0,0],[5,5],[10,10],[15,15],[7,5],[8,10],[-5,0],[120,120],[125,120]])assert.equal(normalize(input),minutes);
});
test('estimated repetitions use unrounded stored hours, preserving five-minute precision',()=>{
 for(const [minutes,count] of [[0,0],[5,40],[10,80],[15,120],[60,480],[120,960]])assert.equal(reps(minutes/60),count);
 assert.equal(reps(1/12+1/12+1/12),120);
});
test('historical hours retain their meaning, including totals beyond the radar ring limit',()=>{
 assert.equal(reps(0.1),48);assert.equal(reps(1.5),720);assert.equal(reps(25),12000);
});
test('missing or invalid durations never render NaN, negative or infinite counts',()=>{
 for(const value of [null,undefined,'',NaN,Infinity,-1,'wrong']){assert.equal(reps(value),0);assert.equal(normalize(value),0);}
});
