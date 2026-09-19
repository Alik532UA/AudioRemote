/// <reference types="vite-plugin-pwa/svelte" />
/// <reference types="vite-plugin-pwa/info" />

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}

	/** Версія з package.json, підставлена `define` у vite.config.ts. */
	const __APP_VERSION__: string;
}

export {};
