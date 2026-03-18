"use client";

import React from "react";
import styled from "styled-components";
import { tokens } from "@/design-system/tokens";

const Btn = styled.button`
  padding: 1.05em 1.9em;
  border: 2px solid #000;
  font-size: 15px;
  color: #131313;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.3s;
  border-radius: 12px;
  background-color: ${tokens.primary.light};
  font-weight: 800;
  font-family: ${tokens.fontFamily.sans};
  box-shadow: 0 2px 0 2px #000;
  line-height: 1;
  user-select: none;

  &::before {
    content: "";
    position: absolute;
    width: 100px;
    height: 120%;
    background-color: ${tokens.primary.DEFAULT};
    top: 50%;
    transform: skewX(30deg) translate(-150%, -50%);
    transition: all 0.5s;
  }

  &:hover:not(:disabled) {
    background-color: ${tokens.primary.DEFAULT};
    color: #fff;
    box-shadow: 0 2px 0 2px #0d3b66;
    border-color: #0d3b66;
  }

  &:hover:not(:disabled)::before {
    transform: skewX(30deg) translate(150%, -50%);
    transition-delay: 0.1s;
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

export function Button({ type = "button", children, className, disabled, ...props }) {
  return (
    <Btn type={type} className={className} disabled={disabled} {...props}>
      {children}
    </Btn>
  );
}

export default Button;
