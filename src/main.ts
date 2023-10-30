import {  Editor, MarkdownView,  Plugin  } from 'obsidian';
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
//import { BaseModal } from './BaseModal';
import { FillTemplate } from './FillTemplate';
import { FromTemplateSettingTab, FromTemplatePluginSettings, DEFAULT_SETTINGS } from './SettingsPane';
import TemplateProcessing from './TemplateProcessing';
import {  ReplacementSpec,  TemplateIdentifier, ReplacementOptions } from './SharedInterfaces';

// Stop mustache from escaping HTML entities as we are generating Markdown
Mustache.escape = function(text:string) {return text;};

/*
 * TODOs:
 * - figure out why textareas are not working qute right
 * - add a replacement string for what goes back into the text
 */





export default class FromTemplatePlugin extends Plugin {
	settings: FromTemplatePluginSettings;
	templates: TemplateProcessing
	addedCommands: string[] = []
	//templateDir: string = "templates"

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FromTemplateSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => this.indexTemplates());
		this.templates = new TemplateProcessing(this.app.vault)
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
		let fileOK = true // Will be false if file creation failed, true if it succeded or was not requested
		if( options.shouldCreateOpen !== "none" ) {
			const path =spec.settings.outputDirectory + "/" + filename + ".md" 
			try {
				fileOK = false
				const file = await this.app.vault.create(path, filledTemplate)
				fileOK = true
			} catch (error) {
				alert("Couldn't create file: " + filename + "\n" + error.toString() )
			}
		}

		// Then see if we replace text in the editor
		//console.log(`Will replace: ${options.willReplaceSelection}, new file: ${newFile}`)
		if( options.willReplaceSelection && fileOK ) {
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




