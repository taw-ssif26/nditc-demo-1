/* Runs before the page paints: decides whether lights/animations are on. Saved choice wins; otherwise respect the device's "reduce motion" / "data saver" settings. */
(function () {
  var v = null, c = navigator.connection || {};
  try { v = localStorage.getItem('nditc_fx'); } catch (e) {}
  if (v !== 'on' && v !== 'off') v = ((window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) || c.saveData) ? 'off' : 'on';
  document.documentElement.setAttribute('data-fx', v);
})();
