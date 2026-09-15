/**
 * UI utility classes and helpers for the FromTemplate plugin.
 * Includes status view, builder components, and text suggestion helpers.
 */

import {
	AbstractInputSuggest,
	type App,
	type SearchResult,
	prepareFuzzySearch,
} from "obsidian";
import {
	Success,
	Failed,
	OverrideResult,
	OverrideOption,
} from "../ErrorHandling.js";

export class TemplateStatusView {
	private readonly statusEl: HTMLElement;

	constructor(
		private readonly modalEl: HTMLElement,
		rootEl: HTMLElement,
	) {
		this.statusEl = rootEl.createDiv({
			text: "",
			cls: "from-template-error-text",
		});
		this.setNeutral();
	}

	setError(message: string): void {
		this.modalEl.addClass("from-template-Error");
		this.statusEl.removeAttribute("hidden");
		this.statusEl.setText(message);
	}

	setWarning(message: string): void {
		this.modalEl.addClass("from-template-Warning");
		this.statusEl.removeAttribute("hidden");
		this.statusEl.setText(message);
	}

	setNeutral(): void {
		this.modalEl.removeClass("from-template-Error");
		this.modalEl.removeClass("from-template-Warning");
		this.statusEl.setAttribute("hidden", "true");
	}
}

export abstract class AddTextSuggest extends AbstractInputSuggest<string> {
	content: string[];
	targetMatch = /^(.*),\s*([^,]*)/;

	constructor(
		private inputEl: HTMLInputElement,
		app: App,
		private onSelectCb: (value: string) => void = (v) => {},
	) {
		super(app, inputEl);
		this.content = this.getContent();
	}

	getSuggestions(inputStr: string): string[] {
		return this.doFuzzySearch(this.getParts(inputStr)[1]);
	}

	getParts(input: string): [string, string] {
		const m = input.match(this.targetMatch);
		if (m) {
			return [m[1], m[2]];
		} else {
			return ["", input];
		}
	}

	doSimpleSearch(target: string): string[] {
		if (!target || target.length < 2) return [];
		const lowerCaseInputStr = target.toLocaleLowerCase();
		const t = this.content.filter((content) =>
			content.toLocaleLowerCase().contains(lowerCaseInputStr),
		);
		return t;
	}

	doFuzzySearch(target: string, maxResults = 20, minScore = -2): string[] {
		if (!target || target.length < 2) return [];

		const fuzzy = prepareFuzzySearch(target);

		return this.content
			.flatMap((content): [string, SearchResult][] => {
				const result = fuzzy(content);
				return result ? [[content, result]] : [];
			})
			.filter(([, result]) => result.score > minScore)
			.sort(([, a], [, b]) => b.score - a.score)
			.map(([c]) => c)
			.slice(0, maxResults);
	}

	renderSuggestion(content: string, el: HTMLElement): void {
		el.setText(content);
	}

	selectSuggestion(content: string, _evt: MouseEvent | KeyboardEvent): void {
		const [head, _tail] = this.getParts(this.inputEl.value);
		if (head.length > 0) {
			this.onSelectCb(head + ", " + content);
			this.inputEl.value = head + ", " + this.wrapContent(content);
		} else {
			this.onSelectCb(content);
			this.inputEl.value = this.wrapContent(content);
		}
		this.inputEl.dispatchEvent(new Event("change"));
		this.inputEl.setSelectionRange(0, 1);
		this.inputEl.setSelectionRange(
			this.inputEl.value.length,
			this.inputEl.value.length,
		);
		this.inputEl.focus();
		this.close();
	}

	wrapContent(content: string): string {
		return content;
	}

	abstract getContent(): string[];
}

export class TagSuggest extends AddTextSuggest {
	getContent() {
		// @ts-expect-error - this is an undocumented function...
		const tagMap: Map<string, any> = this.app.metadataCache.getTags();
		return Object.keys(tagMap).map((k) => k.replace("#", ""));
	}
}

export class LinkSuggest extends AddTextSuggest {
	getContent() {
		return this.app.vault
			.getFiles()
			.filter((f) => f.extension === "md")
			.map((f) => f.basename);
	}

	getSuggestions(inputStr: string): string[] {
		const target = this.getParts(inputStr)[1];
		const m = target.match(/\s*\[\[(.*)/);
		if (!m || m.length < 2 || m[1].length < 1) return [];
		const newTarget = m[1];
		return this.doFuzzySearch(newTarget);
	}

	wrapContent(content: string): string {
		return `[[${content}]]`;
	}
}
//? Should we maintain these on master? I think these experiments should be keept on branches.
/* Experiment towards making a UI that turns suggestions in to visually distinct elements
export class ContentEditableTest extends Modal {
    editDiv:HTMLDivElement

    async onOpen() {
		let {contentEl} = this; 
        contentEl.createEl("h4",{text:"ContentEditable"})
        this.editDiv = contentEl.createEl("div",{text:"Edit me"})
        this.editDiv.setAttribute("contenteditable","true")
        this.addElement("hello","from-template-text-completion-a")
        this.addElement("there","from-template-text-completion-b")

    }

    addElement(tx:string, cls:string) {
        const el = this.editDiv.createSpan(cls)
        el.setText(tx)
        const but = el.createEl("button")
        but.setText("X")
        but.onclick = () => el.detach()
    }
}
*/

/**
 * Validates whether a tentative vault file name contains illegal characters.
 *
 * Returns a successful override result with the original name when valid.
 * Returns a failed override result when invalid, including the attempted value
 * in the error cause for downstream diagnostics.
 *
 * Illegal characters: : [ ] ? / \\
 *
 * @param temptativeFileName Candidate file name to validate.
 * @returns OverrideResult<string> success with the original name, or failure with context.
 *
 * @example
 * const ok = overrideVaultFileName("Daily Note");
 * if (ok.ok) console.log(ok.value);
 *
 * @example
 * const fail = overrideVaultFileName("Daily:Note");
 * if (!fail.ok) console.log(fail.error.cause.attempted);
 */
export function overrideVaultFileName(
	temptativeFileName: string,
): OverrideResult<string> {
	const BAD_CHARS_FOR_FILENAMES_TEXT = ":[]?/\\";
	const BAD_CHARS_FOR_FILENAMES_MATCH = /[:[\]?/\\]/g;

	//const exp = new RegExp(BAD_CHARS_FOR_FILENAMES_MATCH);
	// const containsIllegalCharacters = exp.test(temptativeFileName);
	const matches = Array.from(
		temptativeFileName.matchAll(BAD_CHARS_FOR_FILENAMES_MATCH),
		(match) => ({
			char: match[0],
			index: match.index ?? -1,
		}),
	);

	if (matches.length > 0) {
		const matchedCharacter = matches[0].char;
		/*
			We replace bad characters, collapse duplicates and trim.
			"hello:world" -> "hello_world"
			"a/b?c[d]\\e" -> "a_b_c_d_e"
		*/
		const normalized = temptativeFileName
			.replace(BAD_CHARS_FOR_FILENAMES_MATCH, "_")
			.replace(/_+/g, "_")
			.replace(/^_+|_+$/g, "")
			.trim();

		const overrideParams: OverrideOption<string> = {
			current: normalized,
			attempted: temptativeFileName,
		};

		return Failed(
			`Do not use ${matchedCharacter}, the following characters are forbidden for filenames: ${BAD_CHARS_FOR_FILENAMES_TEXT}`,
			overrideParams,
		);
	}

	return Success(temptativeFileName);
}
/**
 * Attempts to validate a file name and falls back to a default value on failure.
 *
 * This helper never returns a failed result: when validation fails, it returns
 * `Success(defaultValue)`.
 *
 * @param temptativeFileName Candidate file name to validate.
 * @param defaultValue Fallback value used when validation fails.
 * @returns OverrideResult<string> always in the success branch.
 */
export function overrideVaultFileNameOrDefault(
	temptativeFileName: string,
	defaultValue: string,
): OverrideResult<string> {
	const attempt = overrideVaultFileName(temptativeFileName);

	if (!attempt.ok) return Success(defaultValue);

	return attempt;
}
//? Should we Validate paths also?
// export function validateVaultPath(TemptativePath:string): boolean{
// 	return true;
// }
