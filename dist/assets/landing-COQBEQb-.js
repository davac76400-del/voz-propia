const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./scene-DadpB4HY.js","./three.module-Df0CdqQo.js"])))=>i.map(i=>d[i]);
import{a as e,c as t,d as n,f as r,g as i,h as a,i as o,l as s,m as c,n as l,o as u,p as d,r as ee,s as te,t as ne,u as re}from"./index-CvChMY5p.js";var ie=`#2F69FF`,f=`radial-gradient(circle at center, #ffffff 0%, #ecefff 35%, #c2d1ff 100%)`,p=[[`w`,`Hola`,17,10,`#3df2a0`,8],[`w`,`Agua`,83,20,`#00e5ff`,18],[`m`,`o`,36,26,`#ff3df0`,24],[`w`,`Gracias`,16,34,`#ff3df0`,30],[`m`,`smile`,66,8,`#f7ff3d`,36],[`w`,`Te quiero`,84,48,`#f7ff3d`,42],[`w`,`Familia`,17,58,`#b04dff`,54],[`m`,`m`,70,82,`#00e5ff`,60],[`w`,`Tengo sed`,83,72,`#3df2a0`,66],[`w`,`Estoy aquí`,19,82,`#00e5ff`,78],[`m`,`o`,32,90,`#3df2a0`,86],[`w`,`Sí`,84,92,`#ff3df0`,92]],m={o:`<svg viewBox="0 0 60 44"><ellipse cx="30" cy="22" rx="13" ry="17"/><ellipse cx="30" cy="22" rx="5.5" ry="9"/></svg>`,smile:`<svg viewBox="0 0 60 44"><path d="M5 12Q30 50 55 12Q30 26 5 12Z"/></svg>`,m:`<svg viewBox="0 0 60 44"><path d="M5 22Q17 8 30 16Q43 8 55 22Q43 38 30 38Q17 38 5 22Z"/><path d="M5 22H55"/></svg>`},h=[[50,0],[55,6],[46,13],[56,21],[45,29],[54,37],[44,46],[55,54],[46,62],[56,70],[47,78],[55,86],[48,93],[51,100]],ae=7,oe=[[23,55],[14,59],[0,66]],se=[[76,47],[88,42],[100,34]],ce=[[[46,13],[36,16],[30,25],[24,28]],[[56,21],[67,24],[72,34],[80,37]],[[44,46],[33,44],[27,37],[18,36]],[[55,54],[65,60],[72,58],[84,64]],[[46,62],[38,70],[33,81],[27,88]],[[56,70],[66,77],[69,87],[76,95]],[[54,37],[63,32],[66,22]],[[47,78],[40,84],[43,94]],[[45,29],[37,33],[35,42]]],g=[`Sí`,`No`,`Tengo sed`,`Me duele`,`Tengo frío`,`Llama a mi familia`,`Tengo miedo`,`Gracias`],_=[`Menos silencio`,`Más voz`,`Tus labios hablan`,`Sin internet`],v=(t=`chevron-right`)=>`<span class="l-orb" aria-hidden="true">${e(t,16,2.4)}</span>`;function le(){let t=g.map((e,t)=>`<span class="${t%2?`is-solid`:``}">${e}</span><i>✦</i>`).join(``),n=_.map(e=>`<span>${e}</span><i></i>`).join(``),r=(e,t,n,r)=>`
    <div class="l-card"><div class="l-card__inner">
      <div class="l-card__head"><span>${e}</span><span>${t}</span><i></i></div>
      <p class="l-card__v">${n}</p>
      <p class="l-card__d">${r}</p>
    </div></div>`,i=(t,n,r,i)=>`
    <article class="l-feature" data-reveal style="--d:${i*.09}s">
      <span class="l-feature__icon">${e(t,22,1.8)}</span>
      <h3>${n}</h3>
      <p>${r}</p>
    </article>`;return`
  <div class="landing" data-stage="0">
    <div class="l-bg" aria-hidden="true">
      <i style="background:${f}" data-layer="0"></i>
      <i data-layer="1"></i><i data-layer="2"></i><i data-layer="3"></i><i data-layer="4"><b class="l-stars"></b></i>
    </div>
    <div class="l-poster" aria-hidden="true">
      <p class="l-poster__over">Tus labios hablan · nosotros ponemos la</p>
      <p class="l-poster__word">Voz</p>
    </div>
    <div class="l-canvas" aria-hidden="true"><canvas></canvas></div>
    <div class="l-poster l-poster--front" aria-hidden="true">
      <p class="l-poster__over">Tus labios hablan · nosotros ponemos la</p>
      <p class="l-poster__word">Voz</p>
    </div>

    <div class="l-loader" data-loader role="status" aria-live="polite">
      <div class="l-ld" data-ld>
        <p class="l-ld__brand" aria-hidden="true">${u()}<span>Voz Propia</span></p>
        <div class="l-ld__field" aria-hidden="true">
          <div class="l-ld__hero" data-ld-hero>
            <i class="l-ld__wave"></i><i class="l-ld__wave l-ld__wave--2"></i>
            <svg viewBox="0 0 120 76"><defs><linearGradient id="ld-lips" x1="0" x2="1"><stop offset="0" stop-color="#3df2a0"/><stop offset=".5" stop-color="#4d7cff"/><stop offset="1" stop-color="#ff3df0"/></linearGradient></defs><path class="l-ld__lip" d="M6 38C24 30 36 14 49 14C55 14 58 19 60 21C62 19 65 14 71 14C84 14 96 30 114 38C98 41 78 43 60 41C42 43 22 41 6 38Z"/><path class="l-ld__lip l-ld__lip--low" d="M6 39C22 43 42 45 60 44C78 45 98 43 114 39C100 58 82 66 60 66C38 66 20 58 6 39Z"/></svg>
          </div>
          ${p.map(([e,t,n,r,i,a])=>`<span class="l-ld__it l-ld__it--${e}" data-at="${a}" style="--x:${n}%;--y:${r}%;--c:${i}">${e===`w`?`<b>${t}</b>`:m[t]}</span>`).join(``)}
        </div>
        <div class="l-ld__meter" aria-hidden="true">
          <div class="l-ld__track">
            <i class="l-ld__bar l-ld__bar--glow"></i>
            <i class="l-ld__bar"></i>
            <i class="l-ld__spark"></i>
          </div>
          <p class="l-ld__status" data-loader-status>Calibrando lectura de labios</p>
        </div>
      </div>
    </div>

    <header class="l-header">
      <a class="l-word" href="#top" data-scroll="top" aria-label="Voz Propia, arriba">${u()}<span>Voz Propia</span></a>
      <nav class="l-nav" aria-label="Secciones del inicio">
        <a href="#historia" data-scroll="historia">Historia</a>
        <a href="#labios" data-scroll="labios">Labios</a>
        <a href="#entrar" data-scroll="entrar">Entrar</a>
      </nav>
      <div class="l-header__right">
        <button class="l-chip" type="button" data-tools>${e(`lightbulb`,17,2.2)}<span>Consejos</span></button>
        <button class="l-chip l-chip--acct" type="button" data-acct aria-label="Tu cuenta">${e(`user`,17,2.2)}<span data-acct-label>Cuenta</span></button>
        <a class="l-pill" href="#entrar" data-scroll="entrar"><span>Comenzar</span>${v()}</a>
      </div>
    </header>

    <main class="l-main">
      <section class="l-sec l-hero" id="top" aria-labelledby="hero-title">
        <p class="l-hero__script" aria-hidden="true">propia</p>
        <div class="l-hero__row">
          <div class="l-hero__left">
            <p class="l-eyebrow l-in" style="--d:.15s">[ Lectura de labios sin internet ]</p>
            <h1 class="l-hero__title l-in" id="hero-title" style="--d:.28s"><span class="sr-only">Voz Propia. </span>Menos silencio.<br>Más voz.</h1>
          </div>
          <div class="l-hero__right l-in" style="--d:.45s">
            <p>Lee el movimiento de tus labios y lo dice en voz alta. Para quien perdió la voz, en su propio teléfono.</p>
            <p class="l-credit">© 2026 · Proyecto para SOLACYT Infomatrix</p>
            <p class="l-cue">${e(`arrow-down`,14)} Desliza</p>
          </div>
        </div>
      </section>

      <section class="l-sec l-drop" id="historia">
        <div class="l-band" aria-hidden="true"><div class="l-band__track">${t}${t}</div></div>
        <div class="l-wrap l-grid">
          <div class="l-grid__main">
            <p class="l-label" data-reveal>[ 02 · Silencio ]</p>
            <h2 class="l-h2" data-reveal style="--d:.1s">Cuando la voz<br>se cae.<span class="l-script l-script--drop" aria-hidden="true">sin voz</span></h2>
            <p class="l-p" data-reveal style="--d:.2s">Una traqueostomía, una cirugía de garganta o días en terapia intensiva. Las palabras siguen ahí, pero el sonido ya no sale. Desliza y mira cómo cada una cae al suelo, sin que nadie la escuche.</p>
          </div>
          <div class="l-grid__side l-cards" data-reveal style="--d:.25s">
            ${r(`01`,`Visión`,`Tus labios`,`Los mira la cámara de tu teléfono`)}
            ${r(`02`,`Privacidad`,`0 videos`,`Nada sale de tu teléfono, ni una imagen`)}
          </div>
        </div>
        <span class="l-sticker l-sticker--a" aria-hidden="true">Sin internet ✦</span>
      </section>

      <section class="l-sec l-form" id="labios">
        <div class="l-wrap l-form__top">
          <p class="l-label" data-reveal>[ 03 · Forma ]</p>
          <h2 class="l-h2" data-reveal style="--d:.1s">Del silencio,<br>una forma.<span class="l-script l-script--form" aria-hidden="true">tus labios</span></h2>
        </div>
        <div class="l-wrap l-form__bottom">
          <p class="l-p l-p--glass" data-reveal style="--d:.15s">Del caos, cada esfera encuentra su lugar: unos labios. Así lee Voz Propia, con la forma de tu boca y no la de nadie más. Pasa el cursor por encima y mira cómo se desordena y vuelve.</p>
          <button class="l-hold" type="button" data-talk data-reveal style="--d:.28s">
            <span class="hold">${o()}<span class="hold__core">${e(`volume`,18)}</span></span>
            <span class="l-hold__text">Mantén presionado<b>y escucha cómo hablan</b></span>
          </button>
        </div>
        <span class="l-sticker l-sticker--b" aria-hidden="true">Solo tu boca</span>
      </section>

      <section class="l-sec l-release" id="voz">
        <div class="l-release__inner">
          <p class="l-label" data-reveal>[ 04 · Voz ]</p>
          <h2 class="l-h2 l-h2--xl" data-reveal style="--d:.12s">Y entonces,<br>tu voz.<span class="l-script l-script--rel" aria-hidden="true">se escucha</span></h2>
          <p class="l-p l-p--glass" data-reveal style="--d:.24s">Cada palabra despega de tus labios y se vuelve sonido. Al instante, sin internet, con la voz que tu familia eligió para ti.</p>
        </div>
        <span class="l-sticker l-sticker--c" aria-hidden="true">Al instante</span>
        <span class="l-sticker l-sticker--d" aria-hidden="true">100% en tu teléfono</span>
        <span class="l-sticker l-sticker--e" aria-hidden="true">Sin servidores ✦</span>
      </section>

      <section class="l-how" id="como-funciona">
        <div class="l-wrap">
          <div class="l-head">
            <p class="l-eye" data-reveal>Así funciona</p>
            <h2 data-reveal style="--d:.08s">Una voz que vive en tu teléfono</h2>
            <p data-reveal style="--d:.16s">Sin servidores ni esperas. Voz Propia mira tus labios, reconoce la palabra y habla al instante.</p>
          </div>
          <div class="l-features">
            ${i(`scan-face`,`Mira tus labios`,`La cámara de tu teléfono mira cómo se mueven tus labios, aunque te muevas un poco.`,0)}
            ${i(`sparkles`,`Palabras preparadas`,`Nuestro equipo prepara cada palabra con cuidado, para que se reconozca bien desde el primer día.`,1)}
            ${i(`volume`,`Habla por ti`,`Con la voz del teléfono, la que tu familia elija para ti.`,2)}
            ${i(`wifi-off`,`Funciona en modo avión`,`Todo corre dentro del teléfono. Ideal para un cuarto de hospital sin señal.`,3)}
            ${i(`shield-check`,`Tus datos, tuyos`,`No se graba ni se envía video. Nada sale de tu teléfono.`,4)}
            ${i(`layout-grid`,`Respuestas rápidas`,`Sí, no, escala de dolor y frases por tema, a un toque y sin cámara.`,5)}
          </div>
          <div class="l-big" data-reveal>
            <i class="l-big__glow" aria-hidden="true"></i>
            <p class="l-eye">Por qué importa</p>
            <h2 class="l-big__title"><b data-count-to="742">742</b> mil personas<br>en México casi no pueden hablar.<span class="l-script l-script--big" aria-hidden="true">y tienen mucho que decir</span></h2>
            <p class="l-big__p">Tienen mucha dificultad para hablar o comunicarse, o no pueden hacerlo. Para quienes todavía mueven los labios, Voz Propia puede ser su voz.</p>
            <p class="l-big__src">Fuente: INEGI, Encuesta Intercensal 2025 (publicada en 2026)</p>
          </div>
          <div class="l-stats">
            ${[[`0`,`Videos guardados`],[`0`,`Aparatos extra`],[`100%`,`Dentro de tu teléfono`],[`11`,`Niveles de dolor`]].map(([e,t],n)=>`<div class="l-stat" data-reveal style="--d:${n*.08}s"><p class="l-stat__v">${e}</p><p class="l-stat__l">${t}</p></div>`).join(``)}
          </div>
        </div>
      </section>

      <section class="l-roles" id="entrar">
        <div class="l-wrap">
          <div class="l-head">
            <p class="l-eye" data-reveal>Empecemos</p>
            <h2 data-reveal style="--d:.08s">¿Quién va a usar Voz Propia?</h2>
            <p data-reveal style="--d:.16s">Elige tu modo. Se puede cambiar después.</p>
          </div>
          <div class="l-role-grid">
            <button class="l-role l-role--user" type="button" data-role="usuario" data-reveal>
              <span class="l-role__balls" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
              <span class="l-role__tag">${e(`user`,15)} Usuario</span>
              <span class="l-role__title">Iniciar a usar</span>
              <span class="l-role__desc">Para quien va a hablar. Conoce cómo trabajamos y con qué palabras contamos.</span>
              <span class="l-role__list"><span>${e(`check`,16,2.6)} Cómo trabajamos, paso a paso</span><span>${e(`check`,16,2.6)} Las palabras con las que contamos</span><span>${e(`check`,16,2.6)} Nada que configurar</span></span>
              <span class="l-role__cta"><span>Iniciar a usar</span>${v()}</span>
            </button>
            <button class="l-role l-role--pro" type="button" data-ayuda data-reveal style="--d:.12s">
              <span class="l-role__grid" aria-hidden="true"></span>
              <span class="l-role__tag">${e(`sparkles`,15)} Conoce el proyecto</span>
              <span class="l-role__title">Cómo funciona y cómo te ayuda</span>
              <span class="l-role__desc">Datos reales, a quién ayuda y cómo lee tus labios.</span>
              <span class="l-role__list"><span>${e(`check`,16,2.6)} Datos de México y el mundo</span><span>${e(`check`,16,2.6)} A quién ayuda y cómo</span><span>${e(`check`,16,2.6)} Pruébalo con un ejemplo</span></span>
              <span class="l-role__cta"><span>Ver cómo ayuda</span>${v()}</span>
            </button>
            <button class="l-role l-role--jz" type="button" data-tools data-reveal style="--d:.18s">
              <span class="l-jz__stickers" aria-hidden="true"><i>Buena luz</i><i>De frente</i><i>Con calma</i></span>
              <span class="l-role__tag">${e(`lightbulb`,15)} Manual de uso</span>
              <span class="l-role__title">Consejos para usar Voz Propia</span>
              <span class="l-role__desc">Cómo ponerte frente a la cámara, cómo mover los labios, letras que se ven igual, qué hacer si duda y cómo puede ayudar tu familia.</span>
              <span class="l-role__cta"><span>Ver los consejos</span>${v()}</span>
            </button>
            <button class="l-role l-role--dev" type="button" data-dev data-reveal style="--d:.24s">
              <span class="l-role__tag">${e(`code`,15)} Desarrollador</span>
              <span class="l-role__title">Soy programador</span>
              <span class="l-role__desc">Importar videos para entrenar la IA con ejemplos de labios.</span>
              <span class="l-role__cta"><span>Importar videos</span>${v()}</span>
            </button>
          </div>
        </div>
      </section>
    </main>

    <footer class="l-footer">
      <i class="l-footer__glow l-footer__glow--a" aria-hidden="true"></i>
      <i class="l-footer__glow l-footer__glow--b" aria-hidden="true"></i>
      <div class="l-marquee" aria-hidden="true"><div class="l-marquee__track">${n}${n}</div></div>
      <div class="l-footer__body">
        <div class="l-footer__cta" data-reveal>
          <p class="l-footer__eye">[ Hagamos que te escuchen ]</p>
          <p class="l-footer__title">Tus labios<br>ya saben hablar.</p>
          <a class="l-footer__pill" href="#entrar" data-scroll="entrar"><span>Elegir cómo entrar</span><span class="l-orb l-orb--lg">${e(`arrow-up-right`,18,2.2)}</span></a>
        </div>
        <div class="l-footer__cols">
          <div data-reveal><p class="l-footer__h">Voz Propia</p><ul>
            ${[[`historia`,`Historia`],[`labios`,`Labios`],[`entrar`,`Entrar`]].map(([t,n])=>`<li><a href="#${t}" data-scroll="${t}">${n}${e(`arrow-up-right`,13)}</a></li>`).join(``)}
          </ul></div>
          <div data-reveal style="--d:.08s"><p class="l-footer__h">Hecha para</p><ul>
            <li><span>Traqueostomía</span></li><li><span>Laringectomía</span></li><li><span>Terapia intensiva</span></li><li><span>Su familia</span></li>
          </ul></div>
          <div data-reveal style="--d:.16s"><p class="l-footer__h">Promesas</p><ul>
            <li><span>Sin internet</span></li><li><span>Sin video guardado</span></li><li><span>Palabras preparadas</span></li><li><span>Tu voz, tu decisión</span></li>
          </ul></div>
        </div>
      </div>
      <div class="l-footer__bar">
        <p><b>Voz Propia</b><i></i><span>© 2026 · Una ayuda para comunicarse, no un dispositivo médico.</span></p>
        <a class="l-footer__top" href="#top" data-scroll="top" aria-label="Volver arriba">${e(`arrow-up-right`,16)}</a>
      </div>
    </footer>

    <div class="l-gate" data-gate role="dialog" aria-modal="true" aria-labelledby="gate-t" hidden>
      <div class="l-gate__card">
        <div class="l-gate__top">
          <p class="l-gate__brand">${u()}<span>Voz Propia</span></p>
          <button class="l-gate__close" type="button" data-gate-close aria-label="Cerrar" hidden>${e(`x`,18,2.4)}</button>
        </div>
        <div class="l-gate__view" data-view="elegir">
          <h2 id="gate-t">Te damos la bienvenida.</h2>
          <p class="l-gate__p">Elige cómo quieres entrar.</p>
          <button class="l-gate__opt is-main" type="button" data-go-view="entrar">
            <span class="l-gate__ic">${e(`log-in`,20)}</span><span><b>Iniciar sesión</b><small>Ya tengo cuenta.</small></span>${v()}
          </button>
          <button class="l-gate__opt" type="button" data-go-view="crear">
            <span class="l-gate__ic">${e(`user-plus`,20)}</span><span><b>Crear cuenta</b><small>Con tu correo, en un minuto.</small></span>${v()}
          </button>
          <button class="l-gate__opt" type="button" data-guest>
            <span class="l-gate__ic">${e(`user`,20)}</span><span><b>Entrar sin cuenta</b><small>Rápido. Al salir no se guarda nada.</small></span>${v()}
          </button>
          <p class="l-gate__fine">${e(`lock`,14)} Tu cuenta se guarda en este dispositivo. Nadie más la ve.</p>
        </div>
        <div class="l-gate__view l-gate__hello" data-view="hola" hidden>
          <svg class="l-gate__check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27 l8 8 l15 -17"/></svg>
          <h2 data-hello-t>¡Hola!</h2>
          <p class="l-gate__p" data-hello-p>Todo listo.</p>
        </div>
        <div class="l-gate__view l-work" data-view="trabajar" hidden>
          <p class="l-work__hi" data-work-hi>¡Hola!</p>
          <h2 class="l-work__t" data-work-t>Inicia a trabajar</h2>
          <div class="l-work__pad" data-work role="button" tabindex="0" aria-label="Dibuja el círculo con el dedo o el mouse, o mantén presionada la barra espaciadora, para iniciar a trabajar">
            <svg class="l-work__svg" viewBox="0 0 240 240" aria-hidden="true">
              <defs>
                <linearGradient id="wk-g" gradientUnits="userSpaceOnUse" x1="20" y1="20" x2="220" y2="220"><stop offset="0" stop-color="#3df2a0"/><stop offset=".35" stop-color="#00e5ff"/><stop offset=".65" stop-color="#4d7cff"/><stop offset="1" stop-color="#ff3df0"/></linearGradient>
                <radialGradient id="wk-f"><stop offset="0" stop-color="#4d7cff" stop-opacity=".6"/><stop offset="1" stop-color="#3df2a0" stop-opacity=".2"/></radialGradient>
                <filter id="wk-rough" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
              </defs>
              <circle class="l-work__ticks" cx="120" cy="120" r="108" pathLength="108"/>
              <circle class="l-work__fill" cx="120" cy="120" r="80"/>
              <circle class="l-work__track" cx="120" cy="120" r="92"/>
              <g filter="url(#wk-rough)"><circle class="l-work__arc" cx="120" cy="120" r="92" pathLength="100"/></g>
            </svg>
            <i class="l-work__demo" aria-hidden="true"></i>
            <i class="l-work__dot" aria-hidden="true"></i>
            <span class="l-work__core">${u(`md`)}<small data-work-label>Sigue el círculo</small></span>
          </div>
          <p class="l-gate__p l-work__p">Dibújalo con tu dedo o el mouse hasta cerrarlo.</p>
        </div>
        <div class="l-gate__view" data-view="cuenta" hidden>
          <h2>Tu cuenta</h2>
          <div class="l-gate__me"><span class="l-gate__avatar" data-me-initial>A</span><span><b data-me-name></b><small data-me-mail></small></span></div>
          <button class="l-gate__submit" type="button" data-gate-close><span>Seguir</span>${v()}</button>
          <button class="l-gate__out" type="button" data-signout>${e(`log-in`,16,2.2)}<span>Cambiar de cuenta</span></button>
        </div>
        <form class="l-gate__view" data-view="entrar" data-form="entrar" hidden novalidate>
          <button class="l-gate__back" type="button" data-go-view="elegir">${e(`arrow-left`,18,2.4)}<span>Volver</span></button>
          <h2>Iniciar sesión</h2>
          <label class="l-gate__field"><span>Correo</span><input type="email" name="email" autocomplete="email" inputmode="email" required></label>
          <label class="l-gate__field"><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required></label>
          <p class="l-gate__err" data-err aria-live="polite"></p>
          <button class="l-gate__submit" type="submit"><span>Entrar</span>${v()}</button>
          <p class="l-gate__switch">¿No tienes cuenta? <button type="button" data-go-view="crear">Crear cuenta</button></p>
        </form>
        <form class="l-gate__view" data-view="crear" data-form="crear" hidden novalidate>
          <button class="l-gate__back" type="button" data-go-view="elegir">${e(`arrow-left`,18,2.4)}<span>Volver</span></button>
          <h2>Crear cuenta</h2>
          <label class="l-gate__field"><span>Tu nombre</span><input type="text" name="name" autocomplete="name" required></label>
          <label class="l-gate__field"><span>Correo</span><input type="email" name="email" autocomplete="email" inputmode="email" required></label>
          <label class="l-gate__field"><span>Contraseña <small>(mínimo 6)</small></span><input type="password" name="password" autocomplete="new-password" minlength="6" required></label>
          <p class="l-gate__err" data-err aria-live="polite"></p>
          <button class="l-gate__submit" type="submit"><span>Crear y entrar</span>${v()}</button>
          <p class="l-gate__switch">¿Ya tienes cuenta? <button type="button" data-go-view="entrar">Iniciar sesión</button></p>
        </form>
      </div>
    </div>
  </div>`}function y(o,u){let f=!c();o.innerHTML=le();let p=o.querySelector(`.landing`),m=p.querySelector(`.l-canvas`),g=p.querySelector(`[data-loader]`),_=p.querySelector(`[data-gate]`),v=new AbortController,{signal:y}=v,b={progress:0,started:!1},x={x:99,y:99,isDown:!1},S=null,C=!1,ue=!1;(async()=>{try{let{createGravityField:e}=await te(async()=>{let{createGravityField:e}=await import(`./scene-DadpB4HY.js`);return{createGravityField:e}},__vite__mapDeps([0,1]),import.meta.url);if(ue)return;S=e(m,m.querySelector(`canvas`),{ballColor:ie,control:b,pointer:x,reducedMotion:!f,onReady:()=>C=!0})}catch{p.classList.add(`no-webgl`),C=!0}})();let w=p.querySelector(`[data-ld]`),de=p.querySelector(`[data-loader-status]`),fe=Array.from(w.querySelectorAll(`.l-ld__it`)),pe=[`Calibrando lectura de labios`,`Preparando tu cámara`,`Afinando tu voz`,`Casi lista`],me=3e3,he=performance.now(),T=0,ge=-1,_e=he,ve=0,E=[],ye=()=>{},be=()=>{},xe=()=>{b.started=!0,p.classList.add(`is-revealed`),u.jumpToRoles&&Ae(`entrar`,!0)},Se=()=>{let e=e=>e.map(([e,t])=>`${e}% ${t}%`),t=h.slice(0,8),n=h.slice(ae),r=oe,a=se,o=[[`lt`,`polygon(0 0, ${e(t).join(`, `)}, ${e(r).join(`, `)})`],[`lb`,`polygon(${e([...r].reverse()).join(`, `)}, ${e(n).join(`, `)}, 0 100%)`],[`rt`,`polygon(${e(t).join(`, `)}, ${e(a).join(`, `)}, 100% 0)`],[`rb`,`polygon(${e(n).join(`, `)}, 100% 100%, ${e([...a].reverse()).join(`, `)})`]],s=document.createDocumentFragment();for(let[e,t]of o){let n=document.createElement(`div`);n.className=`l-loader__half l-loader__half--${e}`,n.setAttribute(`aria-hidden`,`true`),n.style.clipPath=t,n.style.setProperty(`-webkit-clip-path`,t),n.append(w.cloneNode(!0)),s.append(n)}let c=innerWidth,l=innerHeight,u=(e,t)=>`<polyline class="${t}" pathLength="100" points="${e.map(([e,t])=>`${(e*c/100).toFixed(1)},${(t*l/100).toFixed(1)}`).join(` `)}"/>`,d=document.createElement(`div`);d.className=`l-loader__crack`,d.setAttribute(`aria-hidden`,`true`);let ee=Array.from({length:26},(e,t)=>{let n=4+Math.random()*92,r=h[Math.min(h.length-1,Math.floor(n/7.2))][0],i=t%2?1:-1;return`<i style="left:${r}%;top:${n.toFixed(1)}%;--dx:${(i*(40+Math.random()*260)).toFixed(0)}px;--dy:${(Math.random()*200-100).toFixed(0)}px;--s:${(3+Math.random()*6).toFixed(1)}px;--d:${(Math.random()*.2).toFixed(2)}s"></i>`}).join(``);d.innerHTML=`<svg viewBox="0 0 ${c} ${l}">
      ${u(h,`l-loader__crack-glow`)}${u(h,`l-loader__crack-core`)}
      ${u([h[ae],...oe],`l-loader__crack-sub`)}${u([h[ae],...se],`l-loader__crack-sub`)}
      ${ce.map(e=>u(e,`l-loader__crack-sub l-loader__crack-sub--thin`)).join(``)}
    </svg><i class="l-loader__beam"></i><i class="l-loader__flash"></i><span class="l-loader__sparks">${ee}</span>`,g.append(s,d),w.style.visibility=`hidden`,g.offsetWidth,g.classList.add(`is-cracking`),i([14,40,14,40,24]),E.push(window.setTimeout(()=>{g.classList.add(`is-split`),i([90,40,160])},640)),E.push(window.setTimeout(()=>{g.hidden=!0,be()},2e3))},Ce=()=>{g.classList.add(`is-full`),i(20),de.textContent=`Lista para escucharte`,E.push(window.setTimeout(()=>{ye(),Se()},700))},we=e=>{let t=Math.min(.05,(e-_e)/1e3);_e=e;let n=e-he,r=Math.min(1,n/me),i=100*(.5-Math.cos(Math.PI*r)/2);T+=(Math.min(C?100:92,i)-T)*Math.min(1,6*t),C&&n>=me&&T>99.4&&(T=100),w.style.setProperty(`--p`,(T/100).toFixed(4)),fe.forEach(e=>{e.classList.contains(`on`)||T<Number(e.dataset.at)||e.classList.add(`on`)});let a=Math.min(pe.length-1,Math.floor(T/25));if(a!==ge&&T<100&&(ge=a,de.textContent=pe[a]),T>=100)return Ce();ve=requestAnimationFrame(we)};u.jumpToRoles||u.account||!f?(g.hidden=!0,requestAnimationFrame(xe)):ve=requestAnimationFrame(we);let Te=[`top`,`historia`,`labios`,`voz`,`como-funciona`].map(e=>p.querySelector(`#${e}`)),Ee=e=>{let t=Te.map(e=>e.getBoundingClientRect().top+scrollY);for(let n=0;n<t.length-1;n++)if(e<t[n+1])return n+Math.max(0,e-t[n])/Math.max(1,t[n+1]-t[n]);return t.length-1+(e-t[t.length-1])/(innerHeight||1)},D=0,O=()=>{D||=requestAnimationFrame(()=>{D=0;let e=Ee(window.scrollY);b.progress=e,m.style.opacity=String(1-Math.min(1,Math.max(0,(e-3.5)/.5)));let t=e>3.55?4:e>2.55?3:e>1.55?2:+(e>.7);p.dataset.stage!==String(t)&&(p.dataset.stage=String(t))})};addEventListener(`scroll`,O,{passive:!0,signal:y}),addEventListener(`resize`,O,{signal:y}),O();let k=scrollY,A=scrollY,j=!1,De=()=>document.documentElement.scrollHeight-innerHeight,Oe=()=>{ue||(A+=(k-A)*.09,Math.abs(k-A)<.5&&(A=k,j=!1),window.scrollTo(0,A),j&&requestAnimationFrame(Oe))},ke=()=>{j||(j=!0,A=scrollY,requestAnimationFrame(Oe))};f&&(addEventListener(`wheel`,e=>{if(e.ctrlKey||!_.hidden)return;e.preventDefault();let t=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*innerHeight:e.deltaY;j||(k=scrollY),k=Math.max(0,Math.min(De(),k+t)),ke()},{passive:!1,signal:y}),addEventListener(`scroll`,()=>!j&&(k=A=scrollY),{passive:!0,signal:y}));function Ae(e,t=!1){let n=e===`top`?p:p.querySelector(`#${e}`);if(!n)return;let r=e===`top`?0:n.getBoundingClientRect().top+scrollY;if(t||!f){window.scrollTo(0,r),k=A=r;return}k=Math.max(0,Math.min(De(),r)),ke()}let M=!1;addEventListener(`pointermove`,e=>{M||(x.x=e.clientX/innerWidth*2-1,x.y=-(e.clientY/innerHeight)*2+1)},{signal:y}),addEventListener(`pointerdown`,e=>{M=!!e.target.closest(`[data-talk]`),M?x.x=x.y=99:x.isDown=!0},{signal:y}),addEventListener(`pointerup`,e=>{M=!1,x.isDown=!1,e.pointerType!==`mouse`&&(x.x=x.y=99)},{signal:y}),document.addEventListener(`pointerleave`,()=>x.x=x.y=99,{signal:y});let N=new IntersectionObserver(e=>{for(let t of e)t.isIntersecting&&(t.target.classList.add(`is-in`),N.unobserve(t.target))},{threshold:.3,rootMargin:`0px 0px -6% 0px`});p.querySelectorAll(`[data-reveal]`).forEach(e=>N.observe(e));let je=ee(p.querySelector(`[data-talk]`),900,()=>{let e=l(`Hola. Esta es mi voz.`,d.settings);S?.talk(Promise.all([e,a(1600)]))}),Me=p.querySelector(`[data-acct-label]`),Ne=p.querySelector(`.l-gate__close`),P=null,F=0,I=0,L=()=>{let e=s();Me.textContent=e?e.kind===`invitado`?`Invitado`:e.name.split(` `)[0]:`Entrar`},R=e=>{if(e!==`hola`&&clearTimeout(I),_.querySelectorAll(`[data-view]`).forEach(t=>t.hidden=t.dataset.view!==e),_.querySelectorAll(`[data-err]`).forEach(e=>e.textContent=``),_.dataset.view=e,e===`cuenta`){let e=s();p.querySelector(`[data-me-initial]`).textContent=(e?.name??`?`).charAt(0).toUpperCase(),p.querySelector(`[data-me-name]`).textContent=e?.name??``,p.querySelector(`[data-me-mail]`).textContent=e?.kind===`invitado`?`Sin correo: no se guarda nada.`:e?.email??``}if(e===`trabajar`){let e=s();p.querySelector(`[data-work-hi]`).textContent=!e||e.kind===`invitado`?`¡Bienvenido!`:`¡Hola, ${e.name.split(` `)[0]}!`,p.querySelector(`[data-work-t]`).textContent=`Inicia a trabajar`,p.querySelector(`[data-work-label]`).textContent=`Sigue el círculo`,_.querySelector(`.l-work`).classList.remove(`is-done`)}_.querySelector(`[data-view="${e}"] input, [data-view="${e}"] button:not([hidden])`)?.focus({preventScroll:!0})},Pe=()=>_.querySelectorAll(`.l-flood`).forEach(e=>e.remove()),z=(e=`elegir`,t=!!g.hidden)=>{Pe(),clearTimeout(F),clearTimeout(I),b.paused=!0,_.classList.add(`is-out`),_.hidden=!1,_.offsetWidth,_.classList.remove(`is-out`);let n=_.querySelector(`.l-gate__card`);n.style.animation=`none`,n.offsetWidth,n.style.animation=``,_.classList.toggle(`is-solo`,t),Ne.hidden=!s(),document.documentElement.classList.add(`gate-on`),R(e)},B=()=>{b.paused=!1,_.classList.add(`is-out`),document.documentElement.classList.remove(`gate-on`),clearTimeout(F),F=window.setTimeout(()=>{_.hidden=!0,Pe()},f?420:0),L();let e=P;P=null,e?.()},Fe=()=>{if(P)return R(`trabajar`);let e=s();p.querySelector(`[data-hello-t]`).textContent=e.kind===`invitado`?`¡Bienvenido!`:`¡Hola, ${e.name.split(` `)[0]}!`,p.querySelector(`[data-hello-p]`).textContent=e.kind===`invitado`?`Entraste sin cuenta. Vamos.`:`Qué gusto verte. Vamos.`,R(`hola`),I=window.setTimeout(B,f?1300:300)},V=p.querySelector(`[data-work]`),Ie=Math.PI*2,H=!1,U=!1,W=0,G=0,K=0,q=0,J=e=>V.style.setProperty(`--hold`,e.toFixed(4)),Y=()=>{G=0,K=0,J(0)},Le=()=>{U=!0,i([20,30,60]),J(1),_.querySelector(`.l-work`).classList.add(`is-done`),p.querySelector(`[data-work-t]`).textContent=`¡Adelante!`,p.querySelector(`[data-work-label]`).textContent=`Listo`,i(30);let e=document.createElement(`div`);e.className=`l-flood`,e.innerHTML=`<i></i><i></i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5C12.7 6.7 15.8 10.3 22.5 12C15.8 13.7 12.7 17.3 12 22.5C11.3 17.3 8.2 13.7 1.5 12C8.2 10.3 11.3 6.7 12 1.5Z"/></svg>`,_.append(e),E.push(window.setTimeout(B,f?1250:100))},X=()=>{let e=V.getBoundingClientRect();return{x:e.left+e.width/2,y:e.top+e.height/2,R:e.width*92/240}},Re=e=>{if(U||e.button>0)return;let t=X();H=!0,V.setPointerCapture?.(e.pointerId),V.classList.add(`is-drawing`),W=Math.atan2(e.clientY-t.y,e.clientX-t.x),V.style.setProperty(`--a0`,(W*180/Math.PI).toFixed(1)),V.style.setProperty(`--dir`,`1`),Y(),ze(e)},ze=e=>{if(!H||U)return;let t=X(),n=e.clientX-t.x,r=e.clientY-t.y;if(Math.hypot(n,r)<t.R*.3)return;let i=Math.atan2(r,n),a=i-W;a>Math.PI?a-=Ie:a<-Math.PI&&(a+=Ie),W=i,G+=a,!K&&Math.abs(G)>.06&&(K=Math.sign(G),V.style.setProperty(`--dir`,String(K))),K&&G*K<-.3&&(V.style.setProperty(`--a0`,(i*180/Math.PI).toFixed(1)),Y()),V.style.setProperty(`--ang`,(i*180/Math.PI).toFixed(1)),V.style.setProperty(`--r`,`${t.R.toFixed(1)}px`);let o=Math.max(0,Math.min(1,G*(K||1)/Ie));J(o),He(i,t.R),o>=.97&&Le()},Be=[`#3df2a0`,`#00e5ff`,`#4d7cff`,`#ff3df0`,`#f7ff3d`],Ve=0,He=(e,t)=>{if(!f)return;let n=performance.now();if(n-Ve<32)return;Ve=n;let r=document.createElement(`i`);r.className=`l-work__spark`,r.style.setProperty(`--a`,(e*180/Math.PI).toFixed(1)),r.style.setProperty(`--r`,`${t.toFixed(1)}px`),r.style.setProperty(`--out`,`${(8+Math.random()*26).toFixed(0)}px`),r.style.setProperty(`--drift`,`${(Math.random()*26-13).toFixed(0)}px`),r.style.setProperty(`--s`,`${(3+Math.random()*5).toFixed(1)}px`),r.style.setProperty(`--c`,Be[Math.floor(Math.random()*Be.length)]),V.append(r),window.setTimeout(()=>r.remove(),760)},Z=()=>{H&&(H=!1,V.classList.remove(`is-drawing`),U||Y())},Ue=e=>{if(U||e.key!==` `&&e.key!==`Enter`||e.repeat)return;e.preventDefault(),V.classList.add(`is-drawing`,`is-key`),V.style.setProperty(`--a0`,`-90`),V.style.setProperty(`--dir`,`1`),V.style.setProperty(`--ang`,`-90`),V.style.setProperty(`--r`,`${X().R}px`);let t=performance.now(),n=()=>{let e=Math.min(1,(performance.now()-t)/1500);if(J(e),V.style.setProperty(`--ang`,(-90+e*360).toFixed(1)),e>=1)return Le();q=requestAnimationFrame(n)};q=requestAnimationFrame(n)},We=e=>{(e.key===` `||e.key===`Enter`)&&(cancelAnimationFrame(q),V.classList.remove(`is-drawing`,`is-key`),U||Y())};V.addEventListener(`pointerdown`,Re),V.addEventListener(`pointermove`,ze),V.addEventListener(`pointerup`,Z),V.addEventListener(`pointercancel`,Z),V.addEventListener(`keydown`,Ue),V.addEventListener(`keyup`,We),V.addEventListener(`contextmenu`,e=>e.preventDefault());let Ge=()=>{cancelAnimationFrame(q),V.removeEventListener(`pointerdown`,Re),V.removeEventListener(`pointermove`,ze),V.removeEventListener(`pointerup`,Z),V.removeEventListener(`pointercancel`,Z),V.removeEventListener(`keydown`,Ue),V.removeEventListener(`keyup`,We)};ye=()=>{P=xe,z(s()?`trabajar`:`elegir`,!0),_.classList.add(`is-under`)},be=()=>_.classList.remove(`is-under`),L(),u.account?(P=u.onReturn??null,z(s()?`cuenta`:`elegir`,!0)):g.hidden&&!s()&&z();let Ke=0;_.addEventListener(`touchstart`,e=>Ke=e.touches[0].clientY,{signal:y,passive:!0}),_.addEventListener(`touchmove`,e=>{let t=e.touches[0].clientY-Ke,n=_.scrollHeight<=_.clientHeight+1,r=_.scrollTop<=0,i=_.scrollTop+_.clientHeight>=_.scrollHeight-1;(n||t>0&&r||t<0&&i)&&e.preventDefault()},{signal:y,passive:!1}),_.addEventListener(`submit`,async e=>{e.preventDefault();let t=e.target,n=t.querySelector(`[data-err]`),a=t.querySelector(`[type="submit"]`),o=new FormData(t),s=e=>String(o.get(e)??``);a.disabled=!0,n.textContent=``;try{t.dataset.form===`crear`?await r(s(`name`),s(`email`),s(`password`)):await re(s(`email`),s(`password`)),t.reset(),Fe()}catch(e){i([30,50,30]),n.textContent=e instanceof Error?e.message:`No se pudo entrar. Intenta otra vez.`,t.classList.remove(`is-shake`),t.offsetWidth,t.classList.add(`is-shake`)}finally{a.disabled=!1}},{signal:y});let Q=`usuario`,$=async e=>{if(!s())return z(`elegir`,!0);p.classList.add(`is-leaving`),await a(f?420:0),u.onChoose(Q,e)};p.addEventListener(`click`,e=>{let r=e.target,i=r.closest(`[data-go-view]`);if(i)return R(i.dataset.goView);if(r.closest(`[data-guest]`))return t(),Fe();if(r.closest(`[data-signout]`))return n(),L(),Ne.hidden=!0,R(`elegir`);if(r.closest(`[data-gate-close]`))return s()?B():void 0;if(r.closest(`[data-acct]`))return z(s()?`cuenta`:`elegir`,!0);let a=r.closest(`[data-scroll]`);if(a){e.preventDefault(),Ae(a.dataset.scroll);return}let o=r.closest(`[data-role]`);if(o){Q=o.dataset.role,$();return}if(r.closest(`[data-ayuda]`)){Q=`usuario`,$(`ayuda`);return}if(r.closest(`[data-tools]`)){Q=`usuario`,$(`consejos`);return}if(r.closest(`[data-dev]`))return qe()},{signal:y});let qe=()=>{let t=document.createElement(`dialog`);t.className=`sheet`,t.innerHTML=`
      <div class="sheet__inner">
        <header class="sheet__head">
          <div><p class="kicker">[ Acceso ]</p><h2>Soy programador</h2></div>
          <button class="icon-btn" type="button" data-close aria-label="Cerrar">${e(`x`,20)}</button>
        </header>
        <div style="padding: 20px;">
          <label style="display: block; margin-bottom: 16px;">
            <span style="display: block; font-size: 14px; margin-bottom: 8px;">Contraseña</span>
            <input type="password" id="dev-pwd" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 8px; font-size: 16px;" placeholder="Ingresa la contraseña" autocomplete="off">
          </label>
          <p id="dev-err" style="color: #ff4444; font-size: 12px; margin-bottom: 16px; display: none;"></p>
          <button class="btn btn--primary" id="dev-submit" type="button" style="width: 100%;">Entrar</button>
        </div>
      </div>`,document.body.appendChild(t),t.showModal();let n=t.querySelector(`#dev-pwd`),r=t.querySelector(`#dev-err`),a=t.querySelector(`#dev-submit`),o=t.querySelector(`[data-close]`);n.focus();let s=()=>{n.value===`76767678`?(t.close(),t.remove(),ne()):(r.textContent=`Contraseña incorrecta`,r.style.display=`block`,n.value=``,n.focus(),i([30,50,30]))};a.addEventListener(`click`,s),n.addEventListener(`keypress`,e=>{e.key===`Enter`&&s()}),o.addEventListener(`click`,()=>{t.close(),t.remove()}),t.addEventListener(`close`,()=>t.remove())};return()=>{ue=!0,v.abort(),N.disconnect(),je(),Ge(),cancelAnimationFrame(ve),clearTimeout(F),clearTimeout(I),E.forEach(clearTimeout),cancelAnimationFrame(D),S?.dispose(),document.documentElement.classList.remove(`gate-on`),o.innerHTML=``}}export{y as mountLanding};