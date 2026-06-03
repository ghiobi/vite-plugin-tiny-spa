import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tinySpa } from "../../plugin/index.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tinySpa()],
});
