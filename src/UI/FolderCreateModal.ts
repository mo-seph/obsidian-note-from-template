/**
 * Modal for creating missing parent folders before note creation.
 * Handles user confirmation for folder structure creation.
 */

import { Modal } from "obsidian";
import FT_Plugin from "../main.js";

export class FT_FolderCreateModal extends Modal {
	private folderPath: string | null = null;
	private resolveFn: ((created: boolean) => void) | null = null;
	private rejectFn: ((reason?: unknown) => void) | null = null;

	constructor(plugin: FT_Plugin) {
		super(plugin.app);
	}

	createDirectory(folderPath: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			this.folderPath = folderPath;
			this.resolveFn = resolve;
			this.rejectFn = reject;
			this.open();
		});
	}

	private settle(result: boolean, error?: unknown) {
		const resolve = this.resolveFn;
		const reject = this.rejectFn;
		this.resolveFn = null;
		this.rejectFn = null;
		this.folderPath = null;
		if (error) {
			reject?.(error);
			return;
		}
		resolve?.(result);
	}

	async onOpen() {
		if (!this.folderPath) return;
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h4", { text: "Missing parent folder for note" });
		contentEl.createEl("div", {
			text: this.folderPath,
			cls: "from-template-error-text",
		});
		contentEl.createEl("hr");
		contentEl.createEl("div", {
			text: "This folder does not exist. Do you want to create it now?",
		});
		contentEl.createEl("hr");

		const accept = async () => {
			try {
				console.debug(`Folder: ${this.folderPath} will be created`);
				await this.app.vault.createFolder(this.folderPath!);
				this.settle(true);
			} catch (error) {
				this.settle(false, error);
			}
			this.close();
		};
		const cancel = () => {
			this.settle(false);
			this.close();
		};

		const submits = contentEl.createDiv();
		submits
			.createEl("button", { text: "Create" })
			.addEventListener("click", accept);
		submits
			.createEl("button", { text: "Don't Create" })
			.addEventListener("click", cancel);
	}

	onClose() {
		this.contentEl.empty();
		if (this.resolveFn || this.rejectFn) this.settle(false);
	}
}
