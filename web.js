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

  // Ziyaret sayacı (yalnız yayındaki sitede): GoatCounter — çerezsiz, kişiyi takip etmez; istatistikler antalya.goatcounter.com'da.
  if (location.hostname === 'eruston.github.io') {
    try { localStorage.removeItem('akdeniz-sayildi'); } catch (e) {} // eski sayacın işareti
    var gc = document.createElement('script');
    gc.async = true;
    gc.src = 'https://gc.zgo.at/count.js';
    gc.setAttribute('data-goatcounter', 'https://antalya.goatcounter.com/count');
    document.head.appendChild(gc);
  }

  // Çevrimdışı açılış için uygulama kabuğunu önbelleğe al
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
