document.documentElement.classList.add('js');

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

const revealWithoutGsap = () => {
  const elements = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach((element) => element.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });

  elements.forEach((element) => observer.observe(element));
};

if (!window.gsap || !window.ScrollTrigger) {
  revealWithoutGsap();
} else {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  const media = gsap.matchMedia();
  media.add({
    animate: '(prefers-reduced-motion: no-preference)',
    desktop: '(min-width: 721px)'
  }, ({ conditions }) => {
    if (!conditions.animate) {
      gsap.set('.hero-animate, .hero-device, .reveal', { clearProps: 'all' });
      document.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
      gsap.set('.together__line', { scaleY: 1 });
      return;
    }

    const intro = gsap.timeline({ defaults: { duration: .72, ease: 'power3.out' } });
    intro
      .fromTo('.topbar', { autoAlpha: 0, y: -14 }, { autoAlpha: 1, y: 0, duration: .45 })
      .fromTo('.hero__copy .hero-animate', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, stagger: .08 }, '<.08')
      .fromTo('.hero__rail', { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, duration: .48 }, '<.18')
      .fromTo('.hero-device', { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, stagger: .11 }, '<.08');

    ScrollTrigger.batch('.reveal', {
      start: 'top 86%',
      once: true,
      onEnter: (elements) => {
        elements.forEach((element) => element.classList.add('is-visible'));
        gsap.fromTo(elements, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: .68, stagger: .06, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
      }
    });

    if (conditions.desktop) {
      gsap.to('.device--trainer', {
        y: -34,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 }
      });
      gsap.to('.device--client', {
        y: 22,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 }
      });
    }

    gsap.to('.together__line', {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.together', start: 'top 78%', end: 'bottom 72%', scrub: .7 }
    });
  });
}
