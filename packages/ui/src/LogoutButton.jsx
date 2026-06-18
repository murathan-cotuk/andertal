"use client";

import React from "react";
import styled from "styled-components";

const Btn = styled.button`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 45px;
  height: 45px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: width 0.3s ease, border-radius 0.3s ease, padding 0.3s ease, transform 0.15s ease;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  background-color: rgb(255, 65, 65);
  padding: 0;
  flex-shrink: 0;

  &:active:not(:disabled) {
    transform: translate(2px, 2px);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover,
    &:focus-visible {
      width: auto;
      min-width: 45px;
      padding-right: 12px;
      border-radius: 40px;

      .logout-btn__sign {
        width: 36px;
        padding-left: 4px;
      }

      .logout-btn__text {
        opacity: 1;
        width: auto;
        max-width: 180px;
        padding-right: 4px;
        position: static;
      }
    }
  }

  @media (hover: none), (pointer: coarse) {
    width: auto;
    min-width: 45px;
    padding-right: 12px;
    border-radius: 40px;

    .logout-btn__sign {
      width: 36px;
      padding-left: 4px;
    }

    .logout-btn__text {
      opacity: 1;
      width: auto;
      max-width: 180px;
      padding-right: 4px;
      position: static;
    }
  }
`;

const Sign = styled.span`
  width: 100%;
  transition: width 0.3s ease, padding 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 17px;
    height: 17px;
    display: block;
  }

  svg path {
    fill: white;
  }
`;

const Text = styled.span`
  position: absolute;
  right: 0;
  width: 0;
  opacity: 0;
  color: white;
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  transition: opacity 0.3s ease, width 0.3s ease, padding 0.3s ease;
  line-height: 1;
  font-family: inherit;
`;

function LogoutIcon() {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true">
      <path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z" />
    </svg>
  );
}

/**
 * Animated logout control (Uiverse-style). Pass localized `label` from i18n.
 */
export function LogoutButton({ label, onClick, disabled = false, className, style, type = "button" }) {
  const text = String(label || "").trim() || "Log out";
  return (
    <Btn
      type={type}
      className={className}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={text}
      title={text}
    >
      <Sign className="logout-btn__sign">
        <LogoutIcon />
      </Sign>
      <Text className="logout-btn__text">{text}</Text>
    </Btn>
  );
}

export default LogoutButton;
