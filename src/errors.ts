export enum ErrorCodes {
	Unknown = 0,
	ArmsTooShort = 1,
	MountPointOverlap = 2,
}

export enum ErrorHandlingBehavior {
	Continue = 0,
	Stop = 1,
}

/**
 * Structured payload describing the failure so the consumer UI can point at
 * the specific contraption and value that drove the simulation off the rails.
 */
export interface PintographErrorData {
	/** Optional consumer-supplied id of the contraption that threw (e.g. "wheel1"). */
	contraptionId?: string | undefined;
	/** Optional human-readable contraption type name, e.g. "VArm". */
	contraptionType?: string | undefined;
	/** Numeric details, freely populated per error code. */
	[key: string]: unknown;
}

export class PintographError extends Error {
	constructor(
		public readonly code: keyof typeof ErrorCodes,
		message: string,
		public readonly data?: PintographErrorData
	) {
		super(message);
	}
}

export type OnErrorCallback = (
	errorCode: keyof typeof ErrorCodes,
	data: PintographErrorData | undefined
) => ErrorHandlingBehavior;
