
import { App, MarkdownView, Modal, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TextComponent, TFile, TFolder } from 'obsidian';
import FromTemplatePlugin from "./main"
import  { CreateType,  ReplaceType} from './SharedInterfaces';


export class FromTemplateSettingTab extends PluginSettingTab {
	plugin: FromTemplatePlugin;

	constructor(app: App, plugin: FromTemplatePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getDirectoryText(folder:string) : [string,string,string] {
		const numFolders = this.plugin.templates.countTemplates(folder)
		if( numFolders === undefined ) {
			return [`⚠️ Directory to read templates from. '${folder}' does not exist`,'from-template-error-text','from-template-ok-text']
		}
		else {
			return [`✅ Directory to read templates from. '${folder}' has ${numFolders} templates`,'from-template-ok-text','from-template-error-text']
		}
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Note From Template Settings'});

		const dirSetting = new Setting(containerEl)
			.setName('Template Directory')
			.setDesc('Directory to read templates from')

		// Finding the right template folder
		const updateFolderDescription = (folder:string) => {
			try {
			let [text,clss,r_clss] = this.getDirectoryText(folder)
			dirSetting.descEl.addClass(clss)
			dirSetting.descEl.removeClass(r_clss)
			} catch (error) {

			}
		}

		const folders = this.plugin.templates.getTemplateFolders()
		const opts : Record<string,string> = {}
		folders.forEach(f => opts[f.location.path] =
			("-".repeat(f.depth-1) + ` ${f.location.name} (${f.numTemplates})` )
		)
		dirSetting.addDropdown(text => text
			//.setPlaceholder('templates')
			.addOptions(opts)
			.setValue(this.plugin.settings.templateDirectory)
			.onChange(async (value) => {
				this.plugin.settings.templateDirectory = value;
				updateFolderDescription(value)
				await this.plugin.indexTemplates()
				await this.plugin.saveSettings();
			}));
		
		updateFolderDescription(this.plugin.settings.templateDirectory)


		new Setting(containerEl)
			.setName('Replace selection')
			.setDesc('Should the current editor selection be replaced with a link to the title of the new Note?')
			.addDropdown(toggle => toggle
				.addOption("always","Always")
				.addOption("sometimes","If Selected")
				.addOption("never","Never")
				.setValue(this.plugin.settings.replaceSelection)
				.onChange(async (value) => {
					this.plugin.settings.replaceSelection = value as ReplaceType;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
		.setName('Create and Open Note')
		.setDesc('Should a note be created and opened? If opened, in a pane?')
		.addDropdown(toggle => toggle
			.addOption("none","Don't create note")
			.addOption("create","Create but don't open")
			.addOption("open","Create and open in this pane")
			.addOption("open-pane","Create and open in new pane")
			.setValue(this.plugin.settings.createOpen)
			.onChange(async (value) => {
				this.plugin.settings.createOpen = value as CreateType;
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
		.setName('Default output directory')
		.setDesc('Where to put notes if they have not specified with {{template-output}}')
		.addText(text => text
			.setValue(this.plugin.settings.outputDirectory)
			.onChange(async (value) => {
				this.plugin.settings.outputDirectory = value;
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
		.setName('Default template filename')
		.setDesc('Where to put notes if they have not specified with {{template-output}}')
		.addText(text => text
			.setPlaceholder("{{title}}")
			.setValue(this.plugin.settings.templateFilename)
			.onChange(async (value) => {
				this.plugin.settings.templateFilename = value;
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
		.setName('Default replacement string')
		.setDesc('What replacement string to use if the template has not specified using {{template-replacement}}')
		.addText(text => text
			.setValue(this.plugin.settings.textReplacementTemplate)
			.onChange(async (value) => {
				this.plugin.settings.textReplacementTemplate = value;
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
		.setName('Default field list')
		.setDesc('What fields to expect if they template does not specify with {{template-input}}')
		.addText(text => text
			.setValue(this.plugin.settings.inputFieldList)
			.onChange(async (value) => {
				this.plugin.settings.inputFieldList = value;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Selection split')
			.setDesc('A regex to split up the input selection to fill in extra fields in the note creation box')
			.addText(text => text
				.setValue(this.plugin.settings.inputSplit)
				.onChange(async (value) => {
					this.plugin.settings.inputSplit = value;
					await this.plugin.saveSettings();
				}));

	}
}
