import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKeySequence } from './keySequence';

describe('keySequence', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it('triggers callback when threshold is reached', () => {
		const onComplete = vi.fn();
		const seq = createKeySequence({
			code: 'KeyV',
			threshold: 5,
			onComplete
		});

		for (let i = 0; i < 4; i++) {
			seq.handle({ code: 'KeyV' });
		}
		expect(onComplete).not.toHaveBeenCalled();

		seq.handle({ code: 'KeyV' });
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it('ignores repeat key events', () => {
		const onComplete = vi.fn();
		const seq = createKeySequence({
			code: 'KeyV',
			threshold: 2,
			onComplete
		});

		seq.handle({ code: 'KeyV', repeat: true });
		expect(seq.count).toBe(0);
	});

	it('resets on other keys', () => {
		const seq = createKeySequence({
			code: 'KeyV',
			threshold: 5,
			onComplete: vi.fn()
		});

		seq.handle({ code: 'KeyV' });
		expect(seq.count).toBe(1);

		seq.handle({ code: 'KeyA' });
		expect(seq.count).toBe(0);
	});

	it('resets after timeout window', () => {
		const seq = createKeySequence({
			code: 'KeyV',
			threshold: 5,
			windowMs: 1000,
			onComplete: vi.fn()
		});

		seq.handle({ code: 'KeyV' });
		expect(seq.count).toBe(1);

		vi.advanceTimersByTime(1100);
		expect(seq.count).toBe(0);
	});

	it('ignores inputs inside editable elements', () => {
		const seq = createKeySequence({
			code: 'KeyV',
			threshold: 5,
			onComplete: vi.fn()
		});

		const dummyInput = {
			closest: (sel: string) => sel.includes('input') ? {} : null
		};

		seq.handle({ code: 'KeyV', target: dummyInput as any });
		expect(seq.count).toBe(0);
	});
});
