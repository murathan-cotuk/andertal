"use client";

import React from "react";
import styled from "styled-components";

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #2a1200 0%, #9a5b00 40%, #fbbf24 100%);
  border: 1px solid rgba(255, 214, 107, 0.7);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 6px 16px rgba(180, 83, 9, 0.38), inset 0 1px 0 rgba(255,255,255,0.25);
  white-space: nowrap;
`;

export default function BestsellerBadge({ children = "Bestseller", className, style }) {
  return (
    <Badge className={className} style={style}>
      <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>★</span>
      {children}
    </Badge>
  );
}
