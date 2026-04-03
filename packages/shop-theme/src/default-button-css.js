/** Starter CSS per button role — merchants can replace via Sellercentral. */

export const DEFAULT_ATC_CODE = `/* ToCartButton */
.atc-btn {
  position: relative;
  width: 100%;
  height: 52px;
  cursor: pointer;
  display: flex;
  align-items: center;
  border: 1.5px solid var(--btn-atc-border, #ef8200);
  border-radius: 10px;
  background-color: var(--btn-atc-bg, #ff971c);
  overflow: hidden;
  padding: 0;
  user-select: none;
  box-sizing: border-box;
  transition: background-color 0.3s, border-color 0.3s;
}
.atc-btn,
.atc-btn__text,
.atc-btn__icon {
  transition: all 0.3s;
}
.atc-btn:hover:not(:disabled) {
  background-color: var(--btn-atc-hover-bg, #ef8200);
}
.atc-btn:active:not(:disabled) {
  background-color: var(--btn-atc-hover-bg, #ef8200);
  border-color: var(--btn-atc-hover-bg, #ef8200);
}
.atc-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--btn-atc-disabled-bg, #9ca3af);
  border-color: var(--btn-atc-disabled-border, #9ca3af);
}
.atc-btn__text {
  flex: 1;
  text-align: center;
  color: var(--btn-atc-text, #fff);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.01em;
  padding: 0 54px 0 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 1;
  pointer-events: none;
}
.atc-btn:hover:not(:disabled) .atc-btn__text {
  color: transparent;
}
.atc-btn__icon {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: 50px;
  background-color: var(--btn-atc-icon-bg, #ef8200);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 8px 8px 0;
  z-index: 2;
  pointer-events: none;
}
.atc-btn:hover:not(:disabled) .atc-btn__icon {
  width: 100%;
  border-radius: 8px;
}
.atc-btn:active:not(:disabled) .atc-btn__icon {
  background-color: var(--btn-atc-icon-bg, #ef8200);
}
.atc-btn__icon svg {
  width: 26px;
  height: 26px;
  stroke: var(--btn-atc-icon-stroke, #fff);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  flex-shrink: 0;
}`;

export const DEFAULT_PRIMARY_BUTTON_CODE = `/* Primary CTA */
.shop-btn {
  padding: 1.05em 1.9em;
  border: 2px solid var(--btn-primary-border, #000);
  font-size: 15px;
  color: var(--btn-primary-text, #131313);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.3s;
  border-radius: 12px;
  background-color: var(--btn-primary-bg, #ffb14d);
  font-weight: 800;
  line-height: 1;
  user-select: none;
  box-shadow: 0 2px 0 2px var(--btn-primary-shadow, #000);
}
.shop-btn::before {
  content: "";
  position: absolute;
  width: 100px;
  height: 120%;
  background-color: var(--btn-primary-shine, #ff971c);
  top: 50%;
  transform: skewX(30deg) translate(-150%, -50%);
  transition: all 0.5s;
}
.shop-btn:hover:not(:disabled) {
  background-color: var(--btn-primary-hover-bg, #ff971c);
  color: var(--btn-primary-hover-text, #fff);
  box-shadow: 0 2px 0 2px var(--btn-primary-hover-shadow, #0d3b66);
  border-color: var(--btn-primary-hover-border, #0d3b66);
}
.shop-btn:hover:not(:disabled)::before {
  transform: skewX(30deg) translate(150%, -50%);
  transition-delay: 0.1s;
}
.shop-btn:active:not(:disabled) {
  transform: scale(0.95);
}
.shop-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}`;

export const DEFAULT_SECONDARY_BUTTON_CODE = `/* Secondary */
.shop-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.95em 1.6em;
  border: 2px solid var(--btn-secondary-border, #111827);
  border-radius: 12px;
  background: var(--btn-secondary-bg, #ffffff);
  color: var(--btn-secondary-text, #111827);
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: all 0.25s ease;
}
.shop-btn-secondary:hover:not(:disabled) {
  background: var(--btn-secondary-hover-bg, #111827);
  color: var(--btn-secondary-hover-text, #ffffff);
}
.shop-btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}`;

export const DEFAULT_GHOST_BUTTON_CODE = `/* Ghost */
.shop-btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.9em 1.5em;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--btn-ghost-text, var(--shop-primary, #ff971c));
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.shop-btn-ghost:hover:not(:disabled) {
  background: var(--btn-ghost-hover-bg, rgba(255, 151, 28, 0.12));
  color: var(--btn-ghost-hover-text, var(--shop-accent, #ef8200));
}
.shop-btn-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}`;

export const DEFAULT_OUTLINE_BUTTON_CODE = `/* Outline accent */
.shop-btn-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.9em 1.6em;
  border: 2px solid var(--btn-outline-accent, var(--shop-primary, #ff971c));
  border-radius: 12px;
  background: transparent;
  color: var(--btn-outline-accent, var(--shop-primary, #ff971c));
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: all 0.25s ease;
}
.shop-btn-outline:hover:not(:disabled) {
  background: var(--btn-outline-accent, var(--shop-primary, #ff971c));
  color: var(--btn-outline-hover-text, #ffffff);
}
.shop-btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}`;
