import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from 'react';

// One floating note for greyed-out buttons, saying what brings them in: above the dock, below the top bar.
// A disabled button carries its reason in a visually hidden .why element (or the element its aria-describedby names).
// A finger has no hover, so tapping the button shows it, until the next touch anywhere or a few seconds pass.
export function useWhyTip() {
  const [why, setWhy] = useState<{ text: string; rect: DOMRect; tapped?: boolean } | null>(null);
  const reason = (t: EventTarget, tapped?: boolean) => {
    const b = (t as HTMLElement).closest('[aria-disabled="true"]');
    const ref = b && b.getAttribute('aria-describedby');
    const el = b && (b.querySelector('.why') || (ref ? document.getElementById(ref) : null));
    const text = el && el.textContent;
    return text && b ? { text, rect: b.getBoundingClientRect(), tapped } : null;
  };
  const show = (e: PointerEvent | FocusEvent) => { if (!('pointerType' in e && e.pointerType === 'touch')) setWhy(reason(e.target)); };
  // a mouse or keyboard keeps the hover and focus behaviour; only a finger needs the tap
  const finger = useRef(false);
  const tap = (e: MouseEvent) => { if (!finger.current) return; const w = reason(e.target, true); if (w) setWhy(w); };
  const hide = (e: PointerEvent | FocusEvent) => { if (!('pointerType' in e && e.pointerType === 'touch')) setWhy(null); };
  const tapped = !!why && !!why.tapped;
  useEffect(() => {
    if (!tapped) return;
    const off = () => setWhy(null), t = setTimeout(off, 4000);
    document.addEventListener('pointerdown', off, true);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', off, true); };
  }, [tapped, why]);
  return {
    handlers: { onPointerDown: (e: PointerEvent) => { finger.current = e.pointerType === 'touch'; }, onPointerOver: show, onFocus: show, onPointerLeave: hide, onBlur: hide, onClick: tap },
    tip: why && <WhyTip text={why.text} rect={why.rect} />
  };
}

function WhyTip({ text, rect }: { text: string; rect: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, below = rect.top < innerHeight / 2;
    setAt({
      left: Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)),
      top: below ? rect.bottom + 8 : rect.top - el.offsetHeight - 8
    });
  }, [text, rect]);
  return <div className="tool-tip" aria-hidden="true" ref={ref} style={at ? at : { visibility: 'hidden' }}>{text}</div>;
}
