import spriteMarkup from '@/assets/icons-sprite.svg?raw';
import type { IconName } from './icon-names';

let injected = false;

/** Inject the icon sprite once per document (call from each surface's entry). */
export function injectSprite(): void {
  if (injected) return;
  document.body.insertAdjacentHTML('afterbegin', spriteMarkup);
  injected = true;
}

/** Create an <svg><use> element referencing a sprite symbol (currentColor). */
export function icon(name: IconName, size = 16): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-mono-${name}`);
  svg.append(use);
  return svg;
}
