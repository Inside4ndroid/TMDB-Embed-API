/* eslint-env browser */
(function(){
  const $ = sel => document.querySelector(sel);
  async function checkSession(){
    try {
      const r = await fetch('/auth/session');
      const j = await r.json();
      if (j.authenticated) {
        window.location.href = '/config.html';
      }
    } catch(e) { /* ignore */ }
  }

  async function login(username, password){
    const status = $('#status');
    status.textContent = 'Authenticating...';
    status.className = 'status';
    try {
      const r = await fetch('/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ username, password }) });
      const j = await r.json();
      if (!j.success) {
        if (j.error === 'LOCKED' || j.error === 'TOO_MANY_ATTEMPTS') {
          showLockout(j.retryAfter);
          status.textContent = 'Locked due to excessive attempts';
        } else if (j.error === 'INVALID_CREDENTIALS') {
          status.textContent = 'Invalid credentials';
          if (typeof j.remaining === 'number') {
            status.textContent += ` (${j.remaining} attempts left)`;
          }
        } else {
          status.textContent = j.error || 'Login failed';
        }
        status.classList.add('error');
        return false;
      }
      status.textContent = 'Success! Redirecting...';
      status.classList.add('success');
      setTimeout(()=>{ window.location.href = '/config.html'; }, 400);
      return true;
    } catch (e) {
      status.textContent = 'Network error';
      status.classList.add('error');
      return false;
    }
  }

  // Lockout handling
  let lockoutTimer = null;
  function showLockout(retryAfterSeconds){
    if (!retryAfterSeconds || retryAfterSeconds <= 0) return;
    const banner = $('#lockoutBanner');
    const countdownEl = $('#lockoutCountdown');
    banner.style.display = 'block';
    const end = Date.now() + (retryAfterSeconds * 1000);
    if (lockoutTimer) clearInterval(lockoutTimer);
    lockoutTimer = setInterval(()=>{
      const remain = end - Date.now();
      if (remain <= 0){
        clearInterval(lockoutTimer);
        banner.style.display = 'none';
        countdownEl.textContent = '00:00';
        return;
      }
      const sec = Math.ceil(remain/1000);
      const m = String(Math.floor(sec/60)).padStart(2,'0');
      const s = String(sec%60).padStart(2,'0');
      countdownEl.textContent = `${m}:${s}`;
    }, 1000);
  }

  async function changePassword(oldPassword, newPassword){
    const pwStatus = $('#pwStatus');
    pwStatus.textContent = 'Updating...';
    pwStatus.className = 'status';
    try {
      const r = await fetch('/auth/change-password', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ oldPassword, newPassword }) });
      const j = await r.json();
      if (!j.success) {
        pwStatus.textContent = j.error || 'Update failed';
        pwStatus.classList.add('error');
        return;
      }
      pwStatus.textContent = 'Password updated';
      pwStatus.classList.add('success');
      setTimeout(()=>{ $('#pwForm').reset(); }, 600);
    } catch(e){
      pwStatus.textContent = 'Network error';
      pwStatus.classList.add('error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Flash messaging based on query params
    const params = new URLSearchParams(location.search);
    const status = $('#status');
    if(params.has('loggedOut')) { status.textContent = 'Logged out successfully'; status.classList.add('success'); }
    else if(params.has('expired')) { status.textContent = 'Session expired. Please login again.'; status.classList.add('error'); }
    if(params.has('loggedOut') || params.has('expired')) {
      // Remove params from URL without reloading
      history.replaceState(null,'', location.pathname);
    }
    checkSession();
    $('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const u = $('#username').value.trim();
      const p = $('#password').value;
      if (!u || !p) return;
      login(u,p);
    });
    $('#togglePw').addEventListener('click', () => {
      const chg = $('#pwChange');
      const visible = chg.style.display === 'block';
      chg.style.display = visible ? 'none' : 'block';
    });
    $('#pwForm').addEventListener('submit', e => {
      e.preventDefault();
      const oldPw = $('#oldPw').value;
      const newPw = $('#newPw').value;
      if (newPw.length < 8) {
        $('#pwStatus').textContent = 'Password too short';
        $('#pwStatus').classList.add('error');
        return;
      }
      changePassword(oldPw, newPw);
    });
  });
})();
