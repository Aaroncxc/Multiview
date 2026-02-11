// ============================================================
// Material Presets — Library of common materials
// Inspired by Spline Material Library
// ============================================================

export interface MaterialPreset {
  name: string;
  category: string;
  icon: string;
  props: {
    color: string;
    metalness: number;
    roughness: number;
    emissive: string;
    emissiveIntensity: number;
    opacity: number;
    transmission?: number;     // for glass
    ior?: number;              // index of refraction
    thickness?: number;        // for glass
    clearcoat?: number;
    clearcoatRoughness?: number;
    sheen?: number;
    sheenColor?: string;
    iridescence?: number;
  };
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  // ── Metals ──
  {
    name: "Chrome",
    category: "Metal",
    icon: "⬜",
    props: {
      color: "#e8e8e8",
      metalness: 1.0,
      roughness: 0.05,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Brushed Steel",
    category: "Metal",
    icon: "🔘",
    props: {
      color: "#b0b0b0",
      metalness: 0.9,
      roughness: 0.35,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Gold",
    category: "Metal",
    icon: "🟡",
    props: {
      color: "#ffd700",
      metalness: 1.0,
      roughness: 0.15,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Rose Gold",
    category: "Metal",
    icon: "🌸",
    props: {
      color: "#e8a090",
      metalness: 1.0,
      roughness: 0.2,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Copper",
    category: "Metal",
    icon: "🟤",
    props: {
      color: "#c87533",
      metalness: 1.0,
      roughness: 0.25,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },

  // ── Plastics ──
  {
    name: "Matte White",
    category: "Plastic",
    icon: "⬜",
    props: {
      color: "#f5f5f5",
      metalness: 0,
      roughness: 0.8,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Glossy Black",
    category: "Plastic",
    icon: "⬛",
    props: {
      color: "#1a1a1a",
      metalness: 0,
      roughness: 0.1,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Soft Rubber",
    category: "Plastic",
    icon: "🔵",
    props: {
      color: "#555555",
      metalness: 0,
      roughness: 0.95,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Glossy Red",
    category: "Plastic",
    icon: "🔴",
    props: {
      color: "#cc2233",
      metalness: 0,
      roughness: 0.15,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Pastel Blue",
    category: "Plastic",
    icon: "🔷",
    props: {
      color: "#7ec8e3",
      metalness: 0,
      roughness: 0.4,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },

  // ── Glass & Transparent ──
  {
    name: "Clear Glass",
    category: "Glass",
    icon: "💎",
    props: {
      color: "#ffffff",
      metalness: 0,
      roughness: 0.05,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 0.15,
      transmission: 0.95,
      ior: 1.5,
      thickness: 0.5,
    },
  },
  {
    name: "Frosted Glass",
    category: "Glass",
    icon: "🧊",
    props: {
      color: "#e8f0f8",
      metalness: 0,
      roughness: 0.5,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 0.3,
      transmission: 0.8,
      ior: 1.4,
      thickness: 0.3,
    },
  },
  {
    name: "Tinted Glass",
    category: "Glass",
    icon: "🟦",
    props: {
      color: "#4488cc",
      metalness: 0,
      roughness: 0.05,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 0.25,
      transmission: 0.9,
      ior: 1.5,
      thickness: 0.5,
    },
  },

  // ── Emissive / Neon ──
  {
    name: "Neon Blue",
    category: "Emissive",
    icon: "💙",
    props: {
      color: "#0044ff",
      metalness: 0,
      roughness: 0.3,
      emissive: "#0066ff",
      emissiveIntensity: 2.0,
      opacity: 1,
    },
  },
  {
    name: "Neon Pink",
    category: "Emissive",
    icon: "💗",
    props: {
      color: "#ff0066",
      metalness: 0,
      roughness: 0.3,
      emissive: "#ff0088",
      emissiveIntensity: 2.0,
      opacity: 1,
    },
  },
  {
    name: "Neon Green",
    category: "Emissive",
    icon: "💚",
    props: {
      color: "#00ff44",
      metalness: 0,
      roughness: 0.3,
      emissive: "#00ff66",
      emissiveIntensity: 2.0,
      opacity: 1,
    },
  },
  {
    name: "Warm Glow",
    category: "Emissive",
    icon: "🟠",
    props: {
      color: "#ff8800",
      metalness: 0,
      roughness: 0.5,
      emissive: "#ff6600",
      emissiveIntensity: 1.5,
      opacity: 1,
    },
  },

  // ── Natural ──
  {
    name: "Clay",
    category: "Natural",
    icon: "🟫",
    props: {
      color: "#c4956a",
      metalness: 0,
      roughness: 0.85,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Concrete",
    category: "Natural",
    icon: "⬜",
    props: {
      color: "#a0a0a0",
      metalness: 0,
      roughness: 0.95,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
  {
    name: "Wood",
    category: "Natural",
    icon: "🪵",
    props: {
      color: "#8b6914",
      metalness: 0,
      roughness: 0.7,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 1,
    },
  },
];

export const PRESET_CATEGORIES = [
  ...new Set(MATERIAL_PRESETS.map((p) => p.category)),
];
