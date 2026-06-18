"use client";

import React from "react";
import styled from "styled-components";

const Btn = styled.button`
  position: relative;
  width: 100%;
  min-height: 52px;
  padding: 0 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: none;
  border-radius: 12px;
  background: var(--shop-primary, #ff971c);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-sizing: border-box;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 14px rgba(255, 151, 28, 0.22);
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;

  @media (max-width: 767px) {
    min-height: 56px;
    font-size: 1rem;
  }

  &:hover:not(:disabled) {
    background: var(--shop-accent, #ef8200);
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08), 0 6px 18px rgba(239, 130, 0, 0.28);
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    background: #9ca3af;
    box-shadow: none;
  }

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }
`;

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.2 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.76L21 7H6.2" />
    </svg>
  );
}

export function ToCartButton({ type = "button", children, disabled, onClick, style, className = "" }) {
  return (
    <Btn type={type} disabled={disabled} onClick={onClick} style={style} className={className}>
      <CartIcon />
      <span>{children}</span>
    </Btn>
  );
}

export default ToCartButton;
