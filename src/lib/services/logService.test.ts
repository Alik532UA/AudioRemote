import { describe, it, expect, beforeEach } from 'vitest';
import { logService, maskText, scrubUrl } from './logService.svelte';

describe('logService', () => {
	beforeEach(() => {
		logService.clear();
	});

	it('records info, warn, and error logs and counts errors', () => {
		logService.info('app', 'hello world');
		logService.warn('app', 'careful');
		logService.error('app', 'something broke');

		expect(logService.logs.length).toBe(3);
		expect(logService.errorCount).toBe(1);
	});

	it('masks sensitive emails and parameters', () => {
		expect(maskText('User test@example.com logged in')).toContain('***@***.***');
		expect(scrubUrl('https://example.com/api?token=secret123&other=val')).toContain('token=REDACTED');
	});

	it('generates formatted log report', () => {
		logService.error('net', 'Connection timeout');
		const report = logService.getReport();
		expect(report).toContain('--- LOG REPORT ---');
		expect(report).toContain('Connection timeout');
		expect(report).toContain('ERRORS: 1');
	});
});
