"use client";

import React from "react";

export default function GlobalPageLoader({ label: _label } = {}) {
  return (
    <>
      <div
        role="status"
        aria-label="Loading"
        style={{
          position: "fixed",
          top: "112px",
          left: 0,
          right: 0,
          height: "3px",
          zIndex: 9998,
          backgroundColor: "#1a1a1a",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "0%",
            borderRadius: "30px",
            background: "linear-gradient(90deg, #ff0000, #ff4d4d, #ff0000)",
            boxShadow: "0 0 8px 2px rgba(255,0,0,0.7), 0 0 20px 4px rgba(255,0,0,0.35)",
            animation: "gpl-move 1s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes gpl-move {
          0%   { width: 0%;   left: 0;    right: auto; }
          50%  { width: 100%; left: 0;    right: auto; }
          100% { width: 0%;   left: auto; right: 0; }
        }
      `}</style>
    </>
  );
}
