import type { Attachment } from 'svelte/attachments';

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'iframe',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

export function focusableWithin(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
		if (el.getAttribute('tabindex') === '-1') return false;
		if (el.closest('[hidden]')) return false;
		const style = getComputedStyle(el);
		return style.display !== 'none' && style.visibility !== 'hidden';
	});
}

export function nextTrapTarget(
	items: HTMLElement[],
	active: Element | null,
	shift: boolean
): HTMLElement | null {
	if (items.length === 0) return null;
	const first = items[0];
	const last = items[items.length - 1];

	if (!active || !items.includes(active as HTMLElement)) return shift ? last : first;
	if (shift && active === first) return last;
	if (!shift && active === last) return first;
	return null;
}

export function focusTrap(options: { initial?: () => HTMLElement | null } = {}): Attachment {
	return (node) => {
		const container = node as HTMLElement;
		const returnTo = document.activeElement as HTMLElement | null;

		const initial = options.initial?.() ?? focusableWithin(container)[0] ?? container;
		if (initial === container && !container.hasAttribute('tabindex')) {
			container.setAttribute('tabindex', '-1');
		}
		initial.focus();

		function onKeydown(event: KeyboardEvent) {
			if (event.key !== 'Tab') return;
			const target = nextTrapTarget(
				focusableWithin(container),
				document.activeElement,
				event.shiftKey
			);
			if (!target) return;
			event.preventDefault();
			target.focus();
		}

		container.addEventListener('keydown', onKeydown);

		return () => {
			container.removeEventListener('keydown', onKeydown);
			if (returnTo?.isConnected) returnTo.focus();
		};
	};
}
