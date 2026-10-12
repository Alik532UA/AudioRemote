import type { HandleClientError } from '@sveltejs/kit';
import { logService } from '$lib/services/logService.svelte';
import { errorToMessageKey } from '$lib/errors';

export const handleError: HandleClientError = ({ error, event, status, message }) => {
	const key = errorToMessageKey(error);
	logService.error('app', `Client error: ${message} (${key})`, { error, status, url: event.url.href });
	return { message };
};
