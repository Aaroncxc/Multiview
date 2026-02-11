// ============================================================
// Slider — Range input with label and numeric display
// Apple HIG: Track fills with color, click-on-track to jump,
//            numeric value alongside slider
// ============================================================

import React from "react";
import "./Slider.css";

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  precision = 2,
}) => {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="slider">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <input
          className="slider-value"
          type="number"
          value={Number(value.toFixed(precision))}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          step={step}
          min={min}
          max={max}
        />
      </div>
      <input
        className="slider-range"
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percentage}%, var(--bg-input) ${percentage}%, var(--bg-input) 100%)`,
        }}
      />
    </div>
  );
};
