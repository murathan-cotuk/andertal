"use client";

import React from "react";

/* Brand colours — matches theme #ff971c */
const C_BASE   = "#ff971c";
const C_DARK   = "#ef8200";
const C_ACTIVE = "#ef8200";

export function ToCartButton({ type = "button", children, disabled, onClick, style, className = "" }) {
  return (
    <>
      <style>{`
        .atc-btn {
          position: relative;
          width: 100%;
          height: 52px;
          cursor: pointer;
          display: flex;
          align-items: center;
          border: 1.5px solid ${C_DARK};
          border-radius: 10px;
          background-color: ${C_BASE};
          overflow: hidden;
          padding: 0;
          user-select: none;
          box-sizing: border-box;
          transition: background-color 0.3s, border-color 0.3s;
        }
        .atc-btn, .atc-btn__text, .atc-btn__icon {
          transition: all 0.3s;
        }
        .atc-btn:hover:not(:disabled) {
          background-color: ${C_DARK};
        }
        .atc-btn:active:not(:disabled) {
          background-color: ${C_ACTIVE};
          border-color: ${C_ACTIVE};
        }
        .atc-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          background-color: #9ca3af;
          border-color: #9ca3af;
        }
        .atc-btn__text {
          flex: 1;
          text-align: center;
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.01em;
          padding: 0 54px 0 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          z-index: 1;
          pointer-events: none;
        }
        .atc-btn:hover:not(:disabled) .atc-btn__text {
          color: transparent;
        }
        .atc-btn__icon {
          position: absolute;
          top: 0;
          right: 0;
          height: 100%;
          width: 50px;
          background-color: ${C_DARK};
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 0 8px 8px 0;
          z-index: 2;
          pointer-events: none;
        }
        .atc-btn:hover:not(:disabled) .atc-btn__icon {
          width: 100%;
          border-radius: 8px;
        }
        .atc-btn:active:not(:disabled) .atc-btn__icon {
          background-color: ${C_ACTIVE};
        }
        .atc-btn__icon svg {
          width: 26px;
          height: 26px;
          stroke: #fff;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
          flex-shrink: 0;
        }
      `}</style>
      <button
        type={type}
        disabled={disabled}
        onClick={onClick}
        style={style}
        className={`atc-btn${className ? ` ${className}` : ""}`}
      >
        <span className="atc-btn__text">{children}</span>
        <span className="atc-btn__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5"  y1="12" x2="19" y2="12" />
          </svg>
        </span>
      </button>
    </>
  );
}

export default ToCartButton;
