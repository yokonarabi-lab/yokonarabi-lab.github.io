(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('js');
  let activeVideo = null;
  function stopVideo() {
    if (!activeVideo) return;
    const screen = activeVideo.parentElement;
    activeVideo.remove();
    screen.querySelector('button').hidden = false;
    activeVideo = null;
  }
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const buttons = [...group.querySelectorAll('[role="tab"]')];
    function select(button, focus = false) {
      if (group.dataset.tabs === 'video') stopVideo();
      buttons.forEach(tab => {
        const selected = tab === button;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      });
      if (focus) button.focus();
    }
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => select(button));
      button.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = buttons.length - 1;
        if (next !== undefined) { event.preventDefault(); select(buttons[next], true); }
      });
    });
    select(buttons[0]);
  });
  document.querySelectorAll('[data-screen]').forEach(button => {
    button.addEventListener('click', () => {
      const frame = button.dataset.screen;
      // Keep both providers on the matching screen when the comparison tab changes.
      document.querySelectorAll('[data-game-image]').forEach(img => {
        const name = img.dataset.gameImage;
        img.src = `assets/${name}-${frame}.png`;
        img.alt = `${name === 'claude' ? 'Claude' : 'ChatGPT'}版・英単語クエストの${frame === 'title' ? '開始画面' : 'プレイ画面'}`;
      });
      document.querySelectorAll('[data-screen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.screen === frame)));
    });
  });
  document.querySelectorAll('[data-video] .play-button').forEach(button => {
    button.addEventListener('click', () => {
      stopVideo();
      const screen = button.closest('[data-video]');
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${screen.dataset.video}?autoplay=1&playsinline=1&rel=0`;
      iframe.title = button.getAttribute('aria-label');
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      button.hidden = true;
      screen.appendChild(iframe);
      activeVideo = iframe;
    });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopVideo(); });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window && !reduced.matches) {
    // Observe each readable block, including media and panels revealed by tabs.
    // CSS keyframes also animate elements already inside the first viewport.
    const reveals = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.dataset.reveal = 'visible'; reveals.unobserve(entry.target); }
      });
    }, {rootMargin:'0px 0px -8% 0px', threshold:0.08});
    const revealTargets = [
      '.showcase-heading', '.showcase-slide', '.showcase-controls',
      '.lab-intro .eyebrow', '.lab-intro h2', '.intro-text', '.plan-pair', '.lab-intro .note', '.chapter-nav',
      '.section-heading > *', '.tablist', '.model-label', '.game-screen', '.screen-selector',
      '.video-screen', '.video-fallback', '.slide-preview', '.slide-open', '.media-caption',
      '.result-eyebrow', '.result-block h3', '.slides-record h3', '.results', '.result-block .note',
      '.model-footnote', '.result-block .button', '.delivery-spec', '.slides-record .section-copy',
      '.method .eyebrow', '.method h2', '.method-grid > div', '.method-note',
      '.closing .eyebrow', '.closing h2 > span', '.closing p:not(.eyebrow)', '.closing .button',
      '.youtube-link', 'body > footer .wrap'
    ];
    document.querySelectorAll(revealTargets.join(',')).forEach(element => {
      element.dataset.reveal = 'pending';
      reveals.observe(element);
    });

    const finishCounters = new Set();
    function countUp(element, startedAt) {
      const finalText = element.textContent;
      const target = Number(element.dataset.count);
      if (!Number.isFinite(target) || target <= 0) return;
      const final = document.createElement('span');
      final.className = 'count-final'; final.textContent = finalText;
      const current = document.createElement('span');
      current.className = 'count-current'; current.textContent = '0';
      current.setAttribute('aria-hidden', 'true');
      // Keep the true value accessible and its full width reserved while counting.
      element.replaceChildren(final, current);
      element.dataset.countState = 'running';
      let frame;
      const finish = () => {
        cancelAnimationFrame(frame);
        element.textContent = finalText;
        element.dataset.countState = 'done';
        finishCounters.delete(finish);
      };
      finishCounters.add(finish);
      const draw = now => {
        const progress = Math.min(1, Math.max(0, (now - startedAt) / 1500));
        current.textContent = String(Math.floor(target * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(draw);
        else finish();
      };
      frame = requestAnimationFrame(draw);
    }
    const counters = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || entry.intersectionRatio < .55) return;
        const startedAt = performance.now();
        entry.target.querySelectorAll('[data-count]').forEach(element => countUp(element, startedAt));
        counters.unobserve(entry.target);
      });
    }, {rootMargin:'0px 0px -10% 0px', threshold:.55});
    document.querySelectorAll('.time-row').forEach(row => counters.observe(row));
    const showAll = () => {
      if (!reduced.matches) return;
      reveals.disconnect(); counters.disconnect();
      document.querySelectorAll('[data-reveal]').forEach(el => el.dataset.reveal = 'visible');
      finishCounters.forEach(finish => finish());
    };
    if (reduced.addEventListener) reduced.addEventListener('change', showAll);
    else reduced.addListener(showAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) finishCounters.forEach(finish => finish());
    });
  }
  const mobile = window.matchMedia('(max-width: 600px)');
  const carousel = document.querySelector('.showcase-carousel');
  const choices = [...document.querySelectorAll('[data-showcase]')];
  const gameDialog = document.querySelector('#game-dialog');
  let slideIndex = 0;
  let autoplayRequested = true;
  let carouselVisible = false;
  let carouselTimer;
  let scrollFrame;
  function syncChoices() {
    choices.forEach((button, index) => button.setAttribute('aria-pressed', String(index === slideIndex)));
  }
  function goToSlide(index, instant = false) {
    slideIndex = index;
    syncChoices();
    carousel.scrollTo({left: index * carousel.clientWidth, behavior: instant || reduced.matches ? 'instant' : 'smooth'});
  }
  function syncAutoplay() {
    clearTimeout(carouselTimer);
    if (!mobile.matches || reduced.matches || !autoplayRequested || !carouselVisible || document.hidden || gameDialog.open) return;
    carouselTimer = setTimeout(() => {
      goToSlide((slideIndex + 1) % choices.length);
      syncAutoplay();
    }, 5000);
  }
  function pauseAutoplay() { autoplayRequested = false; syncAutoplay(); }
  choices.forEach((button, index) => button.addEventListener('click', () => { pauseAutoplay(); goToSlide(index); }));
  carousel.addEventListener('pointerdown', pauseAutoplay, {passive:true});
  carousel.addEventListener('touchstart', pauseAutoplay, {passive:true});
  carousel.addEventListener('wheel', event => { if (Math.abs(event.deltaX) > 0) pauseAutoplay(); }, {passive:true});
  carousel.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      if (!mobile.matches) return;
      slideIndex = Math.max(0, Math.min(choices.length - 1, Math.round(carousel.scrollLeft / carousel.clientWidth)));
      syncChoices();
    });
  }, {passive:true});
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { carouselVisible = entries[0].isIntersecting; syncAutoplay(); }, {threshold:0.5}).observe(carousel);
  } else { carouselVisible = true; }
  function responsiveCarousel() {
    if (mobile.matches) goToSlide(slideIndex, true);
    else carousel.scrollTo({left:0, behavior:'instant'});
    syncAutoplay();
  }
  if (mobile.addEventListener) { mobile.addEventListener('change', responsiveCarousel); reduced.addEventListener('change', syncAutoplay); }
  else { mobile.addListener(responsiveCarousel); reduced.addListener(syncAutoplay); }
  window.addEventListener('resize', responsiveCarousel, {passive:true});
  document.addEventListener('visibilitychange', syncAutoplay);
  responsiveCarousel();

  const gameLinks = [...document.querySelectorAll('[data-open-game]')];
  const games = new Map(gameLinks.map(link => [link.dataset.openGame, {
    url: link.href,
    label: link.dataset.openGame === 'claude' ? 'Claude' : 'ChatGPT'
  }]));
  const gameFrame = document.querySelector('#game-frame');
  const gameTitle = document.querySelector('#game-dialog-title');
  const gameExternal = document.querySelector('#game-external');
  let gameOpen = false;
  let returnFocus = null;
  let savedScroll = 0;
  let previousBodyStyles;
  function openGame(provider, remember = true, trigger = null) {
    const game = games.get(provider);
    if (!game || gameOpen || typeof gameDialog.showModal !== 'function') return;
    returnFocus = trigger || document.activeElement;
    savedScroll = window.scrollY;
    previousBodyStyles = {position:document.body.style.position, top:document.body.style.top, width:document.body.style.width};
    if (remember) history.pushState({...history.state, yokonarabiGame:provider}, '', location.href);
    gameTitle.textContent = game.label + '版';
    gameExternal.href = game.url;
    const loading = document.createElement('p');
    loading.className = 'game-loading'; loading.textContent = 'ゲームを読み込み中…'; loading.setAttribute('role', 'status');
    const iframe = document.createElement('iframe');
    iframe.title = game.label + '版・英単語クエスト';
    iframe.src = game.url;
    iframe.allow = 'autoplay';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.addEventListener('load', () => loading.remove(), {once:true});
    gameFrame.replaceChildren(loading, iframe);
    stopVideo();
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScroll}px`;
    document.body.style.width = '100%';
    gameOpen = true;
    gameDialog.showModal();
    syncAutoplay();
  }
  function closeGameView() {
    if (!gameOpen) return;
    gameOpen = false;
    if (gameDialog.open) gameDialog.close();
    // Removing the frame also stops its audio and releases the game document.
    gameFrame.replaceChildren();
    Object.assign(document.body.style, previousBodyStyles);
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, savedScroll);
    root.style.scrollBehavior = previousBehavior;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll:true});
    syncAutoplay();
  }
  function requestGameClose() {
    const hasGameEntry = Boolean(history.state && history.state.yokonarabiGame);
    closeGameView();
    if (hasGameEntry) history.back();
  }
  gameLinks.forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || typeof gameDialog.showModal !== 'function') return;
    event.preventDefault();
    openGame(link.dataset.openGame, true, link);
  }));
  document.querySelector('#game-close').addEventListener('click', requestGameClose);
  gameDialog.addEventListener('cancel', event => { event.preventDefault(); requestGameClose(); });
  gameDialog.addEventListener('close', closeGameView);
  window.addEventListener('popstate', () => {
    const provider = history.state && history.state.yokonarabiGame;
    if (games.has(provider)) openGame(provider, false);
    else closeGameView();
  });
  // A reload of the same URL starts on the introduction, never an orphaned game entry.
  if (history.state && history.state.yokonarabiGame) {
    const state = {...history.state}; delete state.yokonarabiGame;
    history.replaceState(state, '', location.href);
  }
})();
