import { Notice, PluginSettingTab, Setting } from "obsidian";
//Aviable: MarkdownView, Modal, normalizePath, Notice, Plugin, TextComponent, TFile, TFolder
import type {
	CreateType,
	iFT_PluginSettings,
	ReplacementStrategy,
} from "../Shared.js";
import FT_Plugin from "../main.js";
import { FT_TemplateProcessor } from "../TemplateProcessing.js";
import {
	containsFilenameToken,
	isUnsafeVaultFolderPath,
	normalizeSettingsOutputFolder,
} from "../utils.js";

export class FT_SettingTab extends PluginSettingTab {
	plugin: FT_Plugin;
	templateDirChanged: boolean = false;
	templateReloadPending: boolean = false;

	constructor(plugin: FT_Plugin) {
		super(plugin.app, plugin);
		this.plugin = plugin;
	}

	resetTracking() {
		this.templateDirChanged = false;
		this.templateReloadPending = false;
	}

	getDirectoryText(folder: string): [string, string, string] {
		const numFolders = this.plugin.processor?.countTemplates(folder);
		if (numFolders === undefined) {
			return [
				`⚠️ Directory to read templates from. '${folder}' does not exist`,
				"from-template-error-text",
				"from-template-ok-text",
			];
		} else {
			return [
				`✅ Directory to read templates from. '${folder}' has ${numFolders} templates`,
				"from-template-ok-text",
				"from-template-error-text",
			];
		}
	}

	hide(): void {
		console.debug("Settings panel closed");
		if (this.templateReloadPending && this.plugin.settings) {
			void this.plugin.indexTemplates(this.plugin.settings);
		}
		this.resetTracking();
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		console.debug(`Settings panel opened`);
		const pluginSettings: iFT_PluginSettings | undefined = this.plugin.settings;
		if (!pluginSettings) console.debug("No pluggin settings is aviable");
		const processor: FT_TemplateProcessor | undefined = this.plugin.processor;
		if (!processor) console.debug("No processor instance is loaded");

		containerEl.empty();
		containerEl.createEl("h2", { text: "Note From Template Settings" });

		const syncCurrentSettings = () => {
			this.plugin.settings = pluginSettings;
		};

		const saveIfChanged = async <T>(
			current: T,
			next: T,
			apply: () => void,
			options?: { triggerReload?: boolean },
		): Promise<boolean> => {
			if (current === next) return false;
			apply();
			if (options?.triggerReload) {
				this.templateReloadPending = true;
			}
			syncCurrentSettings();
			await this.plugin.saveSettings();
			return true;
		};

		const bindCommittedTextSetting = (
			text: {
				setValue: (value: string) => any;
				onChange: (cb: (value: string) => void) => any;
				inputEl: HTMLInputElement;
			},
			getCurrent: () => string,
			applyNext: (value: string) => void,
			options?: { triggerReload?: boolean },
		) => {
			let isSyncing = false;
			let pendingValue = getCurrent();

			const commitValue = async () => {
				if (isSyncing) return;
				const previous = getCurrent();
				const next = pendingValue;

				isSyncing = true;
				text.setValue(next);
				isSyncing = false;

				await saveIfChanged(
					previous,
					next,
					() => {
						applyNext(next);
					},
					options,
				);
			};

			text.setValue(pendingValue);
			text.onChange((value: string) => {
				if (isSyncing) return;
				pendingValue = value;
			});

			text.inputEl.addEventListener("blur", () => {
				void commitValue();
			});
			text.inputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
				if (ev.key !== "Enter") return;
				ev.preventDefault();
				void commitValue();
				text.inputEl.blur();
			});
		};

		//This is not saving
		const dirSetting = new Setting(containerEl)
			.setName("Template Directory")
			.setDesc("Directory to read templates from");

		// Finding the right template folder
		const updateFolderDescription = (folder: string) => {
			try {
				const [text, clss, r_clss] = this.getDirectoryText(folder);
				dirSetting.descEl.addClass(clss);
				dirSetting.descEl.removeClass(r_clss);
			} catch (error) {
				console.error(error);
			}
		};

		if (processor && this.plugin && pluginSettings) {
			pluginSettings.temptativeOutputFolder = normalizeSettingsOutputFolder(
				pluginSettings.temptativeOutputFolder,
			);

			const folders = processor.getTemplateFolders();

			const opts: Record<string, string> = {};
			folders.forEach(
				(f) =>
					(opts[f.location.path] =
						"-".repeat(f.depth - 1) +
						` ${f.location.name} (${f.numTemplates})`),
			);

			//Template Directory
			dirSetting.addDropdown((text) =>
				text
					//.setPlaceholder('templates')
					.addOptions(opts)
					.setValue(pluginSettings.templateDirectoryPath)
					.onChange(async (value) => {
						const previous = pluginSettings.templateDirectoryPath;
						this.templateDirChanged = previous !== value;
						updateFolderDescription(value);

						await saveIfChanged(
							previous,
							value,
							() => {
								pluginSettings.templateDirectoryPath = value;
							},
							{ triggerReload: true },
						);
					}),
			);

			updateFolderDescription(pluginSettings.templateDirectoryPath);

			new Setting(containerEl)
				.setName("Replace selection")
				.setDesc(
					"Should the current editor selection be replaced with a link to the title of the new Note?",
				)
				.addDropdown((toggle) =>
					toggle
						.addOption("always", "Always")
						.addOption("selected-only", "If Selected")
						.addOption("never", "Never")
						.setValue(pluginSettings.selectionReplacementPolicy)
						.onChange(async (value) => {
							const next = value as ReplacementStrategy;
							await saveIfChanged(
								pluginSettings.selectionReplacementPolicy,
								next,
								() => {
									pluginSettings.selectionReplacementPolicy = next;
								},
							);
						}),
				);

			new Setting(containerEl)
				.setName("Create and Open Note")
				.setDesc("Should a note be created and opened? If opened, in a pane?")
				.addDropdown((toggle) =>
					toggle
						.addOption("none", "Don't create note")
						.addOption("create", "Create but don't open")
						.addOption("open", "Create and Open")
						.addOption("open-pane", "Create and open in new pane")
						.addOption("open-tab", "Create and open in new tab")
						.setValue(pluginSettings.outputNoteHandling)
						.onChange(async (value) => {
							const next = value as CreateType;
							await saveIfChanged(
								pluginSettings.outputNoteHandling,
								next,
								() => {
									pluginSettings.outputNoteHandling = next;
								},
							);
						}),
				);
			new Setting(containerEl)
				.setName("Default Output Filename")
				.setDesc(
					"What to call notes if they have not specified {{template-filename}}.",
				)
				.addText((text) => {
					let isSyncing = false;
					let pendingValue = pluginSettings.temptativeFileName;

					const commitValue = async () => {
						if (isSyncing) return;
						const previous = pluginSettings.temptativeFileName;

						if (containsFilenameToken(pendingValue)) {
							new Notice(
								"Default Output Filename cannot contain {{filename}}. It was reset to {{title}}.",
							);
							const resetValue = "{{title}}";

							isSyncing = true;
							text.setValue(resetValue);
							pendingValue = resetValue;
							isSyncing = false;

							await saveIfChanged(
								previous,
								resetValue,
								() => {
									pluginSettings.temptativeFileName = resetValue;
								},
								{ triggerReload: true },
							);
							return;
						}

						isSyncing = true;
						text.setValue(pendingValue);
						isSyncing = false;

						await saveIfChanged(
							previous,
							pendingValue,
							() => {
								pluginSettings.temptativeFileName = pendingValue;
							},
							{ triggerReload: true },
						);
					};

					text.setPlaceholder("{{title}}");
					text.setValue(pluginSettings.temptativeFileName);
					text.onChange((value: string) => {
						if (isSyncing) return;
						pendingValue = value;
					});

					text.inputEl.addEventListener("blur", () => {
						void commitValue();
					});
					text.inputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
						if (ev.key !== "Enter") return;
						ev.preventDefault();
						void commitValue();
						text.inputEl.blur();
					});
				});
			new Setting(containerEl)
				.setName("Default Output Directory")
				.setDesc(
					'Where to put notes if they have not specified with {{template-output}}, Default value is "" (Your Vault\'s root)',
				)
				.addText((text) => {
					let isSyncing = false;
					let pendingValue = pluginSettings.temptativeOutputFolder;

					const commitValue = async () => {
						if (isSyncing) return;
						const previous = pluginSettings.temptativeOutputFolder;

						if (containsFilenameToken(pendingValue)) {
							new Notice(
								"Default Output Directory cannot contain {{filename}}. It was reset to vault root.",
							);
							const resetValue = "";

							isSyncing = true;
							text.setValue(resetValue);
							pendingValue = resetValue;
							isSyncing = false;

							await saveIfChanged(
								previous,
								resetValue,
								() => {
									pluginSettings.temptativeOutputFolder = resetValue;
								},
								{ triggerReload: true },
							);
							return;
						}

						if (isUnsafeVaultFolderPath(pendingValue)) {
							new Notice(
								"Invalid output path detected. It was reset to vault root.",
							);
							const resetValue = "";

							isSyncing = true;
							text.setValue(resetValue);
							pendingValue = resetValue;
							isSyncing = false;

							await saveIfChanged(
								previous,
								resetValue,
								() => {
									pluginSettings.temptativeOutputFolder = resetValue;
								},
								{ triggerReload: true },
							);
							return;
						}

						const normalized = normalizeSettingsOutputFolder(pendingValue);

						isSyncing = true;
						text.setValue(normalized);
						pendingValue = normalized;
						isSyncing = false;

						await saveIfChanged(
							previous,
							normalized,
							() => {
								pluginSettings.temptativeOutputFolder = normalized;
							},
							{ triggerReload: true },
						);
					};

					text.setValue(pluginSettings.temptativeOutputFolder);
					text.onChange((value: string) => {
						if (isSyncing) return;
						pendingValue = value;
					});

					text.inputEl.addEventListener("blur", () => {
						void commitValue();
					});
					text.inputEl.addEventListener("keydown", (ev: KeyboardEvent) => {
						if (ev.key !== "Enter") return;
						ev.preventDefault();
						void commitValue();
						text.inputEl.blur();
					});
				});
			new Setting(containerEl)
				.setName("Default replacement string")
				.setDesc(
					"What replacement string to use if the template has not specified using {{template-replacement}}",
				)
				.addText((text) => {
					bindCommittedTextSetting(
						text,
						() => pluginSettings.selectionReplacementTemplates,
						(value) => {
							pluginSettings.selectionReplacementTemplates = value;
						},
						{ triggerReload: true },
					);
				});
			new Setting(containerEl)
				.setName("Default field list")
				.setDesc(
					"What fields to expect if they template does not specify with {{template-input}}",
				)
				.addText((text) => {
					bindCommittedTextSetting(
						text,
						() => pluginSettings.rawInputFieldList,
						(value) => {
							pluginSettings.rawInputFieldList = value;
						},
						{ triggerReload: true },
					);
				});

			new Setting(containerEl)
				.setName("Selection split")
				.setDesc(
					'A regex to split up the input selection to fill in extra fields in the note creation box. Should default to "\\s+-\\s+"',
				)
				.addText((text) => {
					bindCommittedTextSetting(
						text,
						() => pluginSettings.inputSplitPattern,
						(value) => {
							pluginSettings.inputSplitPattern = value;
						},
						{ triggerReload: true },
					);
				});
			new Setting(containerEl)
				.setName("Input Suggestions")
				.setDesc(
					'Add suggestion support to text boxes. Will add suggestions for links when typing [[, and for tags for a field called "tags"',
				)
				.addToggle((toggle) =>
					toggle
						.setValue(pluginSettings.enableInputSuggestions)
						.onChange(async (value) => {
							await saveIfChanged(
								pluginSettings.enableInputSuggestions,
								value,
								() => {
									pluginSettings.enableInputSuggestions = value;
								},
							);
						}),
				);
		}
	}
}
