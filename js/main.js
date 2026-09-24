// Kvilda 202 – obecné chování webu (nav, lightbox, animace, galerie, formulář)
document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Mobilní menu ---------- */
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  if (navToggle && mainNav) {
    const setNav = open => {
      const hdr = document.querySelector('header.site-header');
      if (hdr) document.documentElement.style.setProperty('--header-h', hdr.offsetHeight + 'px');
      mainNav.classList.toggle('open', open);
      document.body.classList.toggle('nav-open', open);
      navToggle.textContent = open ? '✕' : '☰';
      navToggle.setAttribute('aria-expanded', open);
    };
    navToggle.addEventListener('click', () => setNav(!mainNav.classList.contains('open')));
    mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setNav(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setNav(false); });
    window.addEventListener('resize', () => { if (window.innerWidth > 900) setNav(false); });
  }

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  revealEls.forEach(el => io.observe(el));

  /* ---------- Lightbox ---------- */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = lightbox.querySelector('img');
  let galleryImgs = [];
  let currentIndex = 0;

  function refreshGalleryImgs() {
    galleryImgs = Array.from(document.querySelectorAll('.gallery-grid figure'))
      .filter(f => f.style.display !== 'none')
      .map(f => f.querySelector('img').src);
  }

  function openLightbox(src) {
    refreshGalleryImgs();
    currentIndex = galleryImgs.indexOf(src);
    if (currentIndex < 0) currentIndex = 0;
    lightboxImg.src = src;
    lightbox.classList.add('open');
  }
  function showIndex(i) {
    if (!galleryImgs.length) return;
    currentIndex = (i + galleryImgs.length) % galleryImgs.length;
    lightboxImg.src = galleryImgs[currentIndex];
  }

  document.querySelectorAll('.gallery-grid figure img').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.src));
  });
  lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.classList.remove('open'));
  lightbox.querySelector('.prev').addEventListener('click', () => showIndex(currentIndex - 1));
  lightbox.querySelector('.next').addEventListener('click', () => showIndex(currentIndex + 1));
  lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('open'); });
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') lightbox.classList.remove('open');
    if (e.key === 'ArrowRight') showIndex(currentIndex + 1);
    if (e.key === 'ArrowLeft') showIndex(currentIndex - 1);
  });

  /* ---------- Rezervační formulář (FormSubmit) ---------- */
  const form = document.getElementById('reserve-form');
  const feedback = document.getElementById('form-feedback');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Odesílám…';
      feedback.className = '';
      feedback.style.display = 'none';
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        });
        if (res.ok) {
          feedback.textContent = 'Děkujeme! Poptávka byla odeslána na kvilda202@gmail.com, ozveme se co nejdřív.';
          feedback.className = 'ok';
          form.reset();
        } else {
          throw new Error('Odeslání se nezdařilo');
        }
      } catch (err) {
        feedback.textContent = 'Něco se nepovedlo. Zkuste to prosím znovu, nebo nám zavolejte na 606 080 413.';
        feedback.className = 'err';
      } finally {
        feedback.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Odeslat poptávku';
      }
    });
  }

  /* ---------- Rok v patičce ---------- */
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
});
