const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const original=fs.readFileSync(path.join(__dirname,'../complete/Code.gs'),'utf8');
function fixture(options={}){
 const calls=[];
 const source=original.replace(/const DEFAULT_LINE_LOGIN_CHANNEL_ID = '[^']*';/,`const DEFAULT_LINE_LOGIN_CHANNEL_ID = ${JSON.stringify(options.fallback??'trusted-channel')};`).replace('U3a76953e63578ec8607297044ac54e5a','coach');
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:key=>{assert.equal(key,'LINE_LOGIN_CHANNEL_ID');return options.property??null;}})},UrlFetchApp:{fetch:url=>{
  calls.push(url.includes('/verify?')?'verify':'profile');
  if(options.networkError)throw Error('sensitive mock-token');
  return {getResponseCode:()=>options.expired?401:200,getContentText:()=>JSON.stringify(url.includes('/verify?')?{client_id:options.client??'trusted-channel',expires_in:options.lifetime??3600}:{userId:options.user??'coach'})};
 }}};
 vm.createContext(context);vm.runInContext(source,context);return {context,calls};
}
for(const method of ['monthlyVerifyCoach_','verifyBookingDeletionCoach_']){
 test(`${method} authenticates the coach against a trusted server fallback when the script property is missing`,()=>{
  const f=fixture();assert.doesNotThrow(()=>f.context[method]('mock-token'));assert.deepEqual(f.calls,['verify','profile']);
 });
 test(`${method} respects the configured channel instead of the fallback`,()=>{
  const f=fixture({property:' configured-channel ',client:'configured-channel'});assert.doesNotThrow(()=>f.context[method]('mock-token'));
  assert.throws(()=>fixture({property:'configured-channel'}).context[method]('mock-token'),/驗證失敗/);
 });
 test(`${method} never bypasses token, channel, expiry or coach checks`,()=>{
  assert.throws(()=>fixture().context[method](''),/重新登入/);
  for(const options of [{client:'attacker-channel'},{expired:true},{lifetime:0},{user:'student'},{networkError:true}]){
   const f=fixture(options);assert.throws(()=>f.context[method]('mock-token'));
  }
 });
}
test('missing property and fallback fail before calling LINE',()=>{
 const f=fixture({fallback:''});assert.throws(()=>f.context.monthlyVerifyCoach_('mock-token'),/指令碼屬性/);assert.deepEqual(f.calls,[]);
});
test('account repair uses the same trusted channel while retaining account ownership checks',()=>{
 const f=fixture();assert.doesNotThrow(()=>f.context.verifyAccountOwner_('mock-token','coach'));
 assert.throws(()=>fixture().context.verifyAccountOwner_('mock-token','student'),/只能補登自己/);
 assert.throws(()=>fixture({client:'attacker-channel'}).context.verifyAccountOwner_('mock-token','coach'),/驗證失敗/);
});
