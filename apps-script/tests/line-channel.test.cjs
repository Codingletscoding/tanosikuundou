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

test('the production channel matches the LIFF SDK channel extraction rule',()=>{
 const frontend=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 const liffId=frontend.match(/const LIFF_ID = '([^']+)'/)[1];
 const channel=original.match(/const DEFAULT_LINE_LOGIN_CHANNEL_ID = '([^']+)'/)[1];
 assert.equal(channel,liffId.match(/([^-]+)-[^-]+/)[1]);assert.equal(channel,'2012115245');
});
test('the previous wrong script property is corrected only to the trusted site channel',()=>{
 const f=fixture({property:'2012115242',fallback:'2012115245',client:'2012115245'});
 assert.doesNotThrow(()=>f.context.monthlyVerifyCoach_('mock-token'));
 assert.throws(()=>fixture({property:'2012115242',fallback:'2012115245',client:'2012115242'}).context.monthlyVerifyCoach_('mock-token'),/頻道不符/);
});
test('channel mismatch reports public numeric IDs without reflecting arbitrary text',()=>{
 const f=fixture({property:'9999999999',client:'2012115245'});assert.throws(()=>f.context.monthlyVerifyCoach_('mock-token'),error=>/LINE：2012115245/.test(error.message)&&/後端：9999999999/.test(error.message));
 const unsafe=fixture({property:'secret-in-configuration',client:'secret-in-response'});
 assert.throws(()=>unsafe.context.monthlyVerifyCoach_('mock-token'),error=>!error.message.includes('secret-in-')&&!error.message.includes('mock-token'));
});
