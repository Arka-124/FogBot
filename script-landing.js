(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero parallax (background scrolls slower than foreground) ---------- */
  var heroScene = document.getElementById('heroScene');
  var hero = document.getElementById('hero');
  var scrollCue = document.querySelector('.scroll-cue');

  function onScroll() {
    var scrollY = window.scrollY;

    if (!reduceMotion && heroScene && hero) {
      var heroHeight = hero.offsetHeight;
      if (scrollY < heroHeight) {
        // background moves at ~0.4x the scroll speed
        heroScene.style.transform = 'translateY(' + (scrollY * 0.4) + 'px)';
      }
    }

    if (scrollCue) {
      var fadeDistance = 140;
      var opacity = Math.max(0, 1 - scrollY / fadeDistance);
      scrollCue.style.opacity = (opacity * 0.7).toFixed(2);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Stat count-up ---------- */
  var statEls = document.querySelectorAll('.stat__value');

  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-target'));
    var suffix = el.getAttribute('data-suffix') || '';
    var duration = 1200;
    var start = null;

    if (reduceMotion) {
      el.textContent = target + suffix;
      return;
    }

    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(target * eased);
      el.textContent = current + suffix;
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    }
    window.requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    var statObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          statObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    statEls.forEach(function (el) { statObserver.observe(el); });
  } else {
    statEls.forEach(animateCount);
  }

  /* ---------- Live Visibility Metric (Synced with Command Center Fog Density) ----------
     The visibility metric is consistent with the post-login command page fog density:
     visibility index = 100 - fog density %
  */
  var visibilityEl = document.getElementById('visibilityValue');

  function updateVisibilityFromFog(fogDensity) {
    var fog = parseInt(fogDensity, 10);
    if (isNaN(fog)) return;
    fog = Math.max(0, Math.min(100, fog));
    var visIndex = 100 - fog; // visibility index = 100 - fog density %
    if (visibilityEl && visibilityEl.textContent !== String(visIndex)) {
      visibilityEl.textContent = visIndex;
    }
  }

  // 1. Synchronously apply cached fog density from localStorage if available
  try {
    var initialFog = localStorage.getItem('fogbot_fog_density');
    if (initialFog !== null && !isNaN(parseInt(initialFog, 10))) {
      updateVisibilityFromFog(initialFog);
    } else {
      // Default fog density is 14% -> 86% visibility
      updateVisibilityFromFog(14);
    }
  } catch (e) {
    updateVisibilityFromFog(14);
  }

  // 2. Fetch latest telemetry from server endpoint
  function fetchFogTelemetry() {
    fetch('/api/telemetry/fog')
      .then(function (res) {
        if (res.ok) return res.json();
      })
      .then(function (data) {
        if (data && typeof data.fogDensity === 'number') {
          updateVisibilityFromFog(data.fogDensity);
          try {
            localStorage.setItem('fogbot_fog_density', data.fogDensity);
          } catch (err) {}
        }
      })
      .catch(function () {});
  }
  fetchFogTelemetry();

  // Poll server every 3s to keep index.html live and in-sync across devices
  setInterval(fetchFogTelemetry, 3000);

  // 3. Instant cross-tab sync via storage event
  window.addEventListener('storage', function (e) {
    if (e.key === 'fogbot_fog_density' && e.newValue !== null) {
      updateVisibilityFromFog(e.newValue);
    }
  });

  // 4. Instant cross-tab sync via BroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      var channel = new BroadcastChannel('fogbot_telemetry');
      channel.onmessage = function (e) {
        if (e.data && typeof e.data.fogDensity === 'number') {
          updateVisibilityFromFog(e.data.fogDensity);
        }
      };
    } catch (err) {}
  }
})();
