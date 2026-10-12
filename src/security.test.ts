// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SECURITY-v10 § 16 — інваріанти безпеки по джерелах для AudioRemote.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full.replace(/\\/g, '/'));
	}
	return out;
}

const sources = walk(join(ROOT, 'src'))
	.filter((f) => /\.(ts|svelte|html|css)$/.test(f))
	.filter((f) => !/\.(test|spec)\.ts$/.test(f))
	.map((f) => f.slice(ROOT.replace(/\\/g, '/').length + 1));

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const withoutComments = (source: string) =>
	source
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1');

const appHtml = read('src/app.html');
const svelteConfig = read('svelte.config.js');

describe('безпека — джерела', () => {
	it('перевірка жива: джерела знайдено', () => {
		expect(sources.length, 'сканер шукає не там').toBeGreaterThan(20);
	});

	it('немає eval і подібного (SECURITY-v10 § 13)', () => {
		const bad = sources.filter((f) =>
			/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(withoutComments(read(f)))
		);
		expect(bad, `заборонені конструкції:\n${bad.join('\n')}`).toEqual([]);
	});

	it('кожен {@html} санітизований або дозволений (SECURITY-v10 § 5.2)', () => {
		const bad: string[] = [];
		for (const file of sources.filter((f) => f.endsWith('.svelte'))) {
			for (const match of withoutComments(read(file)).matchAll(/\{@html\s+([^}]+)\}/g)) {
				const expression = match[1];
				const allowed = /sanitize|JSON\.stringify|[Jj]sonLd|ld\+json/.test(expression);
				if (!allowed) bad.push(`${file}: {@html ${expression.trim().slice(0, 48)}}`);
			}
		}
		expect(bad, `неперевірений {@html}:\n${bad.join('\n')}`).toEqual([]);
	});
});

describe('безпека — CSP (SECURITY-v10 § 6)', () => {
	it("script-src не має 'unsafe-inline' (SECURITY-v10 § 6.1)", () => {
		const scriptSrc = /['"]script-src['"]:\s*\[([^\]]*)\]/.exec(svelteConfig)?.[1] ?? '';
		expect(scriptSrc, 'директиву script-src не знайдено').not.toBe('');
		expect(scriptSrc.includes('unsafe-inline'), "'unsafe-inline' заборонений у script-src").toBe(false);
	});

	it('власні інлайн-скрипти стоять ПІСЛЯ %sveltekit.head% (§ 6.3)', () => {
		const head = appHtml.indexOf('%sveltekit.head%');
		expect(head, '%sveltekit.head% не знайдено').toBeGreaterThan(-1);

		const early = [...appHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)]
			.map((m) => m.index ?? -1)
			.filter((index) => index < head);

		expect(early, 'інлайн-скрипт вище мета-політики').toEqual([]);
	});
});
