import { TemplateField } from "./Shared.js";

//IMPORTANT: Define all values.
/**
 * Central registry of all built-in template fields.
 *
 * This map is the single source of truth for predefined fields that the plugin
 * can inject or recognize without requiring per-template declarations.
 *
 * Key: stable field id used across parsing, UI, and replacement logic.
 * Value: {@link TemplateField} metadata consumed by input rendering and execution.
 *
 * Notes:
 * - Keys in a `Map` must be unique; later duplicates overwrite earlier entries.
 * - Fields marked with `replaceOnly: true` are intended for replacement contexts
 *   and can be skipped by UI input rendering.
 */
export const FT_BuildInFields = new Map<string, TemplateField>([
	[
		"title",
		{
			id: "title",
			value: "",
			default: "",
			inputType: "text",
			args: [""],
			description: "Main Title",
			replaceOnly: false,
		},
	],
	[
		"body",
		{
			id: "body",
			value: "",
			default: "",
			inputType: "area",
			args: [""],
			description: "The Note's content",
			replaceOnly: false,
		},
	],
	[
		"tags",
		{
			id: "tags",
			value: "",
			default: "",
			inputType: "text",
			args: [""],
			description: "",
			replaceOnly: false,
		},
	],
	[
		"templateResult",
		{
			id: "templateResult",
			value: "",
			default: "",
			inputType: "no-render",
			args: [""],
			description: "The Note's final content, includes all fields replaced",
			replaceOnly: true,
		},
	],
	[
		"filename",
		{
			id: "filename",
			value: "",
			default: "",
			inputType: "no-render",
			args: [""],
			description: "The final output filename without extension or path",
			replaceOnly: true,
		},
	],
	[
		"date&time",
		{
			id: "date&time",
			value: "now",
			default: "now",
			inputType: "no-render",
			args: ["yyyy-MM-dd'T'HH:mm"],
			description: "Current Date & Time (Obsidian YAML frontmatter compatible)",
			replaceOnly: true,
		},
	],
	[
		"date",
		{
			id: "date",
			value: "now",
			default: "now",
			inputType: "currentDate",
			args: ["yyyy-MM-dd"],
			description: "Current date",
			replaceOnly: true,
		},
	],
]);
