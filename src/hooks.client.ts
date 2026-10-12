import type { HandleClientError } from '@sveltejs/kit';
import { logService } from '$lib/services/logService.svelte';

export const handleError: HandleClientError = ({ error, event, status, message }) => {
	logService.error('app', `Client error: ${message}`, { error, status, url: event.url.href });
	return { message };
};
