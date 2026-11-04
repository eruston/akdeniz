'use strict';
/* Durak — Antalya en yakın durak & canlı otobüs.
   Veri: Antalyakart'ın kullandığı Kentkart servisi (bölge 026). */

// Web sürümünde gerekirse aracı sunucu adresi config.js ile verilir; Android'de hep doğrudan Kentkart.
var API = (window.DURAK_API || 'https://service.kentkart.com/rl1/') + 'web/';
var BASE_QS = { region: '026', lang: 'tr', authType: '4' };
var REFRESH_MS = 20000, MAP_REFRESH_MS = 10000, RELOCATE_MS = 120000;

/* ---------- köprü ---------- */
var hasBridge = typeof window.Android !== 'undefined';
var pending = {}, reqSeq = 0;
window.__res = function (id, ok, body) {
  var p = pending[id]; if (!p) return; delete pending[id];
  if (!ok) return p.reject(new Error(body || 'Bağlantı hatası'));
  var j;
  try { j = JSON.parse(body); } catch (e) { var er = new Error('Geçersiz yanıt'); er.raw = body; return p.reject(er); }
  if (j && typeof j === 'object') j.__raw = body;
  checkResult(j, p.resolve, p.reject);
};
/* Kentkart her cevapta result.code/message gönderir. Hiç veri listesi yokken sıfırdan farklı bir kod
   gelirse bu "boş sonuç" değil, sunucu hatasıdır (ör. yoğunluk/engelleme): hata olarak göster. */
function checkResult(j, resolve, reject) {
  var r = j && j.result, code = r ? parseInt(r.code, 10) : 0;
  var hasData = j && ['stopList', 'routeList', 'busList', 'pathList', 'placeList'].some(function (k) { return j[k] && j[k].length; });
  if (r && isFinite(code) && code !== 0 && !hasData) {
    var er = new Error('Kentkart: ' + (r.message || ('kod ' + code))); er.raw = j.__raw;
    return reject(er);
  }
  resolve(j);
}
function qs(o) {
  var a = [], k;
  for (k in BASE_QS) a.push(k + '=' + encodeURIComponent(BASE_QS[k]));
  for (k in o) if (o[k] !== undefined && o[k] !== null) a.push(k + '=' + encodeURIComponent(o[k]));
  return a.join('&');
}
/* ---------- tanılama günlüğü: son 15 isteğin özeti (yalnızca telefonda, hiçbir yere gönderilmez) ---------- */
var DIAG = [];
function diagSummary(j) {
  if (!j || typeof j !== 'object') return 'JSON değil';
  var r = j.result || {}, parts = ['code=' + (r.code !== undefined ? r.code : '-')];
  if (r.message) parts.push('msg="' + String(r.message).slice(0, 80) + '"');
  ['stopList', 'routeList', 'busList', 'pathList', 'placeList', 'kioskList'].forEach(function (k) {
    if (j[k]) parts.push(k + '=' + j[k].length);
  });
  var keys = Object.keys(j).filter(function (k) { return k !== 'result' && k !== '__raw'; });
  if (!keys.length) parts.push('(liste yok)');
  return parts.join(' ');
}
function diagLog(path, params, t0, ok, info, raw) {
  var p = Object.keys(params || {}).map(function (k) { return k + '=' + params[k]; }).join('&');
  DIAG.unshift({ at: clock(new Date()) + ':' + pad(new Date().getSeconds()), path: path, p: p, ms: Date.now() - t0, ok: ok, info: info,
    raw: raw ? String(raw).slice(0, 220) : '' });
  if (DIAG.length > 15) DIAG.length = 15;
}
function api(path, params) {
  var t0 = Date.now();
  return apiRaw(path, params).then(function (j) {
    diagLog(path, params, t0, true, diagSummary(j), j && j.__raw);
    if (j) delete j.__raw;
    return j;
  }, function (e) {
    diagLog(path, params, t0, false, e && e.message, e && e.raw);
    throw e;
  });
}
function apiRaw(path, params) {
  var url = API + path + '?' + qs(params || {});
  if (!hasBridge) return fetch(url).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) { var er = new Error('HTTP ' + r.status); er.raw = t; throw er; }
        var j; try { j = JSON.parse(t); } catch (e) { var e2 = new Error('Geçersiz yanıt'); e2.raw = t; throw e2; }
        j.__raw = t; return j;
      });
    })
    .then(function (j) { return new Promise(function (res, rej) { checkResult(j, res, rej); }); });
  return new Promise(function (resolve, reject) {
    var id = 'r' + (++reqSeq);
    pending[id] = { resolve: resolve, reject: reject };
    setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('Zaman aşımı')); } }, 25000);
    window.Android.get(id, url);
  });
}
var store = {
  get: function (k, d) {
    try { var v = hasBridge ? window.Android.load(k) : localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set: function (k, v) {
    try { var s = JSON.stringify(v); if (hasBridge) window.Android.save(k, s); else localStorage.setItem(k, s); } catch (e) {}
  }
};

/* ---------- tema: telefonun karanlık modunu uygulamadan oku ---------- */
var DARK = (function () {
  try { if (hasBridge && window.Android.isDark) return !!window.Android.isDark(); } catch (e) {}
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
})();
document.documentElement.classList.add(DARK ? 'dark' : 'light');

/* ---------- yardımcılar ---------- */
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function num(x) { var n = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isFinite(n) ? n : NaN; }
function int(x) { var n = parseInt(x, 10); return isFinite(n) ? n : NaN; }
function dist(a, b, c, d) {
  var R = 6371000, r = Math.PI / 180, dLa = (c - a) * r, dLo = (d - b) * r;
  var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function clock(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function clockIn(min) { return clock(new Date(Date.now() + min * 60000)); }
function secOfDay(d) { return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); }
function hms(s) {
  var p = String(s || '').split(':'); if (p.length < 2) return NaN;
  return int(p[0]) * 3600 + int(p[1]) * 60 + (p[2] ? int(p[2]) : 0);
}
function sClock(s) { s = ((s % 86400) + 86400) % 86400; return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)); }
function todayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function color(c) {
  c = String(c || '').replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(c) ? '#' + c : null;
}
function inkFor(hex) {
  if (!hex) return '#fff';
  var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#1B1F1E' : '#fff';
}
/* Kentkart adları BÜYÜK HARFLE veriyor; ekranda düzgün Türkçe yazıma çevir ("HUKUK FAKÜLTESİ-1" → "Hukuk Fakültesi-1").
   Kısaltmalar büyük kalır. Eşleştirmede her zaman durak numarası kullanıldığı için yalnızca görünümü etkiler. */
var KEEP_UPPER = { 'AVM': 1, 'AKM': 1, 'PTT': 1, 'SGK': 1, 'TOKİ': 1, 'DSİ': 1, 'ATM': 1, 'KYK': 1, 'ÖSYM': 1, 'TRT': 1,
  'TCDD': 1, 'AŞ': 1, 'A.Ş.': 1, 'AÜ': 1, 'ADM': 1, 'SSK': 1, 'MHP': 0, 'II': 1, 'III': 1, 'IV': 1, 'BLV': 0 };
function nice(t) {
  t = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  if (!t || t !== t.toLocaleUpperCase('tr')) return t; // zaten karışık yazılmışsa dokunma
  return t.split(' ').map(function (w) {
    if (KEEP_UPPER[w] || /^\d+[A-ZÇĞİÖŞÜ]{1,2}$/.test(w)) return w; // AVM, 5M gibi
    var low = w.toLocaleLowerCase('tr');
    return low.replace(/(^|[\-\/(.])([^\-\/(.])/g, function (m, p, c) { return p + c.toLocaleUpperCase('tr'); });
  }).join(' ');
}
function sid(s) { return String(s.stopId != null ? s.stopId : s.busStopId != null ? s.busStopId : s.busStopid != null ? s.busStopid : s.id != null ? s.id : ''); }
function sname(s) { return nice(s.stopName || s.name || s.busStopName || s.title || ''); }
function norm(x) { return String(x == null ? '' : x).trim().toUpperCase(); }


/* ---------- gömülü tarife yedeği (timetable.js → window.TT) ----------
   Kaynak: kk-gtfs (CC0), Kentkart verisinden 1 Kasım 2026'da üretilmiş. Sefer saatleri yalnızca geçerlilik
   aralığında kullanılır (sonrasında yanlış saat göstermemek için kapanır); durak listesi her zaman kullanılabilir. */
var TTX = null;
function ttHas() { return !!(window.TT && TT.stops && TT.pats); }
function ymd(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function ttTimesValid() { if (!ttHas()) return false; var t = ymd(new Date()); return t >= TT.validFrom && t <= TT.validTo; }
function ttDateLabel() { if (!ttHas()) return ''; var v = TT.validFrom; return +v.slice(6) + '.' + v.slice(4, 6) + '.' + v.slice(0, 4); }
function ttIndex() {
  if (TTX || !ttHas()) return TTX;
  var byId = {}, byStop = {}, byCode = {};
  TT.stops.forEach(function (st, i) { byId[st[0]] = i; });
  TT.pats.forEach(function (p, pi) {
    p[3].forEach(function (si, pos) { (byStop[si] = byStop[si] || []).push([pi, pos]); });
    var code = norm(TT.routes[p[0]][0]);
    (byCode[code] = byCode[code] || []).push(pi);
  });
  TTX = { byId: byId, byStop: byStop, byCode: byCode, stops: null };
  return TTX;
}
function ttStopObj(i) { var st = TT.stops[i]; return { id: st[0], name: nice(st[1]), lat: st[2], lng: st[3], routes: '' }; }
function ttAllStops() {
  var X = ttIndex(); if (!X) return [];
  if (!X.stops) X.stops = TT.stops.map(function (st, i) { return ttStopObj(i); });
  return X.stops;
}
function ttDayCol(d) { var w = (d || new Date()).getDay(); return w === 0 ? 7 : (w === 6 ? 6 : 5); } // pazar / cumartesi / hafta içi
/* Bir durakta, verilen hat+yön (yön null = hepsi) için bugünkü varış saatleri (saniye, sıralı) */
function ttArrivals(stopId, code, dir) {
  if (!ttTimesValid()) return null;
  var X = ttIndex(), si = X.byId[String(stopId)]; if (si == null) return null;
  var col = ttDayCol(), out = [], head = '';
  (X.byStop[si] || []).forEach(function (e) {
    var p = TT.pats[e[0]];
    if (norm(TT.routes[p[0]][0]) !== norm(code)) return;
    if (dir != null && String(p[1]) !== String(dir)) return;
    if (e[1] === p[3].length - 1) return; // son durak: buraya gelen otobüs binilecek otobüs değil
    var off = p[4][e[1]];
    p[col].forEach(function (m) { out.push((m + off) * 60); });
    if (!head) head = nice(p[2]);
  });
  if (!out.length) return null;
  out.sort(function (a, b) { return a - b; });
  return { off: 0, times: out, head: head, src: 'tt' };
}
/* Canlı veri yokken bir durağın hatlarını tarifeden üret */
function ttLinesForStop(stop) {
  if (!ttTimesValid()) return [];
  var X = ttIndex(), si = X.byId[String(stop.id)]; if (si == null) return [];
  var seen = {}, lines = [];
  (X.byStop[si] || []).forEach(function (e) {
    var p = TT.pats[e[0]], r = TT.routes[p[0]];
    if (e[1] === p[3].length - 1) return;
    var key = norm(r[0]) + '|' + p[1];
    if (seen[key]) return; seen[key] = 1;
    var l = { key: key, code: r[0], dir: String(p[1]), name: nice(r[1]), head: nice(p[2]), color: color(r[2]), buses: [], plan: null, offline: true };
    l.ck = l.code + '|' + l.dir + '|' + stop.id + '|' + todayKey();
    S.sched[l.ck] = ttArrivals(stop.id, l.code, l.dir) || false;
    applyPlan(l);
    lines.push(l);
  });
  return lines;
}

/* ---------- durum ---------- */
var S = {
  pos: null, stops: [], stop: null, manual: false,
  lines: [], filter: 'all', fav: store.get('fav', []),
  lastOk: 0, timer: null, relocTimer: null, loading: false, err: null,
  sched: {}, map: null, mapLine: null, mapTimer: null, track: {}
};

/* ---------- konum ---------- */
var locStarted = false;
function locate() {
  locStarted = true;
  if (hasBridge) window.Android.locate();
  else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function (p) { window.__loc(p.coords.latitude, p.coords.longitude, p.coords.accuracy, 0, true); },
      function (e) { window.__locErr(e.code === 1 ? 'perm' : 'fail'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
  } else window.__locErr('fail');
}
var COARSE_M = 300;
window.__loc = function (lat, lng, acc, age, final) {
  var prev = S.pos;
  S.locBlocked = false;
  // Kaba konum (±300 m'den kötü) geldiyse ve daha iyisi bekleniyorsa durak aramayı ertele
  if (!final && acc > COARSE_M) {
    if (!S.stops.length) {
      $('stopName').textContent = 'Konum netleşiyor…';
      $('stopMeta').textContent = 'Şu anki hassasiyet ±' + fmtDist(acc) + ' · GPS bekleniyor';
    }
    if (!prev || prev.acc > acc) { S.pos = { lat: lat, lng: lng, acc: acc, t: Date.now() }; if (SM.map) updateStopsMe(); }
    return;
  }
  S.pos = { lat: lat, lng: lng, acc: acc, t: Date.now() };
  if (S.mapLine && S.map) updateUserDot();
  if (SM.map) updateStopsMe();
  if (!prev || dist(prev.lat, prev.lng, lat, lng) > 60 || !S.stops.length) findStops();
};
/* Web'de tarayıcı, bir kez reddedilen konum iznini tekrar sormaz; telefon ayarlarını da sayfa açamaz.
   Bu yüzden web'de nasıl açılacağını yazıyoruz ve konumsuz devam etme seçeneği sunuyoruz. */
function webLocHelp() {
  var ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) {
    return 'iPhone: Ayarlar → Gizlilik ve Güvenlik → Konum Servisleri → Safari Web Siteleri → "Uygulamayı Kullanırken". ' +
      'Ana ekrana eklediysen: Ayarlar → Gizlilik ve Güvenlik → Konum Servisleri bölümünde Akdeniz/Safari iznini kontrol et. Sonra sayfayı yenile.';
  }
  if (/Android/.test(ua)) {
    return 'Android (Chrome): adres çubuğundaki kilit/ayar simgesine dokun → İzinler → Konum → İzin ver. ' +
      'Telefonun konumu da açık olmalı. Sonra sayfayı yenile.';
  }
  return 'Tarayıcının adres çubuğundaki kilit simgesinden bu site için konum iznini aç, sonra sayfayı yenile.';
}
function continueWithoutLocation() { showTab('stops'); }
window.__locErr = function (why) {
  S.locBlocked = (why === 'perm' || why === 'off');
  if (S.pos) return; // elimizde konum var, sessiz geç
  var msg = {
    perm: ['Konum izni gerekli', 'En yakın durağı bulmak için konum izni ver.', true],
    off: ['Konum kapalı', 'Telefonunun konum özelliğini aç, sonra tekrar dene.', true],
    timeout: ['Konum bulunamadı', 'Açık alanda tekrar dene ya da konum ayarlarını kontrol et.', true],
    fail: ['Konum alınamadı', 'Tekrar denemek için yenile.', false]
  }[why] || ['Konum alınamadı', '', false];
  $('stopName').textContent = msg[0];
  $('stopMeta').textContent = '';
  if (hasBridge) {
    showState(msg[0], msg[1], [
      { label: why === 'perm' ? 'İzin ver' : 'Tekrar dene', fn: locate },
      msg[2] ? { label: 'Ayarlar', ghost: true, fn: function () { window.Android.openLocationSettings(); } } : null
    ]);
  } else {
    var text = (why === 'perm' || why === 'off') ? webLocHelp() : msg[1];
    showState(msg[0], text, [
      { label: 'Tekrar dene', fn: function () { $('stopName').textContent = 'Konumun bulunuyor…'; locate(); } },
      { label: 'Konumsuz devam et', ghost: true, fn: continueWithoutLocation }
    ]);
  }
  spin(false);
};

/* ---------- duraklar ---------- */
function mapStop(s) {
  var lat = num(s.lat), lng = num(s.lng != null ? s.lng : s.lon);
  return { id: sid(s), name: sname(s) || ('Durak ' + sid(s)), lat: lat, lng: lng, routes: s.routes || '' };
}
function allStopsCached() {
  var c = store.get('allStops', null);
  if (c && c.t && Date.now() - c.t < 7 * 864e5 && c.list && c.list.length) return Promise.resolve(c.list);
  return api('nearest/find', {}).then(function (r) {
    var list = (r.stopList || []).map(mapStop).filter(function (s) { return s.id && isFinite(s.lat) && isFinite(s.lng); })
      .map(function (s) { return [s.id, s.name, +s.lat.toFixed(6), +s.lng.toFixed(6)]; });
    if (list.length) store.set('allStops', { t: Date.now(), list: list });
    return list;
  });
}
function findStops() {
  var p = S.pos; if (!p) return;
  spin(true);
  if (!S.stops.length) $('stopName').textContent = 'Durak aranıyor…';
  function ttNear() { return ttAllStops().filter(function (s) { return dist(p.lat, p.lng, s.lat, s.lng) < 3000; }).slice(); }
  api('nearest/place', { lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }).then(function (r) {
    var list = (r.stopList || []).map(mapStop).filter(function (s) { return s.id && isFinite(s.lat); });
    if (list.length) return list;
    var t = ttNear(); if (t.length) return t;
    return allStopsCached().then(function (all) {
      return all.map(function (a) { return { id: a[0], name: nice(a[1]), lat: a[2], lng: a[3], routes: '' }; });
    });
  }, function (e) {
    var t = ttNear(); if (t.length) return t; // sunucu yoksa telefondaki durak listesi
    throw e;
  }).then(function (list) {
    list.forEach(function (s) { s.d = dist(p.lat, p.lng, s.lat, s.lng); });
    list.sort(function (a, b) { return a.d - b.d; });
    var seen = {};
    S.stops = list.filter(function (s) { if (seen[s.id]) return false; seen[s.id] = 1; return true; }).slice(0, 6);
    if (!S.stops.length || S.stops[0].d > 5000) {
      spin(false);
      $('stopName').textContent = 'Yakında durak yok';
      $('stopMeta').textContent = '';
      $('stopChips').innerHTML = '';
      showState('Yakında durak bulunamadı', 'Bu uygulama Antalya\'daki Antalyakart duraklarını gösterir.', [{ label: 'Tekrar dene', fn: locate }]);
      return;
    }
    var keep = S.manual && S.stop;
    if (keep && !S.stops.some(function (s) { return s.id === S.stop.id; })) {
      S.stop.d = dist(p.lat, p.lng, S.stop.lat, S.stop.lng); S.stops.push(S.stop);
    }
    if (keep) S.stop = S.stops.filter(function (s) { return s.id === S.stop.id; })[0];
    var changed = !S.stop || (!keep && S.stop.id !== S.stops[0].id);
    if (!keep) S.stop = S.stops[0];
    renderHeader();
    if (changed) { S.lines = []; S.err = null; renderList(); }
    loadArrivals();
  }).catch(function (e) {
    spin(false);
    if (!S.stops.length) {
      $('stopName').textContent = 'Bağlantı sorunu';
      showState('Durak bilgisi alınamadı', 'İnternet bağlantını kontrol edip tekrar dene.', [{ label: 'Tekrar dene', fn: findStops }]);
    }
  });
}
function pickStop(s) {
  if (S.stop && S.stop.id === s.id) return;
  S.stop = s; S.manual = s !== S.stops[0]; S.lines = []; S.err = null;
  renderHeader(); renderList(); loadArrivals();
}

/* ---------- varışlar ---------- */
var arrSeq = 0;
function etaMin(b) {
  var t = num(b.timeDiff), sd = int(b.stopDiff);
  if (!isFinite(t)) return NaN;
  return Math.max(0, Math.round(t));
}
function loadArrivals() {
  var stop = S.stop; if (!stop) return;
  var my = ++arrSeq;
  S.loading = true; spin(true);
  api('nearest/bus', { lat: stop.lat, lng: stop.lng, busStopId: stop.id, accuracy: 0 }).then(function (r) {
    if (my !== arrSeq) return;
    S.loading = false; S.err = null; S.lastOk = Date.now(); S.ttFallback = false; spin(false);
    S.lines = buildLines(r, stop);
    renderList();
    S.lines.forEach(function (l) { queueSchedule(l, stop); });
    if (S.mapLine) refreshMapCard();
  }).catch(function (e) {
    if (my !== arrSeq) return;
    S.loading = false; spin(false);
    S.err = e.message || 'Hata';
    if (!S.lines.length || S.ttFallback) {
      var tl = ttLinesForStop(stop);
      if (tl.length) { S.lines = tl; S.ttFallback = true; }
    }
    renderList();
    if (S.mapLine) refreshMapCard();
  });
}
/* Donmuş otobüs tespiti: sunucu aynı otobüsü 3 dk boyunca aynı yerde, aynı durak farkıyla
   ve düşmeyen bir süreyle bildiriyorsa (GPS takılmış, otobüs beklemede/seferden çıkmış),
   bu veri canlı sayılmaz; yerine tarife gösterilir. */
var FROZEN_MS = 180000;
function trackBus(stopId, b) {
  var key = stopId + '|' + (b.id || b.plate || (b.lat + ',' + b.lng));
  var now = Date.now(), t = S.track[key];
  var samePos = t && (!isFinite(b.lat) || !isFinite(t.lat) ? true : dist(t.lat, t.lng, b.lat, b.lng) < 40);
  var sameSd = t && (t.sd === b.sd || (!isFinite(t.sd) && !isFinite(b.sd)));
  var notDropping = t && (!isFinite(b.m) || !isFinite(t.m) || b.m >= t.m);
  if (t && samePos && sameSd && notDropping) {
    t.seen = now;
  } else {
    t = S.track[key] = { lat: b.lat, lng: b.lng, sd: b.sd, m: b.m, since: now, seen: now };
  }
  return now - t.since >= FROZEN_MS;
}
function pruneTrack() {
  var now = Date.now();
  Object.keys(S.track).forEach(function (k) { if (now - S.track[k].seen > 10 * 60000) delete S.track[k]; });
}
function buildLines(r, stop) {
  var groups = {}, order = [];
  function key(code, dir) { return norm(code) + '|' + (dir == null ? '' : String(dir)); }
  function add(code, dir, info) {
    if (!code) return null;
    var k = key(code, dir);
    if (!groups[k]) {
      groups[k] = { key: k, code: String(code).trim(), dir: dir == null || dir === '' ? null : String(dir),
        name: '', head: '', color: null, buses: [], plan: null };
      order.push(k);
    }
    var g = groups[k];
    if (info) {
      g.head = g.head || nice(info.headSign || info.headsign || '');
      g.name = g.name || (info.name || info.routeName || '').trim();
      g.color = g.color || color(info.routeColor || info.color);
      g.routeCode = g.routeCode || info.routeCode;
    }
    return g;
  }
  (r.routeList || []).forEach(function (rt) {
    add(rt.displayRouteCode || rt.routeCode, rt.direction, rt);
  });
  if (!order.length && stop.routes) {
    String(stop.routes).split(/[,;\s]+/).forEach(function (c) { if (c) add(c, null, null); });
  }
  (r.busList || []).forEach(function (b) {
    var code = b.displayRouteCode || b.routeCode; if (!code) return;
    var m = etaMin(b), sd = int(b.stopDiff);
    if (isFinite(m) === false && !(sd >= 0)) return;
    if (isFinite(sd) && sd < 0) return;
    var g = groups[key(code, b.direction)];
    if (!g) {
      // yön bilinmiyorsa aynı hattın ilk grubuna bağla
      for (var i = 0; i < order.length; i++) if (groups[order[i]].code.toUpperCase() === norm(code) && (groups[order[i]].dir == null || b.direction == null)) { g = groups[order[i]]; break; }
    }
    if (!g) g = add(code, b.direction, b);
    if (!g.head && b.headSign) g.head = nice(b.headSign);
    var bus = { m: m, sd: sd, at: isFinite(m) ? Date.now() + m * 60000 : NaN, lat: num(b.lat), lng: num(b.lng), plate: b.plate || b.plateNumber || '', id: b.busId || b.plate || '' };
    bus.frozen = trackBus(stop.id, bus);
    g.buses.push(bus);
  });
  pruneTrack();
  var out = order.map(function (k) { return groups[k]; });
  out.forEach(function (g) {
    g.frozenCount = g.buses.filter(function (b) { return b.frozen; }).length;
    g.buses = g.buses.filter(function (b) { return !b.frozen; });
    g.buses.sort(function (a, b) { return (isFinite(a.m) ? a.m : 999) - (isFinite(b.m) ? b.m : 999); });
    var old = S.lines.filter(function (o) { return o.key === g.key; })[0];
    if (old && old.plan) g.plan = old.plan;
  });
  return out;
}

/* ---------- planlı saatler ---------- */
var schedQ = [], schedActive = 0;
function queueSchedule(line, stop) {
  var ck = line.code + '|' + (line.dir || '?') + '|' + stop.id + '|' + todayKey();
  line.ck = ck;
  if (S.sched[ck] !== undefined) { applyPlan(line); return; }
  var cached = store.get('sch:' + ck, undefined);
  if (cached !== undefined) { S.sched[ck] = cached; applyPlan(line); return; }
  S.sched[ck] = null;
  schedQ.push({ line: line, stop: stop, ck: ck });
  pumpSchedule();
}
function pumpSchedule() {
  while (schedActive < 3 && schedQ.length) {
    var job = schedQ.shift(); schedActive++;
    (function (job) { fetchSchedule(job).then(function (res) {
      // Kentkart'ın güncel tarifesi gelmezse telefondaki tarifeye düş (kaydetme: ertesi gün tekrar denensin)
      var data = res.data || ttArrivals(job.stop.id, job.line.code, job.line.dir) || false;
      S.sched[res.ck] = data;
      if (res.data) store.set('sch:' + res.ck, res.data);
      S.lines.forEach(function (l) { if (l.ck === res.ck) applyPlan(l); });
      renderList();
    }).catch(function () {}).then(function () { schedActive--; pumpSchedule(); }); })(job);
  }
}
function fetchSchedule(job) {
  var line = job.line, stop = job.stop;
  var dirs = line.dir != null ? [line.dir] : ['0', '1'];
  function tryDir(i) {
    if (i >= dirs.length) return Promise.resolve({ ck: job.ck, data: false });
    return api('pathInfo', { displayRouteCode: line.code, direction: dirs[i], resultType: '001010' }).then(function (r) {
      var p = (r.pathList || [])[0];
      var data = p && extractTimes(p, stop.id);
      if (data) {
        if (!line.head && p.headSign) data.head = nice(p.headSign);
        return { ck: job.ck, data: data };
      }
      return tryDir(i + 1);
    }, function () { return tryDir(i + 1); });
  }
  return tryDir(0);
}
function extractTimes(p, stopId) {
  var stops = p.busStopList || [];
  var st = null;
  for (var i = 0; i < stops.length; i++) if (sid(stops[i]) === String(stopId)) { st = stops[i]; break; }
  if (!st) return null;
  var off = int(st.arrival_offset != null ? st.arrival_offset : st.departure_offset != null ? st.departure_offset : st.arrivalOffset);
  if (!isFinite(off)) off = null;
  var dow = (new Date().getDay() + 6) % 7; // Pzt=0
  var times = [];
  (p.scheduleList || []).forEach(function (sc) {
    var d = String(sc.description || '');
    var active = d.length >= 7 && /^[A-Za-z]{7}/.test(d) ? d.charAt(dow) === d.charAt(dow).toUpperCase() && /[A-Z]/.test(d.charAt(dow)) : true;
    if (!active) return;
    (sc.timeList || []).forEach(function (t) {
      var s = hms(t.departureTime || t.time); if (isFinite(s)) times.push(s);
    });
  });
  if (!times.length) return null;
  times.sort(function (a, b) { return a - b; });
  return { off: off, times: times, head: '' };
}
function applyPlan(line) {
  var d = S.sched[line.ck];
  if (!d) { line.plan = d === false ? { none: true } : null; return; }
  if (!line.head && d.head) line.head = d.head;
  var now = secOfDay(new Date()), off = d.off || 0;
  var next = d.times.map(function (t) { return t + off; }).filter(function (t) { return t >= now - 30; }).slice(0, 3);
  line.plan = { next: next, approx: d.off == null };
}

/* ---------- favoriler ---------- */
function isFav(code) { return S.fav.indexOf(norm(code)) >= 0; }
function toggleFav(code) {
  var c = norm(code), i = S.fav.indexOf(c);
  if (i >= 0) S.fav.splice(i, 1); else S.fav.push(c);
  store.set('fav', S.fav);
  renderList();
}

/* ---------- çizim ---------- */
function spin(on) { $('refreshBtn').classList.toggle('spin', !!on); }
function showState(title, text, btns) {
  var L = $('list'); L.innerHTML = '';
  $('toolbar').hidden = true;
  var box = el('div', 'state');
  box.appendChild(el('h2', null, title));
  if (text) box.appendChild(el('div', null, text));
  (btns || []).forEach(function (b) {
    if (!b) return;
    var x = el('button', 'btn' + (b.ghost ? ' ghost' : ''), b.label);
    x.onclick = b.fn; box.appendChild(x);
  });
  L.appendChild(box);
}
function renderHeader() {
  var s = S.stop; if (!s) return;
  $('eyebrow').textContent = s === S.stops[0] ? 'En yakın durak' : 'Seçili durak';
  $('stopName').textContent = s.name;
  var meta = [];
  if (isFinite(s.d)) meta.push(fmtDist(s.d) + ' uzakta');
  if (s.id) meta.push('Durak no ' + s.id);
  if (S.pos && S.pos.acc > COARSE_M) meta.push('konum ±' + fmtDist(S.pos.acc));
  $('stopMeta').textContent = meta.join(' · ');
  var C = $('stopChips'); C.innerHTML = '';
  S.stops.forEach(function (x) {
    var b = el('button', 'chip' + (x.id === s.id ? ' on' : ''), x.name + ' · ' + fmtDist(x.d));
    b.onclick = function () { haptic(); pickStop(x); };
    C.appendChild(b);
  });
}
/* Canlı veri en fazla 75 sn eski olabilir; daha eskiyse canlı süreler HİÇ gösterilmez. */
var STALE_MS = 75000;
function liveFresh() { return !!S.lastOk && Date.now() - S.lastOk <= STALE_MS; }
function liveDown() { return !!S.lastOk && !liveFresh() && !!S.err; }
function minsTo(at) { return Math.max(0, Math.round((at - Date.now()) / 60000)); }
function midnight() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
/* Bir hat için sıradaki varışlar: önce canlı otobüsler, sonra tarifeden tamamla */
function arrivals(l) {
  var out = [];
  if (liveFresh()) l.buses.forEach(function (b) {
    if (isFinite(b.at)) out.push({ at: b.at, live: true, sd: b.sd, now: b.sd === 0 || b.m <= 0 });
  });
  if (l.plan && l.plan.next && !l.plan.approx) {
    var m0 = midnight(), last = out.length ? out[out.length - 1].at : 0;
    l.plan.next.forEach(function (sec) {
      var at = m0 + sec * 1000;
      if (at > Date.now() - 30000 && at > last + 120000) out.push({ at: at, live: false });
    });
  }
  out.sort(function (x, y) { return x.at - y.at; });
  // ilk varıştan sonrakileri yalnızca 2 saat içindekilerle sınırla
  if (out.length) {
    var lim = Math.max(out[0].at, Date.now()) + 2 * 3600000;
    out = out.filter(function (a, i) { return i === 0 || a.at <= lim; });
  }
  return out.slice(0, 3);
}
var SIGNAL_SVG = '<svg class="sig" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
  '<circle cx="3.2" cy="12.8" r="1.8"/><path class="a1" d="M2 8.4a5.6 5.6 0 0 1 5.6 5.6" fill="none" stroke-width="1.8" stroke-linecap="round"/>' +
  '<path class="a2" d="M2 3.6a10.4 10.4 0 0 1 10.4 10.4" fill="none" stroke-width="1.8" stroke-linecap="round"/></svg>';
function timeLabel(a) {
  var m = minsTo(a.at);
  if (a.live && a.now) return { big: 'Şimdi', unit: '' };
  if (a.live && m <= 0) return { big: '<1', unit: 'dk' };
  if (!a.live && m <= 0) return { big: clock(new Date(a.at)), unit: '' };
  if (m >= 60) return { big: clock(new Date(a.at)), unit: '' };
  return { big: String(m), unit: 'dk' };
}
function lineRow(l) {
  var row = el('div', 'row'); row.setAttribute('role', 'button');
  var badge = el('div', 'badge', l.code);
  if (l.color) { badge.style.background = l.color; badge.style.color = inkFor(l.color); }
  row.appendChild(badge);

  var mid = el('div', 'mid');
  mid.appendChild(el('div', 'dest', l.head ? '→ ' + l.head : (l.name || 'Hat ' + l.code)));
  var sub = el('div', 'sub');
  var arr = arrivals(l);
  var first = arr[0];

  // alt satır: ilk otobüse dair kısa açıklama
  if (first && first.live) {
      var b0 = l.buses[0], bits = [];
    if (isFinite(b0.sd)) bits.push(b0.sd === 0 ? 'Durakta' : b0.sd + ' durak önce');
    if (b0.sd !== 0 && minsTo(first.at) < 60) bits.push(clock(new Date(first.at)));
    sub.textContent = bits.join(' · ');
  } else if (first) {
    sub.textContent = l.frozenCount ? 'Konum donuk · tarife' : (minsTo(first.at) < 60 ? 'Tarife · ' + clock(new Date(first.at)) : 'Tarifeye göre');
  } else if (l.plan && l.plan.approx && l.plan.next && l.plan.next.length) {
    sub.textContent = 'Hat başından kalkış ' + l.plan.next.map(sClock).join(' · ');
  } else if (l.offline) {
    sub.textContent = 'Bugün başka sefer yok';
  } else if (liveDown()) {
    sub.textContent = 'Canlı veri alınamıyor';
  } else if (!liveFresh()) {
    sub.textContent = 'Güncelleniyor…';
  } else if (l.frozenCount) {
    sub.textContent = 'Otobüs konumu güncellenmiyor';
  } else if (l.plan) {
    sub.textContent = 'Şu an yaklaşan otobüs yok';
  } else {
    sub.textContent = 'Tarife yükleniyor…';
  }
  mid.appendChild(sub);
  row.appendChild(mid);

  // sağ taraf: varış şeridi
  var strip = el('div', 'arr');
  if (!arr.length) {
    strip.appendChild(el('div', 'arr-none', '—'));
  } else {
    var lead = el('div', 'arr-lead' + (first.live ? ' live' : ' sched'));
    var t = timeLabel(first);
    if (first.live) { var sig = el('span', 'sigwrap'); sig.innerHTML = SIGNAL_SVG; lead.appendChild(sig); }
    var big = el('b', t.big === 'Şimdi' ? 'now' : (t.unit && +t.big <= 3 ? 'soon' : ''), t.big);
    if (t.big.length > 3) big.className += ' small';
    lead.appendChild(big);
    if (t.unit) lead.appendChild(el('span', 'unit', t.unit));
    strip.appendChild(lead);
    if (arr.length > 1) {
      var more = el('div', 'arr-more');
      arr.slice(1).forEach(function (a, i) {
        if (i) more.appendChild(el('span', 'dot', '·'));
        var tl = timeLabel(a);
        var x = el('span', a.live ? 'live' : 'sched', tl.big + (tl.unit ? ' ' + tl.unit : ''));
        more.appendChild(x);
      });
      strip.appendChild(more);
    }
  }
  row.appendChild(strip);

  var star = el('button', 'star' + (isFav(l.code) ? ' on' : ''), '★');
  star.setAttribute('aria-label', 'Takip et');
  star.onclick = function (e) { e.stopPropagation(); toggleFav(l.code); };
  row.appendChild(star);
  row.onclick = function () { openMap(l); };
  return row;
}
function score(l) {
  var a = arrivals(l)[0];
  if (a) return (a.at - Date.now()) / 60000 + (a.live ? 0 : 0.5);
  if (l.buses[0]) return 60 + (isFinite(l.buses[0].sd) ? l.buses[0].sd : 0);
  if (l.plan && l.plan.next && l.plan.next.length) return 300 + (l.plan.next[0] - secOfDay(new Date())) / 60;
  return 100000;
}
function renderList() {
  renderSheet();
  var L = $('list');
  if (!S.stop) return;
  if (!S.lines.length) {
    if (S.err) return showState('Otobüs bilgisi alınamadı', 'Bağlantını kontrol edip tekrar dene. (' + S.err + ')', [{ label: 'Tekrar dene', fn: loadArrivals }]);
    if (S.loading || !S.lastOk) {
      $('toolbar').hidden = true; L.innerHTML = '';
      for (var i = 0; i < 4; i++) L.appendChild(el('div', 'skel'));
      return;
    }
    return showState('Bu duraktan hat bulunamadı', 'Yukarıdan yakındaki başka bir durağı seçebilirsin.', [{ label: 'Yenile', fn: loadArrivals }]);
  }
  $('toolbar').hidden = false;
  document.querySelectorAll('.seg').forEach(function (b) { b.classList.toggle('on', b.dataset.f === S.filter); });
  var lines = S.lines.slice().sort(function (a, b) { return score(a) - score(b); });
  var favs = lines.filter(function (l) { return isFav(l.code); });
  var rest = lines.filter(function (l) { return !isFav(l.code); });
  L.innerHTML = '';
  if (S.filter === 'fav') {
    if (!favs.length) {
      var st = el('div', 'state');
      st.appendChild(el('h2', null, 'Takip ettiğin hat yok'));
      st.appendChild(el('div', null, 'Bu duraktaki bir hattın yanındaki ★ işaretine dokunarak takibe al.'));
      L.appendChild(st);
    } else favs.forEach(function (l) { L.appendChild(lineRow(l)); });
  } else {
    if (favs.length) { L.appendChild(el('div', 'section', 'Takip ettiklerin')); favs.forEach(function (l) { L.appendChild(lineRow(l)); }); }
    if (rest.length) { if (favs.length) L.appendChild(el('div', 'section', 'Diğer hatlar')); rest.forEach(function (l) { L.appendChild(lineRow(l)); }); }
  }
  var up = $('updated');
  up.classList.toggle('warn', !!S.err);
  if (liveDown()) up.textContent = 'Son veri ' + clock(new Date(S.lastOk));
  else if (S.err && S.lastOk) up.textContent = 'Bağlantı zayıf · ' + clock(new Date(S.lastOk));
  else if (S.lastOk) up.textContent = 'Güncellendi ' + clock(new Date(S.lastOk));
  if (liveDown() || S.ttFallback) {
    var warn = el('div', 'stale');
    warn.appendChild(el('b', null, 'Canlı veriye ulaşılamıyor'));
    warn.appendChild(el('div', null, S.ttFallback
      ? 'Saatler telefondaki tarifeden (' + ttDateLabel() + ' verisi). Bağlantı gelince canlı süreler kendiliğinden döner.'
      : 'Gösterilen saatler yalnızca tarifeden. Bağlantı gelince canlı süreler kendiliğinden döner.'));
    L.insertBefore(warn, L.firstChild);
  }
}


/* ---------- altlık harita ----------
   Birincil: OpenFreeMap vektör haritası (anahtarsız, ücretsiz) — sade görünüm için
   binalar, parklar, ikonlar vb. kaldırılır, renkler temaya göre ayarlanır.
   Yedek: WebGL yoksa ya da stil yüklenemezse OpenStreetMap raster + gri filtre. */
var OFM_STYLE = 'https://tiles.openfreemap.org/styles/positron';
var DROP_LAYER = /^(park|landcover|landuse|building|aeroway|road_area_pier|road_pier|railway|boundary|place_country|place_state|highway_path)/;
var PAL = {
  dark: { bg: '#1B1E20', water: '#15212A', waterTxt: '#53687A', casing: '#1B1E20', minor: '#2B2F33',
          major: '#3A3F45', motorway: '#4A5057', roadTxt: '#7E868D', placeTxt: '#A6ADB3', halo: '#1B1E20' },
  light: { bg: '#F2F1EE', water: '#CAD6DC', waterTxt: '#7F95A3', casing: '#DEDCD6', minor: '#FFFFFF',
           major: '#FFFFFF', motorway: '#FFFFFF', roadTxt: '#9AA0A3', placeTxt: '#6F777B', halo: '#F2F1EE' }
};
function minimalStyle(style) {
  var c = PAL[DARK ? 'dark' : 'light'];
  style.layers = (style.layers || []).filter(function (l) { return !DROP_LAYER.test(l.id); });
  style.layers.forEach(function (l) {
    var p = l.paint = l.paint || {}, id = l.id;
    if (l.type === 'background') p['background-color'] = c.bg;
    else if (id === 'water') p['fill-color'] = c.water;
    else if (id === 'waterway') p['line-color'] = c.water;
    else if (l.type === 'line' && /casing/.test(id)) p['line-color'] = c.casing;
    else if (l.type === 'line' && /minor/.test(id)) p['line-color'] = c.minor;
    else if (l.type === 'line' && /motorway/.test(id)) p['line-color'] = c.motorway;
    else if (l.type === 'line') p['line-color'] = c.major;
    else if (l.type === 'symbol') {
      p['text-color'] = id === 'water_name' ? c.waterTxt : /^highway_name/.test(id) ? c.roadTxt : c.placeTxt;
      p['text-halo-color'] = c.halo;
      if (l.layout && l.layout['icon-image']) delete l.layout['icon-image'];
    }
  });
  return style;
}
function hasWebGL() {
  try { var cv = document.createElement('canvas'); return !!(cv.getContext('webgl') || cv.getContext('experimental-webgl')); }
  catch (e) { return false; }
}
function addRasterBase(map) {
  if (map._base) { map.removeLayer(map._base); map._base = null; }
  map.getContainer().classList.add('raster');
  map._base = L.tileLayer(hasBridge ? 'https://tiles.durak.local/osm/{z}/{x}/{y}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, keepBuffer: 4, attribution: '© OpenStreetMap'
  }).addTo(map);
  map._base.bringToBack();
}
var styleCache = null;
function getStyle() {
  if (styleCache) return Promise.resolve(JSON.parse(styleCache));
  return fetch(OFM_STYLE).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function (t) { styleCache = t; return JSON.parse(t); });
}
function addBaseMap(map) {
  if (typeof L.maplibreGL !== 'function' || typeof maplibregl === 'undefined' || !hasWebGL()) return addRasterBase(map);
  var done = false;
  var giveUp = setTimeout(function () { if (!done) { done = true; addRasterBase(map); } }, 9000);
  getStyle().then(function (style) {
    if (done) return;
    var ml = L.maplibreGL({ style: minimalStyle(style), attributionControl: { customAttribution: '© OpenStreetMap · OpenFreeMap' }, interactive: false });
    ml.addTo(map);
    map._base = ml;
    var gl = ml.getMaplibreMap && ml.getMaplibreMap();
    if (gl) {
      gl.on('load', function () { done = true; clearTimeout(giveUp); });
      gl.on('error', function (e) {
        if (!done && e && e.error && /style|source|Failed to fetch/i.test(String(e.error.message || ''))) {
          done = true; clearTimeout(giveUp); addRasterBase(map);
        }
      });
    } else { done = true; clearTimeout(giveUp); }
  }).catch(function () { if (!done) { done = true; clearTimeout(giveUp); addRasterBase(map); } });
}
/* Harita kaynak yazısı: OSM kuralları gereği harita açılınca görünür; 5 sn sonra ya da haritaya ilk dokunuşta
   sağ alttaki küçük "?" simgesine dönüşür, simgeye basınca tekrar açılır (osmfoundation.org/wiki/Attribution). */
function compactAttribution(m) {
  var box = m.getContainer(), timer = null;
  var Btn = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      var b = L.DomUtil.create('button', 'attr-btn');
      b.type = 'button'; b.textContent = '?'; b.setAttribute('aria-label', 'Harita kaynakları');
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', function (e) { L.DomEvent.stop(e); expand(); });
      return b;
    }
  });
  new Btn().addTo(m);
  function collapse() { clearTimeout(timer); box.classList.add('attr-collapsed'); }
  function expand() { box.classList.remove('attr-collapsed'); clearTimeout(timer); timer = setTimeout(collapse, 5000); }
  expand(); // ilk açılışta görünür
  // sadece gerçek kullanıcı dokunuşunda küçült (haritanın kendi konum ayarlaması sayılmaz)
  L.DomEvent.on(box, 'touchstart mousedown wheel', function () {
    if (!box.classList.contains('attr-collapsed')) collapse();
  });
}
function makeMap(elId, center, zoom) {
  var m = L.map(elId, { zoomControl: false, attributionControl: true, minZoom: 9, maxZoom: 19 });
  m.attributionControl.setPrefix(false);
  compactAttribution(m);
  m.setView(center, zoom);
  m.getContainer().classList.add('map-' + (DARK ? 'dark' : 'light'));
  addBaseMap(m);
  return m;
}

/* ---------- harita ---------- */
var mapLayers = {};
function openMap(l) {
  S.mapLine = l; S.pathOkAt = 0; S.pathErr = false;
  S.mapFrom = S.tab;
  saveStopsView();
  setTimeout(function () { syncHeading(); }, 0);
  $('home').hidden = true; $('stopsScreen').hidden = true; $('tabbar').hidden = true; $('mapScreen').hidden = false;
  var badge = $('mapBadge'); badge.textContent = l.code;
  badge.style.background = l.color || ''; badge.style.color = l.color ? inkFor(l.color) : '';
  $('mapDest').textContent = l.head ? '→ ' + l.head : (l.name || 'Hat ' + l.code);
  $('mapMeta').textContent = 'Canlı konum yükleniyor…';
  if (!S.map) {
    S.map = makeMap('map', [S.stop.lat, S.stop.lng], 15);
  } else {
    S.map.setView([S.stop.lat, S.stop.lng], 15);
  }
  setTimeout(function () { S.map.invalidateSize(); }, 50);
  Object.keys(mapLayers).forEach(function (k) { S.map.removeLayer(mapLayers[k]); });
  mapLayers = {};
  mapLayers.stop = L.circleMarker([S.stop.lat, S.stop.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#0A5A73', fillOpacity: 1 })
    .bindTooltip(S.stop.name, { permanent: false }).addTo(S.map);
  updateUserDot();
  refreshMapCard();
  loadPath(l, true);
  clearInterval(S.mapTimer);
  S.mapTimer = setInterval(function () { if (S.mapLine) loadPath(S.mapLine, false); }, MAP_REFRESH_MS);
}
function closeMap() {
  S.mapLine = null; clearInterval(S.mapTimer);
  $('mapScreen').hidden = true; $('tabbar').hidden = false;
  showTab(S.mapFrom || 'home');
  syncHeading();
}
window.__back = function () {
  if (S.mapLine) { closeMap(); return true; }
  if (S.tab === 'stops' && searchOpen()) { closeSearch(); return true; }
  if (S.tab === 'stops' && !$('stopSheet').hidden) { closeSheet(); return true; }
  if (S.tab === 'stops') { showTab('home'); return true; }
  return false;
};

/* ---------- sekmeler ---------- */
S.tab = 'home';
function saveStopsView() {
  if (SM.map && !$('stopsScreen').hidden) SM.saved = { c: SM.map.getCenter(), z: SM.map.getZoom() };
}
function showTab(t) {
  if (S.tab === 'stops' && t !== 'stops') saveStopsView();
  S.tab = t;
  $('home').hidden = t !== 'home';
  $('stopsScreen').hidden = t !== 'stops';
  document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
  if (t === 'stops') openStopsMap();
  else renderList();
  syncHeading();
}


/* ---------- dokunma titreşimi ---------- */
function haptic() {
  try {
    if (hasBridge && window.Android.tap) window.Android.tap();
    else if (navigator.vibrate) navigator.vibrate(60);
  } catch (e) {}
}

/* ---------- arama: durak adı / numarası ve hat kodu ---------- */
function fold(t) {
  var map = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  return String(t || '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, function (c) { return map[c]; })
    .replace(/̇/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
var SX = null; // arama dizini
function searchIndex() {
  if (SX) return SX;
  var stops = {}, lines = [];
  (ttHas() ? ttAllStops() : []).forEach(function (st) { stops[st.id] = st; });
  Object.keys(SM.near).forEach(function (k) { if (!stops[k]) stops[k] = SM.near[k]; });
  S.stops.forEach(function (st) { if (!stops[st.id]) stops[st.id] = st; });
  var sl = Object.keys(stops).map(function (k) { var st = stops[k]; return { st: st, f: fold(st.name) }; });
  if (ttHas()) {
    var X = ttIndex();
    Object.keys(X.byCode).forEach(function (code) {
      var byDir = {};
      X.byCode[code].forEach(function (pi) {
        var p = TT.pats[pi], d = String(p[1]), n = p[5].length + p[6].length + p[7].length;
        if (!byDir[d] || n > byDir[d].n) byDir[d] = { n: n, p: p };
      });
      Object.keys(byDir).sort().forEach(function (d) {
        var p = byDir[d].p, r = TT.routes[p[0]];
        lines.push({ code: r[0], dir: d, head: nice(p[2]), name: nice(r[1]), color: color(r[2]), f: fold(r[0]), fh: fold(p[2]) + ' ' + fold(r[1]) });
      });
    });
  }
  SX = { stops: sl, lines: lines };
  return SX;
}
function runSearch(q) {
  var f = fold(q), box = $('results');
  box.innerHTML = '';
  if (!f) { box.appendChild(el('div', 'res-empty', 'Durak adı ("hukuk", "rektörlük"), durak numarası ya da hat kodu ("AÜ103", "KL08") yaz.')); return; }
  var X = searchIndex(), toks = f.split(' ');
  // hatlar: kod eşleşmesi önce, sonra yön/hat adında geçenler
  var lines = X.lines.filter(function (l) { return l.f.indexOf(f.replace(/ /g, '')) === 0; });
  if (lines.length < 6 && f.length >= 3) X.lines.forEach(function (l) {
    if (lines.indexOf(l) < 0 && toks.every(function (t) { return l.fh.indexOf(t) >= 0; })) lines.push(l);
  });
  lines = lines.slice(0, 8);
  // duraklar: numara ya da tüm kelimeler adda geçsin; başta geçen ve yakın olan önce
  var isNum = /^\d+$/.test(f), stops = [];
  X.stops.forEach(function (o) {
    var sc;
    if (isNum) { if (String(o.st.id).indexOf(f) !== 0) return; sc = 0; }
    else {
      if (!toks.every(function (t) { return o.f.indexOf(t) >= 0; })) return;
      sc = o.f.indexOf(f) === 0 ? 0 : ((' ' + o.f).indexOf(' ' + toks[0]) >= 0 ? 1 : 2);
    }
    var d = S.pos ? dist(S.pos.lat, S.pos.lng, o.st.lat, o.st.lng) : 0;
    stops.push({ st: o.st, sc: sc, d: d });
  });
  stops.sort(function (a, b) { return a.sc - b.sc || a.d - b.d; });
  stops = stops.slice(0, 15);

  if (lines.length) {
    box.appendChild(el('div', 'section', 'Hatlar'));
    lines.forEach(function (l) {
      var r = el('button', 'res'), bd = el('div', 'badge', l.code);
      if (l.color) { bd.style.background = l.color; bd.style.color = inkFor(l.color); }
      var t = el('div', 't'); t.appendChild(el('b', null, '→ ' + l.head)); t.appendChild(el('span', null, l.name));
      r.appendChild(bd); r.appendChild(t);
      r.onclick = function () { haptic(); closeSearch(); openLineFromSearch(l); };
      box.appendChild(r);
    });
  }
  if (stops.length) {
    box.appendChild(el('div', 'section', 'Duraklar'));
    stops.forEach(function (o) {
      var r = el('button', 'res'), pin = el('div', 'pin'); pin.innerHTML = STOP_SVG;
      var t = el('div', 't'); t.appendChild(el('b', null, o.st.name));
      t.appendChild(el('span', null, 'Durak no ' + o.st.id + (S.pos ? ' · ' + fmtDist(o.d) : '')));
      r.appendChild(pin); r.appendChild(t);
      r.onclick = function () { haptic(); closeSearch(); goToStop(o.st); };
      box.appendChild(r);
    });
  }
  if (!lines.length && !stops.length) box.appendChild(el('div', 'res-empty', '"' + q + '" için sonuç bulunamadı.'));
  // telefondaki listede olmayan yeni duraklar için Kentkart'a da sor (sessizce, sonuç azsa)
  if (!isNum && stops.length < 3 && f.length >= 3) {
    clearTimeout(SX.t); var asked = q;
    SX.t = setTimeout(function () {
      api('nearest/find', { keyword: asked }).then(function (r) {
        if ($('q').value !== asked) return;
        var add = (r.stopList || []).map(mapStop).filter(function (st) { return st.id && isFinite(st.lat); });
        var have = {}; X.stops.forEach(function (o) { have[o.st.id] = 1; });
        var fresh = add.filter(function (st) { return !have[st.id]; });
        if (fresh.length) { fresh.forEach(function (st) { X.stops.push({ st: st, f: fold(st.name) }); }); runSearch(asked); }
      }, function () {});
    }, 450);
  }
}
function openSearch() {
  $('results').hidden = false; $('stopsHint').hidden = true;
  runSearch($('q').value);
}
function closeSearch() {
  $('results').hidden = true; $('q').blur();
  if (SM.map) drawStops(true);
}
function searchOpen() { return !$('results').hidden; }
function goToStop(st) {
  if (!SM.map) return;
  SM.map.setView([st.lat, st.lng], Math.max(SM.map.getZoom(), 17), { animate: false });
  addNear([st]);
  drawStops(true);
  selectStopFromStops(st);
}
/* Hat aramasından: o yöndeki duraklardan sana en yakın olanı seç, hattın canlı haritasını aç */
function openLineFromSearch(l) {
  var best = null;
  if (ttHas()) {
    var X = ttIndex();
    (X.byCode[norm(l.code)] || []).forEach(function (pi) {
      var p = TT.pats[pi]; if (String(p[1]) !== String(l.dir)) return;
      p[3].forEach(function (si, pos) {
        if (pos === p[3].length - 1) return;
        var st = TT.stops[si], d = S.pos ? dist(S.pos.lat, S.pos.lng, st[2], st[3]) : pos;
        if (!best || d < best.d) best = { si: si, d: d };
      });
    });
  }
  if (best) {
    var st = ttStopObj(best.si); st.d = S.pos ? best.d : NaN;
    var ex = S.stops.filter(function (x) { return x.id === st.id; })[0];
    if (ex) st = ex; else S.stops.push(st);
    if (!S.stop || S.stop.id !== st.id) {
      S.stop = st; S.manual = true; S.lines = []; S.err = null; S.lastOk = 0;
      renderHeader(); renderList(); loadArrivals();
    }
  }
  if (!S.stop) return;
  openMap({ key: norm(l.code) + '|' + l.dir, code: l.code, dir: String(l.dir), head: l.head, name: l.name, color: l.color, buses: [], plan: null });
}

/* ---------- Duraklar haritası ---------- */
var SM = { map: null, layer: null, me: null, selId: null, all: null, near: {}, loadingAll: false, drawT: null, cells: {}, pending: 0 };
var STOP_SVG = '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M6 3h12a3 3 0 0 1 3 3v10a2 2 0 0 1-2 2v1.5a1.5 1.5 0 0 1-3 0V18H8v1.5a1.5 1.5 0 0 1-3 0V18a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3zm0 3v5h12V6H6zm1.5 7.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm9 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z"/></svg>';
function stopIcon(sel) {
  // ikon 20 px, ama dokunma alanı 36 px (küçük ikon da rahat basılsın)
  return L.divIcon({ className: 'stop-ico', html: '<div class="stop-pin' + (sel ? ' sel' : '') + '">' + STOP_SVG + '</div>', iconSize: [36, 36], iconAnchor: [18, 18] });
}
function openStopsMap() {
  var c = S.pos ? [S.pos.lat, S.pos.lng] : (S.stop ? [S.stop.lat, S.stop.lng] : [36.8970, 30.6510]); // varsayılan: Akdeniz Üniversitesi kampüsü
  if (!SM.map) {
    SM.map = makeMap('stopsMap', c, 16);
    SM.layer = L.layerGroup().addTo(SM.map);
    SM.map.on('moveend', function () { clearTimeout(SM.drawT); SM.drawT = setTimeout(drawStops, 250); });
  }
  setTimeout(function () {
    // gizliyken boyutu 0 olduğu için harita kayabiliyor: kayıtlı görünümü geri yükle
    SM.map.invalidateSize({ pan: false });
    if (SM.saved) SM.map.setView(SM.saved.c, SM.saved.z, { animate: false });
    drawStops();
  }, 60);
  addNear(S.stops);
  updateStopsMe();
  ensureAllStops();
}
function ensureAllStops() {
  if (SM.all || SM.loadingAll) return;
  if (ttHas()) { SM.all = ttAllStops(); drawStops(); return; }
  SM.loadingAll = true;
  allStopsCached().then(function (list) {
    SM.loadingAll = false;
    SM.all = list.map(function (a) { return { id: a[0], name: nice(a[1]), lat: a[2], lng: a[3], routes: '' }; });
    drawStops();
  }, function () { SM.loadingAll = false; drawStops(); });
}
var CELL_LAT = 0.004, CELL_LNG = 0.005;
function addNear(list) {
  if (SX && list.length) SX = null;
  list.forEach(function (s) { if (s && s.id && isFinite(s.lat) && isFinite(s.lng)) SM.near[s.id] = s; });
}
function fetchCells() {
  if (!SM.map || SM.map.getZoom() < 14) return;
  var b = SM.map.getBounds().pad(0.15), c = SM.map.getCenter();
  var la0 = Math.floor(b.getSouth() / CELL_LAT), la1 = Math.floor(b.getNorth() / CELL_LAT);
  var lo0 = Math.floor(b.getWest() / CELL_LNG), lo1 = Math.floor(b.getEast() / CELL_LNG);
  if (SM.queue) SM.queue.forEach(function (t) { if (SM.cells[t.k] === 'queued') delete SM.cells[t.k]; });
  var todo = [];
  for (var i = la0; i <= la1; i++) for (var j = lo0; j <= lo1; j++) {
    var k = i + ':' + j, cell = SM.cells[k];
    if (cell === 'loading' || (typeof cell === 'number' && Date.now() - cell < 10 * 60000)) continue;
    todo.push({ k: k, lat: (i + 0.5) * CELL_LAT, lng: (j + 0.5) * CELL_LNG });
  }
  todo.sort(function (x, y) { return dist(c.lat, c.lng, x.lat, x.lng) - dist(c.lat, c.lng, y.lat, y.lng); });
  SM.queue = todo.slice(0, 9);
  SM.queue.forEach(function (t) { SM.cells[t.k] = 'queued'; });
  pumpCells();
}
// Kentkart'ı yormamak için aynı anda en fazla 2 bölge sorgusu
var cellActive = 0;
function pumpCells() {
  while (cellActive < 2 && SM.queue && SM.queue.length) {
    var t = SM.queue.shift();
    if (SM.cells[t.k] !== 'queued') continue;
    (function (t) {
      SM.cells[t.k] = 'loading'; SM.pending++; cellActive++;
      api('nearest/place', { lat: t.lat.toFixed(6), lng: t.lng.toFixed(6) }).then(function (r) {
        addNear((r.stopList || []).map(mapStop));
        SM.cells[t.k] = Date.now();
      }, function () { delete SM.cells[t.k]; }).then(function () {
        SM.pending--; cellActive--;
        clearTimeout(SM.drawT); SM.drawT = setTimeout(function () { drawStops(true); }, 120);
        pumpCells();
      });
    })(t);
  }
}
/* Durakları yakınlığa göre çiz:
   - yakınlık ≥ 16 : otobüs ikonları (DOM), en fazla 300
   - yakınlık 14–15: küçük noktalar (tek tuval üzerine, çok hızlı) + ekranda birbirine çok yakın olanlardan biri
   - yakınlık < 14 : hiçbiri, "yakınlaştır" uyarısı
   Kaydırınca hepsi silinip yeniden çizilmez; sadece giren eklenir, çıkan kaldırılır. */
var ICON_ZOOM = 16, DOT_ZOOM = 14, DOT_CELL_PX = 16, MAX_ICONS = 300, MAX_DOTS = 1500;
SM.markers = {}; // id -> { m: marker, mode: 'icon'|'dot'|'sel' }
function stopsDotStyle() {
  return { radius: 4.5, color: '#fff', weight: 1.5, fillColor: '#1E6FD9', fillOpacity: 1, renderer: SM.canvas };
}
function clearStopMarkers() {
  Object.keys(SM.markers).forEach(function (id) { SM.layer.removeLayer(SM.markers[id].m); });
  SM.markers = {};
}
function drawStops(noFetch) {
  if (!SM.map || S.tab !== 'stops') return;
  if (!SM.canvas) SM.canvas = L.canvas({ padding: 0.3, tolerance: 10 }); // tolerance: noktaya dokunma alanı
  var hint = $('stopsHint'), z = SM.map.getZoom();
  if (z < DOT_ZOOM) {
    clearStopMarkers();
    hint.textContent = 'Durakları görmek için yakınlaştır'; hint.hidden = false;
    return;
  }
  if (!noFetch) fetchCells();
  // tam liste (eksik olabiliyor) + bölge sorgularından gelenler, durak numarasına göre birleşik
  var merged = {};
  (SM.all || []).forEach(function (s) { merged[s.id] = s; });
  Object.keys(SM.near).forEach(function (k) { merged[k] = SM.near[k]; });
  var b = SM.map.getBounds().pad(0.2);
  var vis = [];
  Object.keys(merged).forEach(function (k) { var st = merged[k]; if (b.contains([st.lat, st.lng])) vis.push(st); });

  var mode = z >= ICON_ZOOM ? 'icon' : 'dot';
  if (mode === 'dot') {
    // ekranda ~16 px'lik karelere böl, her karede tek durak (seçili durak her zaman kalır)
    var seen = {}, thin = [];
    vis.forEach(function (st) {
      var pt = SM.map.latLngToContainerPoint([st.lat, st.lng]);
      var cell = z <= DOT_ZOOM ? 26 : DOT_CELL_PX; // en uzakta daha seyrek
      var key = Math.floor(pt.x / cell) + ':' + Math.floor(pt.y / cell);
      if (st.id === SM.selId || !seen[key]) { seen[key] = 1; thin.push(st); }
    });
    vis = thin.slice(0, MAX_DOTS);
  } else if (vis.length > MAX_ICONS) {
    var c = SM.map.getCenter();
    vis.sort(function (x, y) { return dist(c.lat, c.lng, x.lat, x.lng) - dist(c.lat, c.lng, y.lat, y.lng); });
    vis = vis.slice(0, MAX_ICONS);
  }

  var want = {};
  vis.forEach(function (st) { want[st.id] = st; });
  // ekrandan çıkanları ya da gösterim türü değişenleri kaldır
  Object.keys(SM.markers).forEach(function (id) {
    var cur = SM.markers[id], wantMode = id === SM.selId ? 'sel' : mode;
    if (!want[id] || cur.mode !== wantMode) { SM.layer.removeLayer(cur.m); delete SM.markers[id]; }
  });
  // yeni girenleri ekle
  vis.forEach(function (st) {
    if (SM.markers[st.id]) return;
    var m, md;
    if (st.id === SM.selId) {
      md = 'sel'; m = L.marker([st.lat, st.lng], { icon: stopIcon(true), zIndexOffset: 1000, keyboard: false });
    } else if (mode === 'icon') {
      md = 'icon'; m = L.marker([st.lat, st.lng], { icon: stopIcon(false), keyboard: false });
    } else {
      md = 'dot'; m = L.circleMarker([st.lat, st.lng], stopsDotStyle());
    }
    m.on('click', function () { selectStopFromStops(st); }).addTo(SM.layer);
    SM.markers[st.id] = { m: m, mode: md };
  });

  if (!$('stopSheet').hidden) { hint.hidden = true; return; }
  hint.textContent = vis.length
    ? (mode === 'dot' ? 'Bir durağa dokun ya da yakınlaştır' : 'Saatleri görmek için bir durağa dokun')
    : ((SM.loadingAll || SM.pending) ? 'Duraklar yükleniyor…' : 'Bu bölgede durak yok');
  hint.hidden = false;
}
function updateStopsMe() {
  if (!SM.map || !S.pos) return;
  var ll = [S.pos.lat, S.pos.lng];
  var r = Math.max(10, S.pos.acc || 0);
  if (SM.acc) SM.acc.setLatLng(ll).setRadius(r);
  else SM.acc = L.circle(ll, { radius: r, stroke: false, fillColor: '#2563EB', fillOpacity: 0.12, interactive: false }).addTo(SM.map);
  if (SM.me) SM.me.setLatLng(ll);
  else SM.me = makeMe(ll, SM.map);
}
function selectStopFromStops(st) {
  haptic();
  var s = { id: st.id, name: st.name, lat: st.lat, lng: st.lng, routes: st.routes || '' };
  s.d = S.pos ? dist(S.pos.lat, S.pos.lng, s.lat, s.lng) : NaN;
  var existing = S.stops.filter(function (x) { return x.id === s.id; })[0];
  if (existing) { existing.d = s.d; s = existing; } else S.stops.push(s);
  if (SM.selId && SM.markers[SM.selId]) { SM.layer.removeLayer(SM.markers[SM.selId].m); delete SM.markers[SM.selId]; }
  if (SM.markers[s.id]) { SM.layer.removeLayer(SM.markers[s.id].m); delete SM.markers[s.id]; }
  SM.selId = s.id;
  if (!S.stop || S.stop.id !== s.id) {
    S.stop = s; S.manual = s !== S.stops[0]; S.lines = []; S.err = null; S.lastOk = 0;
    renderHeader(); renderList(); loadArrivals();
  }
  $('stopSheet').hidden = false; $('stopsHint').hidden = true;
  renderSheet(); drawStops(true);
  // seçilen durak kartın altında kalmasın
  var pt = SM.map.latLngToContainerPoint([st.lat, st.lng]), h = SM.map.getSize().y;
  if (pt.y > h * 0.45) SM.map.panBy([0, pt.y - h * 0.3]);
}
function closeSheet() {
  var prev = SM.selId; $('stopSheet').hidden = true; SM.selId = null;
  if (prev && SM.markers[prev]) { SM.layer.removeLayer(SM.markers[prev].m); delete SM.markers[prev]; }
  drawStops(true);
}
function renderSheet() {
  var sh = $('stopSheet'); if (!sh || sh.hidden || !S.stop) return;
  $('sheetName').textContent = S.stop.name;
  var meta = [];
  if (isFinite(S.stop.d)) meta.push(fmtDist(S.stop.d) + ' uzakta');
  if (S.stop.id) meta.push('Durak no ' + S.stop.id);
  $('sheetMeta').textContent = meta.join(' · ');
  var box = $('sheetList'); box.innerHTML = '';
  var all = $('sheetAll');
  if (!S.lines.length) {
    all.hidden = true;
    if (S.err) { box.appendChild(el('div', 'sheet-empty', 'Bilgi alınamadı. Bağlantını kontrol et.')); return; }
    if (S.loading || !S.lastOk) { box.appendChild(el('div', 'skel')); box.appendChild(el('div', 'skel')); return; }
    box.appendChild(el('div', 'sheet-empty', 'Bu duraktan geçen hat bulunamadı.'));
    return;
  }
  if (liveDown() || S.ttFallback) box.appendChild(el('div', 'sheet-empty warn', 'Canlı veriye ulaşılamıyor · saatler tarifeden'));
  var lines = S.lines.slice().sort(function (a, b) { return score(a) - score(b); });
  lines.slice(0, 4).forEach(function (l) { box.appendChild(lineRow(l)); });
  all.hidden = false;
  all.textContent = lines.length > 4 ? 'Tüm hatlar (' + lines.length + ')' : 'Durağın tüm ayrıntıları';
}
/* ---------- yönlü konum işareti ----------
   Mavi nokta + telefonun baktığı yöne açılan soluk koni (Google Haritalar gibi).
   Yön: Android'de telefonun yön sensörü (gerçek kuzeye düzeltilmiş), web'de tarayıcının pusulası.
   Pusula sadece bir harita ekranı açıkken çalışır. */
S.heading = null; S.headRot = 0;
var ME_HTML = '<div class="me"><svg class="me-cone" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">' +
  '<defs><radialGradient id="meCone" cx="60" cy="60" r="58" gradientUnits="userSpaceOnUse">' +
  '<stop offset="0" style="stop-color:var(--cone);stop-opacity:.7"/><stop offset=".55" style="stop-color:var(--cone);stop-opacity:.35"/>' +
  '<stop offset="1" style="stop-color:var(--cone);stop-opacity:0"/></radialGradient></defs>' +
  '<path d="M60 60 L26.7 12.5 A58 58 0 0 1 93.3 12.5 Z" fill="url(#meCone)"/></svg><div class="me-dot"></div></div>';
function meIcon() { return L.divIcon({ className: 'me-ico', html: ME_HTML, iconSize: [120, 120], iconAnchor: [60, 60] }); }
function makeMe(ll, map) {
  var m = L.marker(ll, { icon: meIcon(), interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(map);
  applyHeadingTo(m);
  return m;
}
function applyHeadingTo(m) {
  if (!m) return;
  var el = m.getElement && m.getElement(); if (!el) return;
  var cone = el.querySelector('.me-cone'); if (!cone) return;
  if (S.heading == null) { cone.style.opacity = '0'; return; }
  cone.style.opacity = '1';
  cone.style.transform = 'rotate(' + S.headRot + 'deg)';
}
window.__heading = function (h) {
  if (h == null || !isFinite(h)) { S.heading = null; }
  else {
    // en kısa yoldan dön (359° → 1° arası tam tur atmasın)
    var cur = ((S.headRot % 360) + 360) % 360, d = ((h - cur + 540) % 360) - 180;
    S.headRot += d; S.heading = h;
  }
  applyHeadingTo(SM.me); applyHeadingTo(mapLayers.me);
};
/* web: tarayıcı pusulası (Android Chrome: deviceorientationabsolute, iPhone: webkitCompassHeading) */
var webHeading = { on: false, handler: null, asked: false };
function webHeadingStart(fromGesture) {
  if (hasBridge || webHeading.on) return;
  var D = window.DeviceOrientationEvent; if (!D) return;
  function attach() {
    webHeading.handler = function (e) {
      var h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
      else if (e.absolute !== false && typeof e.alpha === 'number') {
        var scr = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
        h = (360 - e.alpha + scr) % 360;
      }
      if (h != null && (S.heading == null || Math.abs(((h - S.heading) + 540) % 360 - 180) >= 2)) window.__heading(h);
    };
    window.addEventListener('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', webHeading.handler, true);
    webHeading.on = true;
  }
  if (typeof D.requestPermission === 'function') { // iPhone: izin sadece dokunuşla istenebilir
    if (webHeading.granted) return attach();
    if (!fromGesture) return;
    D.requestPermission().then(function (r) { if (r === 'granted') { webHeading.granted = true; attach(); } }).catch(function () {});
  } else attach();
}
function webHeadingStop() {
  if (!webHeading.on) return;
  window.removeEventListener('deviceorientationabsolute', webHeading.handler, true);
  window.removeEventListener('deviceorientation', webHeading.handler, true);
  webHeading.on = false; window.__heading(null);
}
var headingOn = false;
function syncHeading(fromGesture) {
  var need = !!S.mapLine || !$('stopsScreen').hidden;
  if (need === headingOn && !(need && fromGesture && !hasBridge && !webHeading.on)) return;
  headingOn = need;
  if (hasBridge) { try { need ? window.Android.startHeading() : window.Android.stopHeading(); } catch (e) {} if (!need) window.__heading(null); }
  else { need ? webHeadingStart(fromGesture) : webHeadingStop(); }
}
function updateUserDot() {
  if (!S.map || !S.pos) return;
  var ll = [S.pos.lat, S.pos.lng];
  if (mapLayers.me) mapLayers.me.setLatLng(ll);
  else mapLayers.me = makeMe(ll, S.map);
}
var pathSeq = 0;
function loadPath(l, first) {
  var my = ++pathSeq;
  var dirs = l.dir != null ? [l.dir] : (l.pathDir != null ? [l.pathDir] : ['0', '1']);
  function go(i) {
    if (i >= dirs.length) { if (my === pathSeq) $('mapMeta').textContent = 'Hat güzergâhı alınamadı'; return; }
    var rt = first || !mapLayers.route ? '111000' : '010000';
    api('pathInfo', { displayRouteCode: l.code, direction: dirs[i], resultType: rt }).then(function (r) {
      if (my !== pathSeq || S.mapLine !== l) return;
      var p = (r.pathList || [])[0];
      if (!p) return go(i + 1);
      if (rt === '111000' && dirs.length > 1) {
        var has = (p.busStopList || []).some(function (s) { return sid(s) === S.stop.id; });
        if (!has && i + 1 < dirs.length) return go(i + 1);
        l.pathDir = dirs[i];
      }
      drawPath(l, p, first);
    }, function () { if (my === pathSeq) { S.pathErr = true; mapStaleCheck(); } });
  }
  go(0);
}
function drawPath(l, p, fit) {
  var col = l.color || '#0A5A73';
  if (p.pointList && p.pointList.length) {
    var pts = p.pointList.slice().sort(function (a, b) { return int(a.seq) - int(b.seq); })
      .map(function (q) { return [num(q.lat), num(q.lng)]; }).filter(function (q) { return isFinite(q[0]) && isFinite(q[1]); });
    if (mapLayers.route) S.map.removeLayer(mapLayers.route);
    mapLayers.route = L.polyline(pts, { color: col, weight: 5, opacity: .75 }).addTo(S.map);
    mapLayers.stop.bringToFront();
  }
  if (p.busStopList && p.busStopList.length) {
    if (mapLayers.stops) S.map.removeLayer(mapLayers.stops);
    var sg = L.layerGroup();
    p.busStopList.forEach(function (s) {
      var la = num(s.lat), lo = num(s.lng);
      if (!isFinite(la) || !isFinite(lo) || sid(s) === S.stop.id) return;
      var st = { id: sid(s), name: sname(s) || ('Durak ' + sid(s)), lat: la, lng: lo, routes: '' };
      L.circleMarker([la, lo], { radius: 4, color: col, weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(sg);
      // parmakla kolay basılsın diye görünmez, geniş bir dokunma alanı
      L.circleMarker([la, lo], { radius: 16, stroke: false, fillOpacity: 0 })
        .on('click', function () { selectStopFromMap(st); }).addTo(sg);
    });
    sg.addTo(S.map); mapLayers.stops = sg;
    mapLayers.stop.bringToFront();
  }
  if (mapLayers.buses) S.map.removeLayer(mapLayers.buses);
  var grp = L.layerGroup();
  var nextId = l.buses[0] ? String(l.buses[0].id || l.buses[0].plate) : null;
  var nextLL = null, n = 0;
  (p.busList || []).forEach(function (b) {
    var la = num(b.lat), lo = num(b.lng); if (!isFinite(la) || !isFinite(lo)) return;
    n++;
    var isNext = nextId && (String(b.busId || '') === nextId || String(b.plate || b.plateNumber || '') === nextId);
    var tk = S.track[S.stop.id + '|' + (b.busId || b.plate || '')];
    var frozen = tk && Date.now() - tk.since >= FROZEN_MS;
    if (isNext) nextLL = [la, lo];
    var html = '<div class="bus-pin' + (isNext ? ' next' : '') + '" style="background:' + col + ';color:' + inkFor(col) + '">🚌 ' +
      String(l.code).replace(/[<>&"]/g, '') + '</div>';
    L.marker([la, lo], { icon: L.divIcon({ className: 'bus-ico', html: html, iconSize: [0, 0] }), zIndexOffset: isNext ? 1000 : 0, opacity: frozen ? 0.35 : 1 }).addTo(grp);
  });
  grp.addTo(S.map); mapLayers.buses = grp;
  S.lastPath = p;
  S.pathOkAt = Date.now(); S.pathErr = false;
  $('mapMeta').textContent = n ? n + ' otobüs hatta · ' + clock(new Date()) + ' itibarıyla' : 'Şu an hatta canlı otobüs görünmüyor';
  if (fit) {
    var bounds = L.latLngBounds([[S.stop.lat, S.stop.lng]]);
    if (nextLL) bounds.extend(nextLL);
    else if (mapLayers.route) bounds = mapLayers.route.getBounds();
    if (S.pos && dist(S.pos.lat, S.pos.lng, S.stop.lat, S.stop.lng) < 2000) bounds.extend([S.pos.lat, S.pos.lng]);
    S.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }
}
function selectStopFromMap(st) {
  haptic();
  if (!S.mapLine || (S.stop && S.stop.id === st.id)) return;
  st.d = S.pos ? dist(S.pos.lat, S.pos.lng, st.lat, st.lng) : NaN;
  if (!S.stops.some(function (x) { return x.id === st.id; })) S.stops.push(st);
  S.stop = st; S.manual = true; S.lines = []; S.err = null; S.lastOk = 0;
  // haritadaki hattın eski durağa ait sürelerini hemen temizle
  S.mapLine.buses = []; S.mapLine.plan = null; S.mapLine.frozenCount = 0;
  if (mapLayers.stop) {
    mapLayers.stop.setLatLng([st.lat, st.lng]);
    mapLayers.stop.unbindTooltip().bindTooltip(st.name, { permanent: false });
  }
  if (S.lastPath) drawPath(S.mapLine, S.lastPath, false);
  var C = $('mapCard'); C.innerHTML = '';
  C.appendChild(el('div', 'big', '…'));
  C.appendChild(el('div', 'txt', st.name + ' durağı için veriler yükleniyor'));
  renderHeader(); renderList(); loadArrivals();
}
function mapStaleCheck() {
  if (!S.mapLine) return;
  var age = S.pathOkAt ? Date.now() - S.pathOkAt : Infinity;
  if (!S.pathErr && age < 30000) return;
  if (age === Infinity) { $('mapMeta').textContent = 'Canlı konum alınamadı, tekrar deneniyor…'; return; }
  if (age < 30000) { $('mapMeta').textContent = 'Bağlantı zayıf · konumlar ' + clock(new Date(S.pathOkAt)) + ' itibarıyla'; return; }
  if (age < 120000 && mapLayers.buses) {
    mapLayers.buses.eachLayer(function (m) { if (m.setOpacity) m.setOpacity(0.35); });
    $('mapMeta').textContent = 'Canlı konum alınamıyor · soluk işaretler ' + clock(new Date(S.pathOkAt)) + ' konumu';
    return;
  }
  if (mapLayers.buses) { S.map.removeLayer(mapLayers.buses); mapLayers.buses = null; }
  $('mapMeta').textContent = 'Canlı konum alınamıyor · otobüsler gösterilmiyor';
}
function refreshMapCard() {
  var l = S.mapLine; if (!l) return;
  var fresh = S.lines.filter(function (x) { return x.key === l.key; })[0];
  if (!fresh) fresh = S.lines.filter(function (x) { return x.code === l.code; })[0];
  if (fresh) { fresh.pathDir = l.pathDir; S.mapLine = l = fresh; }
  else if (S.lastOk && S.lines.length) {
    var C0 = $('mapCard'); C0.innerHTML = '';
    C0.appendChild(el('div', 'big', '—'));
    C0.appendChild(el('div', 'txt', S.stop.name + ' durağında bu hat için bilgi yok'));
    return;
  }
  var C = $('mapCard'); C.innerHTML = '';
  var b0 = liveFresh() ? l.buses[0] : null;
  var big = el('div', 'big'), txt = el('div', 'txt');
  if (!b0 && (liveDown() || S.ttFallback)) {
    big.textContent = '—';
    var nx = arrivals(l)[0];
    txt.textContent = 'Canlı veriye ulaşılamıyor' + (nx ? ' · tarifeye göre ' + clock(new Date(nx.at)) : '');
  } else if (b0 && isFinite(b0.at)) {
    var mm = minsTo(b0.at);
    big.textContent = b0.sd === 0 || b0.m <= 0 ? 'Şimdi' : (mm <= 0 ? '<1 dk' : mm + ' dk');
    txt.textContent = S.stop.name + ' durağına' + (isFinite(b0.sd) && b0.sd > 0 ? ' · ' + b0.sd + ' durak önce' : '') + ' · tahmini ' + clock(new Date(b0.at)) +
      (l.buses[1] && isFinite(l.buses[1].at) ? ' · sonraki ' + minsTo(l.buses[1].at) + ' dk' : '');
  } else if (l.plan && l.plan.next && l.plan.next.length) {
    big.textContent = sClock(l.plan.next[0]);
    txt.textContent = 'Canlı otobüs yaklaşmıyor · ' + (l.plan.approx ? 'hat başı kalkış saati' : 'tarifeye göre ' + S.stop.name);
  } else {
    big.textContent = '—';
    txt.textContent = S.stop.name + ' durağına yaklaşan otobüs görünmüyor';
  }
  C.appendChild(big); C.appendChild(txt);
}

/* ---------- döngü ---------- */
function startTimers() {
  clearInterval(S.timer); clearInterval(S.relocTimer); clearInterval(S.tick);
  S.tick = setInterval(function () { if (!S.mapLine && S.lines.length) renderList(); else if (S.mapLine) { refreshMapCard(); mapStaleCheck(); } }, 15000);
  S.timer = setInterval(function () { if (S.stop && !S.loading) loadArrivals(); }, REFRESH_MS);
  S.relocTimer = setInterval(function () { if (!S.locBlocked) locate(); }, RELOCATE_MS);
}
window.__pause = function () { if (!hasBridge) { webHeadingStop(); headingOn = false; } clearInterval(S.tick); clearInterval(S.timer); clearInterval(S.relocTimer); clearInterval(S.mapTimer); };
window.__resume = function () {
  if (!hasBridge) setTimeout(function () { syncHeading(); }, 0);
  startTimers();
  if (!S.locBlocked && (!S.pos || Date.now() - S.pos.t > 60000)) locate();
  if (S.stop && !S.loading) loadArrivals();
  if (S.mapLine) { clearInterval(S.mapTimer); S.mapTimer = setInterval(function () { if (S.mapLine) loadPath(S.mapLine, false); }, MAP_REFRESH_MS); loadPath(S.mapLine, false); }
};

$('refreshBtn').onclick = function () { locate(); if (S.stop) loadArrivals(); };
/* Tanılama ekranı: yenile düğmesine basılı tut */
(function () {
  var t = null, btn = $('refreshBtn');
  function start() { clearTimeout(t); t = setTimeout(function () { t = 'fired'; openDiag(); }, 700); }
  function stop(e) { if (t === 'fired') { if (e) e.preventDefault(); } else clearTimeout(t); t = null; }
  btn.addEventListener('touchstart', start, { passive: true });
  btn.addEventListener('mousedown', start);
  ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(function (ev) { btn.addEventListener(ev, stop); });
})();
function diagText() {
  var lines = ['Akdeniz tanılama · ' + new Date().toLocaleString('tr-TR'),
    'Sürüm: ' + (hasBridge ? 'Android' : 'web') + ' · API: ' + API,
    'Titreşim: ' + (hasBridge && window.Android.vibInfo ? window.Android.vibInfo() : ('tarayıcı · navigator.vibrate ' + (navigator.vibrate ? 'var' : 'yok'))),
    'Konum: ' + (S.pos ? S.pos.lat.toFixed(5) + ',' + S.pos.lng.toFixed(5) + ' ±' + Math.round(S.pos.acc || 0) + ' m' : 'yok'),
    'Durak: ' + (S.stop ? S.stop.id + ' ' + S.stop.name : 'yok') + ' · hat sayısı ' + S.lines.length + ' · hata: ' + (S.err || '-'),
    ''];
  DIAG.forEach(function (d) {
    lines.push((d.ok ? 'OK  ' : 'HATA') + ' ' + d.at + ' ' + d.path + ' (' + d.ms + ' ms)');
    lines.push('     ' + d.p);
    lines.push('     ' + d.info);
    if (d.raw) lines.push('     ham: ' + d.raw.replace(/\s+/g, ' '));
  });
  if (!DIAG.length) lines.push('Henüz istek yok.');
  return lines.join('\n');
}
function openDiag() {
  var o = $('diag'); o.hidden = false;
  $('diagText').textContent = diagText();
}
$('diagClose').onclick = function () { $('diag').hidden = true; };
$('diagCopy').onclick = function () {
  var txt = diagText();
  if (hasBridge && window.Android.copy) window.Android.copy(txt);
  else if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
  $('diagCopy').textContent = 'Kopyalandı ✓';
  setTimeout(function () { $('diagCopy').textContent = 'Kopyala'; }, 1800);
};
$('diagTest').onclick = function () {
  $('diagTest').textContent = 'Test ediliyor…';
  var c = S.pos || (S.stop ? { lat: S.stop.lat, lng: S.stop.lng } : { lat: 36.8969, lng: 30.6510 });
  var jobs = [api('nearest/place', { lat: (+c.lat).toFixed(6), lng: (+c.lng).toFixed(6) }),
              api('nearest/find', { keyword: 'hukuk' })];
  if (S.stop) jobs.push(api('nearest/bus', { lat: S.stop.lat, lng: S.stop.lng, busStopId: S.stop.id, accuracy: 0 }));
  Promise.all(jobs.map(function (p) { return p.catch(function () {}); })).then(function () {
    $('diagTest').textContent = 'Şimdi test et';
    $('diagText').textContent = diagText();
  });
};
$('backBtn').onclick = closeMap;
document.querySelectorAll('.tab').forEach(function (b) { b.onclick = function () { if (S.tab !== b.dataset.tab) showTab(b.dataset.tab); syncHeading(true); }; });
$('sheetClose').onclick = closeSheet;
$('q').addEventListener('focus', openSearch);
$('q').addEventListener('input', function () { $('qClear').hidden = !$('q').value; openSearch(); });
$('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('q').blur(); });
$('qClear').onclick = function () { $('q').value = ''; $('qClear').hidden = true; $('q').focus(); runSearch(''); };
$('sheetAll').onclick = function () { closeSheet(); showTab('home'); };
$('locBtn').onclick = function () {
  syncHeading(true);
  if (S.pos && SM.map) SM.map.setView([S.pos.lat, S.pos.lng], Math.max(SM.map.getZoom(), 16));
  locate();
};
document.querySelectorAll('.seg').forEach(function (b) {
  b.onclick = function () { S.filter = b.dataset.f; renderList(); };
});
if (S.fav.length) S.filter = 'all';
spin(true);
(function () {
  var L0 = $('list');
  if (!L0.children.length) {
    L0.innerHTML = '<div class="locating"><div class="radar"><i></i><i></i><i></i><b></b></div>' +
      '<h2>Konumun bulunuyor</h2><div>En yakın durak ve otobüsler birazdan burada.</div></div>';
  }
})();
startTimers();
locate();
