const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const code=source.slice(source.indexOf('        const fetchAPI ='),source.indexOf('        const CircleProgress ='))+'\nthis.request=fetchAPI;';
function setup(options={}){
 const calls=[];const context={API_URL:'https://example.test/api',window:{},fetch:async(url,request)=>{calls.push({url,body:JSON.parse(request.body)});if(options.networkError)throw Error('private-session-token');return {json:async()=>options.response||{status:'success',securityVersion:2}};}};
 if(!options.noLiff)context.liff={getAccessToken:()=>options.token===undefined?'current-session':options.token};
 vm.createContext(context);vm.runInContext(code,context);return {request:context.request,calls};
}
test('every frontend request uses the current LIFF session, including previously unauthenticated actions',async()=>{
 const f=setup();for(const action of ['checkUser','registerUser','bookClass','getStudentStats','getCoachData','approveBooking','addLog','deleteSlot'])assert.equal((await f.request({action,accessToken:'caller-override'})).status,'success');
 assert(f.calls.every(call=>call.body.accessToken==='current-session'));
});
test('missing sessions make no API calls',async()=>{
 for(const options of [{noLiff:true},{token:''},{token:null}]){const f=setup(options);assert.equal((await f.request({action:'bookClass'})).status,'error');assert.equal(f.calls.length,0);}
});
test('old or incomplete backend versions fail closed instead of enabling management',async()=>{
 for(const response of [{status:'success',isAdmin:true},{status:'success',securityVersion:1,isAdmin:true}]){const f=setup({response});const result=await f.request({action:'checkUser'});assert.equal(result.status,'error');assert.equal(result.isAdmin,undefined);}
});
test('network error details cannot expose session tokens',async()=>{
 const f=setup({networkError:true});const result=await f.request({action:'checkUser'});assert.equal(result.status,'error');assert(!JSON.stringify(result).includes('private-session-token'));
});
