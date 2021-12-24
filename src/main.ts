import { App, Editor, MarkdownView, Modal, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TextComponent, TFile, TFolder } from 'obsidian';
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
//import { BaseModal } from './BaseModal';
import { FillTemplate } from './FillTemplate';
import TemplateHelper, { CreateType, ReplacementSpec, ReplaceType, TemplateDefaults, TemplateIdentifier } from './templates';
import { commands } from 'codemirror';

// Stop mustache from escaping HTML entities as we are generating Markdown
Mustache.escape = function(text:string) {return text;};

/*
 * TODOs:
 * - figure out why textareas are not working qute right
 * - add a replacement string for what goes back into the text
 */

interface FromTemplatePluginSettings extends TemplateDefaults {
	templateDirectory: string;
	inputSplit: string;
	config: string;
}

const DEFAULT_SETTINGS: FromTemplatePluginSettings = {
	outputDirectory:"test",
	templateFilename:"{{title}}",
	inputFieldList:"title,body",
	textReplacementTemplate:"[[{{title}}]]",
	templateDirectory: 'templates',
	replaceSelection: "always",
	createOpen: "create",
	inputSplit: "\\s+-\\s+",
	config: '[]'
}


export interface ReplacementOptions {
	editor:Editor;
	shouldReplaceSelection:ReplaceType
	shouldCreateOpen:CreateType
	willReplaceSelection:boolean;
}

export default class FromTemplatePlugin extends Plugin {
	settings: FromTemplatePluginSettings;
	templates: TemplateHelper
	addedCommands: string[] = []
	//templateDir: string = "templates"

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FromTemplateSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => this.indexTemplates());
		this.templates = new TemplateHelper(this.app.vault)
		this.addCommand({id:"reload",name:"Re-index Templates",callback: async () => this.indexTemplates()})
	}

	// Adds all the template commands - calls getTemplates which looks for files in the settings.templateDirectory
	async indexTemplates() {
		this.clearTemplateCommands()
		const templates = await this.templates.getTemplates(this.settings.templateDirectory) || []
		console.log("Got templates: ",templates.map(c => c.path).join(", "))
		templates.forEach(async t => {
			if( t ) {
				const ts = (await t) as TemplateIdentifier
				const command = this.addCommand( {
					id:ts.id,
					name: ts.name,
					editorCallback: async (editor, view ) => { this.launchTemplate(editor,view,ts) }
					
				});
				this.addedCommands.push( command.id )
			}
		})
	}

	clearTemplateCommands() {
		//From https://liamca.in/Obsidian/API+FAQ/commands/unload+a+Command
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.addedCommands.forEach(cid => {
			try {
				(this.app as any).commands.removeCommand(cid)
			} catch(error) {
				console.log("Could not remove command: ",error)
			}
		} )
	}

	async launchTemplate(editor:Editor,view:MarkdownView, ts:TemplateIdentifier) {
		// Get the template text and the fields to fill in
		const template = await this.templates.prepareTemplate(
			ts,this.settings,editor.getSelection(),this.settings.inputSplit)
		// Can we fill in extra information here?
		template.data['currentTitle'] = view.file.basename
		template.data['currentPath'] = view.file.path
		const options:ReplacementOptions = {
			editor:editor,
			shouldReplaceSelection:template.settings.shouldReplaceInput,
			shouldCreateOpen:template.settings.shouldCreateOpen,
			willReplaceSelection:true,
		}
		//This class does all the UI work
		new FillTemplate(this.app,this,template,options).open();
	}


	async templateFilled(spec:ReplacementSpec,options:ReplacementOptions) {
		let [filledTemplate,replaceText,filename] = await this.templates.fillOutTemplate(spec)

		console.log(spec)
		console.log(options)

		// First try to make the file
		let newFile = null
		if( options.shouldCreateOpen !== "none" ) {
			const path =spec.settings.outputDirectory + "/" + filename + ".md" 
			try {
				newFile = await this.app.vault.create(path, filledTemplate)
			} catch (error) {
				alert("Couldn't create file: " + filename + "\n" + error.toString() )
			}
		}

		// Then see if we replace text in the editor
		//console.log(`Will replace: ${options.willReplaceSelection}, new file: ${newFile}`)
		if( options.willReplaceSelection && newFile ) {
			options.editor.replaceRange(replaceText,
				options.editor.getCursor("from"), options.editor.getCursor("to"));
		}

		// Then see if we should open the new file

		if( options.shouldCreateOpen === "open" && newFile ) {
			this.app.workspace.activeLeaf.openFile(newFile)
		} 
		else if( options.shouldCreateOpen === "open-pane" && newFile ) {
			this.app.workspace.splitActiveLeaf().openFile(newFile)
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

		const dirSetting = new Setting(containerEl)
			.setName('Template Directory')
			.setDesc('Directory to read templates from')

		// Finding the right template folder
		const updateFolderDescription = (folder:string) => {
			try {
			let [text,clss,r_clss] = this.getDirectoryText(folder)
			dirSetting.setDesc(text)
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
