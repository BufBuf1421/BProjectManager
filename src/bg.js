(function() {
  const root = getComputedStyle(document.documentElement);
  
  // Чтение переменных
  function v(name, fallback) {
    const val = root.getPropertyValue(name).trim();
    return val || fallback;
  }
  function num(name, fallback) {
    return parseFloat(v(name, fallback));
  }
  function px(name, fallback) {
    return parseFloat(v(name, fallback));
  }
  
  const config = {
    bgColor: v('--bg-color', '#1a1a1a'),
    gridColor: v('--grid-color', 'rgba(255,255,255,0.05)'),
    gridColorBold: v('--grid-color-bold', 'rgba(255,255,255,0.09)'),
    crossColorSmall: v('--cross-color-small', 'rgba(255,255,255,0.25)'),
    crossColorLarge: v('--cross-color-large', 'rgba(255,255,255,0.45)'),
    gridSize: px('--grid-size', 40),
    boldEvery: num('--bold-every', 4),
    crossSizeSmall: px('--cross-size-small', 5),
    crossSizeLarge: px('--cross-size-large', 9),
    crossThickness: px('--cross-thickness', 1),
    scrollSpeed: num('--scroll-speed', 0.15),
    twinkleMin: num('--twinkle-min', 0.1),
    twinkleMax: num('--twinkle-max', 1.0),
    twinkleSpeed: num('--twinkle-speed', 0.005),
  };
  
  const app = document.getElementById('app');
  const canvas = app.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  
  let W = 0, H = 0, dpr = 1;
  let offset = 0;
  let crosses = [];  // массив с фазами мерцания
  
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = app.clientWidth;
    H = app.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildCrosses();
  }
  
  function rebuildCrosses() {
    // Крестики расставлены по сетке крупного шага (gridSize * boldEvery)
    const step = config.gridSize * config.boldEvery;
    const cols = Math.ceil(W / step) + 2;
    const rows = Math.ceil(H / step) + 2;
    crosses = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Чередование: шахматка
        const isLarge = (r + c) % 2 === 0;
        crosses.push({
          baseX: c * step,
          baseY: r * step,
          phase: Math.random() * Math.PI * 2,
          speed: config.twinkleSpeed * (0.5 + Math.random()),
          isLarge,
        });
      }
    }
  }
  
  function parseRGBA(str) {
    // Парсит rgba(...) или #hex
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(s => parseFloat(s.trim()));
      return { r: parts[0]||0, g: parts[1]||0, b: parts[2]||0, a: parts[3] ?? 1 };
    }
    if (str.startsWith('#')) {
      const hex = str.slice(1);
      const bigint = parseInt(hex.length === 3 
        ? hex.split('').map(c => c+c).join('')
        : hex, 16);
      return { r: (bigint>>16)&255, g: (bigint>>8)&255, b: bigint&255, a: 1 };
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  
  const cSmall = parseRGBA(config.crossColorSmall);
  const cLarge = parseRGBA(config.crossColorLarge);
  const cGrid = parseRGBA(config.gridColor);
  const cGridBold = parseRGBA(config.gridColorBold);
  
  function drawGrid() {
    const s = config.gridSize;
    const step = s * config.boldEvery;
    
    // Сдвиг
    const ox = -((offset) % step);
    const oy = -((offset * 0.7) % step);  // легкая диагональ
    
    // Мелкая сетка
    ctx.strokeStyle = config.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < W; x += s) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = oy; y < H; y += s) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
    
    // Крупная сетка
    ctx.strokeStyle = config.gridColorBold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < W; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = oy; y < H; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();
    
    // Крестики
    const t = performance.now();
    const lineWidth = config.crossThickness;
    
    for (const cross of crosses) {
      const x = cross.baseX + ox;
      const y = cross.baseY + oy;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      
      // Мерцание: синусоида со случайной фазой
      const phase = Math.sin(t * cross.speed + cross.phase);
      // Нелинейность, чтобы было больше "тёмного" времени
      const norm = (phase + 1) / 2; // 0..1
      const tw = config.twinkleMin + (config.twinkleMax - config.twinkleMin) * Math.pow(norm, 2);
      
      const color = cross.isLarge ? cLarge : cSmall;
      const size = cross.isLarge ? config.crossSizeLarge : config.crossSizeSmall;
      
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a * tw})`;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      // Вертикальная линия крестика
      ctx.moveTo(x + 0.5, y - size);
      ctx.lineTo(x + 0.5, y + size);
      // Горизонтальная
      ctx.moveTo(x - size, y + 0.5);
      ctx.lineTo(x + size, y + 0.5);
      ctx.stroke();
    }
  }
  
  function frame() {
    // Очистка
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, W, H);
    
    drawGrid();
    
    offset += config.scrollSpeed;
    requestAnimationFrame(frame);
  }
  
  window.addEventListener('resize', resize);
  resize();
  frame();
})();