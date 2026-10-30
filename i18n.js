(() => {
  'use strict';
  const dictionary = window.BadmintonJapanese || {};
  const protectedNames = new Set(['關聖里活動中心','永康嘉世','仁德羽潮','南區羽潮','自理場地(需私訊確認)']);
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = Object.keys(dictionary).filter(key => key.length > 1).sort((a,b) => b.length-a.length);
  const pattern = new RegExp(keys.map(escape).join('|'), 'g');
  let language = 'zh-TW';
  try { if (localStorage.getItem('badminton.language') === 'ja') language = 'ja'; } catch (_) {}
  let protectedPattern = null;
  const rebuildProtected = () => { protectedPattern = new RegExp([...protectedNames].filter(Boolean).sort((a,b)=>b.length-a.length).map(escape).join('|'), 'g'); };
  rebuildProtected();
  const remember = value => {
    let changed = false;
    const add = name => { if (typeof name === 'string' && name && !protectedNames.has(name)) { protectedNames.add(name); changed = true; } };
    const visit = data => {
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data)) { data.forEach(visit); return; }
      for (const [key, item] of Object.entries(data)) {
        if (key === 'name' || key === 'displayName') add(typeof item === 'string' ? item.split(' [')[0] : item);
        if (['location','makeupLocation','selectedLoc'].includes(key) && typeof item === 'string') item.replace(/^coach_loc:/,'').split(',').forEach(add);
        if (item && typeof item === 'object') visit(item);
      }
    };
    visit(value); if (changed) rebuildProtected();
  };
  const replace = text => {
    if (Object.hasOwn(dictionary, text)) return dictionary[text];
    const trimmed = text.trim();
    const normalized = trimmed.replace(/\s+/g,' ');
    if (Object.hasOwn(dictionary, normalized)) return text.slice(0,text.indexOf(trimmed)) + dictionary[normalized] + text.slice(text.indexOf(trimmed)+trimmed.length);
    return text.replace(pattern, match => dictionary[match]);
  };
  const translate = text => {
    text = String(text);
    if (language !== 'ja') return text;
    // Keep literal names out of the replacement pass, including mixed labels/options/dialogs.
    const names = [];
    const masked = text.replace(protectedPattern, match => { names.push(match); return `\uE000${names.length-1}\uE001`; });
    return replace(masked).replace(/\uE000(\d+)\uE001/g, (_, index) => names[Number(index)]);
  };
  const textStates = new WeakMap(), attributeStates = new WeakMap();
  const readOriginal = (state, current) => state && current === state.translated ? state.original : current;
  let observer, pending = false;
  const ignored = element => element && element.closest('script,style,textarea,[translate="no"],[data-i18n-ignore]');
  const apply = () => {
    if (observer) observer.disconnect();
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (ignored(node.parentElement)) continue;
        const original = readOriginal(textStates.get(node), node.nodeValue);
        const translated = translate(original);
        textStates.set(node, { original, translated });
        if (node.nodeValue !== translated) node.nodeValue = translated;
      }
      for (const element of document.body.querySelectorAll('[placeholder],[title],[alt],[aria-label],[data-label]')) {
        if (ignored(element)) continue;
        const states = attributeStates.get(element) || {};
        for (const attr of ['placeholder','title','alt','aria-label','data-label']) {
          if (!element.hasAttribute(attr)) continue;
          const original = readOriginal(states[attr],element.getAttribute(attr));
          const translated = translate(original);
          states[attr] = { original, translated };
          if (element.getAttribute(attr) !== translated) element.setAttribute(attr,translated);
        }
        attributeStates.set(element,states);
      }
      document.documentElement.lang = language;
      document.title = translate('樂動羽球');
      document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.language === language)));
    } finally {
      if (observer) observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','alt','aria-label','data-label']});
    }
  };
  const schedule = () => { if (!pending) { pending = true; queueMicrotask(() => { pending = false; apply(); }); } };
  const setLanguage = next => {
    language = next === 'ja' ? 'ja' : 'zh-TW';
    try { localStorage.setItem('badminton.language',language); } catch (_) {}
    apply();
    window.dispatchEvent(new CustomEvent('badminton-language-change',{detail:language}));
  };
  const originalAlert = window.alert.bind(window), originalConfirm = window.confirm.bind(window);
  window.alert = message => originalAlert(translate(message));
  window.confirm = message => originalConfirm(translate(message));
  window.BadmintonI18n = { translate, remember, setLanguage, getLanguage:()=>language };
  const start = () => {
    const toolbar = document.createElement('nav');
    toolbar.className = 'language-switch'; toolbar.setAttribute('translate','no'); toolbar.setAttribute('aria-label','Language / 語言');
    for (const [value,label] of [['zh-TW','中文'],['ja','日本語']]) {
      const button = document.createElement('button');button.type='button';button.textContent=label;button.dataset.language=value;
      button.addEventListener('click',()=>setLanguage(value));toolbar.append(button);
    }
    document.body.prepend(toolbar);
    observer = new MutationObserver(schedule);apply();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
