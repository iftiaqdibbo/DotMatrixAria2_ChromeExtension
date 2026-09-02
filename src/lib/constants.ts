export const ARIA2_DEFAULT_RPC_URL = "http://localhost:6800/jsonrpc";

export const ARIA2_DEFAULT_FILTER_EXTENSIONS: string[] = [];

export const ARIA2_DEFAULT_SAFE_MODE_HOSTS: string[] = [
  "gofile.io",
  "1fichier.com",
  "pixeldrain.com",
  "mediafire.com",
  "mega.nz",
  "ranoz.net",
  "datanodes.to",
  "bowfile.com",
  "dl.free.fr",
  "swisstransfer.com",
  "freedlink.me",
  "fileditch.com",
  "uploadnow.io",
  "wdho.ru",
  "mixdrop.",
  "chomikuj.pl",
  "vikingfile.com",
  "dayuploads.com",
  "downmediaload.com",
  "hexload.com",
  "1cloudfile.com",
  "usersdrive.com",
  "megaup.net",
  "clicknupload.org",
  "dailyuploads.net",
  "rapidgator.net",
  "nitroflare.com",
  "filebin.net",
  "oshi.at",
];

export interface BuiltInTheme {
  id: string;
  name: string;
  accent: string;
}

export const ARIA2_THEMES: BuiltInTheme[] = [
  { id: "original", name: "Original", accent: "#ff1a1a" },
  { id: "catppuccin", name: "Catppuccin", accent: "#f38ba8" },
  { id: "dracula", name: "Dracula", accent: "#ff79c6" },
  { id: "nord", name: "Nord", accent: "#88c0d0" },
  { id: "tokyo-night", name: "Tokyo Night", accent: "#7aa2f7" },
];

export interface CustomTheme {
  id: string;
  name: string;
  accent: string;
  amber: string;
  green: string;
}

export type ThemeId = BuiltInTheme["id"] | `custom:${string}`;

export const ARIA2_CUSTOM_THEMES_KEY = "aria2_custom_themes";