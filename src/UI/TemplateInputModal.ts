/**
 * Template input modal for collecting user data before template execution.
 */
import {
	Modal,
	Setting,
	TextComponent,
	TextAreaComponent,
	ToggleComponent,
	DropdownComponent,
	Notice,
	KeymapEventHandler,
} from "obsidian";
import FT_Plugin from "../main.js";
import {
	FT_DomEventId,
	ExecuteTemplateEvent,
	OpenInputModalEvent,
	ExtendedSettings,
	type CreateType,
	type TemplateField,
	TemplateCacheEntry,
} from "../Shared.js";
import { FT_BuildInFields } from "../BuildIn.js";
import {
	LinkSuggest,
	overrideVaultFileName,
	TagSuggest,
	TemplateStatusView,
} from "./utils.js";
import {
	buildVaultFilePath,
	capitalize,
	isUnsafeVaultFolderPath,
	normalizeVaultFolderPath,
	parseCsvStringList,
} from "../utils.js";
import { FT_TemplateProcessor } from "../TemplateProcessing.js";
import { computedRef, Computed, ref, Reactive } from "./Signals.js";
import { validateDateString } from "../Dates.js";

/**
 * Modal dialog that collects user input for filling out a template before writing the generated note.
 *
 * Opened via {@link OpenInputModalEvent} with an {@link ExtendedSettings} (containing the compiled template,
 * its metadata, and the pre-populated data record)(controlling whether/how the active editor selection is replaced).
 */
export class FT_TemplateInputModal extends Modal {
	_plugin: FT_Plugin;

	private _processor?: FT_TemplateProcessor;
	private _targetTemplate?: TemplateCacheEntry;
	private _settings?: ExtendedSettings;
	private _busAbort = new AbortController();
	private _status: TemplateStatusView;

	private _fields: Map<string, TemplateField>;
	private _fieldElements: HTMLElement[] = [];

	/* ----------------------------- Field Shortcuts ---------------------------- */

	private _fieldShortcutHandlers: KeymapEventHandler[] = [];

	/* ------------------------- Dynamic Path Resolution ------------------------ */

	private _destination: Computed<string>;
	private _nameRef: Reactive<string>;
	private _pathRef: Reactive<string>;
	private _destinationUnsubscribe?: () => void;

	private _mustResolveName: boolean = false;
	private _nameIsResolved: boolean = false;
	private _nameTemplate?: string;
	private _destinationInfoNameFields?: Record<string, string>;
	private _destinationInfo_RenderName?: (
		data: Record<string, unknown>,
	) => string;

	private _mustResolvePath: boolean = false;
	private _pathIsResolved: boolean = false;
	private _pathTemplate?: string;
	private _destinationInfoPathFields?: Record<string, string>;
	private _destinationInfoRenderPath?: (
		data: Record<string, unknown>,
	) => string;

	/* -------------------------------------------------------------------------- */

	constructor(plugin: FT_Plugin) {
		super(plugin.app);
		this._plugin = plugin;
		this._status = new TemplateStatusView(this.modalEl, this.contentEl);
		this._fields = new Map();
		this._nameRef = ref("");
		this._pathRef = ref("");
		this._destination = computedRef([this._pathRef, this._nameRef], () =>
			buildVaultFilePath(this._pathRef.value, this._nameRef.value),
		);

		// Command Trigger Stage -> Input Gathering Stage
		this._plugin.eventBus.addEventListener(
			FT_DomEventId.openInputModal,
			(event: OpenInputModalEvent) => {
				const { targetTemplate, processor, globalSettings } = event.detail;

				this._processor = processor;
				this._targetTemplate = targetTemplate;
				this._settings = globalSettings;

				this.preRender();
				super.open();
			},
			{ signal: this._busAbort.signal },
		);
	}

	destroy(): void {
		this._destinationUnsubscribe?.();
		this._destination.destroy();
		this._busAbort.abort();
	}

	onClose() {
		//Reset States
		const { contentEl, titleEl } = this;
		titleEl.empty(); //Garbage Collected
		contentEl.empty(); //Garbage Collected
		this._destinationUnsubscribe?.();
		this._destinationUnsubscribe = undefined;
		this._settings = undefined;
		this.clearFieldShortcuts();
		this._fieldElements = [];
		this._fields = new Map();
	}

	preRender(): void {
		/* -------------------------------------------------------------------------- */
		/*                            Input Gathering Stage                           */
		/* -------------------------------------------------------------------------- */

		if (!this._processor) return;
		if (!this._settings) return;

		/* -------------------------------------------------------------------------- */
		/*                             Dynamic Output Name                            */
		/* -------------------------------------------------------------------------- */

		// Reset State, just in case.
		this._destinationInfoNameFields = {};
		this._destinationInfo_RenderName = undefined;
		this._destinationInfoPathFields = {};
		this._destinationInfoRenderPath = undefined;
		this._nameIsResolved = false;
		this._pathIsResolved = false;

		// Dinamic Name
		this._mustResolveName = this._processor.isValidTemplate(
			this._settings.temptativeFileName,
		);
		if (this._mustResolveName) {
			console.info("Filename must be resolved");
			this._nameTemplate = this._settings?.temptativeFileName;
			this._nameIsResolved = false;
			const res = this._processor.prepareTemplate(this._nameTemplate);
			if (!res.ok) {
				console.error(res.error);
			} else {
				const { fieldNames, render } = res.value;
				this._destinationInfoNameFields = fieldNames;
				this._destinationInfo_RenderName = render;
			}
		} else {
			this._settings.outputFileName = this._settings.temptativeFileName;
		}

		// Dinamic Path
		const rawBaseOutputPath = this._settings.temptativeOutputFolder;
		const normalizedBaseOutputPath =
			normalizeVaultFolderPath(rawBaseOutputPath);
		if (isUnsafeVaultFolderPath(rawBaseOutputPath)) {
			console.warn(
				`Unsafe default output path '${rawBaseOutputPath}' detected. Falling back to vault root.`,
			);
			this._settings.temptativeOutputFolder = "";
		} else {
			this._settings.temptativeOutputFolder = normalizedBaseOutputPath;
		}

		this._mustResolvePath = this._processor.isValidTemplate(
			this._settings.temptativeOutputFolder,
		);
		if (this._mustResolvePath) {
			console.info("Directory must be resolved");
			this._pathTemplate = this._settings.temptativeOutputFolder;
			this._pathIsResolved = false;

			const res = this._processor.prepareTemplate(this._pathTemplate);
			if (!res.ok) {
				console.error(res.error);
			} else {
				const { fieldNames, render } = res.value;
				this._destinationInfoPathFields = fieldNames;
				this._destinationInfoRenderPath = render;
			}
		} else {
			this._settings.outputDirectory = this._settings.temptativeOutputFolder;
			this._pathIsResolved = true;
		}

		// Sync reactive refs with current output values before rendering UI.
		this._nameRef.value =
			this._settings.outputFileName || this._settings.temptativeFileName;
		this._pathRef.value = this._mustResolvePath
			? this._settings.temptativeOutputFolder
			: this._settings.outputDirectory;

		//A nice Builder Pattern Here
		this.addHeader()
			.addBody()
			.addInfoSection()
			.addFieldsSection()
			.addReplacementSection()
			.addCreateOpenSection()
			.addSubmitSection();

		//Register Field Shortcuts & focus first field
		this.registerFieldShortcuts();
	}

	addHeader(): this {
		this.modalEl.addClass("from-template-modal");
		this.titleEl.createEl("h4", {
			text: "Create from Template",
			cls: "from-template-title",
		});
		return this;
	}

	addBody(): this {
		//TODO: This needs rework, its using a TemplateStatusView that hides elements constructed.
		this._status.setNeutral();
		return this;
	}

	addInfoSection(): this {
		/* -------------------------- Source Template info -------------------------- */
		const templateRow = this.contentEl.createDiv({
			cls: [
				"from-template-control-row",
				"from-template-control-row-minimal-space",
			],
		});

		templateRow
			.createDiv({
				cls: "from-template-description-column",
			})
			.createDiv({
				text: "Template:",
				cls: ["from-template-sublabel"],
			});

		templateRow
			.createDiv({
				cls: "from-template-control-column",
			})
			.createSpan({
				text: `${this._targetTemplate?.meta.path}`,
				cls: ["from-template-subcontrol"],
			});

		/* ------------------------- Source Destination info ------------------------ */
		const destinationRow = this.contentEl.createDiv({
			cls: [
				"from-template-control-row",
				"from-template-control-row-minimal-space",
			],
		});
		destinationRow
			.createDiv({
				cls: "from-template-description-column",
			})
			.createDiv({
				text: "Destination:",
				cls: ["from-template-sublabel"],
			});

		const destinationValueContainer = destinationRow.createDiv({
			cls: "from-template-control-column",
		});

		// this._destination = new Reactive(`${this._settings?.temptativeOutputFolder}/${this._settings?.temptativeFileName}.md`);
		const destinationField = destinationValueContainer.createSpan({
			text: this._destination.value,
			cls: ["from-template-subcontrol", "from-template-code-span"],
		});
		this._destinationUnsubscribe?.();
		this._destinationUnsubscribe = this._destination.subscribe((value) => {
			destinationField.setText(value);
		});

		destinationRow
			.createDiv({
				cls: "from-template-key-column",
			})
			.createDiv({
				text: "⌘+",
				cls: "from-template-shortkey",
			});

		this.addSeparator();

		return this;
	}

	addFieldsSection(): this {
		const settings = this._settings;
		if (!settings) return this;

		const isFilled = (v: string) => v.trim().length > 0;
		const toPartialData = (fields: Record<string, string>) =>
			Object.fromEntries(
				Object.entries(fields).map(([k, v]) => [
					k,
					isFilled(v) ? v : `{{${k}}}`,
				]),
			);
		const allFilled = (fields: Record<string, string>) =>
			Object.values(fields).every((v) => isFilled(v));

		/**
		 * Updates the template data field and triggers dynamic name/path resolution.
		 */
		const updateFieldValue = (
			id: string,
			newValue: string,
			oldValue: string,
		) => {
			settings.textReplacement_data[id] = newValue; //TODO: Maybe blow this up.

			const fieldData = this._fields.get(id);
			if (fieldData) {
				fieldData.value = newValue;
				this._fields.set(id, fieldData);
			}
			this._status.setNeutral();

			if (!this._settings) return;

			/* -------------------------------------------------------------------------- */
			/*                        DINAMIC DESTINATION PATH/NAME                       */
			/* -------------------------------------------------------------------------- */

			// Dinamic Resolution of Output File Name.
			if (
				this._mustResolveName &&
				this._destinationInfoNameFields &&
				this._nameTemplate &&
				this._destinationInfo_RenderName
			) {
				/** If current field is part of _destinationInfoNameFields */
				const isPartOfName = this._destinationInfoNameFields[id] != undefined;
				if (isPartOfName) {
					let validName = newValue;
					const attempt = overrideVaultFileName(newValue);
					if (!attempt.ok && attempt.error.cause.current) {
						//Drop a notification to the user, use normalized value instead.
						new Notice(attempt.error.message);
						validName = attempt.error.cause.current;
					}
					this._destinationInfoNameFields[id] = validName;
					const name = this._destinationInfo_RenderName(
						toPartialData(this._destinationInfoNameFields),
					);
					this._settings.outputFileName = name;
					this._nameRef.value = name;
					this._nameIsResolved = allFilled(this._destinationInfoNameFields);
				}
			}

			//Resolve path
			if (
				this._mustResolvePath &&
				this._pathTemplate &&
				this._destinationInfoPathFields &&
				this._destinationInfoRenderPath
			) {
				const isPartOfPath = this._destinationInfoPathFields[id] !== undefined;
				if (isPartOfPath) {
					this._destinationInfoPathFields[id] = newValue;
					const renderedPath = this._destinationInfoRenderPath(
						toPartialData(this._destinationInfoPathFields),
					);
					const safePath = isUnsafeVaultFolderPath(renderedPath)
						? ""
						: normalizeVaultFolderPath(renderedPath);

					if (
						safePath === "" &&
						renderedPath.trim() !== "" &&
						isUnsafeVaultFolderPath(renderedPath)
					) {
						console.warn(
							`Unsafe dynamic output path '${renderedPath}' detected. Falling back to vault root.`,
						);
					}

					this._settings.outputDirectory = safePath;
					this._pathRef.value = safePath;
					this._pathIsResolved = allFilled(this._destinationInfoPathFields);
				}
			}
		};
		const focusNextField = (index: number) => {
			let next = index + 1;
			if (next > this._fieldElements.length - 1) next = 0;
			this._fieldElements[next]?.focus();
		};

		/* -------------------------------------------------------------------------- */
		/*                               FIELDS HANDLING                              */
		/* -------------------------------------------------------------------------- */

		// console.debug("INCOMING FIELD MAP: \n", settings.fields);
		this._fields = new Map(settings.fields);

		for (const [id, field] of this._fields.entries()) {
			const initialValue = field.value ?? "";
			settings.textReplacement_data[id] = initialValue;
			updateFieldValue(id, initialValue, initialValue);
		}

		let order = 0;
		this._fields.forEach((field, fieldID) => {
			if (field.inputType === "no-render") return;

			const controlEl = this.contentEl.createEl("div", {
				cls: "from-template-control-row",
			});
			const labelContainer = controlEl.createEl("label", {
				cls: "from-template-description-column",
			});
			labelContainer.createEl("label", {
				text: `${capitalize(field.id)}`,
				cls: "from-template-label-text",
			});
			if (field.description && field.description.length > 0)
				labelContainer.createDiv({
					text: field.description,
					cls: "from-template-label-description",
				});
			labelContainer.htmlFor = field.id;

			const controlWrapper: HTMLDivElement = controlEl.createEl("div", {
				cls: "from-template-control-column",
			});

			//Input Controls
			const element = this.createInputControl(
				controlWrapper,
				field,
				updateFieldValue,
				focusNextField,
				order,
			);

			this._fields.set(field.id, field);

			this._fieldElements.push(element);
			const keyEl = controlEl.createEl("div", {
				cls: "from-template-key-column",
			});

			if (order > 7) return; //We only count the first 8 valid Elements.
			if (element) {
				if (order === 0) element.focus();
				element.addClass("from-template-control");
				if (order <= 8) {
					keyEl.createEl("div", {
						text: `${order + 1}`,
						cls: "from-template-shortkey",
					});
				}
				order++;
			}
		});

		return this;
	}

	private selectField(index: number) {
		if (index >= 0 && index < this._fieldElements.length) {
			this._fieldElements[index]?.focus();
		}
	}

	private addReplacementSection(): this {
		const options = this._settings;
		if (!options) return this;

		this.addSeparator();

		//Añadimos un h2 "Source Text Replacement"
		this.contentEl.createEl("h5", {
			text: "Source Text Replacement",
			cls: "from-template-section-title",
		});

		/* ----------------------------- Replace toogle ----------------------------- */

		//Turn on-of replacement
		options.isSelectionReplacementEnabled = false;
		if (
			options.selectionReplacementPolicy === "always" ||
			(options.selectionReplacementPolicy === "selected-only" &&
				options.editorSelection.length > 0)
		)
			options.isSelectionReplacementEnabled = true;
		new Setting(
			this.contentEl.createDiv({ cls: "from-template-control-row-undivided" }),
		)
			.setName("Replace selected text")
			.addToggle((toggle) =>
				toggle
					.setValue(options.isSelectionReplacementEnabled)
					.onChange((value) => {
						options.isSelectionReplacementEnabled = value;
						replacementText.setDisabled(!value);
					}),
			);

		/* ------------------------------- FieldNames ------------------------------- */

		const fieldNames: string[] = [
			...new Set([
				...parseCsvStringList(options.rawInputFieldList),
				...Array.from(FT_BuildInFields.values())
					.filter((field) => field.replaceOnly)
					.map((field) => field.id),
			]),
		];

		const availableFieldsRow = this.contentEl.createDiv({
			cls: ["from-template-control-row"],
		});
		const availableFieldsLabel = availableFieldsRow.createDiv({
			cls: "from-template-description-column",
		});
		availableFieldsLabel.createDiv({
			text: "Available fields:",
			cls: ["from-template-sublabel"],
		});
		availableFieldsLabel.createDiv({
			text: "for replacement string",
			cls: ["from-template-label-description"],
		});
		const availableFields = availableFieldsRow.createDiv({
			cls: "from-template-control-column",
		});

		fieldNames.forEach((fieldName) => {
			const button = availableFields.createEl("button", {
				text: fieldName,
				cls: ["from-template-inline-code-button"],
			});
			button.onClickEvent(() => {
				const token = `{{${fieldName}}}`;
				const currentValue = replacementText.getValue();
				if (currentValue.includes(token)) return;
				replacementText.setValue(currentValue + token);
				options.textReplacement_Pattern = replacementText.getValue();
			});
		});

		/* ----------------------------- Replacement Row ---------------------------- */
		const replacementRow = this.contentEl.createDiv({
			cls: ["from-template-control-row"],
		});
		replacementRow
			.createDiv({
				cls: "from-template-description-column",
			})
			.createDiv({
				text: "Replacement:",
				cls: ["from-template-sublabel"],
			});

		// Crear primero el div de la columna
		const replacementColumn = replacementRow.createDiv({
			cls: "from-template-control-column",
		});

		//Rellenar options.textReplacement_Pattern
		if (options.selectionReplacementTemplates) {
			options.textReplacement_Pattern = options.selectionReplacementTemplates;
		}
		// console.log(options.textReplacement_Pattern); // * Uses template definition if aviable.

		// Luego crear el TextComponent usando ese div
		const replacementText = new TextComponent(replacementColumn)
			.setValue(options.textReplacement_Pattern)
			.onChange((value) => {
				options.textReplacement_Pattern = value;
			})
			.setDisabled(!options.isSelectionReplacementEnabled);
		// Asegurar la clase en el input
		replacementText.inputEl.addClass("from-template-subcontrol");

		return this;
	}

	private addCreateOpenSection(): this {
		const finalSettings = this._settings;
		if (!finalSettings) return this;

		this.addSeparator();

		new Setting(
			this.contentEl.createDiv({ cls: "from-template-control-row-undivided" }),
		)
			.setName("Create and open note")
			.setDesc("Should the note be created / opened?")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("none", "Don't create")
					.addOption("create", "Create, but don't open")
					.addOption("open", "Create and open")
					.addOption("open-pane", "Create and open in new pane")
					.addOption("open-tab", "Create and open in new tab")
					.setValue(finalSettings!.outputNoteHandling)
					.onChange((value) => {
						finalSettings!.outputNoteHandling = value as CreateType;
					});
			});

		return this;
	}

	addSubmitSection(): this {
		const finalSettings = this._settings;
		if (!finalSettings) return this;

		this.addSeparator();

		const row = this.contentEl.createDiv({ cls: "from-template-control-row" });
		row.createDiv({ cls: "from-template-description-column" });

		// Execute Template Event
		const submit = async () => {
			try {
				const normalizedTargetPath = normalizeVaultFolderPath(
					finalSettings.outputDirectory,
				);
				if (isUnsafeVaultFolderPath(finalSettings.outputDirectory)) {
					console.warn(
						`Unsafe output path '${finalSettings.outputDirectory}' detected on submit. Falling back to vault root.`,
					);
					finalSettings.outputDirectory = "";
					this._pathRef.value = "";
				} else {
					finalSettings.outputDirectory = normalizedTargetPath;
				}

				if (this._mustResolveName && !this._nameIsResolved) {
					new Notice("Destination Name is not resolved yet");
					return;
				}
				if (this._mustResolvePath && !this._pathIsResolved) {
					new Notice("Destination Path is not resolved yet");
					return;
				}

				finalSettings.fields = this._fields;

				for (const [id, field] of this._fields.entries()) {
					if (id === "tags") continue;
					finalSettings.textReplacement_data[id] = field.value ?? "";
				}

				const tags = this._fields.get("tags");
				if (tags) {
					const outputTagList = parseCsvStringList(tags.value);
					console.debug(
						"Input Field tags",
						tags,
						" Converting to:",
						outputTagList,
					);
					finalSettings.textReplacement_data["tags"] = outputTagList;
				}

				this._plugin.eventBus.dispatchEvent(
					new ExecuteTemplateEvent({
						templateId: finalSettings.templateMetadata.id,
						finalSettings,
						inputData: { ...finalSettings.textReplacement_data },
					}),
				);
				this.close();
			} catch (error) {
				console.debug("Unhandled error dispatching template event", error);
				this._status.setError(
					error instanceof Error ? error.message : String(error),
				);
			}
		};

		row
			.createDiv({ cls: "from-template-control-column" })
			.createEl("button", { text: "Add", cls: "from-template-submit" })
			.addEventListener("click", () => {
				void submit();
			});

		row
			.createDiv({ cls: "from-template-key-column" })
			.createDiv({ text: "↩", cls: "from-template-shortkey" });

		this.scope.register(["Mod"], "enter", () => {
			void submit();
		});

		return this;
	}

	private addSeparator(): void {
		this.contentEl.createEl("hr", { cls: "from-template-section-sep" });
	}

	createInputControl(
		controlEl: HTMLElement, // Root Element.
		field: TemplateField,
		UpdateFieldValue: (key: string, newValue: any, oldValue: any) => void,
		ProceedToNextField: (i: number) => void,
		index: number,
	): HTMLElement {
		try {
			let textEl = controlEl.createDiv();
			const inputType = field.inputType;
			const name = field.id;

			switch (inputType) {
				case "text": {
					// console.debug(`Creating a text element for ${field.id}, with default value: "${field.default}"\n`, field);
					const updateValue = (newValue: string) => {
						// console.debug(`currentValue: ${textComponent.getValue()}`);
						UpdateFieldValue(name, newValue, newValue);
					};
					const defaultValue = field.value ?? (field.args ? field.args[0] : "");
					const textComponent = new TextComponent(controlEl)
						.setValue(defaultValue)
						.onChange(updateValue);
					textComponent.inputEl.size = 50;

					textEl = textComponent.inputEl;
					textEl.onkeydown = (ev: KeyboardEvent) => {
						if (ev.code === "Enter") {
							UpdateFieldValue(name, textComponent.getValue(), "");
							if (!ev.ctrlKey) ProceedToNextField(index);
						}
					};
					if (this._plugin.settings?.enableInputSuggestions) {
						if (name === "tags")
							new TagSuggest(textEl as HTMLInputElement, this.app, updateValue);
						else
							new LinkSuggest(
								textEl as HTMLInputElement,
								this.app,
								updateValue,
							);
					}
					return textEl;
				}

				case "area": {
					const value = field.value ?? (field.args ? field.args[0] : "");

					const textAreaEl = new TextAreaComponent(controlEl)
						.setValue(value)
						.onChange((value) => UpdateFieldValue(name, value, "")); //TODO: Fix oldValue
					textAreaEl.inputEl.rows = 5;
					const areaEl = textAreaEl.inputEl;
					areaEl.onkeydown = (ev: KeyboardEvent) => {
						if (!ev.shiftKey && ev.code === "Enter") {
							ProceedToNextField(index);
						}
					};
					return textAreaEl.inputEl;
				}

				case "choice": {
					if (!field.args) return controlEl;
					const value = field.value ?? (field.args ? field.args[0] : "");

					const opts: Record<string, string> = {};
					field.args.forEach((f) => (opts[f] = capitalize(f)));
					const dropDown = new DropdownComponent(controlEl)
						.addOptions(opts)
						.setValue(value)
						.onChange((value) => UpdateFieldValue(name, value, ""));
					return dropDown.selectEl;
				}

				case "multi": {
					if (!field.args) return controlEl;
					const selected: string[] = [];
					const spanEl = controlEl.createSpan();
					field.args.forEach((f) => {
						const d = spanEl.createDiv({ text: f });
						new ToggleComponent(d).setTooltip(f).onChange((value) => {
							if (value) selected.push(f);
							else selected.remove(f);
							UpdateFieldValue(name, selected.join(", "), "");
						});
					});
					return spanEl;
				}

				//Special case {{date&time}} standart Obsidian format.
				//For inserting arbitrary dates use {{date}} by declaring it in template-input.
				case "currentDate": {
					const textComponent = new TextComponent(controlEl)
						.setValue(field.value)
						.onChange((value) => {
							UpdateFieldValue(name, value, value);
						});
					textComponent.inputEl.size = 50;

					textComponent.inputEl.onblur = () => {
						const validation = validateDateString(textComponent.getValue());
						if (!validation.ok) {
							new Notice(`Invalid date: ${validation.error.message}`, 8000);
							textComponent.setValue(field.default);
							UpdateFieldValue(name, field.default, field.default);
						}
					};

					textComponent.inputEl.onkeydown = (ev: KeyboardEvent) => {
						if (ev.code === "Enter") {
							textComponent.inputEl.blur();
							if (!ev.ctrlKey) ProceedToNextField(index);
						}
					};

					return textComponent.inputEl;
				}
			}
		} catch (error) {
			console.error(error);
		}

		return controlEl;
	}

	private registerFieldShortcuts(): void {
		this.clearFieldShortcuts(); // limpia anteriores antes de registrar

		for (let index = 0; index < 9; index++) {
			const handler = this.scope.register(["Mod"], `${index + 1}`, () => {
				const element = this._fieldElements[index];
				if (!element || !element.isConnected) return;
				element.focus();
			});
			this._fieldShortcutHandlers.push(handler);
		}
	}
	private clearFieldShortcuts(): void {
		for (const handler of this._fieldShortcutHandlers) {
			this.scope.unregister(handler);
		}
		this._fieldShortcutHandlers = [];
	}
}
