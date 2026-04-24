import { useId } from "react";

const PATH_STYLE = {
  fill: "none",
  stroke: "black",
  strokeWidth: 6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  transition: "stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease",
};

export default function CustomCheckbox({
  checked = false,
  onChange,
  disabled = false,
  size = 24,
  id,
  className,
  style,
  title,
  "aria-label": ariaLabel,
  tabIndex,
  readOnly = false,
}) {
  const generatedId = useId();
  const checkboxId = id || generatedId;

  return (
    <label
      htmlFor={checkboxId}
      className={className}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
      title={title}
      aria-label={ariaLabel}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        tabIndex={tabIndex}
        readOnly={readOnly}
        style={{ display: "none" }}
      />
      <svg viewBox="0 0 64 64" width={size} height={size} style={{ overflow: "visible" }} aria-hidden="true">
        <path
          d="M 0 16 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 16 L 32 48 L 64 16 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 16"
          pathLength="575.0541381835938"
          style={{
            ...PATH_STYLE,
            strokeDasharray: checked ? "70.5096664428711 9999999" : "241 9999999",
            strokeDashoffset: checked ? -262.2723388671875 : 0,
          }}
        />
      </svg>
    </label>
  );
}
