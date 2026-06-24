import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const isFirefox = mode === "firefox";
  const outDir = isFirefox ? "dist/firefox" : "dist/chrome";

  return {
    base: "",
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, "src/entries/popup.html"),
          full: resolve(__dirname, "src/entries/full.html"),
          options: resolve(__dirname, "src/entries/options.html"),
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: isFirefox ? "firefox/manifest.json" : "manifest.chrome.json",
            dest: ".",
            rename: "manifest.json",
          },
          { src: "icons", dest: "." },
          { src: "src/content.js", dest: "src" },
          { src: "src/background.js", dest: "src" },
          { src: "src/constants.js", dest: "src" },
        ],
      }),
    ],
  };
});