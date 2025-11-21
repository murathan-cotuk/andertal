"use client";

import React from "react";
import styled from "styled-components";

const StyledButton = styled.button`
  font-family: "Aeonik", sans-serif;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  ${({ size }) => {
    switch (size) {
      case "sm":
        return `
          padding: 8px 16px;
          font-size: 14px;
        `;
      case "lg":
        return `
          padding: 14px 28px;
          font-size: 18px;
        `;
      default:
        return `
          padding: 12px 24px;
          font-size: 16px;
        `;
    }
  }}

  ${({ variant }) => {
    switch (variant) {
      case "secondary":
        return `
          background-color: #6b7280;
          color: white;
          &:hover {
            background-color: #4b5563;
          }
        `;
      case "outline":
        return `
          background-color: transparent;
          color: #0ea5e9;
          border: 2px solid #0ea5e9;
          &:hover {
            background-color: #f0f9ff;
          }
        `;
      case "ghost":
        return `
          background-color: transparent;
          color: #374151;
          &:hover {
            background-color: #f3f4f6;
          }
        `;
      default:
        return `
          background-color: #0ea5e9;
          color: white;
          &:hover {
            background-color: #0284c7;
          }
        `;
    }
  }}

  ${({ fullWidth }) =>
    fullWidth &&
    `
    width: 100%;
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  ...props
}) => {
  return (
    <StyledButton variant={variant} size={size} fullWidth={fullWidth} {...props}>
      {children}
    </StyledButton>
  );
};

