(() => {
  'use strict';
  if (new URLSearchParams(location.search).has('test') || navigator.webdriver) return;
  const endpoint = 'https://datts-calculator-stats.datts-vk-226271074.workers.dev/events';
  const once = new Set();
  let memoryVisitor = crypto.randomUUID(), memorySession = {id:crypto.randomUUID(), at:Date.now()};
  let queue = [], busy = false;
  const get = (key, fallback) => { try {return JSON.parse(localStorage.getItem(key)) || fallback;} catch {return fallback;} };
  const put = (key, value) => {try {localStorage.setItem(key, JSON.stringify(value));} catch {}};
  function identity() {
    let vid = get('datts-visitor', memoryVisitor);
    if (typeof vid !== 'string' || !/^[a-f0-9-]{36}$/.test(vid)) vid = memoryVisitor;
    put('datts-visitor', vid);
    let session = get('datts-session', memorySession);
    if (!session || typeof session.id !== 'string' || !/^[a-f0-9-]{36}$/.test(session.id) || !(session.at > Date.now()-1800000)) session={id:crypto.randomUUID()};
    session.at=Date.now(); memorySession=session; put('datts-session',session);
    return {vid,sid:session.id};
  }
  async function flush() {
    if (busy || !queue.length) return;
    busy=true;
    const batch=queue.splice(0,30);
    try {
      const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},
        body:JSON.stringify(batch),keepalive:true,credentials:'omit'});
      if (!r.ok) throw Error('statistics unavailable');
    } catch {queue.unshift(...batch); queue=queue.slice(0,100);} finally {busy=false;}
  }
  window.dattsTrack = name => {
    const person=identity();
    // Editing is a session-level conversion; do not send a request for every keystroke.
    if (name==='parameters_changed') {
      const key=person.sid+name;
      if (once.has(key)) return;
      once.add(key);
    }
    queue.push({id:crypto.randomUUID(),...person,name});
    flush();
  };
  window.dattsTrack('visit');
  setInterval(flush,15000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
})();
