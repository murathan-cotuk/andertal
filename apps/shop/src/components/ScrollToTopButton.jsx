"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";

/** align with `HEADER_NARROW_MQ` in ShopHeader — no floating chrome on phone/tablet */
const HIDE_BELOW_PX = 1023;

const Button = styled.button`
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  pointer-events: ${(p) => (p.$visible ? "auto" : "none")};
  transform: scale(${(p) => (p.$visible ? 1 : 0.92)});
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;

  &:focus-visible {
    outline: 2px solid var(--shop-primary, #ff971c);
    outline-offset: 3px;
  }

  @media (max-width: ${HIDE_BELOW_PX}px) {
    display: none;
  }
`;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mql) return;

    const update = () => setReduced(Boolean(mql.matches));
    update();

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }

    mql.addListener(update);
    return () => mql.removeListener(update);
  }, []);

  return reduced;
}

export default function ScrollToTopButton() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setVisible(window.scrollY > 400);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const handleClick = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [prefersReducedMotion]);

  const ariaLabel = useMemo(() => "Back to top", []);

  return (
    <Button
      type="button"
      className="scroll-up-btn"
      $visible={visible}
      onClick={handleClick}
      aria-label={ariaLabel}
    >
      <svg
        className="scroll-up-icon"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M12 19V5M5 12l7-7 7 7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Button>
  );
}
