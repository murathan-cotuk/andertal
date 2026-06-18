"use client";

import React from "react";
import styled from "styled-components";

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;

  @media (min-width: 480px) {
    width: auto;
    min-width: 148px;
    flex-shrink: 0;
  }
`;

const Label = styled.span`
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #9ca3af;
`;

const Stepper = styled.div`
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 52px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);

  @media (max-width: 767px) {
    min-height: 56px;
  }
`;

const StepBtn = styled.button`
  flex: 0 0 48px;
  width: 48px;
  border: 0;
  background: #f9fafb;
  color: #374151;
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    background: #f3f4f6;
    color: #111827;
  }

  &:active:not(:disabled) {
    background: #e5e7eb;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  @media (max-width: 767px) {
    flex-basis: 52px;
    width: 52px;
  }
`;

const Value = styled.input`
  flex: 1;
  min-width: 0;
  border: 0;
  border-left: 1px solid #e5e7eb;
  border-right: 1px solid #e5e7eb;
  background: #fff;
  text-align: center;
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  font-variant-numeric: tabular-nums;
  outline: none;
  padding: 0 8px;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type="number"] {
    -moz-appearance: textfield;
  }

  &:disabled {
    color: #9ca3af;
    background: #fafafa;
  }
`;

function clampQty(raw, min, max) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default function ProductQuantityStepper({
  label,
  value,
  onChange,
  min = 1,
  max = 9999,
  disabled = false,
  decrementAria,
  incrementAria,
}) {
  const qty = clampQty(value, min, max);

  const setQty = (next) => {
    onChange(clampQty(next, min, max));
  };

  return (
    <Wrap>
      {label ? <Label>{label}</Label> : null}
      <Stepper>
        <StepBtn
          type="button"
          aria-label={decrementAria || "Menge verringern"}
          disabled={disabled || qty <= min}
          onClick={() => setQty(qty - 1)}
        >
          −
        </StepBtn>
        <Value
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={qty}
          disabled={disabled}
          aria-label={label || "Menge"}
          onChange={(e) => setQty(e.target.value)}
          onBlur={(e) => setQty(e.target.value)}
        />
        <StepBtn
          type="button"
          aria-label={incrementAria || "Menge erhöhen"}
          disabled={disabled || qty >= max}
          onClick={() => setQty(qty + 1)}
        >
          +
        </StepBtn>
      </Stepper>
    </Wrap>
  );
}
