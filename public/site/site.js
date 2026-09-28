document.documentElement.classList.add('js');

const reveal = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -7% 0px' });

  reveal.forEach((element) => observer.observe(element));
} else {
  reveal.forEach((element) => element.classList.add('is-visible'));
}

document.getElementById('year').textContent = String(new Date().getFullYear());
