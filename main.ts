import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import * as Mustache from 'mustache';
import metadataParser from 'markdown-yaml-metadata-parser'

interface MyPluginSettings {
	templateDirectory: string;
	replaceSelection: boolean;
	config: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	templateDirectory: 'templates',
	replaceSelection: true,
	config: '[]'
}

interface TemplateSpec {
	id: string; //Unique ID for building commands
	name: string; //Name to show for the command (probably same as the template filename, but doesn't have to be)
	template: string; //Name of the template file
	directory: string; //Output directory for notes generated from the template
}


export default class FromTemplatePlugin extends Plugin {
	settings: MyPluginSettings;
	templateDir: string = "templates"

	async onLayoutReady() {
		console.log('loading plugin');

		await this.loadSettings();
		this.addTemplates()
		this.addSettingTab(new FromTemplateSettingTab(this.app, this));
	}

	// Adds all the template commands - calls getTemplates which looks for files in the settings.templateDirectory
	async addTemplates() {
		const templates = await this.getTemplates()
		templates.forEach(async t => {
			const ts = (await t) as TemplateSpec
			this.addCommand( {
				id:ts.id,
				name: ts.name,
				editorCallback: (editor, _ ) => {
					//This class does all the UI work
					new FillTemplate(this.app,this,editor,ts.template,ts.directory).open();
				}
			});
		})
	}

	// Run through the settings directory and return an TemplateSettings for each valid file there
	async getTemplates() {
		const templateFolder:TFolder = this.app.vault.getAbstractFileByPath(this.settings.templateDirectory) as TFolder
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
				}
				console.log("Got spec: ",tmpl)
				return tmpl
			}
		})
		console.log("Got templates! ",templates)
		return templates
		
	}

	async createNote(template_name:string,directory:string,title:string,values:object) {
		const template = await this.loadTemplate(template_name);
		const result = Mustache.render(template,values);
		this.app.vault.create(directory + "/" + title + ".md", result)
	}

	// Reads in the template file, strips out the templating ID tags from the YAML and returns the result
	async loadTemplate(name:string): Promise<string> {
		const filename = this.templateDir + "/" + name + ".md"
		const file = this.app.vault.getAbstractFileByPath(filename);
		if (!(file instanceof TFile)) {
			console.log("File was not a file! " + file.path)
			return
		}
		const rawTemplate = await this.app.vault.read(file)
		var finalTemplate = rawTemplate
		const templateFields = [
			"template-id",
			"template-name",
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

class FillTemplate extends Modal {
	plugin:FromTemplatePlugin
	editor:Editor
	templateName:string
	targetDir:string
	constructor(app: App,plugin:FromTemplatePlugin,editor:Editor,template:string,target:string) {
		super(app);
		this.plugin = plugin;
		this.editor= editor;
		this.templateName=template
		this.targetDir=target
	}

	async onOpen() {
		let {contentEl} = this;

		// Load the template based on the name given
		let template = await this.plugin.loadTemplate(this.templateName)
		// Pull out the tags the Mustache finds
		const result: Array<Array<any>> = Mustache.parse(template);

		//Create the top of the interface - header and input for Title of the new note
		contentEl.createEl('h2', { text: "Create from Template: " + this.templateName });
		const titleEl = contentEl.createEl('div');
		titleEl.createEl('span',{text:"Title: "});
		const titleInput = titleEl.createEl('input');
		titleInput.value = this.editor.getSelection()
		titleInput.style.cssText = 'float: right;';

		//Now go through and make an input for each field in the template
		const controls:Record<string,HTMLInputElement> = {"title":titleInput}
		result.forEach( r => {
			if( r[0] === "name" && r[1] != "title") {
				const id:string = r[1]
				const controlEl = contentEl.createEl('div');
				controlEl.createEl("span", {text: id})
				const input = controlEl.createEl('input');
				input.style.cssText = 'float: right;';
				controls[id] = input
			}
		})

		//And a submit button
		const submitButton = contentEl.createEl('button', { text: "Add" });
		submitButton.style.cssText = 'float: right;';

		//On submit, get the data out of the form, replace the selection in the editor with a link to the current Title, and create the note
		submitButton.addEventListener('click', () => {
			const data:Record<string,string> = {}
			for( const k in controls ) {
				data[k] = controls[k].value
			}
			if( this.plugin.settings.replaceSelection )
				this.editor.replaceRange("[["+data['title']+"]]",this.editor.getCursor("from"), this.editor.getCursor("to"));
			this.plugin.createNote(this.templateName,this.targetDir,data['title'],data);
			this.close()
		});

	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();

	}
}

class FromTemplateSettingTab extends PluginSettingTab {
	plugin: FromTemplatePlugin;

	constructor(app: App, plugin: FromTemplatePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Note From Template Settings'});

		new Setting(containerEl)
			.setName('Template Directory')
			.setDesc('Directory to read templates from')
			.addText(text => text
				.setPlaceholder('templates')
				.setValue('')
				.onChange(async (value) => {
					this.plugin.settings.templateDirectory = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Replace selection')
			.setDesc('Should the current editor selection be replaced with a link to the title of the new Note?')
			.addToggle(toggle => toggle
				.setValue(true)
				.onChange(async (value) => {
					this.plugin.settings.replaceSelection = value;
					await this.plugin.saveSettings();
				}));

	}
}
