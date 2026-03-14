// Random background effect — picked once per page load
(function () {
  const el = document.getElementById('bg-effect');
  if (!el) return;

  const effects = [staticNoise, filmGrain, gradientDrift, particleField];
  const names = ['staticNoise', 'filmGrain', 'gradientDrift', 'particleField'];
  const pick = Math.floor(Math.random() * effects.length);
  console.log('bg effect:', names[pick]);
  effects[pick](el);

  // 1. Static noise texture (SVG feTurbulence + vignette, no JS animation)
  function staticNoise(container) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = `
      <filter id="bg-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>`;
    document.body.appendChild(svg);

    Object.assign(container.style, {
      background: 'radial-gradient(ellipse at center, rgba(20,20,20,1) 0%, rgba(0,0,0,1) 70%)',
    });

    const noiseLayer = document.createElement('div');
    Object.assign(noiseLayer.style, {
      position: 'absolute',
      inset: '0',
      filter: 'url(#bg-noise)',
      opacity: '0.04',
    });
    container.appendChild(noiseLayer);
  }

  // 2. Animated film grain (tiny canvas redrawn at ~10fps)
  function filmGrain(container) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      imageRendering: 'pixelated',
      opacity: '0.04',
    });
    container.appendChild(canvas);

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    let last = 0;
    function draw(now) {
      if (now - last > 100) {
        last = now;
        for (let i = 0; i < data.length; i += 4) {
          const v = Math.random() * 255;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  // 3. Slow gradient drift (CSS animation)
  function gradientDrift(container) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes bg-drift {
        0%   { background-position: 0% 0%; }
        25%  { background-position: 100% 50%; }
        50%  { background-position: 50% 100%; }
        75%  { background-position: 0% 50%; }
        100% { background-position: 0% 0%; }
      }
    `;
    document.head.appendChild(style);

    Object.assign(container.style, {
      background: 'radial-gradient(ellipse at center, rgba(25,25,30,1), rgba(0,0,0,1) 70%)',
      backgroundSize: '200% 200%',
      animation: 'bg-drift 45s ease-in-out infinite',
    });
  }

  // 4. Sparse particle field (canvas with drifting dots)
  function particleField(container) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
    });
    container.appendChild(canvas);

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const count = 40;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1 + Math.random(),
      alpha: 0.08 + Math.random() * 0.07,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,
    }));

    function draw(now) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = now * 0.001;
      for (const p of particles) {
        p.x += p.vx + Math.sin(t + p.phase) * 0.1;
        p.y += p.vy + Math.cos(t + p.phase) * 0.1;

        // wrap
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }
})();
