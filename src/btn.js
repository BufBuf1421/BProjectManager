// Определяем кастомный элемент <my-crystal-button>
class CrystalButton extends HTMLElement {
    connectedCallback() {
        const shadow = this.attachShadow({ mode: 'open' });

        shadow.innerHTML = `
            <style>
.btn-wrap {
    position: relative;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    isolation: isolate;
}
.btn-create-project {
    position: relative;
    width: 253px;
    height: 50px;
    border: none;
    border-radius: 14px;
    cursor: pointer;
    outline: none;
    overflow: hidden;
    isolation: isolate;
    background: 
        radial-gradient(ellipse at 50% 30%, rgba(255, 255, 255, 0.55) 0%, transparent 55%),
        linear-gradient(135deg, 
            #4ad4ff 0%, 
            #a06bff 30%, 
            #ff5ec4 55%, 
            #ffb85c 80%, 
            #a6ff5c 100%);
    background-size: 200% 200%;
    box-shadow: 
        0 0 12px rgba(160, 107, 255, 0.4),
        0 0 25px rgba(255, 94, 196, 0.25),
        inset 0 0 0 2px rgba(255, 255, 255, 0.65),
        inset 0 5px 6px rgba(255, 255, 255, 0.35),
        inset 0 -5px 8px rgba(120, 40, 200, 0.4);
    animation: rainbowShift 6s ease infinite;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.btn-create-project:hover {
    transform: translateY(-2px) scale(1.015);
    box-shadow: 
        0 0 18px rgba(160, 107, 255, 0.5),
        0 0 35px rgba(255, 94, 196, 0.35),
        inset 0 0 0 2px rgba(255, 255, 255, 0.85),
        inset 0 5px 8px rgba(255, 255, 255, 0.5),
        inset 0 -5px 8px rgba(120, 40, 200, 0.5);
}
.btn-create-project:active {
    transform: translateY(1px) scale(0.99);
}
.facets {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: 14px;
    pointer-events: none;
    background: 
        conic-gradient(from 45deg at 20% 30%, 
            rgba(255, 255, 255, 0.3) 0deg, 
            transparent 50deg, 
            transparent 310deg, 
            rgba(255, 255, 255, 0.3) 360deg),
        conic-gradient(from -45deg at 80% 70%, 
            rgba(255, 255, 255, 0.25) 0deg, 
            transparent 60deg, 
            transparent 300deg, 
            rgba(255, 255, 255, 0.25) 360deg);
    mix-blend-mode: overlay;
    opacity: 0.85;
}
.inner-glow {
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: 14px;
    pointer-events: none;
    background-image: 
        radial-gradient(1px 1px at 15% 30%, #fff, transparent),
        radial-gradient(1.5px 1.5px at 30% 65%, #fff, transparent),
        radial-gradient(1px 1px at 45% 25%, #fff, transparent),
        radial-gradient(1.5px 1.5px at 60% 70%, #fff, transparent),
        radial-gradient(1px 1px at 75% 35%, #fff, transparent),
        radial-gradient(1px 1px at 88% 60%, #fff, transparent),
        radial-gradient(1.5px 1.5px at 10% 75%, #fff, transparent),
        radial-gradient(1px 1px at 50% 50%, #fff, transparent),
        radial-gradient(1px 1px at 92% 25%, #fff, transparent),
        radial-gradient(1px 1px at 22% 15%, #fff, transparent);
    animation: innerTwinkle 2.5s ease-in-out infinite alternate;
}
.inner-frame {
    position: absolute;
    inset: 5px;
    z-index: 3;
    border-radius: 10px;
    pointer-events: none;
    border: 1px solid rgba(255, 255, 255, 0.5);
    box-shadow: 
        inset 0 0 0 1px rgba(255, 255, 255, 0.15),
        0 0 4px rgba(255, 255, 255, 0.2);
}
.corner {
    position: absolute;
    width: 6px;
    height: 6px;
    z-index: 5;
    background: #fff;
    transform: rotate(45deg);
    filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 5px #a06bff);
    border-radius: 1px;
    pointer-events: none;
    animation: cornerGlow 2s ease-in-out infinite alternate;
}
.tl { top: 4px; left: 4px; }
.tr { top: 4px; right: 4px; }
.bl { bottom: 4px; left: 4px; }
.br { bottom: 4px; right: 4px; }
.wing {
    position: absolute;
    top: 20%;
    bottom: 20%;
    width: 3px;
    z-index: 4;
    pointer-events: none;
    border-radius: 50%;
    filter: blur(1px);
}
.wing.left {
    left: 8px;
    background: linear-gradient(to bottom, 
        transparent, 
        rgba(255, 255, 255, 0.7) 50%, 
        transparent);
}
.wing.right {
    right: 8px;
    background: linear-gradient(to bottom, 
        transparent, 
        rgba(255, 255, 255, 0.7) 50%, 
        transparent);
}
.rainbow-border {
    position: absolute;
    inset: 0;
    z-index: 6;
    border-radius: 14px;
    pointer-events: none;
    padding: 2px;
    background: linear-gradient(120deg, 
        #7afcff 0%, 
        #a06bff 20%, 
        #ff5ec4 40%, 
        #ffb85c 60%, 
        #a6ff5c 80%, 
        #7afcff 100%);
    background-size: 300% 100%;
    -webkit-mask: 
        linear-gradient(#fff 0 0) content-box, 
        linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: borderFlow 4s linear infinite;
    opacity: 0.85;
}
.top-gloss {
    position: absolute;
    top: 4px;
    left: 10%;
    right: 10%;
    height: 32%;
    z-index: 7;
    border-radius: 50% 50% 40% 40% / 100% 100% 60% 60%;
    background: linear-gradient(to bottom, 
        rgba(255, 255, 255, 0.85) 0%, 
        rgba(255, 255, 255, 0.35) 55%, 
        rgba(255, 255, 255, 0) 100%);
    pointer-events: none;
    filter: blur(1px);
}
.sparkle {
    position: absolute;
    width: 8px;
    height: 8px;
    z-index: 8;
    pointer-events: none;
    clip-path: polygon(
        50% 0%, 55% 45%, 100% 50%, 55% 55%, 
        50% 100%, 45% 55%, 0% 50%, 45% 45%
    );
    background: radial-gradient(circle, #fff 0%, #fff 40%, transparent 75%);
    filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #ff9ce0);
    animation: sparkleBlink 2s ease-in-out infinite;
}
.s1 { top: -2px; left: 6px; animation-delay: 0s; }
.s2 { top: -2px; right: 6px; animation-delay: 0.5s; }
.s3 { bottom: -2px; left: 6px; animation-delay: 1s; }
.s4 { bottom: -2px; right: 6px; animation-delay: 1.5s; }
.flyer {
    position: absolute;
    inset: 0;
    z-index: 9;
    pointer-events: none;
    overflow: hidden;
    border-radius: 14px;
}
.flyer::before {
    content: '';
    position: absolute;
    width: 10px;
    height: 10px;
    top: 50%;
    left: 50%;
    clip-path: polygon(
        50% 0%, 58% 42%, 100% 50%, 58% 58%, 
        50% 100%, 42% 58%, 0% 50%, 42% 42%
    );
    background: radial-gradient(circle, #fff 0%, #fff 55%, transparent 85%);
    filter: drop-shadow(0 0 3px #fff);
    opacity: 0;
    animation: flyStar 8s linear infinite;
}
.flyer::after {
    content: '';
    position: absolute;
    width: 100px;
    height: 1.5px;
    top: 50%;
    left: 50%;
    background: linear-gradient(90deg, 
        transparent 0%, 
        rgba(255, 255, 255, 0.3) 20%,
        rgba(255, 255, 255, 1) 50%, 
        rgba(255, 255, 255, 0.3) 80%,
        transparent 100%);
    filter: blur(0.4px);
    box-shadow: 
        0 0 4px rgba(255, 255, 255, 0.8),
        0 0 8px rgba(200, 180, 255, 0.4);
    opacity: 0;
    animation: flyStar 8s linear infinite;
}
.btn-text {
    position: relative;
    z-index: 10;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #fff;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    text-shadow: 
        0 0 4px rgba(255, 255, 255, 0.8),
        0 1px 2px rgba(60, 20, 100, 0.9);
}
@keyframes rainbowShift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
@keyframes borderFlow {
    0%   { background-position: 0% 0%; }
    100% { background-position: 300% 0%; }
}
@keyframes innerTwinkle {
    0%   { opacity: 0.6; }
    100% { opacity: 1; }
}
@keyframes sparkleBlink {
    0%, 100% { opacity: 0.4; transform: scale(0.85); }
    50%      { opacity: 1;   transform: scale(1.2); }
}
@keyframes cornerGlow {
    0%   { opacity: 0.6; transform: rotate(45deg) scale(0.9); }
    100% { opacity: 1;   transform: rotate(45deg) scale(1.1); }
}
@keyframes flyStar {
    0% {
        left: 105%;
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.5);
    }
    6% {
        left: 95%;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1.1);
    }
    50% {
        left: 50%;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1.2);
    }
    24% {
        left: -5%;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }
    25% {
        left: -5%;
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.5);
    }
    100% {
        left: -5%;
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.5);
    }
}
.floating-particle {
    position: absolute; width: 6px; height: 6px; border-radius: 50%;
    background: radial-gradient(circle, #fff 0%, #fff 40%, rgba(255,255,255,0) 75%);
    box-shadow: 0 0 4px #fff, 0 0 8px rgba(255,200,255,0.8), 0 0 12px rgba(180,140,255,0.6);
    pointer-events: none; z-index: 2; opacity: 0;
}
.p1 { top: 10%; left: 5%;  animation: float1 6s ease-in-out infinite; }
.p2 { top: 0%;  left: 30%; width: 4px; height: 4px; animation: float2 7s ease-in-out infinite 0.5s; }
.p3 { top: -10%; left: 55%; width: 5px; height: 5px; animation: float3 5.5s ease-in-out infinite 1s; }
.p4 { top: 5%;  right: 5%; animation: float4 6.5s ease-in-out infinite 1.5s; }
.p5 { bottom: 10%; left: 8%;  width: 5px; height: 5px; animation: float5 7.5s ease-in-out infinite 2s; }
.p6 { bottom: 0%;  left: 40%; width: 4px; height: 4px; animation: float6 6s ease-in-out infinite 2.5s; }
.p7 { bottom: -5%; right: 30%; width: 5px; height: 5px; animation: float7 5.5s ease-in-out infinite 3s; }
.p8 { bottom: 10%; right: 8%; animation: float8 8s ease-in-out infinite 3.5s; }
@keyframes float1 { 0%{transform:translate(0,0) scale(.5);opacity:0} 20%{opacity:1} 50%{transform:translate(20px,-25px) scale(1.2);opacity:1} 80%{opacity:.8} 100%{transform:translate(40px,-50px) scale(.3);opacity:0} }
@keyframes float2 { 0%{transform:translate(0,0) scale(.4);opacity:0} 25%{opacity:1} 50%{transform:translate(-15px,-20px) scale(1);opacity:1} 100%{transform:translate(-30px,-45px) scale(.3);opacity:0} }
@keyframes float3 { 0%{transform:translate(0,0) scale(.6);opacity:0} 20%{opacity:1} 60%{transform:translate(10px,-30px) scale(1.3);opacity:1} 100%{transform:translate(-10px,-55px) scale(.2);opacity:0} }
@keyframes float4 { 0%{transform:translate(0,0) scale(.5);opacity:0} 30%{opacity:1} 50%{transform:translate(-25px,-20px) scale(1.1);opacity:1} 100%{transform:translate(-50px,-40px) scale(.3);opacity:0} }
@keyframes float5 { 0%{transform:translate(0,0) scale(.5);opacity:0} 25%{opacity:1} 60%{transform:translate(15px,25px) scale(1);opacity:1} 100%{transform:translate(30px,50px) scale(.3);opacity:0} }
@keyframes float6 { 0%{transform:translate(0,0) scale(.4);opacity:0} 20%{opacity:1} 50%{transform:translate(20px,30px) scale(1.2);opacity:1} 100%{transform:translate(40px,55px) scale(.3);opacity:0} }
@keyframes float7 { 0%{transform:translate(0,0) scale(.5);opacity:0} 30%{opacity:1} 60%{transform:translate(-20px,25px) scale(1);opacity:1} 100%{transform:translate(-40px,45px) scale(.3);opacity:0} }
@keyframes float8 { 0%{transform:translate(0,0) scale(.6);opacity:0} 25%{opacity:1} 70%{transform:translate(-15px,30px) scale(1.2);opacity:1} 100%{transform:translate(-30px,55px) scale(.3);opacity:0} }
.outer-star {
    position: absolute; width: 14px; height: 14px;
    pointer-events: none; z-index: 3;
    clip-path: polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%);
    background: radial-gradient(circle, #fff 0%, #fff 40%, transparent 80%);
    filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 6px rgba(200,160,255,0.8));
    opacity: 0;
    animation: outerStarPop 5s ease-in-out infinite;
}
.o1 { top: 5%; left: -5%; animation-delay: 0s; }
.o2 { top: -10%; right: 10%; width: 10px; height: 10px; animation-delay: 1.2s; }
.o3 { bottom: -15%; left: 15%; width: 12px; height: 12px; animation-delay: 2.4s; }
.o4 { bottom: 5%; right: -5%; animation-delay: 3.6s; }
@keyframes outerStarPop {
    0%, 100% { opacity: 0; transform: scale(0.3) rotate(0deg); }
    15%      { opacity: 1; transform: scale(1.3) rotate(45deg); }
    30%      { opacity: 1; transform: scale(1) rotate(90deg); }
    45%      { opacity: 0; transform: scale(0.5) rotate(135deg); }
}
.legend-rays {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: -1;
}
.core-flash {
    position: absolute;
    top: 0;
    left: 0;
    width: 350px;
    height: 60px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(255, 235, 180, 0.75) 0%, rgba(255, 200, 100, 0.4) 25%, rgba(255, 160, 60, 0.15) 55%, transparent 80%);
    filter: blur(30px);
    animation: coreFlash 3.5s ease-in-out infinite alternate;
    pointer-events: none;
}
@keyframes coreFlash {
    0%   { opacity: 0.7; transform: translate(-50%, -50%) scale(0.92); }
    100% { opacity: 1;   transform: translate(-50%, -50%) scale(1.08); }
}
.ray {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: var(--len, 60px);
    transform-origin: center bottom;
    transform: translate(-50%, -100%) rotate(var(--angle, 0deg)) scaleY(1);
    pointer-events: none;
    background: linear-gradient(to top,
        rgba(255, 245, 200, 1) 0%,
        rgba(255, 220, 120, 0.9) 20%,
        rgba(255, 190, 70, 0.6) 55%,
        rgba(255, 150, 40, 0.15) 85%,
        transparent 100%);
    animation: rayBreath var(--dur, 3.5s) ease-in-out infinite alternate;
    animation-delay: var(--delay, 0s);
    will-change: transform, opacity;
    box-shadow: 0px 0px 60px #dd7e00;
}
.ray.short {
    width: 1px;
    background: linear-gradient(to top,
        rgba(255, 240, 180, 0.9) 0%,
        rgba(255, 200, 90, 0.6) 40%,
        rgba(255, 160, 60, 0.2) 80%,
        transparent 100%);
    box-shadow: 0 0 2px rgba(255, 220, 120, 0.5);
    opacity: 0.75;
}
@keyframes rayBreath {
    0% {
        transform: translate(-50%, -100%) rotate(var(--angle, 0deg)) scaleY(0.4);
        opacity: 0.35;
    }
    100% {
        transform: translate(-50%, -100%) rotate(var(--angle, 0deg)) scaleY(1.4);
        opacity: 1;
    }
}
</style>


<div class="btn-wrap">

          <div class="legend-rays">
    <!-- Ядро-вспышка из центра кнопки -->
    <span class="core-flash"></span>

    <!-- Лучи -->
    <span class="ray" style="--angle: -90deg; --len: 140px; --dur: 3.4s; --delay: 0s;"></span>
    <span class="ray" style="--angle: -85deg; --len: 120px; --dur: 3.8s; --delay: 0.3s;"></span>
    <span class="ray" style="--angle: -94deg; --len: 100px; --dur: 3.2s; --delay: 0.6s;"></span>
    <span class="ray" style="--angle: -73deg; --len: 130px; --dur: 4.1s; --delay: 0.9s;"></span>
    <span class="ray" style="--angle: -98deg; --len: 110px; --dur: 3.6s; --delay: 1.2s;"></span>
    <span class="ray" style="--angle: -81deg; --len: 150px; --dur: 3.9s; --delay: 1.5s;"></span>
    <span class="ray" style="--angle:   -87deg; --len: 160px; --dur: 3.3s; --delay: 0.1s;"></span>
    <span class="ray" style="--angle:  82deg; --len: 150px; --dur: 4.0s; --delay: 0.7s;"></span>
    <span class="ray" style="--angle:  98deg; --len: 110px; --dur: 3.5s; --delay: 1.1s;"></span>
    <span class="ray" style="--angle:  73deg; --len: 130px; --dur: 3.7s; --delay: 0.4s;"></span>
    <span class="ray" style="--angle:  94deg; --len: 100px; --dur: 4.2s; --delay: 1.4s;"></span>
    <span class="ray" style="--angle:  85deg; --len: 120px; --dur: 3.1s; --delay: 0.2s;"></span>
    <span class="ray" style="--angle:  90deg; --len: 140px; --dur: 3.8s; --delay: 0.5s;"></span>

    <!-- Короткие лучи-«искры» в промежутках -->
    <span class="ray short" style="--angle: -82deg; --len: 60px; --dur: 4.4s; --delay: 0.15s;"></span>
    <span class="ray short" style="--angle: -52deg; --len: 55px; --dur: 3.9s; --delay: 0.95s;"></span>
    <span class="ray short" style="--angle: -22deg; --len: 70px; --dur: 4.6s; --delay: 1.75s;"></span>
    <span class="ray short" style="--angle:   8deg; --len: 65px; --dur: 4.1s; --delay: 0.55s;"></span>
    <span class="ray short" style="--angle:  38deg; --len: 55px; --dur: 3.7s; --delay: 1.35s;"></span>
    <span class="ray short" style="--angle:  68deg; --len: 60px; --dur: 4.3s; --delay: 0.25s;"></span>
    <span class="ray short" style="--angle:  82deg; --len: 50px; --dur: 3.5s; --delay: 1.05s;"></span>
</div>

        <!-- Парящие блёстки вокруг кнопки -->
        <span class="floating-particle p1"></span>
        <span class="floating-particle p2"></span>
        <span class="floating-particle p3"></span>
        <span class="floating-particle p4"></span>
        <span class="floating-particle p5"></span>
        <span class="floating-particle p6"></span>
        <span class="floating-particle p7"></span>
        <span class="floating-particle p8"></span>

        <!-- Внешние звёздочки -->
        <span class="outer-star o1"></span>
        <span class="outer-star o2"></span>
        <span class="outer-star o3"></span>
        <span class="outer-star o4"></span>

        <button id="welcomeCreateBtn" class="btn-create-project">
     <!-- Фасетки кристалла -->
        <span class="facets"></span>
        
        <!-- Мерцающие искры внутри -->
        <span class="inner-glow"></span>
        
        <!-- Двойная внутренняя обводка (как на рефах) -->
        <span class="inner-frame"></span>
        
        <!-- Угловые декоративные ромбики -->
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
        
        <!-- Боковые свечения-крылья -->
        <span class="wing left"></span>
        <span class="wing right"></span>
        
        <!-- Радужная обводка -->
        <span class="rainbow-border"></span>
        
        <!-- Верхний глянцевый блик -->
        <span class="top-gloss"></span>
        
        <!-- Угловые звёздочки -->
        <span class="sparkle s1"></span>
        <span class="sparkle s2"></span>
        <span class="sparkle s3"></span>
        <span class="sparkle s4"></span>
        
        <!-- Летающая звезда + жёсткий блик-полоса -->
        <span class="flyer"></span>
        
        <!-- Текст -->
        <span class="btn-text">+ Создать проект</span></button>
      </div>
      </body>
</html>
        `;

        // Пробрасываем клик наружу
        shadow.getElementById('welcomeCreateBtn').addEventListener('click', (e) => {
            this.dispatchEvent(new Event('click'));
        });
        
    }
}

customElements.define('my-crystal-button', CrystalButton);