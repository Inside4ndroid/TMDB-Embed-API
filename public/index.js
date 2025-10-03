// Admin panel logic (refactored into IIFE, no inline handlers)
(function(){
async function fetchConfig(){
	const r = await fetch('/api/config');
	if(!r.ok) throw new Error('Failed to fetch config');
	return r.json();
}
async function fetchProviders(){
	const r = await fetch('/api/providers');
	if(!r.ok) throw new Error('Failed to fetch providers');
	return r.json();
}

function setFebboxCookies(cookiesArray){
	const listEl = document.getElementById('febboxCookieList');
	const hidden = document.querySelector('input[name="febboxCookiesHidden"]');
	if(!listEl || !hidden) return;
	const arr = Array.isArray(cookiesArray)? cookiesArray.filter(c=>c && typeof c==='string') : [];
	hidden.value = arr.join(',');
	listEl.innerHTML = arr.length? arr.map((c,i)=>`<div class="cookie-item" data-idx="${i}"><code>${c}</code><button type="button" class="remove" title="Remove" data-action="rm" data-idx="${i}">✕</button></div>`).join('') : '<div class="empty">No cookies added</div>';
}
function addFebboxCookie(){
	const input = document.getElementById('febboxCookieInput');
	const val = (input.value||'').trim();
	if(!val) return;
	const hidden = document.querySelector('input[name="febboxCookiesHidden"]');
	const existing = hidden.value? hidden.value.split(',').filter(Boolean):[];
	if(existing.includes(val)) { input.value=''; return; }
	existing.push(val);
	setFebboxCookies(existing);
	input.value='';
	validate();
}
function removeFebboxCookie(idx){
	const hidden = document.querySelector('input[name="febboxCookiesHidden"]');
	const existing = hidden.value? hidden.value.split(',').filter(Boolean):[];
	const next = existing.filter((_,i)=> i!=idx);
	setFebboxCookies(next);
	validate();
}
document.addEventListener('click', (e)=>{
	const btn = e.target.closest('#addFebboxCookieBtn');
	if(btn){ addFebboxCookie(); }
	const rm = e.target.closest('.cookie-item button.remove');
	if(rm){ const idx = rm.dataset.idx; removeFebboxCookie(idx); }
});
document.addEventListener('keydown',(e)=>{ if(e.key==='Enter' && e.target.id==='febboxCookieInput'){ e.preventDefault(); addFebboxCookie(); }});

// TMDB multi-key management
function setTmdbKeys(keys){
	const listEl = document.getElementById('tmdbKeyList');
	const hidden = document.querySelector('input[name="tmdbApiKeysHidden"]');
	if(!listEl || !hidden) return;
	const arr = Array.isArray(keys)? keys.filter(k=>k && typeof k==='string') : [];
	hidden.value = arr.join(',');
	listEl.innerHTML = arr.length? arr.map((k,i)=>`<div class="key-item" data-idx="${i}"><code>${k}</code><button type="button" class="remove" data-action="rm-tmdb" data-idx="${i}" title="Remove">✕</button></div>`).join('') : '<div class="empty">No TMDB keys</div>';
}
function addTmdbKey(){
	const input = document.getElementById('tmdbKeyInput');
	const val = (input.value||'').trim();
	if(!val) return;
	const hidden = document.querySelector('input[name="tmdbApiKeysHidden"]');
	const existing = hidden.value? hidden.value.split(',').filter(Boolean):[];
	if(existing.includes(val)) { input.value=''; return; }
	existing.push(val);
	setTmdbKeys(existing);
	input.value='';
	validate();
}
function removeTmdbKey(idx){
	const hidden = document.querySelector('input[name="tmdbApiKeysHidden"]');
	const existing = hidden.value? hidden.value.split(',').filter(Boolean):[];
	setTmdbKeys(existing.filter((_,i)=> i!=idx));
	validate();
}
document.addEventListener('click',(e)=>{
	if(e.target.closest('#addTmdbKeyBtn')) addTmdbKey();
	const rm = e.target.closest('.key-item button.remove');
	if(rm){ removeTmdbKey(rm.dataset.idx); }
});
document.addEventListener('keydown',(e)=>{ if(e.key==='Enter' && e.target.id==='tmdbKeyInput'){ e.preventDefault(); addTmdbKey(); }});

function fillForm(data){
	const merged = data.merged || {};
	const override = data.override || {};
	const f = document.getElementById('cfgForm');
	const fields = ['port'];
	fields.forEach(k=>{ if(!f.elements[k]) return; const ov = override[k]; f.elements[k].value = ov !== undefined ? ov : (merged[k]||''); });
	if (f.elements['defaultRegion']) {
		const val = override.defaultRegion !== undefined ? override.defaultRegion : (merged.defaultRegion || '');
		f.elements['defaultRegion'].value = val || '';
	}
	f.elements['defaultProviders'].value = (override.defaultProviders || merged.defaultProviders || []).join(',');
	(function(){
		let cookiesVal = override.febboxCookies || merged.febboxCookies || [];
		if(typeof cookiesVal === 'string') {
			const trimmed = cookiesVal.trim();
			if(trimmed.startsWith('[') && trimmed.endsWith(']')) { try { const arr = JSON.parse(trimmed); if(Array.isArray(arr)) cookiesVal = arr; } catch{} }
			else if (trimmed.includes(',') || trimmed.includes('\n') || trimmed.includes(';')) {
				cookiesVal = trimmed.split(/[\n;,]+/).map(s=>s.trim()).filter(Boolean);
			} else if(trimmed) cookiesVal = [trimmed]; else cookiesVal = [];
		}
		if(!Array.isArray(cookiesVal)) cookiesVal = [];
		setFebboxCookies(cookiesVal);
	})();
	(function(){
		let keys = override.tmdbApiKeys || merged.tmdbApiKeys || [];
		if(!Array.isArray(keys)) {
			if (override.tmdbApiKey) keys = [override.tmdbApiKey];
			else if (merged.tmdbApiKey) keys = [merged.tmdbApiKey];
			else keys = [];
		}
		setTmdbKeys(keys);
	})();
	const mqRaw = override.minQualitiesRaw !== undefined ? override.minQualitiesRaw : (merged.minQualitiesRaw || '');
	const presetValues = ['all','480p','720p','1080p','1440p','2160p'];
	let matchedPreset = presetValues.includes((mqRaw||'').toLowerCase()) ? mqRaw.toLowerCase() : (mqRaw? 'custom':'all');
	const presetInput = document.querySelector(`input[name="qualityPreset"][value="${matchedPreset}"]`) || document.querySelector('input[name="qualityPreset"][value="all"]');
	if (presetInput) presetInput.checked = true;
	const customField = document.querySelector('textarea[name="minQualitiesRaw"]');
	if (customField) {
		if (matchedPreset === 'custom') { customField.disabled = false; customField.value = mqRaw; }
		else { customField.disabled = true; customField.value = ''; }
	}
	const excRaw = override.excludeCodecsRaw !== undefined ? override.excludeCodecsRaw : (merged.excludeCodecsRaw || '');
	let parsed = null; try { if(excRaw && /[\{\[]/.test(excRaw)) parsed = JSON.parse(excRaw); } catch {}
	let mode = 'none';
	if(parsed){
		const dv = parsed.excludeDV === true;
		const hdr = parsed.excludeHDR === true;
		if(!dv && !hdr) mode = 'none';
		else if(dv && hdr) mode = 'all';
		else if(dv && !hdr) mode = 'dv';
		else if(hdr && !dv) mode = 'hdr';
		else mode = 'advanced';
	} else if(excRaw){
		if(/excludeDV":true/.test(excRaw) && !/excludeHDR":true/.test(excRaw)) mode='dv';
		else if(/excludeHDR":true/.test(excRaw) && !/excludeDV":true/.test(excRaw)) mode='hdr';
		else mode='advanced';
	}
	const presetInputC = document.querySelector(`input[name="codecPreset"][value="${mode}"]`) || document.querySelector('input[name="codecPreset"][value="all"]');
	if(presetInputC) presetInputC.checked = true;
	const codecTa = document.querySelector('textarea[name="excludeCodecsRaw"]');
	if(mode==='advanced') { codecTa.disabled=false; codecTa.value = excRaw || JSON.stringify({excludeDV:false,excludeHDR:false}); }
	else { codecTa.disabled=true; codecTa.value=''; }
	document.getElementById('currentCfg').textContent = JSON.stringify(merged, null, 2);
	document.getElementById('overrideCfg').textContent = Object.keys(override).length? JSON.stringify(override,null,2): '(none)';
	document.getElementById('bootWarn').style.display = (!merged.febboxCookies || merged.febboxCookies.length===0)? 'block':'none';
	// Removed version & overrides pills from UI; logic deleted
	const cacheBanner = document.getElementById('cacheDisabledBanner'); if(cacheBanner) cacheBanner.style.display = merged.disableCache? 'block':'none';
	const tmdbBanner = document.getElementById('tmdbMissingBanner');
	if(tmdbBanner){
		const tmdbMissing = !((override.tmdbApiKeys && override.tmdbApiKeys.length) || (merged.tmdbApiKeys && merged.tmdbApiKeys.length) || override.tmdbApiKey || merged.tmdbApiKey);
		const tmdbProvidersEnabled = [
			merged.enableShowboxProvider !== false,
			merged.enable4khdhubProvider !== false,
			merged.enableMoviesmodProvider !== false,
			merged.enableMp4hydraProvider !== false
		].some(Boolean);
		tmdbBanner.style.display = (tmdbMissing && tmdbProvidersEnabled)? 'block':'none';
	}
	const advBools = [
		['enable4khdhubProvider','adv_enable4khdhub'],
		['enableMoviesmodProvider','adv_enableMoviesmod'],
		['enableMp4hydraProvider','adv_enableMp4hydra'],
		['enableVidzeeProvider','adv_enableVidzee'],
		['enableVixsrcProvider','adv_enableVixsrc'],
		['enableProxy','adv_enableProxy'],
		['disableCache','adv_disableCache'],
		['enablePStreamApi','adv_enablePStream'],
		['disableUrlValidation','adv_disableUrlValidation'],
		['disable4khdhubUrlValidation','adv_disable4khdhubValidation']
	];
	advBools.forEach(([cfgKey, elName])=>{ const el = f.elements[elName]; if(!el) return; const src = (override[cfgKey]!==undefined? override[cfgKey] : merged[cfgKey]); if(el.type==='checkbox'){ el.checked = !!src; } else { el.value = src? 'true':''; } });
	const advTexts = [
	['showboxCacheDir','adv_showboxCacheDir']
	];
	advTexts.forEach(([cfgKey, elName])=>{ const el = f.elements[elName]; if(!el) return; const val = override[cfgKey]!==undefined? override[cfgKey] : merged[cfgKey]; el.value = val || ''; });
	// Sync checkbox style advanced flags
	const advFlagMap = {
		adv_disableCache: 'disableCache',
		adv_disableUrlValidation: 'disableUrlValidation',
		adv_disable4khdhubValidation: 'disable4khdhubUrlValidation'
	};
	Object.entries(advFlagMap).forEach(([inputName, cfgKey]) => {
		const el = f.elements[inputName];
		if(!el) return;
		const val = override[cfgKey] !== undefined ? override[cfgKey] : merged[cfgKey];
		el.checked = !!val;
	});
}

async function reload(){
	try {
		const data = await fetchConfig();
		fillForm(data);
		renderProviderMatrix(data.merged);
		validate();
		setStatus('');
	} catch(e){ setStatus('Load failed: '+e.message,true); }
}

function setStatus(msg, isErr){
	const el = document.getElementById('status');
	el.textContent = msg;
	el.style.color = isErr? '#dc2626':'inherit';
}

async function save(){
	const f = document.getElementById('cfgForm');
	const payload = {};
	const dp = f.elements['defaultProviders'].value.trim();
	if (dp) payload.defaultProviders = dp.split(/[\s,]+/).filter(Boolean);
	['port'].forEach(k=>{
		if(!f.elements[k]) return;
		const v = f.elements[k].value.trim();
		payload[k] = v? v : null;
	});
	const selPreset = document.querySelector('input[name="qualityPreset"]:checked');
	if (selPreset) {
		if (selPreset.value === 'custom') {
			const cv = f.elements['minQualitiesRaw'].value.trim();
			if (cv) payload.minQualitiesRaw = cv; else payload.minQualitiesRaw = null;
		} else {
			payload.minQualitiesRaw = selPreset.value === 'all' ? 'all' : selPreset.value;
		}
	}
	const cPreset = document.querySelector('input[name="codecPreset"]:checked');
	if(cPreset){
		if(cPreset.value==='none') payload.excludeCodecsRaw = JSON.stringify({excludeDV:false,excludeHDR:false});
		else if(cPreset.value==='all') payload.excludeCodecsRaw = JSON.stringify({excludeDV:true,excludeHDR:true});
		else if(cPreset.value==='dv') payload.excludeCodecsRaw = JSON.stringify({excludeDV:true,excludeHDR:false});
		else if(cPreset.value==='hdr') payload.excludeCodecsRaw = JSON.stringify({excludeDV:false,excludeHDR:true});
		else if(cPreset.value==='advanced') {
			const raw = document.querySelector('textarea[name="excludeCodecsRaw"]').value.trim();
			payload.excludeCodecsRaw = raw || null;
		}
	}
	const drSel = f.elements['defaultRegion'];
	if (drSel) payload.defaultRegion = drSel.value ? drSel.value : null;
	const cookiesHidden = f.elements['febboxCookiesHidden'];
	if(cookiesHidden){
		const cookiesVal = cookiesHidden.value.trim();
		payload.febboxCookies = cookiesVal? cookiesVal.split(',').filter(Boolean) : [];
	}
	const boolMap = {
		adv_enable4khdhub:'enable4khdhubProvider',
		adv_enableMoviesmod:'enableMoviesmodProvider',
		adv_enableMp4hydra:'enableMp4hydraProvider',
		adv_enableVidzee:'enableVidzeeProvider',
		adv_enableVixsrc:'enableVixsrcProvider',
		adv_enableProxy:'enableProxy',
		adv_disableCache:'disableCache',
		adv_enablePStream:'enablePStreamApi',
		adv_disableUrlValidation:'disableUrlValidation',
		adv_disable4khdhubValidation:'disable4khdhubUrlValidation'
	};
	Object.entries(boolMap).forEach(([formName,cfgKey])=>{ const el = f.elements[formName]; if(el) payload[cfgKey] = !!el.checked; });
	const textMap = { adv_showboxCacheDir:'showboxCacheDir' };
	Object.entries(textMap).forEach(([formName,cfgKey])=>{ const el = f.elements[formName]; if(!el) return; const v = el.value.trim(); payload[cfgKey] = v? v : null; });
	const tmdbHidden = f.elements['tmdbApiKeysHidden'];
	if (tmdbHidden){
		const raw = tmdbHidden.value.trim();
		payload.tmdbApiKeys = raw? raw.split(',').filter(Boolean) : [];
		payload.tmdbApiKey = null;
	}
	try {
		const r = await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
		const js = await r.json();
		if(!js.success) throw new Error(js.error||'Save failed');
		setStatus('Saved ✔');
		fillForm(js);
	} catch(e){ setStatus(e.message,true); }
}

function openConfirmReset(){
	const modal = document.getElementById('confirmReset');
	if(!modal) return Promise.resolve(false);
	// Respect persisted preference
	try {
		const skip = localStorage.getItem('ns_confirmReset_skip') === '1';
		if (skip) return Promise.resolve(true);
	} catch {}
	modal.classList.add('show');
	return new Promise(resolve => {
		const onClick = (e)=>{
			const action = e.target?.dataset?.action;
			if(action==='confirm'){
				try {
					const dontAsk = modal.querySelector('#confirmResetDontAsk')?.checked;
					if (dontAsk) localStorage.setItem('ns_confirmReset_skip','1');
				} catch {}
				cleanup(); resolve(true);
			}
			if(action==='cancel' || e.target===modal.querySelector('.modal-backdrop')){ cleanup(); resolve(false); }
		};
		function onKey(e){ if(e.key==='Escape'){ cleanup(); resolve(false); } }
		function cleanup(){ modal.classList.remove('show'); modal.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); }
		modal.addEventListener('click', onClick);
		document.addEventListener('keydown', onKey);
	});
}

function openConfirmRestart(){
	const modal = document.getElementById('confirmRestart');
	if(!modal) return Promise.resolve(false);
	modal.classList.add('show');
	return new Promise(resolve => {
		const onClick = (e)=>{
			const action = e.target?.dataset?.action;
			if(action==='confirm'){ cleanup(); resolve(true); }
			if(action==='cancel' || e.target===modal.querySelector('.modal-backdrop')){ cleanup(); resolve(false); }
		};
		function onKey(e){ if(e.key==='Escape'){ cleanup(); resolve(false); } }
		function cleanup(){ modal.classList.remove('show'); modal.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); }
		modal.addEventListener('click', onClick);
		document.addEventListener('keydown', onKey);
	});
}

async function clearAll(){
	const confirmed = await openConfirmReset();
	if(!confirmed) return;
	// To truly reset to app defaults, we must:
	// - Explicitly clear arrays so env fallbacks don't persist
	// - Set boolean flags to their default values (rather than null)
	// - Null legacy single TMDB key
	const payload = {
		port: null,
		defaultRegion: null,
		defaultProviders: [],
		minQualitiesRaw: 'all',
		excludeCodecsRaw: JSON.stringify({excludeDV:false,excludeHDR:false}),
		// Explicit empty arrays ensure override wins over any prior env mirror
		febboxCookies: [],
		tmdbApiKeys: [],
		tmdbApiKey: null,
		// Provider enable flags default to true
		enableShowboxProvider: true,
		enable4khdhubProvider: true,
		enableMoviesmodProvider: true,
		enableMp4hydraProvider: true,
		enableVidzeeProvider: true,
		enableVixsrcProvider: true,
		enableProxy: false,
		// Other defaults
		disableCache: false,
		enablePStreamApi: true,
		disableUrlValidation: false,
		disable4khdhubUrlValidation: false,
		showboxCacheDir: null
	};
	try {
		const r = await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
		const js = await r.json();
		if(!js.success) throw new Error(js.error||'Clear failed');
		setStatus('All settings reset to defaults');
		fillForm(js);
		// Re-render provider matrix immediately so toggles reflect defaults without page refresh
		try { renderProviderMatrix(js.merged); } catch {}
		validate();
	} catch(e){ setStatus(e.message,true); }
}

function setTheme(t){
	document.documentElement.dataset.theme = t;
	localStorage.setItem('ns_theme', t);
}
function initTheme(){
	const saved = localStorage.getItem('ns_theme');
	setTheme(saved || 'dark');
}
function toggleTheme(){
	setTheme(document.documentElement.dataset.theme === 'dark' ? 'light':'dark');
}
function navTo(id){
	document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id===id));
	document.querySelectorAll('.nav-item').forEach(a=>a.classList.toggle('active', a.dataset.target===id));
	if(history.replaceState) history.replaceState(null,'', '#'+id);
	if(id==='panel-status') loadServerStatus();
}
function attachCoreListeners(){
	const saveBtn = document.getElementById('saveBtn');
	const reloadBtn = document.getElementById('reloadBtn');
	const clearBtn = document.getElementById('clearBtn');
	if(saveBtn) saveBtn.addEventListener('click', save);
	if(reloadBtn) reloadBtn.addEventListener('click', reload);
	if(clearBtn) clearBtn.addEventListener('click', clearAll);
}
function bindNavigation(){
	document.querySelectorAll('.nav .nav-item[data-target]').forEach(btn=>{
		btn.addEventListener('click', ()=> navTo(btn.dataset.target));
	});
	const themeBtn = document.querySelector('.nav .theme-toggle');
	if(themeBtn) themeBtn.addEventListener('click', toggleTheme);
}
function bindShellControls(){
	const burger = document.querySelector('.burger');
	if(burger) burger.addEventListener('click', ()=> toggleSidebar());
	const overlay = document.querySelector('.overlay');
	if(overlay) overlay.addEventListener('click', ()=> toggleSidebar(false));
}
async function verifySession(){
	try {
		const r = await fetch('/auth/session',{cache:'no-store'});
		const j = await r.json();
		if(!j.authenticated){ location.replace('/?expired=1'); }
	} catch { location.replace('/?expired=1'); }
}

async function loadServerStatus(){
	const metricsEl = document.getElementById('statusMetrics');
	const endpointsEl = document.getElementById('statusEndpoints');
	const provEnhanced = document.getElementById('statusProvidersEnhanced');
	if(!metricsEl) return;
	metricsEl.textContent = 'Loading...';
	if(endpointsEl) endpointsEl.textContent = 'Loading...';
	if(provEnhanced) provEnhanced.innerHTML = '<div class="prov-row">Loading...</div>';
	try {
		const r = await fetch('/api/status');
		if(!r.ok) throw new Error('Status fetch failed');
		const j = await r.json();
		if(!j.success) throw new Error('Status error');
		metricsEl.textContent = JSON.stringify(j.metrics, null, 2);
		if(endpointsEl) endpointsEl.textContent = (j.endpoints||[]).join('\n');
		if(provEnhanced){
			provEnhanced.innerHTML = '';
			const header = document.createElement('div');
			header.className='prov-row header';
			header.innerHTML = '<span>Name</span><span>Enabled</span><span>Cookie Req</span><span>Cookie OK</span><span>Functional</span><span>Notes</span>';
			provEnhanced.appendChild(header);
			j.providers.forEach(p=>{
				const row = document.createElement('div');
				row.className = 'prov-row';
				row.dataset.provider = p.name;
				row.innerHTML = `<strong>${p.name}</strong>`+
					`<span class="badge ${p.enabled? 'ok':'off'}">${p.enabled? 'on':'off'}</span>`+
					`<span class="badge ${p.cookieRequired? 'warn':'off'}">${p.cookieRequired? 'yes':'no'}</span>`+
					`<span class="badge ${p.cookieOk? 'ok':'fail'}">${p.cookieOk? 'ok':'missing'}</span>`+
					`<span class="badge" data-role="functional" title="Run provider checks first">?</span>`+
					`<span class="notes" data-role="notes"></span>`;
				provEnhanced.appendChild(row);
			});
		}
	} catch(e){
		metricsEl.textContent = 'Failed: '+e.message;
		if(endpointsEl) endpointsEl.textContent = 'n/a';
		if(provEnhanced) provEnhanced.innerHTML = '<div class="prov-row">Status load failed</div>';
	}
}
async function runProviderFunctionalChecks(){
	const targetTmdb = '293660'; // TMDB ID provided
	const provEnhanced = document.getElementById('statusProvidersEnhanced');
	const summary = document.getElementById('providerCheckSummary');
	if(!provEnhanced) return;
	summary.textContent = 'Running checks...';
	const rows = Array.from(provEnhanced.querySelectorAll('.prov-row:not(.header)'));
	let completed=0, passed=0;
	for(const row of rows){
		const name = row.dataset.provider;
		const funcBadge = row.querySelector('[data-role="functional"]');
		const notesEl = row.querySelector('[data-role="notes"]');
		if(funcBadge){ funcBadge.textContent='…'; funcBadge.className='badge'; }
		if(notesEl) notesEl.textContent='';
		// Skip disabled providers
		if(row.querySelector('.badge.ok, .badge.off') && row.children[1].textContent==='off'){
			if(funcBadge){ funcBadge.textContent='skip'; funcBadge.className='badge off'; }
			completed++; continue;
		}
		try {
			const r = await fetch(`/api/streams/${name}/movie/${targetTmdb}`);
			if(!r.ok) throw new Error('HTTP '+r.status);
			const j = await r.json();
			const isOk = j && Array.isArray(j.streams) && j.streams.length>0;
			if(isOk){
				passed++;
				if(funcBadge){ funcBadge.textContent='ok'; funcBadge.className='badge ok'; }
				if(notesEl) notesEl.textContent = `${j.streams.length} streams`;
			}else{
				if(funcBadge){ funcBadge.textContent='none'; funcBadge.className='badge fail'; }
				if(notesEl) notesEl.textContent = 'No streams array';
			}
		}catch(err){
			if(funcBadge){ funcBadge.textContent='fail'; funcBadge.className='badge fail'; }
			if(notesEl) notesEl.textContent = err.message;
		}
		completed++;
		summary.textContent = `Progress: ${completed}/${rows.length} (passed: ${passed})`;
	}
	summary.textContent = `Checks complete: ${passed}/${rows.length} passed`;
}
document.addEventListener('DOMContentLoaded', ()=> {
	initTheme();
	attachCoreListeners();
	bindNavigation();
	bindShellControls();
	const logoutBtn = document.getElementById('logoutBtn');
	if(logoutBtn){
		logoutBtn.addEventListener('click', async ()=>{
			try { await fetch('/auth/logout',{method:'POST'}); } catch {}
			// Use replace to avoid creating extra history entry
			location.replace('/?loggedOut=1');
		});
	}
	const restartBtn = document.getElementById('restartBtn');
	if(restartBtn){
		restartBtn.addEventListener('click', async ()=>{
			const ok = await openConfirmRestart();
			if(!ok) return;
			setStatus('Restarting server…');
			try {
				const r = await fetch('/api/restart',{ method:'POST' });
				if(!r.ok){ const t = await r.text().catch(()=>r.statusText); throw new Error(t||('HTTP '+r.status)); }
				// Server will shut down soon; start polling until it comes back
				await new Promise(resolve => setTimeout(resolve, 1000));
				const start = Date.now();
				const timeoutMs = 60_000;
				(async function poll(){
					try {
						const pr = await fetch('/api/health',{ cache:'no-store' });
						if(pr.ok){ location.reload(); return; }
					} catch {}
					if(Date.now()-start > timeoutMs){ setStatus('Restart timed out', true); return; }
					setTimeout(poll, 1000);
				})();
			} catch(e){ setStatus('Restart failed: '+e.message, true); }
		});
	}
	reload();
	const h = location.hash.slice(1);
	navTo(h||'panel-core');
	// Revalidate session on back-forward cache navigation or visibility
	window.addEventListener('pageshow', (e)=>{
		if(e.persisted){ verifySession(); }
	});
	document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') verifySession(); });
	// Advanced flag checkbox change -> validation
	document.getElementById('advFlags')?.addEventListener('change', (e)=>{
		if(e.target.matches('.adv-flag-item input[type="checkbox"]')) {
			validate();
		}
	});
	const rsb = document.getElementById('refreshStatusBtn');
	if(rsb) rsb.addEventListener('click', loadServerStatus);
	const rpc = document.getElementById('runProviderChecksBtn');
	if(rpc) rpc.addEventListener('click', runProviderFunctionalChecks);
});
function toggleSidebar(force){
	const sb = document.getElementById('sidebar');
	const showing = force !== undefined ? force : !sb.classList.contains('open');
	sb.classList.toggle('open', showing);
	document.querySelector('.overlay').classList.toggle('show', showing);
}
function validate(){
	const f = document.getElementById('cfgForm');
	const errors = [];
	const qp = document.querySelector('input[name="qualityPreset"]:checked');
	if(qp && qp.value==='custom') {
		const mq = f.elements['minQualitiesRaw'].value.trim();
		if(mq && /[\{\[]/.test(mq)) { try { JSON.parse(mq); } catch(e){ errors.push('Min Qualities invalid JSON'); markInvalid(f.elements['minQualitiesRaw']); } }
	}
	const codecPreset = document.querySelector('input[name="codecPreset"]:checked');
	if(codecPreset && codecPreset.value==='advanced') {
		const ec = f.elements['excludeCodecsRaw'].value.trim();
		if(ec && /[\{\[]/.test(ec)) { try { JSON.parse(ec); } catch(e){ errors.push('Exclude Codecs invalid JSON'); markInvalid(f.elements['excludeCodecsRaw']); } }
	}
	const p = f.elements['port'].value.trim();
	if(p) { const pn = Number(p); if(!(pn>0 && pn<=65535)) { errors.push('Port must be 1-65535'); markInvalid(f.elements['port']); } }
	const dp = f.elements['defaultProviders'].value.trim();
	if(dp && !/^[a-z0-9_,\-\s]+$/.test(dp)) { errors.push('Default Providers contains invalid chars'); markInvalid(f.elements['defaultProviders']); }
	const sum = document.getElementById('validationSummary');
	if(errors.length){ sum.textContent = errors.join(' • '); sum.classList.add('has-errors'); }
	else { sum.textContent=''; sum.classList.remove('has-errors'); }
	document.getElementById('saveBtn').disabled = errors.length>0;
	return errors.length===0;
}
function markInvalid(el){ el.classList.add('invalid'); setTimeout(()=>el.classList.remove('invalid'), 3000); }
document.addEventListener('input', (e)=>{
	if(e.target.closest('#cfgForm')) validate();
});
document.addEventListener('change', (e)=>{
	const t = e.target;
	if(t.name === 'qualityPreset') {
		const customField = document.querySelector('textarea[name="minQualitiesRaw"]');
		if(t.value === 'custom') { customField.disabled = false; } else { customField.disabled = true; customField.value=''; }
		validate();
	}
	if(t.name === 'codecPreset') {
		const ta = document.querySelector('textarea[name="excludeCodecsRaw"]');
		if(t.value==='advanced') { ta.disabled=false; if(!ta.value.trim()) ta.value = JSON.stringify({excludeDV:false,excludeHDR:false}); }
		else { ta.disabled=true; ta.value=''; }
		validate();
	}
});
async function renderProviderMatrix(merged){
	if(!merged){ try { const data = await fetchConfig(); merged = data.merged||{}; } catch { return; } }
	const container = document.getElementById('providerMatrix'); if(!container) return;
	const defaults = (merged.defaultProviders||[]).map(s=>s.toLowerCase());
	
	// Fetch available providers from API
	let availableProviders = [];
	try {
		const providersResponse = await fetch('/api/providers');
		if (providersResponse.ok) {
			const providersData = await providersResponse.json();
			availableProviders = providersData.providers || [];
		}
	} catch (e) {
		console.warn('Failed to fetch providers list:', e.message);
	}
	
	// Create provider list with enable flags
	const providers = availableProviders.map(p => {
		const flag = `enable${p.name.charAt(0).toUpperCase() + p.name.slice(1)}Provider`;
		return [p.name, flag];
	});
	
	container.innerHTML = providers.map(([name,flag])=>{
		const enabled = merged[flag] !== false;
		const isDefault = defaults.includes(name);
		return `<div class=\"pm-item\" data-prov=\"${name}\" data-flag=\"${flag}\" data-enabled=\"${enabled}\" data-default=\"${isDefault}\">`
			+`<button type=\"button\" class=\"pm-enable\" title=\"Enable/Disable\" data-action=\"toggle-enable\">${enabled? '⏻':'✖'}</button>`
			+`<span class=\"pm-name\">${name}</span>`
			+`<button type=\"button\" class=\"pm-default\" title=\"Toggle Default\" data-action=\"toggle-default\">${isDefault? '★':'☆'}</button>`
			+`</div>`;
	}).join('');
	const hidden = document.querySelector('input[name="defaultProviders"]'); if(hidden) hidden.value = defaults.join(',');
	if(!container._bound){
		container.addEventListener('click', async (e)=>{
			const btn = e.target.closest('button[data-action]'); if(!btn) return;
			const item = btn.closest('.pm-item'); if(!item) return;
			const prov = item.dataset.prov; const flag = item.dataset.flag;
			let data; try { data = await fetchConfig(); } catch(err){ setStatus('Provider fetch failed',true); return; }
			const mergedNow = data.merged||{};
			let defaultsNow = (mergedNow.defaultProviders||[]).slice();
			const patch = {};
			if(btn.dataset.action==='toggle-enable'){
				const currentlyEnabled = item.dataset.enabled==='true';
				patch[flag] = !currentlyEnabled;
				if(currentlyEnabled){ defaultsNow = defaultsNow.filter(d=>d!==prov); patch.defaultProviders = defaultsNow; }
			} else if(btn.dataset.action==='toggle-default'){
				const isDefault = item.dataset.default==='true';
				if(isDefault){ defaultsNow = defaultsNow.filter(d=>d!==prov); }
				else { if(!defaultsNow.includes(prov)) defaultsNow.push(prov); patch[flag] = true; }
				patch.defaultProviders = defaultsNow;
			}
			try {
				await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
				const updated = await fetchConfig();
				fillForm(updated);
				renderProviderMatrix(updated.merged);
				reloadLiveOnly();
			} catch(err){ setStatus('Update failed: '+err.message,true); }
		});
		container._bound = true;
	}
}
function reloadLiveOnly(){
	fetchConfig().then(c=>{
		document.getElementById('currentCfg').textContent = JSON.stringify(c.merged||{},null,2);
		document.getElementById('overrideCfg').textContent = (c.override && Object.keys(c.override).length)? JSON.stringify(c.override,null,2):'(none)';
	}).catch(()=>{});
}

// No globals exported; all handlers bound programmatically
})();
