/* Akdeniz — yalnızca WEB sürümüne özel ekler. Android uygulamasında yüklenmez. */
(function () {
  // Uygulama arka plana gidince yenilemeyi durdur, dönünce devam et (Android'de bunu Java tarafı yapıyor)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (window.__pause) window.__pause(); }
    else if (window.__resume) window.__resume();
  });

  // Geri hareketi (Android tarayıcıda geri tuşu / iPhone'da kaydırma): önce açık ekranı kapat
  try {
    history.replaceState({ akdeniz: 1 }, '');
    history.pushState({ akdeniz: 2 }, '');
    window.addEventListener('popstate', function () {
      var handled = window.__back && window.__back();
      if (handled) history.pushState({ akdeniz: 2 }, '');
    });
  } catch (e) {}

  // Ziyaret sayacı (yalnız yayındaki sitede): hits.konst.fish — hesapsız, sadece sayı tutar.
  // "cihaz": her telefon ilk girişinde bir kez; "acilis": her açılışta. Sayılar sayac.html'de.
  if (location.hostname === 'eruston.github.io') {
    var HIT = 'https://hits.konst.fish/api/count/incr/badge.svg?url=';
    var hit = function (key, done) {
      var im = new Image();
      if (done) im.onload = done;
      im.src = HIT + encodeURIComponent('https://eruston.github.io/akdeniz/' + key) + '&t=' + Date.now();
    };
    try {
      if (!localStorage.getItem('akdeniz-sayildi')) hit('cihaz', function () { try { localStorage.setItem('akdeniz-sayildi', String(Date.now())); } catch (e) {} });
    } catch (e) {}
    hit('acilis');
  }

  // Çevrimdışı açılış için uygulama kabuğunu önbelleğe al
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
