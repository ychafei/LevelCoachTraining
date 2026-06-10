import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Shared motion + visual primitives for the public marketing surface.
// Every animation respects prefers-reduced-motion: when reduced motion is
// requested the elements render in their final state with no transform/opacity
// animation. Imagery always sits on top of a CSS gradient so a slow or broken
// network image still looks intentional.

const EASE = [0.16, 1, 0.3, 1];

// Fade-and-rise on scroll into view. `as` lets callers pick the rendered tag.
export function Reveal({
  children,
  as = 'div',
  delay = 0,
  y = 16,
  className = '',
  once = true,
  amount = 0.3,
  ...rest
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] || motion.div;

  if (reduce) {
    const Tag = as;
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount }}
      transition={{ duration: 0.6, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

// Container that staggers its <Stagger.Item> children as they enter the viewport.
export function Stagger({
  children,
  as = 'div',
  className = '',
  gap = 0.08,
  once = true,
  amount = 0.2,
  ...rest
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] || motion.div;

  if (reduce) {
    const Tag = as;
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: gap } },
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

function StaggerItem({ children, as = 'div', className = '', y = 18, ...rest }) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] || motion.div;

  if (reduce) {
    const Tag = as;
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <MotionTag
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

Stagger.Item = StaggerItem;

// Photographic image that always renders over a gradient placeholder, so a
// broken or slow image degrades gracefully. `eager` is reserved for the LCP
// hero image; everything else lazy-loads.
export function GradientImage({
  src,
  alt,
  className = '',
  imgClassName = '',
  gradientClassName = 'bg-[linear-gradient(135deg,#0b2350_0%,#13357a_45%,#2563eb_100%)]',
  eager = false,
  overlayClassName = '',
  children,
}) {
  return (
    <div className={`relative overflow-hidden ${gradientClassName} ${className}`}>
      {src && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover ${imgClassName}`}
        />
      )}
      {overlayClassName && <div className={`absolute inset-0 ${overlayClassName}`} aria-hidden="true" />}
      {children}
    </div>
  );
}

// Decorative layered SVG / blur field used behind hero copy. Purely cosmetic.
export function HeroPattern({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full opacity-[0.55]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="lc-grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M36 0H0V36" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lc-grid)" />
      </svg>
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-500/30 blur-3xl" />
      <div className="absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl" />
    </div>
  );
}

export default Reveal;
