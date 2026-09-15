type Unsubscribe = () => void;

// Interfaz común: "un valor que se puede leer y observar"
interface Ref<T> {
	readonly value: T;
	subscribe(listener: (v: T) => void): Unsubscribe;
}

// ref() — lectura y escritura
export class Reactive<T> implements Ref<T> {
	private _value: T;
	private _listeners: Set<(v: T) => void> = new Set();

	constructor(initial: T) {
		this._value = initial;
	}

	get value(): T {
		return this._value;
	}
	set value(next: T) {
		this._value = next;
		this._listeners.forEach((l) => l(next));
	}

	subscribe(listener: (v: T) => void): Unsubscribe {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	}
}

type RefOrType<T> = Ref<T> | T;
export class Computed<T> implements Ref<T> {
	private readonly _signal: Reactive<T>;
	private readonly _unsubscribers: Unsubscribe[] = [];

	constructor(deps: RefOrType<unknown>[], compute: () => T) {
		this._signal = new Reactive(compute());
		for (const dep of deps) {
			const ref = toRef(dep);
			this._unsubscribers.push(
				ref.subscribe(() => {
					this._signal.value = compute();
				}),
			);
		}
	}

	get value(): T {
		return this._signal.value;
	}
	// sin setter — read-only por diseño

	subscribe(listener: (value: T) => void): Unsubscribe {
		return this._signal.subscribe(listener);
	}

	destroy(): void {
		for (const unsub of this._unsubscribers) unsub();
		this._unsubscribers.length = 0;
	}
}

/* -------------------------------------------------------------------------- */
/*                                  Utilities                                 */
/* -------------------------------------------------------------------------- */
function isRef<T>(value: unknown): value is Ref<T> {
	return (
		value !== null &&
		typeof value === "object" &&
		"value" in value &&
		"subscribe" in value &&
		typeof (value as Record<string, unknown>).subscribe === "function"
	);
}
function toRef<T>(value: T): Ref<T> {
	if (isRef<T>(value)) return value;
	return new Reactive(value); // valor plano → Ref estático
}

export function ref<T>(initial: T): Reactive<T> {
	return new Reactive(initial);
}

export function computedRef<T>(
	deps: RefOrType<unknown>[],
	computeFn: () => T,
): Computed<T> {
	return new Computed(deps, computeFn);
}
