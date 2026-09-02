import {
  ARIA2_THEMES,
  ARIA2_CUSTOM_THEMES_KEY,
  CustomTheme,
  BuiltInTheme,
  ThemeId,
} from "./constants";

function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve as (result: Record<string, unknown>) => void);
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve as () => void);
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleaned = hex.replace("#", "");
  if (cleaned.length === 3) {
    cleaned = cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
  }
  const val = parseInt(cleaned, 16);
  return { r: (val >> 16) & 255, g: (val >> 8) & 255, b: val & 255 };
}

function lightenColor(r: number, g: number, b: number, amount: number): { r: number; g: number; b: number } {
  const a = Math.round(255 * amount);
  return {
    r: Math.min(255, r + a),
    g: Math.min(255, g + a),
    b: Math.min(255, b + a),
  };
}

export interface CustomThemeVars {
  "--accent": string;
  "--accent-rgb": string;
  "--accent-bright": string;
  "--accent-dim": string;
  "--accent-glow": string;
  "--accent-glow-soft": string;
  "--accent-glow-mid": string;
  "--accent-glow-hard": string;
  "--red": string;
  "--red-dim": string;
  "--amber": string;
  "--amber-rgb": string;
  "--amber-dim": string;
  "--amber-glow": string;
  "--green": string;
  "--green-rgb": string;
  "--green-dim": string;
  "--green-glow": string;
  "--gray-300-rgb": string;
}

export function computeCustomThemeVars(theme: CustomTheme): CustomThemeVars {
  const ar = hexToRgb(theme.accent);
  const ab = hexToRgb(theme.amber);
  const gr = hexToRgb(theme.green);
  const bright = lightenColor(ar.r, ar.g, ar.b, 0.06);
  const brightHex =
    "#" +
    [bright.r, bright.g, bright.b]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");

  const accentRGB = `${ar.r}, ${ar.g}, ${ar.b}`;
  const amberRGB = `${ab.r}, ${ab.g}, ${ab.b}`;
  const greenRGB = `${gr.r}, ${gr.g}, ${gr.b}`;
  const gray300RGB = "112, 112, 112";

  return {
    "--accent": theme.accent,
    "--accent-rgb": accentRGB,
    "--accent-bright": brightHex,
    "--accent-dim": `rgba(${accentRGB}, 0.08)`,
    "--accent-glow": `rgba(${accentRGB}, 0.25)`,
    "--accent-glow-soft": `rgba(${accentRGB}, 0.15)`,
    "--accent-glow-mid": `rgba(${accentRGB}, 0.35)`,
    "--accent-glow-hard": `rgba(${accentRGB}, 0.45)`,
    "--red": theme.accent,
    "--red-dim": `rgba(${accentRGB}, 0.08)`,
    "--amber": theme.amber,
    "--amber-rgb": amberRGB,
    "--amber-dim": `rgba(${amberRGB}, 0.08)`,
    "--amber-glow": `rgba(${amberRGB}, 0.3)`,
    "--green": theme.green,
    "--green-rgb": greenRGB,
    "--green-dim": `rgba(${greenRGB}, 0.08)`,
    "--green-glow": `rgba(${greenRGB}, 0.3)`,
    "--gray-300-rgb": gray300RGB,
  };
}

export async function getCustomThemes(): Promise<CustomTheme[]> {
  const result = await storageGet([ARIA2_CUSTOM_THEMES_KEY]);
  return (result[ARIA2_CUSTOM_THEMES_KEY] as CustomTheme[]) || [];
}

export async function saveCustomThemes(themes: CustomTheme[]): Promise<void> {
  return storageSet({ [ARIA2_CUSTOM_THEMES_KEY]: themes });
}

export interface AllThemeEntry {
  id: ThemeId;
  name: string;
  accent: string;
  isCustom?: boolean;
}

export async function getAllThemes(): Promise<AllThemeEntry[]> {
  const builtIn: AllThemeEntry[] = ARIA2_THEMES.map((t) => ({
    id: t.id,
    name: t.name,
    accent: t.accent,
  }));
  const custom = await getCustomThemes();
  const customMapped: AllThemeEntry[] = custom.map((t) => ({
    id: `custom:${t.id}` as ThemeId,
    name: "\u2726 " + t.name,
    accent: t.accent,
    isCustom: true,
  }));
  return [...builtIn, ...customMapped];
}

export async function applyTheme(theme?: ThemeId): Promise<void> {
  if (!theme) {
    const result = await storageGet(["aria2_theme"]);
    theme = ((result.aria2_theme as string) || "original") as ThemeId;
  }
  const el = document.documentElement;
  el.removeAttribute("data-theme");
  if (theme && theme.startsWith("custom:")) {
    const customId = theme.slice("custom:".length);
    const customs = await getCustomThemes();
    const ct = customs.find((t) => t.id === customId);
    if (ct) {
      const vars = computeCustomThemeVars(ct);
      for (const [key, val] of Object.entries(vars)) {
        el.style.setProperty(key, val);
      }
    } else {
      el.removeAttribute("style");
      await storageSet({ aria2_theme: "original" });
    }
  } else {
    el.removeAttribute("style");
    if (theme && theme !== "original") {
      el.setAttribute("data-theme", theme);
    }
  }
}