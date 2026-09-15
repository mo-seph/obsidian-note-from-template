import {
	Plugin,
	App,
	TFolder,
	Notice,
	type Editor,
	type PluginManifest,
	type TFile,
} from "obsidian";
import { type iFT_PluginSettings } from "./Shared.js";
import {
	FT_SettingTab,
	FT_FolderCreateModal,
	FT_TemplateInputModal,
} from "./UI/index.js";
import { FT_TemplateProcessor } from "./TemplateProcessing.js";
import {
	containsFilenameToken,
	isUnsafeVaultFolderPath,
	normalizeVaultFolderPath,
} from "./utils.js";

export default class FT_Plugin extends Plugin {
	/**
	 * Plugin settings loaded from Obsidian's data store.
	 * Undefined until {@link loadSettings} is called during plugin initialization.
	 */
	settings: iFT_PluginSettings | undefined;
	/** Template processor responsible for managing and preparing templates. */
	processor: FT_TemplateProcessor;
	/** DOM event target used as the plugin-local event bus for template workflow events. */
	eventBus: HTMLDivElement;
	settingsTab: FT_SettingTab; //UI
	templateInputModal: FT_TemplateInputModal;
	folderCreateModal: FT_FolderCreateModal;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		console.debug(`Plugin Root (Vault) is ${this.app.vault.getRoot().path}`);
		// this.addedCommands = []; //Only command registered by
		this.eventBus = document.createElement("div");
		this.processor = new FT_TemplateProcessor(this);
		this.settingsTab = new FT_SettingTab(this);
		this.settings = undefined;

		/* ------------------------------- Obsidian UI ------------------------------ */

		this.folderCreateModal = new FT_FolderCreateModal(this);
		this.templateInputModal = new FT_TemplateInputModal(this);
	}

	async onload() {
		const settings = await this.loadSettings(); //Explict load settings from disk
		this.settings = settings;
		this.addSettingTab(this.settingsTab);

		this.addCommand({
			id: "reload",
			name: "Re-index Templates",
			callback: async () => {
				this.indexTemplates(settings);
			},
		});

		// Defer the folder check & template indexing until the workspace layout is ready.
		// During `onload` the vault index is not yet populated, so checkIfFolderExists
		// would incorrectly report existing folders as missing and open the settings
		// tab prematurely on every startup.
		// https://docs.obsidian.md/Reference/TypeScript+API/Workspace/onLayoutReady
		this.app.workspace.onLayoutReady(() => {
			if (!this.ensureTemplateDirectoryConfigured(settings)) {
				return;
			}
			this.indexTemplates(settings);
		});
	}

	async onunload() {
		this.removeCommand("reload");
		this.processor?.cleanCache();
		console.log("unloading plugin");
	}

	private ensureTemplateDirectoryConfigured(
		settings: iFT_PluginSettings,
	): boolean {
		//If templateDirectoryPath is invalid or does not exists, prevent user to continue and open settings.
		const folder = settings.templateDirectoryPath?.trim();
		const isMissing = !folder;
		const doesNotExist = folder ? !this.checkIfFolderExists(folder) : true;

		if (isMissing) {
			new Notice(
				"Template Directory is required. Configure it in the plugin settings before using Note From Template.",
				8000,
			);
		}

		if (doesNotExist) {
			new Notice(
				`Template Directory "${folder}" does not exist in the vault. Update it in the plugin settings before using Note From Template.`,
				8000,
			);
		}

		if (isMissing || doesNotExist) {
			(this.app as any).setting.open();
			(this.app as any).setting.openTabById(this.manifest.id);
			return false;
		}

		return true;
	}

	// Adds all the template commands - calls getTemplates which looks for files in the settings.templateDirectoryPath
	async indexTemplates(settings: iFT_PluginSettings) {
		const processor = this.processor;

		if (processor) {
			this.ensureTemplateDirectoryConfigured(settings);

			const loadResult = await processor.loadFromDefaultLocation(settings);
			if (!loadResult.ok) {
				console.error(loadResult.error.message);
				return;
			}
			const paths = Object.values(loadResult.value).map(
				({ meta }) => meta.path,
			);
			console.debug("Got templates:", paths.join(", "));
		}
		console.info("Templates Reloaded");
	}

	/**
	 * Checks whether the provided vault path currently resolves to an existing folder.
	 *
	 * This method only validates existence and type (`TFolder`) at the exact path.
	 * It does not create folders, normalize paths, or validate intermediate segments.
	 *
	 * @param folder - Vault-relative folder path to validate.
	 * @returns `true` when the path exists and is a folder; otherwise `false`.
	 */
	checkIfFolderExists(folder: string): boolean {
		return this.app.vault.getAbstractFileByPath(folder) instanceof TFolder;
	}

	async createFolderIfNeeded(folder: string) {
		const normalizedFolder = normalizeVaultFolderPath(folder);
		if (!normalizedFolder) return;

		if (isUnsafeVaultFolderPath(folder)) {
			console.warn(
				`Unsafe folder path '${folder}' detected while creating destination folder. Falling back to vault root.`,
			);
			return;
		}

		if (!this.checkIfFolderExists(normalizedFolder)) {
			await this.folderCreateModal.createDirectory(normalizedFolder);
			return;
		}

		// if (!)
		// 	throw new Error("Folder creation cancelled by user");
	}

	getCurrentSelection(editor?: Editor): string {
		if (editor) return editor.getSelection();
		const selection = window.getSelection();
		if (!selection) return "";
		// console.log("Got no Editor, getting from window: ",selection)
		return selection.toString();
	}

	replaceCurrentSelection(repl: string, editor?: Editor) {
		if (editor) {
			console.log("Got Editor");
			editor.replaceRange(
				repl,
				editor.getCursor("from"),
				editor.getCursor("to"),
			);
		} else {
			console.log("Got no Editor, putting text on clipboard: ", repl);
			navigator.clipboard.writeText(repl);
			//! https://developer.mozilla.org/en-US/docs/Web/API/Selection
			//const sel = window.getSelection()
			//const selText = sel.toString()
			//if( sel.anchorNode === sel.focusNode ) {
		}
	}

	openFile(file: TFile, mode: "current" | "tab" | "split") {
		if (mode === "current") {
			this.app.workspace.getLeaf(false).openFile(file);
			return;
		}

		this.app.workspace.getLeaf(mode).openFile(file);
	}

	/**
	 * Loads plugin settings from Obsidian's persisted plugin data and merges them
	 * with the default configuration.
	 *
	 * This method is intentionally side-effect free with respect to plugin setup:
	 * it only reads stored data and returns a fully populated settings object.
	 * Because of that, it can also be reused by external classes or helper
	 * functions that need access to the resolved settings without depending on
	 * the plugin object {@link FT_Plugin.settings}.
	 *
	 * @returns The resolved plugin settings, combining persisted values with defaults.
	 */
	async loadSettings(): Promise<iFT_PluginSettings> {
		const DEFAULT_SETTINGS: iFT_PluginSettings = {
			//NOTE: Comments are for how each field is displayed in settings pane

			templateDirectoryPath: "templates", //Template Directory
			selectionReplacementPolicy: "selected-only", //Replace Selection
			outputNoteHandling: "open", //Create and Open Note
			temptativeOutputFolder: "", //Default output Directory
			temptativeFileName: "{{title}}", //Default Template Name
			outputDirectory: "", //Efective Directory - if temptativeOutputFolder is a template, this is the final"resolved" value.
			outputFileName: "", //Efective Filename - if temptativeFileName is a template, this is the final "resolved" value.
			selectionReplacementTemplates: "{{filename}}", //Default Replacement String
			rawInputFieldList: "title,body", // Default Field List
			inputSplitPattern: "\\s+-\\s+", // Selection Split
			enableInputSuggestions: true, //Input Suggestions
			pluginConfigRaw: "[]", //Does not appear on UI (settings pane)
		};

		//If data file does not exists, this.loadData() returns null by default
		const fromDisk: any | null = await this.loadData();
		if (!fromDisk) {
			console.info("No previous data exists for this plugin, using defaults");
			return DEFAULT_SETTINGS;
		}

		const combinedDefaultSettings = await Object.assign(
			DEFAULT_SETTINGS,
			fromDisk,
		);

		if (containsFilenameToken(combinedDefaultSettings.temptativeFileName)) {
			console.warn(
				"Default Output Filename cannot contain {{filename}}. Falling back to '{{title}}'.",
			);
			combinedDefaultSettings.temptativeFileName = "{{title}}";
		}

		if (containsFilenameToken(combinedDefaultSettings.temptativeOutputFolder)) {
			console.warn(
				"Default Output Directory cannot contain {{filename}}. Falling back to vault root.",
			);
			combinedDefaultSettings.temptativeOutputFolder = "";
		}

		console.debug(`Default config is loaded:\n`, combinedDefaultSettings);

		return combinedDefaultSettings;
	}

	async saveSettings() {
		console.info("Config Saved");
		await this.saveData(this.settings);
	}
}
