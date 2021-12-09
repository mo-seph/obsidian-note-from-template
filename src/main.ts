import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, TFile, TFolder } from 'obsidian';
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { tmpdir } from 'os';
import { notDeepStrictEqual, strictEqual } from 'assert';
import { BaseModal } from './BaseModal';
import { FillTemplate } from './FillTemplate';

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

export interface TemplateSpec {
	id: string; //Unique ID for building commands
	name: string; //Name to show for the command (probably same as the template filename, but doesn't have to be)
	template: string; //Name of the template file
	directory: string; //Output directory for notes generated from the template
	input: string; //Fields to pull out of the input
	replacement: string; //A template string for the text that will be inserted in the editor
}

export interface ReplacementSpec {
	input:string;
	template:TemplateSpec;
	editor:Editor;
	data:Record<string,string>;
	//replacement_text:string;
	create_note:boolean;
	open_note:boolean;
}

export default class FromTemplatePlugin extends Plugin {
	settings: FromTemplatePluginSettings;
	//templateDir: string = "templates"

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FromTemplateSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => this.addTemplates());
	}

	// Adds all the template commands - calls getTemplates which looks for files in the settings.templateDirectory
	async addTemplates() {
		const templates = await this.getTemplates()
		console.log("Got templates! ",templates)
		templates.forEach(async t => {
			const ts = (await t) as TemplateSpec
			this.addCommand( {
				id:ts.id,
				name: ts.name,
				editorCallback: (editor, _ ) => {
					//This class does all the UI work
					const replacement = {
						input:editor.getSelection(),
						template:ts,
						editor:editor,
						data:{},
						create_note:true,
						open_note:true,
					}
					new FillTemplate(this.app,this,replacement).open();
				}
			});
		})
	}


	// Run through the settings directory and return an TemplateSettings for each valid file there
	async getTemplates() {
		console.log("Template settings folder: " + this.settings.templateDirectory)
		const templateFolder:TFolder = this.app.vault.getAbstractFileByPath(this.settings.templateDirectory) as TFolder
		if( ! templateFolder ) return []
		const templates = templateFolder.children.map( async c => {
			if( c instanceof TFile ) {
				const data = await this.app.vault.read(c)
				const result = metadataParser(data)
				const fn = c.basename
				const tmpl = {
					id:result.metadata['template-id'] || fn.toLowerCase(),
					name:result.metadata['template-name'] || fn,
					template:fn,
					directory:result.metadata['template-output'] || "test",
					input:result.metadata['template-input'] || "title,body",
					replacement:result.metadata['template-replacement'] || "[[{{title}}]]",
				}
				return tmpl
			}
		})
		return templates
		
	}

	async templateFilled(spec:ReplacementSpec) {
		const template = await this.loadTemplate(spec.template.name);
		const result = Mustache.render(template,spec.data);

		if( this.settings.replaceSelection && (spec.template.replacement !== "none") ) {
			const replaceText = Mustache.render(spec.template.replacement,spec.data)
			spec.editor.replaceRange(replaceText,spec.editor.getCursor("from"), spec.editor.getCursor("to"));
		}
		//this.createNote(spec.template.name,spec.template.directory,spec.data['title'],spec.data);
		const filename =spec.template.directory + "/" + spec.data['title'] + ".md" 
		try {
			this.app.vault.create(spec.template.directory + "/" + spec.data['title'] + ".md", result)
		} catch (error) {
			alert("Couldn't create file: \n" + error.toString() )
		}
	}

	// Reads in the template file, strips out the templating ID tags from the YAML and returns the result
	async loadTemplate(name:string): Promise<string> {
		const filename = this.settings.templateDirectory + "/" + name + ".md"
		const file = this.app.vault.getAbstractFileByPath(filename);
		if (!(file instanceof TFile)) {
			alert("Couldn't find file: " + file.path)
			return
		}
		const rawTemplate = await this.app.vault.read(file)
		var finalTemplate = rawTemplate
		const templateFields = [
			"template-id",
			"template-name",
			"template-replacement",
			"template-input",
			"template-output"
		]
		templateFields.forEach(tf => {
			const re = new RegExp(tf + ".*\n")
			finalTemplate = finalTemplate.replace(re,"")
		})
		return finalTemplate
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
		console.log("Checking settings folder: " + folder)
		const templateFolder:TFolder = this.app.vault.getAbstractFileByPath(folder) as TFolder
		if( ! templateFolder ) {
			return [`⚠️ Directory to read templates from. '${folder}' does not exist`,'from-template-error-text','from-template-ok-text']
		}
		else {
			return [`✅ Directory to read templates from. '${folder}' has ${templateFolder.children.length} templates`,'from-template-ok-text','from-template-error-text']
		}
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Note From Template Settings'});

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
