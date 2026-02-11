// ============================================================
// Color Picker — Compact color selector
// Apple HIG: Swatch preview + hex input, clear affordance
// ============================================================

import React, { useState, useRef, useEffect } from "react";
import "./ColorPicker.css";

interface ColorPickerProps {
  value: string; // #RRGGBB
  onChange: (color: string) => void;
  label?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      onChange(val);
    }
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setHexInput(e.target.value);
  };

  return (
    <div className="color-picker" ref={wrapperRef}>
      {label && <span className="color-picker-label">{label}</span>}
      <div className="color-picker-controls">
        <button
          className="color-picker-swatch"
          style={{ backgroundColor: value }}
          onClick={() => setIsOpen(!isOpen)}
          title="Pick color"
          aria-label={`Color: ${value}`}
        />
        <input
          className="color-picker-hex"
          value={hexInput}
          onChange={handleHexChange}
          spellCheck={false}
          maxLength={7}
        />
      </div>

      {isOpen && (
        <div className="color-picker-popover">
          <input
            type="color"
            className="color-picker-native"
            value={value}
            onChange={handleNativeChange}
          />
          {/* Quick color presets */}
          <div className="color-picker-presets">
            {[
              "#ffffff", "#cccccc", "#888888", "#444444", "#000000",
              "#ff4444", "#ff8844", "#ffcc44", "#44ff44", "#44ccff",
              "#4488ff", "#8844ff", "#ff44cc", "#44ffcc", "#ff6666",
            ].map((c) => (
              <button
                key={c}
                className="color-picker-preset"
                style={{ backgroundColor: c }}
                onClick={() => {
                  onChange(c);
                  setHexInput(c);
                }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
