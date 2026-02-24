import { useState, useRef, useEffect, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * Lightweight tooltip component. Shows on hover with a small delay.
 * Positions above by default, flips below if near viewport top.
 * Horizontally anchors left/center/right based on trigger position in viewport.
 */
export function Tooltip({ children, content, className }: {
  children: ReactNode;
  content: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [above, setAbove] = useState(true);
  const [hAlign, setHAlign] = useState<'center' | 'left' | 'right'>('center');
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    timer.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setAbove(rect.top > 80);
        // Pick horizontal alignment based on where the trigger sits
        const vw = window.innerWidth;
        if (rect.left < vw * 0.3) {
          setHAlign('left');
        } else if (rect.right > vw * 0.7) {
          setHAlign('right');
        } else {
          setHAlign('center');
        }
      }
      setVisible(true);
    }, 200);
  };

  const hide = () => {
    clearTimeout(timer.current);
    setVisible(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const hAlignClass =
    hAlign === 'left' ? 'left-0' :
    hAlign === 'right' ? 'right-0' :
    'left-1/2 -translate-x-1/2';

  return (
    <span
      ref={triggerRef}
      className={clsx('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <span
          className={clsx(
            'absolute z-50 px-3 py-2 text-xs text-white bg-gray-800 rounded-lg shadow-lg',
            'whitespace-normal w-80 leading-relaxed pointer-events-none',
            above ? 'bottom-full mb-2' : 'top-full mt-2',
            hAlignClass,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/**
 * Small "?" info icon with tooltip. Place next to labels/headings.
 */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip content={text} className={className}>
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold cursor-help hover:bg-gray-300 transition-colors select-none">
        ?
      </span>
    </Tooltip>
  );
}
