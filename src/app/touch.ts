// Whether the main pointer is a finger. Picks tap and long-press wording over click, keys and right-click; the CSS
// asks the same question with @media (pointer: coarse).
const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
export const isTouch = () => !!coarse && coarse.matches;
