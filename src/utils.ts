// Original function was "ucFirst".
export function capitalize(s: string): string {
	return s[0].toUpperCase() + s.substring(1);
}

/**
 * Ensures that the provided value is a string array.
 *
 * This utility function normalizes different input types into a predictable string array.
 * It handles falsy values, arrays, and strings, falling back to a backup array when
 * the input cannot be converted.
 *
 * @param input - The input value to normalize. Accepts:
 *            - `string` → wrapped as a single-element array
 *            - `string[]` → returned as-is
 *            - falsy values (`null`, `undefined`, `false`, `0`, `""`) → returns the backup array
 *            - any other type → returns the backup array (as a safe fallback)
 * @param backup - Default array used when `a` is falsy, not an array, or not a string.
 *                 If `backup` itself is falsy, an empty array is used instead.
 * @returns A guaranteed `string[]`:
 *          - If `input` is a non‑empty array → `a`
 *          - If `input` is a string → `[input]`
 *          - Otherwise → `backup` (or `[]` if `backup` is also falsy)
 *
 * @example
 * // Returns ["hello"]
 * ensureArray("hello", []);
 *
 * @example
 * // Returns ["a", "b"]
 * ensureArray(["a", "b"], ["default"]);
 *
 * @example
 * // Returns ["default"]
 * ensureArray(null, ["default"]);
 *
 * @example
 * // Returns [] (backup is falsy)
 * ensureArray(undefined, null);
 */
export function ensureArray(input: any, backup: string[]): string[] {
	const backupValue = backup ? backup : [];
	if (!input) return backupValue;
	if (input instanceof Array) return input;
	if (typeof input === "string") return [input];
	return backupValue;
}

/**
 * Parses a comma-separated string list into normalized items.
 * Trims whitespace and removes empty entries.
 */
export function parseCsvStringList(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

/**
 * Returns true if a template string references the built-in {{filename}} token.
 * Accepts both double and triple brace forms.
 */
export function containsFilenameToken(value: string | undefined): boolean {
	if (!value) return false;
	return /{{{?\s*filename\s*}?}}/i.test(value);
}

/**
 * Handlebars identifiers cannot contain '&'.
 * Normalize built-in tokens that include unsupported characters to safe aliases
 * while preserving the public token syntax used by templates and replacement text.
 */
export function normalizeHandlebarsBuiltInTokens(source: string): string {
	return source
		.replace(/{{{\s*date&time\s*}}}/g, "{{{dateAndTime}}}")
		.replace(/{{\s*date&time\s*}}/g, "{{dateAndTime}}");
}

/**
 * Normalizes a vault-relative folder path.
 *
 * Root aliases "", "/" and "./" are normalized to "".
 */
export function normalizeVaultFolderPath(input: string | undefined): string {
	const raw = (input ?? "").trim().replace(/\\/g, "/");
	if (raw === "" || raw === "/" || raw === "./") return "";

	let normalized = raw;
	while (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}

	normalized = normalized.replace(/\/{2,}/g, "/");
	normalized = normalized.replace(/^\/+/, "");
	normalized = normalized.replace(/\/+$/, "");

	if (normalized === ".") return "";
	return normalized;
}

/**
 * Returns true when the provided folder path attempts to escape vault boundaries.
 */
export function isUnsafeVaultFolderPath(input: string | undefined): boolean {
	const raw = (input ?? "").trim();
	if (raw === "" || raw === "/" || raw === "./") return false;

	if (/^[A-Za-z]:[\\/]/.test(raw)) return true;

	const normalized = normalizeVaultFolderPath(raw);
	if (normalized === "") return false;

	const segments = normalized.split("/");
	return segments.some((segment) => segment === "..");
}

/**
 * Builds a final vault file path from folder + fileName.
 */
export function buildVaultFilePath(folder: string, fileName: string): string {
	const normalizedFolder = normalizeVaultFolderPath(folder);
	const normalizedFileName = fileName.trim();

	if (!normalizedFolder) return `${normalizedFileName}.md`;
	return `${normalizedFolder}/${normalizedFileName}.md`;
}

/**
 * Normalizes a settings path value to a canonical folder representation.
 *
 * - Root aliases ("", "/", "./") become "".
 * - Non-root values always end with "/".
 */
export function normalizeSettingsOutputFolder(
	input: string | undefined,
): string {
	const normalized = normalizeVaultFolderPath(input);
	if (!normalized) return "";
	return normalized.endsWith("/") ? normalized : `${normalized}/`;
}
