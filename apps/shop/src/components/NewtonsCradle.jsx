"use client";

import React from "react";

const css = `
.newtons-cradle {
  --uib-size: 50px;
  --uib-speed: 1.2s;
  --uib-color: #474554;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--uib-size);
  height: var(--uib-size);
}
.newtons-cradle__dot {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
  width: 25%;
  transform-origin: center top;
}
.newtons-cradle__dot::after {
  content: '';
  display: block;
  width: 100%;
  height: 25%;
  border-radius: 50%;
  background-color: var(--uib-color);
}
.newtons-cradle__dot:first-child {
  animation: nc-swing var(--uib-speed) linear infinite;
}
.newtons-cradle__dot:last-child {
  animation: nc-swing2 var(--uib-speed) linear infinite;
}
@keyframes nc-swing {
  0%  { transform: rotate(0deg);   animation-timing-function: ease-out; }
  25% { transform: rotate(70deg);  animation-timing-function: ease-in;  }
  50% { transform: rotate(0deg);   animation-timing-function: linear;   }
}
@keyframes nc-swing2 {
  0%  { transform: rotate(0deg);   animation-timing-function: linear;   }
  50% { transform: rotate(0deg);   animation-timing-function: ease-out; }
  75% { transform: rotate(-70deg); animation-timing-function: ease-in;  }
}
`;

export default function NewtonsCradle({ size = 50, color = "#474554", centered = true }) {
  const style = centered
    ? { display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0" }
    : {};
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={style}>
        <div
          className="newtons-cradle"
          style={{ "--uib-size": `${size}px`, "--uib-color": color }}
        >
          <div className="newtons-cradle__dot" />
          <div className="newtons-cradle__dot" />
          <div className="newtons-cradle__dot" />
          <div className="newtons-cradle__dot" />
        </div>
      </div>
    </>
  );
}
