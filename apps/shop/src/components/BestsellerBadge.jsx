"use client";

import React from "react";
import styled from "styled-components";

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, #111827 0%, #f59e0b 50%, #b45309 100%);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 4px 12px rgba(180, 83, 9, 0.28);
  white-space: nowrap;
`;

export default function BestsellerBadge({ children = "Bestseller", className, style }) {
  return (
    <Badge className={className} style={style}>
      {children}
    </Badge>
  );
}
