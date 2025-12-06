"use client";

import React from "react";
import styled from "styled-components";

const InputWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`;

const Label = styled.label`
  font-family: "Manrope", sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
`;

const StyledInput = styled.input`
  font-family: "Manrope", sans-serif;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.2s ease;
  width: 100%;
  text-transform: none;
  letter-spacing: 0.01em;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }

  &:disabled {
    background-color: #f3f4f6;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-family: "Manrope", sans-serif;
  font-size: 14px;
  color: #ef4444;
`;

export const Input = ({
  label,
  error,
  ...props
}) => {
  return (
    <InputWrapper>
      {label && <Label>{label}</Label>}
      <StyledInput 
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        {...props} 
      />
      {error && <ErrorText>{error}</ErrorText>}
    </InputWrapper>
  );
};

