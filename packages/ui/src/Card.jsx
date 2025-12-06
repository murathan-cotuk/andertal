"use client";

import React from "react";
import styled from "styled-components";

const StyledCard = styled.div`
  background-color: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;

  ${({ $hover }) =>
    $hover &&
    `
    cursor: pointer;
    &:hover {
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      transform: translateY(-2px);
    }
  `}
`;

export const Card = ({ children, hover, ...props }) => {
  return (
    <StyledCard $hover={hover} {...props}>
      {children}
    </StyledCard>
  );
};

