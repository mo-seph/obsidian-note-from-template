/**
 * Date processing helpers for Obsidian-compatible frontmatter values.
 *
 * Obsidian's DateValue.parseFromString expects an ISO 8601 date or date-time string:
 * https://docs.obsidian.md/Reference/TypeScript+API/DateValue/parseFromString#DateValue.parseFromString()+method
 *
 * This module accepts ISO-like input and can also return a user-facing Luxon-formatted string.
 */
import { DateTime } from "luxon";
import { Ok, Err, Result } from "./ErrorHandling.js"; // Adjust path as needed

/**
 * Converts an input date string into:
 * 1) a user-facing date string (optionally formatted with Luxon), and
 * 2) an Obsidian-safe ISO value for frontmatter.
 *
 * Supported inputs:
 * - "now": resolves to the current local date-time.
 * - compact numeric date "YYYYMMDD" (for example, "20240101").
 * - ISO 8601 date/date-time strings.
 *
 * @param ISO8601String Input date token.
 * @param userFormat Optional Luxon format for the user-facing output.
 * @param locale Locale used by Luxon when formatting the user-facing output.
 * @returns Object with userFriendlyDate and frontmatterSafeDate.
 */
export function processDate(
	ISO8601String: string,
	userFormat: string = "",
	locale: string = "en-US",
): { userFriendlyDate: string; frontmatterSafeDate: string } {
	const trimmed = ISO8601String.trim();

	// --- Special case: literal "now" ---
	if (trimmed.toLowerCase() === "now") {
		const now = DateTime.now(); // current local date-time
		const isoNow = now.toISO(); // full ISO 8601 value (for example: "2024-01-01T13:07:04.054-04:00")

		let luxonDate: string;
		if (userFormat) {
			luxonDate = now.setLocale(locale).toFormat(userFormat);
		} else {
			luxonDate = isoNow; // return ISO when no user format is provided
		}

		return {
			userFriendlyDate: luxonDate,
			frontmatterSafeDate: isoNow, // keep the resolved ISO value for frontmatter
		};
	}

	// --- Case: compact numeric literal (digits only, no separators) ---
	// Example: "20240101"
	if (/^\d{8}$/.test(trimmed)) {
		const isoDate = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
		const dt = DateTime.fromISO(isoDate);

		let luxonDate: string;
		if (userFormat) {
			luxonDate = dt.setLocale(locale).toFormat(userFormat);
		} else {
			luxonDate = trimmed; // keep "YYYYMMDD" as user-facing literal
		}

		return {
			userFriendlyDate: luxonDate,
			frontmatterSafeDate: isoDate, // "YYYY-MM-DD" is safe for Obsidian frontmatter
		};
	}

	// --- Standard case: ISO 8601 string (date only or date-time with optional offset) ---
	const dt = DateTime.fromISO(trimmed);
	if (!dt.isValid) {
		console.warn(`Invalid ISO 8601 string: ${trimmed}`);
		return { userFriendlyDate: "", frontmatterSafeDate: "" };
	}

	const frontmatterSafeDate = trimmed; // keep original value as-is (already ISO)

	let luxonDate: string;
	if (userFormat) {
		luxonDate = dt.setLocale(locale).toFormat(userFormat);
	} else {
		luxonDate = frontmatterSafeDate; // no user format: return original ISO value
	}

	return { userFriendlyDate: luxonDate, frontmatterSafeDate };
}

/**
 * Validates whether a string is "now" (case‑insensitive) or a valid ISO 8601 date/time string.
 * @param input - The string to validate.
 * @returns Result<string, Error> - Ok with the original string if valid, or Err with an Error describing the failure.
 */
export function validateDateString(input: string): Result<string, Error> {
	const trimmed = input.trim();

	// 1. "now" (case insensitive)
	if (/^now$/i.test(trimmed)) {
		return Ok(trimmed);
	}

	// 2. ISO 8601 patterns (extended and basic)
	// Extended date only: YYYY-MM-DD
	const isoDateExt = /^\d{4}-\d{2}-\d{2}$/;
	// Extended date+time: YYYY-MM-DDThh:mm:ss[.sss][Z|±hh:mm|±hhmm]
	const isoDateTimeExt =
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[\+\-]\d{2}:?\d{2})?$/;
	// Basic date only: YYYYMMDD
	const isoDateBasic = /^\d{8}$/;
	// Basic date+time: YYYYMMDDThhmmss[.sss][Z|±hhmm|±hh:mm]
	const isoDateTimeBasic = /^\d{8}T\d{6}(\.\d{1,3})?(Z|[\+\-]\d{2}:?\d{2})?$/;

	if (isoDateExt.test(trimmed)) {
		return Ok(trimmed);
	}
	if (isoDateTimeExt.test(trimmed)) {
		return Ok(trimmed);
	}
	if (isoDateBasic.test(trimmed)) {
		return Ok(trimmed);
	}
	if (isoDateTimeBasic.test(trimmed)) {
		return Ok(trimmed);
	}

	// 3. Detailed error analysis for common mistakes
	if (/[^0-9TZ+\-:. ]/i.test(trimmed)) {
		// Contains characters not allowed in ISO8601 or 'now'
		const invalidChars = trimmed.match(/[^0-9TZ+\-:. ]/g);
		return Err(
			new Error(
				`Invalid character(s): ${[...new Set(invalidChars)].join(", ")}`,
			),
		);
	}

	if (trimmed.includes("T")) {
		// Has 'T' but does not match the date+time pattern
		if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed) && !/^\d{8}T/.test(trimmed)) {
			return Err(
				new Error(
					"Invalid date format before 'T': expected YYYY-MM-DD or YYYYMMDD",
				),
			);
		}
		const afterT = trimmed.split("T")[1];
		if (
			afterT &&
			!/^\d{2}:\d{2}:\d{2}/.test(afterT) &&
			!/^\d{6}/.test(afterT)
		) {
			return Err(
				new Error("Invalid time format after 'T': expected hh:mm:ss or hhmmss"),
			);
		}
		return Err(new Error("Invalid overall date+time structure"));
	}

	// Validate length and numeric composition
	const digitsOnly = trimmed.replace(/[^0-9]/g, "");
	if (digitsOnly.length === 8) {
		return Err(
			new Error(
				"Invalid basic date format: expected 8 digits (YYYYMMDD), but the string contains disallowed separators",
			),
		);
	}
	if (digitsOnly.length === 14) {
		return Err(
			new Error(
				"Invalid basic datetime format: expected 14 digits (YYYYMMDDThhmmss)",
			),
		);
	}

	return Err(
		new Error(
			"Not 'now' nor a valid ISO 8601 string (supported formats: YYYY-MM-DD, YYYY-MM-DDThh:mm:ss[.sss][Z|±hh:mm], YYYYMMDD, YYYYMMDDThhmmss[.sss][Z|±hhmm])",
		),
	);
}
