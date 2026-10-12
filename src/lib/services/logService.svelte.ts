import { browser, dev } from '$app/environment';
import { SvelteURL } from 'svelte/reactivity';
import { trailAsText } from './breadcrumbs';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	category: string;
	message: string;
	data?: unknown;
}

const MAX_LOGS = 1000;
const SESSION_STORAGE_KEY = 'audioremote_logs_history';
const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
const SENSITIVE_PARAM = /^(token|access_token|code|state|key|api_?key|password|email)$/i;

export function maskText(str: string): string {
	return str.replace(EMAIL_REGEX, '***@***.***');
}

export function scrubUrl(raw: string): string {
	try {
		const url = new SvelteURL(raw);
		for (const name of [...url.searchParams.keys()]) {
			if (SENSITIVE_PARAM.test(name)) url.searchParams.set(name, 'REDACTED');
		}
		return url.toString();
	} catch {
		return maskText(raw);
	}
}

class LogService {
	logs = $state<LogEntry[]>([]);
	errorCount = $derived(this.logs.filter((l) => l.level === 'error').length);
	readonly appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
	private mirrorEnabled = true;

	constructor() {
		if (browser) {
			try {
				const saved = window.sessionStorage?.getItem(SESSION_STORAGE_KEY);
				if (saved) {
					const parsed = JSON.parse(saved);
					if (Array.isArray(parsed)) this.logs = parsed;
				}
			} catch {
				// Ignore storage quota error
			}
		}
	}

	private mirror(): void {
		if (!browser || !this.mirrorEnabled) return;
		try {
			window.sessionStorage?.setItem(
				SESSION_STORAGE_KEY,
				JSON.stringify($state.snapshot(this.logs))
			);
		} catch {
			this.mirrorEnabled = false;
		}
	}

	private add(level: LogLevel, category: string, rawMessage: string, data?: unknown) {
		const message = maskText(rawMessage);
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			category: category.toUpperCase(),
			message,
			data
		};

		this.logs.push(entry);
		if (this.logs.length > MAX_LOGS) {
			this.logs.shift();
		}
		this.mirror();

		if (browser) {
			if (dev || level === 'error') {
				const prefix = `[${level.toUpperCase()}] [${entry.category}]`;
				if (level === 'error') console.error(prefix, message, data ?? '');
				else if (level === 'warn') console.warn(prefix, message, data ?? '');
				else console.log(prefix, message, data ?? '');
			}
		}
	}

	info(category: string, message: string, data?: unknown): void {
		this.add('info', category, message, data);
	}

	warn(category: string, message: string, data?: unknown): void {
		this.add('warn', category, message, data);
	}

	error(category: string, message: string, data?: unknown): void {
		this.add('error', category, message, data);
	}

	clear(): void {
		this.logs = [];
		this.mirror();
	}

	getReport(): string {
		const inBrowser = typeof window !== 'undefined';
		const header = [
			'--- LOG REPORT ---',
			`DATE: ${new Date().toISOString()}`,
			`VERSION: ${this.appVersion}`,
			`URL: ${inBrowser ? scrubUrl(window.location.href) : 'SSR'}`,
			`DEVICE: ${inBrowser ? navigator.userAgent : 'SSR'}`,
			`ONLINE: ${inBrowser ? navigator.onLine : 'n/a'}`,
			`ERRORS: ${this.errorCount}`,
			'---'
		].join('\n');

		let crumbsSection = '';
		if (inBrowser && typeof trailAsText === 'function') {
			try {
				const trail = trailAsText();
				if (trail) crumbsSection = `\n--- BREADCRUMBS ---\n${trail}\n`;
			} catch {
				// ignore
			}
		}

		const body = this.logs
			.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}`)
			.join('\n');

		return `${header}${crumbsSection}\n--- RECENT LOGS ---\n${body}`;
	}
}

export const logService = new LogService();
