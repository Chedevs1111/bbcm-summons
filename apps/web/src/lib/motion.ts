/**
 * Scroll-reveal and count-up.
 *
 * Two rules learned the hard way, both about failure modes rather than easing:
 *
 *  1. A reveal starts at `opacity: 0`. Whatever flips it must not be something that
 *     can silently never run. `IntersectionObserver` does not fire in some embedded
 *     and offscreen browsing contexts, which would leave the page permanently blank,
 *     so this uses a geometry check on scroll plus a timeout that forces the end state.
 *  2. A counter must never render a number that is not true. The real figure is what
 *     sits in the DOM; the animation plays over it, and is skipped entirely when the
 *     tab is hidden — a throttled frame loop stalls after its first tick, which would
 *     otherwise strand the tile showing the opening frame of the count.
 */

import { useEffect, useRef } from 'react';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function show(el: HTMLElement, delay: number): void {
  if (el.dataset.shown === '1') return;
  el.style.setProperty('--reveal-delay', `${delay}ms`);
  el.dataset.shown = '1';
}

/**
 * Reveals `.reveal` descendants of the returned ref as they reach the viewport.
 *
 * Pass a key that changes when the view's content changes (a route or record id), so
 * freshly rendered nodes are swept rather than left hidden.
 */
export function useReveal(key?: unknown) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const nodes = () => Array.from(root.querySelectorAll<HTMLElement>('.reveal'));

    if (prefersReducedMotion()) {
      nodes().forEach((el) => show(el, 0));
      return;
    }

    let frame = 0;
    const sweep = () => {
      frame = 0;
      const limit = window.innerHeight * 0.94;
      let shown = 0;
      for (const el of nodes()) {
        if (el.dataset.shown === '1') continue;
        if (el.getBoundingClientRect().top < limit) show(el, Math.min(shown++ * 55, 260));
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(sweep);
    };

    sweep();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });

    // Last resort. Adding the attribute still leaves a CSS transition to raise the
    // opacity, and a transition cannot run if the frame clock is stalled, so force
    // the end state inline. Nothing may end up permanently invisible.
    const settle = setTimeout(() => {
      for (const el of nodes()) {
        show(el, 0);
        if (getComputedStyle(el).opacity === '0') {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      }
    }, 1600);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(settle);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, [key]);

  return ref;
}

/** Drives the gold hairline under the top bar. */
export function useScrollProgress(): void {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      doc.style.setProperty('--scroll-progress', String(max > 0 ? Math.min(1, doc.scrollTop / max) : 0));
      doc.dataset.scrolled = doc.scrollTop > 4 ? '1' : '0';
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      removeEventListener('scroll', onScroll);
    };
  }, []);
}

/**
 * Counts an element up to `value`.
 *
 * `format` must be the same formatter the caller renders with, so no frame ever shows
 * an amount in a different notation than the settled one.
 */
export function useCountUp(value: number, format: (n: number) => string = String) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const final = () => { el.textContent = format(value); };

    if (
      prefersReducedMotion() ||
      !Number.isFinite(value) ||
      typeof requestAnimationFrame !== 'function' ||
      document.visibilityState !== 'visible'
    ) {
      final();
      return;
    }

    let frame = 0;
    const guard = setTimeout(final, 1400);
    const duration = 780;
    const start = performance.now();

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      el.textContent = format(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(step);
      else { clearTimeout(guard); final(); }
    };
    frame = requestAnimationFrame(step);

    return () => { cancelAnimationFrame(frame); clearTimeout(guard); final(); };
  }, [value, format]);

  return ref;
}
