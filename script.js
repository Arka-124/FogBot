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

  /* ---------- Live visibility ticker (demo placeholder) ----------
     Replace this with a real value pushed from the dashboard telemetry
     feed once available. For now it gently drifts to look "live". */
  var visibilityEl = document.getElementById('visibilityValue');
  if (visibilityEl) {
    var current = parseInt(visibilityEl.textContent, 10) || 86;
    setInterval(function () {
      var drift = Math.round((Math.random() - 0.5) * 4);
      current = Math.min(98, Math.max(60, current + drift));
      visibilityEl.textContent = current;
    }, 4000);
  }
})();
