import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { tmpdir } from 'os';
import { strictEqual } from 'assert';

// Stop mustache from escaping HTML entities as we are generating Markdown
Mustache.escape = function(text:string) {return text;};

/*
 * TODOs:
 * - figure out why textareas are not working qute right
 * - add a replacement string for what goes back into the text
 */

interface MyPluginSettings {
	templateDirectory: string;
	replaceSelection: boolean;
	inputSplit: string;
	config: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	templateDirectory: 'templates',
	replaceSelection: true,
	inputSplit: "-",
	config: '[]'
}

interface TemplateSpec {
	id: string; //Unique ID for building commands
	name: string; //Name to show for the command (probably same as the template filename, but doesn't have to be)
	template: string; //Name of the template file
	directory: string; //Output directory for notes generated from the template
	input: string; //Fields to pull out of the input
	replacement: string; //A template string for the text that will be inserted in the editor
}


export default class FromTemplatePlugin extends Plugin {
	settings: MyPluginSettings;
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
					new FillTemplate(this.app,this,editor,ts).open();
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
					input:result.metadata['template-input'] || "title,body",
					replacement:result.metadata['template-replacement'] || "[[{{title}}]]",
				}
				return tmpl
			}
		})
		return templates
		
	}

	async createNote(template_name:string,directory:string,title:string,values:object) {
		const template = await this.loadTemplate(template_name);
		const result = Mustache.render(template,values);
		const filename =directory + "/" + title + ".md" 
		try {
			this.app.vault.create(directory + "/" + title + ".md", result)
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

class FillTemplate extends Modal {
	plugin:FromTemplatePlugin
	editor:Editor
	spec:TemplateSpec
	constructor(app: App,plugin:FromTemplatePlugin,editor:Editor,spec:TemplateSpec) {
		super(app);
		this.plugin = plugin;
		this.editor= editor;
		this.spec = spec;
	}

	async onOpen() {
		let {contentEl} = this;

		// Load the template based on the name given
		let template = await this.plugin.loadTemplate(this.spec.name)

		//Create the top of the interface - header and input for Title of the new note
		contentEl.createEl('h2', { text: "Create from Template: " + this.spec.name });
		contentEl.createEl('h4', { text: "Destination: " + this.spec.directory });
		const form = contentEl.createEl('div');

		// Parse the input to fill out tags in the template
		const controls:Record<string,() => string> = {};
		const input = this.editor.getSelection()
		const input_fields = this.parseInput(input)
		const title = (input_fields['title'] || "").replace(/[^a-zA-Z0-9 -:]/g,"") //Quick and dirty regex for usable titles

		this.createInput(form,controls,"title","text",title)

		// Pull out the tags the Mustache finds
		const result: Array<Array<any>> = Mustache.parse(template);

		//Now go through and make an input for each field in the template
		//const controls:Record<string,HTMLInputElement> = {"title":titleInput}
		result.forEach( r => {
			if( r[0] === "name" && r[1] != "title") {
				const [id,typ] = this.parseField(r[1])
				this.createInput(contentEl,controls,id,typ,input_fields[id],r[1])
			}
		})

	
		//And a submit button
		const submit = contentEl.createDiv({cls:"from-template-section"})
		const submitButton = submit.createEl('button', { text: "Add", cls:"from-template-submit" });
		//submitButton.style.cssText = 'align: right;';
		//On submit, get the data out of the form, replace the selection in the editor with a link to the current Title, and create the note
		submitButton.addEventListener('click', () => {
			const data:Record<string,string> = {}
			for( const k in controls ) {
				data[k] = controls[k]()
			}
			if( this.plugin.settings.replaceSelection && (this.spec.replacement !== "none") ) {
				const replaceText = Mustache.render(this.spec.replacement,data)
				this.editor.replaceRange(replaceText,this.editor.getCursor("from"), this.editor.getCursor("to"));
			}
			this.plugin.createNote(this.spec.name,this.spec.directory,data['title'],data);
			this.close()
		});

	}

	parseInput(input:string) : Record<string,string> {
		const fields = this.spec.input.split(",").map(s => s.trim())
		const input_parts = input.split(new RegExp(this.plugin.settings.inputSplit)).map(s=>s.trim())
		const zip = (a:string[], b:string[]) => Array.from(Array(Math.min(b.length, a.length)), (_, i) => [a[i], b[i]]);
		const r : Record<string,string> = {}
		zip(fields,input_parts).forEach(f => r[f[0]] = f[1])
		return r
	}

	parseField(input:string) : [string,string] {
		const parts = input.split(":");
		const id = parts[0] || input;
		const inputType = parts[1] || (id === "body" ? "area" : "text" );
		return [id,inputType]
	}

	/*
	 * Creates the UI element for putting in the text. Takes a parent HTMLElement, and:
	 * - creates a div with a title for the control
	 * - creates a control, base on a field type. The 'field' parameter is taken from the template, and can be given as field:type
	*/
	createInput(parent:HTMLElement, controls:Record<string,() => string>, id:string, inputType:string=null, initial:string="", template_id:string=null){
		const controlEl = parent.createEl('div',{cls:"from-template-section"});

		const labelText = id[0].toUpperCase() + id.substring(1) + ": ";
		const label = controlEl.createEl("label", {text: labelText, cls:"from-template-label"})
		label.htmlFor = id
		var inputField:HTMLElement;
		var valueFunc:()=>string = () => ""
		switch(inputType) {
			case "area": {
				const i = controlEl.createEl('textarea', {cls:"from-template-control"});
				i.id = id
				i.rows = 5;
				i.cols = 50;
				i.value = initial;
				valueFunc = () => { return i.value; }
				inputField = i;
				break;
			}
			case "text": {
				const i = controlEl.createEl('input', {cls:"from-template-control"});
				i.id = id
				i.size = 50
				i.value = initial;
				valueFunc = () => i.value
				inputField = i;
				break;
			}
		}
		if(inputField) {
			//inputField.style.cssText = 'float: right;';
		}
		controls[template_id || id] = valueFunc
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
		new Setting(containerEl)
			.setName('Selection split')
			.setDesc('A regex to split up the input selection to fill in extra fields in the note creation box')
			.addText(text => text
				.setValue("-")
				.onChange(async (value) => {
					this.plugin.settings.inputSplit = value;
					await this.plugin.saveSettings();
				}));

	}
}
