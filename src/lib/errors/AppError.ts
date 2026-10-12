/**
 * Доменні класи помилок (ERROR-HANDLING-v10 § 1.1 - § 1.2).
 */
export class AppError extends Error {
	override name = 'AppError';

	constructor(
		public readonly code: string,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
	}
}

export class ValidationError extends AppError {
	override name = 'ValidationError';
	constructor(public readonly fields: Record<string, string> = {}) {
		super('VALIDATION_ERROR', 'Validation failed');
	}
}

export class NotFoundError extends AppError {
	override name = 'NotFoundError';
	constructor(resource = 'Resource') {
		super('NOT_FOUND', `${resource} not found`);
	}
}

export type NetworkErrorInit = {
	status?: number;
	retryAfterMs?: number;
	cause?: unknown;
};

export class NetworkError extends AppError {
	override name = 'NetworkError';
	readonly status?: number;
	readonly retryAfterMs?: number;
	constructor(
		message = 'Network request failed',
		{ status, retryAfterMs, cause }: NetworkErrorInit = {}
	) {
		super('NETWORK_ERROR', message, { cause });
		this.status = status;
		this.retryAfterMs = retryAfterMs;
	}
}

export class AuthError extends AppError {
	override name = 'AuthError';
	constructor(message = 'Authentication required') {
		super('AUTH_ERROR', message);
	}
}
