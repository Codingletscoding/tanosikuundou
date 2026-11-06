const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(language='ja') {
 const messages=[];const storage=new Map([['badminton.language',language]]);
 const document={readyState:'loading',addEventListener(){},body:{querySelectorAll:()=>[]},documentElement:{},querySelectorAll:()=>[],createTreeWalker:()=>({nextNode:()=>false})};
 const ctx={window:{alert:m=>messages.push(m),confirm:m=>{messages.push(m);return true;},dispatchEvent(){}},document,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},NodeFilter:{SHOW_TEXT:4},CustomEvent:class{},queueMicrotask};
 vm.createContext(ctx);for(const f of ['ja.js','i18n.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
 return {i:ctx.window.BadmintonI18n,window:ctx.window,messages,storage};
}
test('Japanese labels and full policy paragraphs have explicit translations',()=>{
 const {i,window}=setup();assert.equal(i.translate('教練管理後台'),'コーチ管理画面');assert.equal(i.translate('課程預約'),'レッスン予約');
 assert.equal(i.translate('天災停課'),'自然災害による休講');
 const policy=Object.keys(window.BadmintonJapanese).find(t=>t.startsWith('安全永遠是第一考量'));
 assert(i.translate(policy).includes('全額返金'));assert(!i.translate(policy).includes('當次課程'));
});
test('names and venue names survive mixed labels, options, and parentheses',()=>{
 const {i}=setup();i.remember({members:[{name:'陳教練(小明)'}],slots:[{location:'自選場地[二樓]+球館'}]});
 const text=i.translate('學生：陳教練(小明) · 預約 自選場地[二樓]+球館');
 assert(text.includes('陳教練(小明)'));assert(text.includes('自選場地[二樓]+球館'));assert(text.includes('予約'));assert(text.includes('受講者：'));
 assert.equal(i.translate('關聖里活動中心'),'關聖里活動中心');
});
test('dynamic counts, monthly prefixes, and weekdays translate without changing IDs',()=>{
 const {i}=setup();assert.equal(i.translate('[月繳4堂] 新手團課'),'[月額4回] 初心者グループレッスン');
 assert.equal(i.translate('2026-10-30 (週五)'),'2026-10-30 (金曜日)');assert.equal(i.translate('slot-123'),'slot-123');
 assert(!i.translate('教練專屬時段 (1對1 於 關聖里活動中心)').includes('於'));
});
test('alerts and confirmations use the selected language and retain names',()=>{
 const {i,window,messages}=setup();i.remember({name:'王小花'});window.alert('課程上架成功！');window.confirm('學生：王小花\n確定送出');
 assert.equal(messages[0],'レッスンを公開しました。');assert(messages[1].includes('王小花'));assert(messages[1].includes('送信を確定'));
});
test('Chinese is restored and preference is remembered',()=>{
 const {i,storage}=setup();i.setLanguage('zh-TW');assert.equal(i.translate('課程預約'),'課程預約');assert.equal(storage.get('badminton.language'),'zh-TW');i.setLanguage('ja');assert.equal(i.translate('課程預約'),'レッスン予約');
});
test('backend errors are translated without changing technical variable names',()=>{
 const {i}=setup();assert.equal(i.translate('尚未設定 LINE_LOGIN_CHANNEL_ID。'),'LINE_LOGIN_CHANNEL_IDが設定されていません。');
 assert(!i.translate('只能取消審核中或預約成功的訂單。').includes('預約'));
});

test('student nicknames remain unchanged when Japanese is selected',()=>{
 const {i}=setup();i.remember({students:[{nickname:'學生預約'},{nickname:'  學生 [預約]  '}]});
 assert.equal(i.translate('學生預約'),'學生預約');
 assert.equal(i.translate('學生 [預約]'),'學生 [預約]');
 assert(i.translate('學生預約 · 課程預約').includes('學生預約'));
});
test('teaching coach labels translate while names containing existing dictionary words remain unchanged',()=>{
 const {i}=setup();i.remember({teachingCoaches:[{id:'a',name:'學生預約教練'}]});
 assert.equal(i.translate('授課教練管理'),'担当コーチ管理');
 assert.equal(i.translate('授課教練：學生預約教練'),'担当コーチ：學生預約教練');
 assert.equal(i.translate('請選擇授課教練'),'担当コーチを選択してください');
});
test('historical booking fields translate while former teaching coach names remain intact',()=>{
 const {i}=setup();i.remember({teachingCoachName:'舊教練預約'});
 assert.equal(i.translate('補登歷史預約'),'過去の予約を追加');
 assert.equal(i.translate('歷史付款狀態'),'過去の支払状況');
 assert.equal(i.translate('授課教練：舊教練預約'),'担当コーチ：舊教練預約');
});

test('five-minute training units and approximate counts are translated',()=>{
 const {i}=setup();
 assert.equal(i.translate('每格 5 分鐘（約 40 次），每項最多 2 小時'),'5分単位（約40回）、各項目は最大2時間');
 assert.equal(i.translate('約 40 次'),'約 40 回');
 assert.equal(i.translate('訓練次數依每 5 分鐘約 40 次估算。'),'練習回数は5分あたり約40回で推定しています。');
});
