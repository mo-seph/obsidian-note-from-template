import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, TFile, TFolder } from 'obsidian';
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { BaseModal } from './BaseModal';
import { FillTemplate } from './FillTemplate';
import TemplateHelper, { ReplacementSpec, TemplateIdentifier } from './templates';

// Stop mustache from escaping HTML entities as we are generating Markdown
Mustache.escape = function(text:string) {return text;};

/*
 * TODOs:
 * - figure out why textareas are not working qute right
 * - add a replacement string for what goes back into the text
 */

interface FromTemplatePluginSettings {
	templateDirectory: string;
	replaceSelection: boolean;
	inputSplit: string;
	config: string;
}

const DEFAULT_SETTINGS: FromTemplatePluginSettings = {
	templateDirectory: 'templates',
	replaceSelection: true,
	inputSplit: "\\s+-\\s+",
	config: '[]'
}


export interface ReplacementOptions {
	editor:Editor;
	createNote:boolean;
	shouldReplaceSelection:boolean;
	willReplaceSelection:boolean;
	openNote:boolean;
}

export default class FromTemplatePlugin extends Plugin {
	settings: FromTemplatePluginSettings;
	templates: TemplateHelper
	//templateDir: string = "templates"

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FromTemplateSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => this.addTemplates());
		this.templates = new TemplateHelper(this.app.vault)
	}

	// Adds all the template commands - calls getTemplates which looks for files in the settings.templateDirectory
	async addTemplates() {
		const templates = await this.templates.getTemplates(this.settings.templateDirectory) || []
		console.log("Got templates! ",templates)
		templates.forEach(async t => {
			const ts = (await t) as TemplateIdentifier
			this.addCommand( {
				id:ts.id,
				name: ts.name,
				editorCallback: async (editor, _ ) => { this.launchTemplate(editor,ts) }
				
			});
		})
	}

	async launchTemplate(editor:Editor,ts:TemplateIdentifier) {
		// Get the template text and the fields to fill in
		const template = await this.templates.prepareTemplate(
			ts,editor.getSelection(),this.settings.inputSplit)

		const options:ReplacementOptions = {
			editor:editor,
			createNote:true,
			openNote:true,
			shouldReplaceSelection:this.settings.replaceSelection,
			willReplaceSelection:this.settings.replaceSelection,
		}
		//This class does all the UI work
		new FillTemplate(this.app,this,template,options).open();
	}


	async templateFilled(spec:ReplacementSpec,options:ReplacementOptions) {
		let [filledTemplate,replaceText] = await this.templates.fillOutTemplate(spec)

		if( this.settings.replaceSelection && (spec.settings.textReplacementTemplate !== "none") ) {
			options.editor.replaceRange(replaceText,
				options.editor.getCursor("from"), options.editor.getCursor("to"));
		}

		const filename =spec.settings.outputDirectory + "/" + spec.data['title'] + ".md" 
		try {
			this.app.vault.create(filename, filledTemplate)
		} catch (error) {
			alert("Couldn't create file: " + filename + "\n" + error.toString() )
		}
	}

	

	onunload() {
		console.log('unloading plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}



class FromTemplateSettingTab extends PluginSettingTab {
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

		/*
		let nameText: TextComponent;
		new Setting(contentEl)
		.setName("Test")
		.setDesc(("Testing stuff?"))
		.addText((text) => {
			nameText = text;
			text.setValue("Hi")
				.onChange((value) => {
					console.log("New text: "+value)
					//this.setValidationError(nameText, "invalid_name");
				});
		});
		*/

		const dirSetting = new Setting(containerEl)
			.setName('Template Directory')
			.setDesc('Directory to read templates from')

		const updateFolderDescription = (folder:string) => {
			try {
			let [text,clss,r_clss] = this.getDirectoryText(folder)
			dirSetting.setDesc(text)
			dirSetting.descEl.addClass(clss)
			dirSetting.descEl.removeClass(r_clss)
			} catch (error) {

			}
		}
		dirSetting.addText(text => text
				.setPlaceholder('templates')
				.setValue(this.plugin.settings.templateDirectory)
				.onChange(async (value) => {
					this.plugin.settings.templateDirectory = value;
					updateFolderDescription(value)
					await this.plugin.saveSettings();
				}));
		updateFolderDescription(this.plugin.settings.templateDirectory)
		new Setting(containerEl)
			.setName('Replace selection')
			.setDesc('Should the current editor selection be replaced with a link to the title of the new Note?')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.replaceSelection)
				.onChange(async (value) => {
					this.plugin.settings.replaceSelection = value;
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
