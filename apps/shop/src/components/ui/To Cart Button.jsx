"use client";

import React from "react";
import styled from "styled-components";
import { tokens } from "@/design-system/tokens";

const Button2 = styled.button`
  display: inline-block;
  transition: all 0.2s ease-in;
  position: relative;
  overflow: hidden;
  z-index: 1;
  font-family: ${tokens.fontFamily.sans};
  font-weight: 700;
  color:rgb(255, 255, 255);
  padding: 0.7em 1.7em;
  cursor: pointer;
  font-size: 16px;
  border-radius: 10px;
  background:rgb(226, 175, 8);
  border: 1px solid #e8e8e8;
  box-shadow: 6px 6px 12px #c5c5c5, -6px -6px 12px #ffffff;
  user-select: none;

  &:active {
    color: #666;
    box-shadow: inset 4px 4px 12px #c5c5c5, inset -4px -4px 12px #ffffff;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }

  &::before {
    content: "";
    position: absolute;
    left: 50%;
    transform: translateX(-50%) scaleY(1) scaleX(1.25);
    top: 100%;
    width: 140%;
    height: 180%;
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 50%;
    display: block;
    transition: all 0.5s 0.1s cubic-bezier(0.55, 0, 0.1, 1);
    z-index: -1;
  }

  &::after {
    content: "";
    position: absolute;
    left: 55%;
    transform: translateX(-50%) scaleY(1) scaleX(1.45);
    top: 180%;
    width: 160%;
    height: 190%;
    background-color: ${tokens.primary.DEFAULT};
    border-radius: 50%;
    display: block;
    transition: all 0.5s 0.1s cubic-bezier(0.55, 0, 0.1, 1);
    z-index: -1;
  }

  &:hover:not(:disabled) {
    color: #ffffff;
    border: 1px solid ${tokens.primary.DEFAULT};
  }

  &:hover:not(:disabled)::before {
    top: -35%;
    background-color: ${tokens.primary.DEFAULT};
    transform: translateX(-50%) scaleY(1.3) scaleX(0.8);
  }

  &:hover:not(:disabled)::after {
    top: -45%;
    background-color: ${tokens.primary.DEFAULT};
    transform: translateX(-50%) scaleY(1.3) scaleX(0.8);
  }
`;

export function ToCartButton({ type = "button", children, ...props }) {
  return (
    <Button2 type={type} {...props}>
      {children}
    </Button2>
  );
}

export default ToCartButton;
