/* -------------------------------------------------------------------------- */
/*             Error Handling via Pattern Matching (more explicit)            */
/* -------------------------------------------------------------------------- */

export type Ok<T> = {
	ok: true;
	value: T;
};
export type Err<E extends Error> = {
	ok: false;
	error: E;
};

export type Result<T, E extends Error> = Ok<T> | Err<E>;

export const Ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const Err = <E extends Error>(error: E): Err<E> => ({
	ok: false,
	error,
});

/* -------------------------------------------------------------------------- */
/*                           ATTEMPT OVERRIDE VALUE                           */
/* -------------------------------------------------------------------------- */

export type OverrideCause<T> = {
	message: string;
	current?: T;
	attempted?: T;
	defaultValue?: T;
};

export class OverrideError<T> extends Error {
	readonly cause: OverrideCause<T>;

	constructor(cause: OverrideCause<T>) {
		super(cause.message);
		this.name = "OverrideError";
		this.cause = cause;
	}
}

export type OverrideResult<T> = Result<T, OverrideError<T>>;
export type OverrideOption<T> = Omit<OverrideCause<T>, "message">;

export const Success = <T>(value: T): Ok<T> => Ok(value);
export const Failed = <T>(
	message: string,
	options?: OverrideOption<T>,
): Err<OverrideError<T>> => Err(new OverrideError<T>({ message, ...options }));

export function attemptOverride<T>(
	current: T,
	next: T,
	options?: {
		canOverride?: (current: T, next: T) => boolean;
		defaultValue?: T;
		useDefaultOnFail?: boolean;
		failMessage?: string;
	},
): OverrideResult<T> {
	const can = options?.canOverride ? options.canOverride(current, next) : true;

	if (can) return Success(next);

	if (options?.useDefaultOnFail && options.defaultValue !== undefined) {
		return Success(options.defaultValue);
	}

	return Failed<T>(options?.failMessage ?? "No se pudo actualizar el valor", {
		current,
		attempted: next,
		defaultValue: options?.defaultValue,
	});
}
