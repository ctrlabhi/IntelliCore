(function () {
  'use strict';

  const scrollProgressBar = document.getElementById('scrollProgressBar');
  const rocketRunner = document.getElementById('rocketRunner');
  let scrollFrame = 0;

  function updateScrollProgress() {
    scrollFrame = 0;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const progress = maxScroll ? Math.min(100, (scrollTop / maxScroll) * 100) : 0;

    if (scrollProgressBar) scrollProgressBar.style.width = progress.toFixed(2) + '%';
    if (rocketRunner) {
      const rocketWidth = window.innerWidth <= 600 ? 29 : 34;
      const edge = rocketWidth / 2 + 4;
      const safeTravel = Math.max(0, window.innerWidth - edge * 2);
      rocketRunner.style.left = (edge + safeTravel * (progress / 100)).toFixed(1) + 'px';
    }
  }

  function scheduleScrollProgress() {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollProgress);
  }

  scheduleScrollProgress();
  window.addEventListener('scroll', scheduleScrollProgress, { passive: true });
  window.addEventListener('resize', scheduleScrollProgress, { passive: true });
  window.addEventListener('load', scheduleScrollProgress, { once: true });

  const canvas = document.getElementById('icWorkspaceNeuralCanvas');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = ['#00d2ff', '#3a86ff', '#05f2af', '#8338ec'];
  const pointer = { x: null, y: null, radius: 145 };
  let particles = [];
  let frameId = 0;
  let lastFrame = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const count = isMobile
      ? Math.min(24, Math.max(14, Math.floor((width * height) / 26000)))
      : Math.min(44, Math.max(24, Math.floor((width * height) / 30000)));

    particles = Array.from({ length: count }, function (_, index) {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.65,
        vy: (Math.random() - 0.5) * 0.65,
        size: Math.random() * 2.2 + 1.1,
        color: palette[index % palette.length]
      };
    });

    drawNetwork();
    if (!reducedMotion) startAnimation();
  }

  function drawNetwork() {
    context.clearRect(0, 0, width, height);

    particles.forEach(function (particle, index) {
      if (!reducedMotion) {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > height) particle.vy *= -1;

        if (pointer.x !== null && pointer.y !== null) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.hypot(dx, dy);
          if (distance < pointer.radius && distance > 0) {
            particle.x -= (dx / distance) * 0.55;
            particle.y -= (dy / distance) * 0.55;
          }
        }
      }

      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fillStyle = particle.color;
      context.fill();

      for (let next = index + 1; next < particles.length; next += 1) {
        const other = particles[next];
        const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
        const maxDistance = 135;
        if (distance < maxDistance) {
          context.beginPath();
          context.strokeStyle = 'rgba(0, 210, 255, ' + ((1 - distance / maxDistance) * 0.28).toFixed(3) + ')';
          context.lineWidth = 1;
          context.moveTo(particle.x, particle.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }
      }
    });
  }

  function animate(timestamp) {
    frameId = 0;
    if (document.hidden) return;

    if (timestamp - lastFrame >= 32) {
      lastFrame = timestamp;
      drawNetwork();
    }
    frameId = window.requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (!frameId && !document.hidden) {
      lastFrame = 0;
      frameId = window.requestAnimationFrame(animate);
    }
  }

  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('pointermove', function (event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }, { passive: true });
  window.addEventListener('pointerleave', function () {
    pointer.x = null;
    pointer.y = null;
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    } else {
      startAnimation();
    }
  });

  resizeCanvas();
})();
