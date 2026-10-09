import { useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';

// One floating note for greyed-out buttons, saying what brings them in: above the dock, below the top bar.
// A disabled button carries its reason in a visually hidden .why element (or the element its aria-describedby names).
export function useWhyTip() {
  const [why, setWhy] = useState<{ text: string; rect: DOMRect } | null>(null);
  const show = (e: PointerEvent | FocusEvent) => {
    const b = (e.target as HTMLElement).closest('[aria-disabled="true"]');
    const ref = b && b.getAttribute('aria-describedby');
    const el = b && (b.querySelector('.why') || (ref ? document.getElementById(ref) : null));
    const text = el && el.textContent;
    setWhy(text && b ? { text, rect: b.getBoundingClientRect() } : null);
  };
  const hide = () => setWhy(null);
  return {
    handlers: { onPointerOver: show, onFocus: show, onPointerLeave: hide, onBlur: hide },
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
