import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	// server: {
	// 	https: true, // Necessário para WebXR
	// 	host: true,
	// },
	// optimizeDeps: {
	// 	include: ["three", "jsqr"],
	// },
});
