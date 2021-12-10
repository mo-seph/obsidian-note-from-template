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
	inputFieldList: string; //Fields to pull out of the input
	replacement: string; //A template string for the text that will be inserted in the editor
}

export interface TemplateField {
	id: string //Unique id, first bit of the field
	inputType: string // What kind of input is it?
	args: string[]
	alternatives: string[]
}

export interface ReplacementSpec {
	input:string; // The currently selected text in the editor
	template:TemplateSpec;
	editor:Editor;
	fields:TemplateField[]; //Specifications for all of the fields in the template
	data:Record<string,string>; //The data to fill in the template with
	//replacement_text:string;
	createNote:boolean;
	shouldReplaceSelection:boolean;
	willReplaceSelection:boolean;
	replacementText:string;
	openNote:boolean;
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
				editorCallback: async (editor, _ ) => { this.launchTemplate(editor,ts) }
				
			});
		})
	}

	async launchTemplate(editor:Editor,ts:TemplateSpec) {
		// Get the template text and the fields to fill in
		const templateText = await this.loadTemplate(ts.name)
		const templateFields = this.templateFields(templateText)
		// Get the input from the editor
		const input = editor.getSelection()
		// ... and populate the field data with it
		const fieldData = this.parseInput(input,ts.inputFieldList)
		//This class does all the UI work
		const replacement = {
			input:input,
			template:ts,
			editor:editor,
			fields:templateFields,
			data:fieldData,
			createNote:true,
			openNote:true,
			shouldReplaceSelection:this.settings.replaceSelection,
			willReplaceSelection:this.settings.replaceSelection,
			replacementText:ts.replacement
		}
		new FillTemplate(this.app,this,replacement).open();
	}

	// Run through the settings directory and return an TemplateSettings for each valid file there
	async getTemplates() : Promise<TemplateSpec[]> {
		console.log("Template settings folder: " + this.settings.templateDirectory)
		const templateFolder:TFolder = this.app.vault.getAbstractFileByPath(this.settings.templateDirectory) as TFolder
		if( ! templateFolder ) return []
		const templates : Promise<TemplateSpec>[] = templateFolder.children.map( async c => {
			if( c instanceof TFile ) {
				const data = await this.app.vault.read(c)
				const result = metadataParser(data)
				const fn = c.basename
				const tmpl:TemplateSpec = {
					id:result.metadata['template-id'] || fn.toLowerCase(),
					name:result.metadata['template-name'] || fn,
					template:fn,
					directory:result.metadata['template-output'] || "test",
					inputFieldList:result.metadata['template-input'] || "title,body",
					replacement:result.metadata['template-replacement'] || "[[{{title}}]]",
				}
				return tmpl
			}
		})
		return Promise.all(templates)
	}

	async templateFilled(spec:ReplacementSpec) {
		console.log("Filling template")
		console.log(spec)
		const data = spec.data

		//Copy data across to all the alternative formulations of a field
		spec.fields.forEach( f => {
			f.alternatives.forEach( a => data[a] = data[f.id])
		})
		
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

	templateFields(template:string): TemplateField[] {
		// Pull out the tags the Mustache finds
		// Returns tuples of type ["name","<tag>"] - maybe other types...
		//const templateFields: Array<Array<any>> = Mustache.parse(template);
		const templateFields: string[][] = Mustache.parse(template);
		
		const titleField:TemplateField = {id:"title",inputType:"text",args:[],alternatives:[]}

		const fields:TemplateField[] = [titleField]

		templateFields.forEach( r => {
			if( r[0] === "name" ) {
				const field = this.parseField(r[1])
				const existing = fields.find((t)=> t.id === field.id )
				if( existing ) { this.mergeField(existing,field)}
				else fields.push(field)
			}
		} )
		return fields
	}

	parseField(input:string) : TemplateField {
		const parts = input.split(":");
		const id = parts[0] || input;
		return {
			id: id,
			inputType: parts[1] || ( id === "body" ? "area" : "text" ),
			args: parts.slice(2),
			alternatives: input === id ? [] : [input]
		}
	}

	parseInput(input:string,spec:string) : Record<string,string> {
		const fields = spec.split(",").map(s => s.trim())
		const input_parts = input.split(new RegExp(this.settings.inputSplit)).map(s=>s.trim())
		const zip = (a:string[], b:string[]) => Array.from(Array(Math.min(b.length, a.length)), (_, i) => [a[i], b[i]]);
		const r : Record<string,string> = {}
		zip(fields,input_parts).forEach(f => r[f[0]] = f[1])
		console.log("Got input: ",r)
		return r
	}

	mergeField(current:TemplateField,additional:TemplateField) {
		current.alternatives = current.alternatives.concat(additional.alternatives)
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
