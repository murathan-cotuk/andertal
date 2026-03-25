"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";

const Button = styled.button`
  width: 50px;
  height: 50px;
  border-radius: 20%;
  background-color: #e38b00;
  border: none;
  font-weight: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4px double #e9e9e9;
  border-radius: 15px;
  cursor: pointer;
  transition-duration: 0.3s;
  overflow: hidden;
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;

  opacity: ${(p) => (p.$visible ? 1 : 0)};
  pointer-events: ${(p) => (p.$visible ? "auto" : "none")};
  transform: scale(${(p) => (p.$visible ? 1 : 0.92)});
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    width 0.3s ease,
    background-color 0.3s ease;

  &:focus-visible {
    outline: 2px solid #e38b00;
    outline-offset: 3px;
  }

  .svgIcon {
    width: 12px;
    transition-duration: 0.3s;
  }

  .svgIcon path {
    fill: #e9e9e9;
  }

  &:hover {
    width: 140px;
    border-radius: 15px;
    transition-duration: 0.3s;
    background-color: #e38b00;
    align-items: center;
  }

  &:hover .svgIcon {
    transition-duration: 0.3s;
    transform: translateY(-200%);
  }

  &::before {
    position: absolute;
    bottom: -20px;
    content: "Back to Top";
    color: #e9e9e9;
    font-size: 0px;
    transition-duration: 0.3s;
    white-space: nowrap;
  }

  &:hover::before {
    font-family: Garet;
    font-size: 15px;
    opacity: 1;
    bottom: unset;
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
      className="button"
      $visible={visible}
      onClick={handleClick}
      aria-label={ariaLabel}
    >
      <svg viewBox="0 0 384 512" className="svgIcon" aria-hidden="true">
        <path d="M214.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 141.2V448c0 17.7 14.3 32 32 32s32-14.3 32-32V141.2L329.4 246.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z" />
      </svg>
    </Button>
  );
}

