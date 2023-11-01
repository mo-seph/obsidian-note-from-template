import {  Editor, MarkdownView,  Plugin  } from 'obsidian';
import { TemplateInputUI } from './TemplateInputUI';
import { FromTemplateSettingTab, FromTemplatePluginSettings, DEFAULT_SETTINGS } from './SettingsPane';
import TemplateProcessing from './TemplateProcessing';
import {  ActiveTemplate,  TemplateIdentifier, ReplacementOptions, TemplateResult } from './SharedInterfaces';

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
		const templates = await this.templates.getTemplateIdentifiersFromDirectory(this.settings.templateDirectory) || []
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
			shouldReplaceSelection:template.template.replaceSelection,
			shouldCreateOpen:template.template.createOpen,
			willReplaceSelection:true,
		}
		//This class does all the UI work
		new TemplateInputUI(this.app,this,template,options).open();
	}


	async templateFilled(spec:ActiveTemplate,options:ReplacementOptions) {
		let result = await spec.template.fillOutTemplate(spec)

		console.log("Active: ",spec)
		console.log("Options: ",options)
		console.log("Result: ",result)

		return;
		this.writeTemplate(result,options)
	}

	async writeTemplate(result:TemplateResult, options:ReplacementOptions) {

		// First try to make the file
		console.log("Making file")
		let newFile = null
		let fileOK = true // Will be false if file creation failed, true if it succeded or was not requested
		if( options.shouldCreateOpen !== "none" ) {
			//try {
				fileOK = false
				const file = await this.app.vault.create(result.fullPath, result.note)
				fileOK = true
			//} catch (error) {
				//alert("Couldn't create file: " + result.filename + "\n" + error.toString() )
			//}
		}

		// Then see if we replace text in the editor
		//console.log(`Will replace: ${options.willReplaceSelection}, new file: ${newFile}`)
		console.log("Doing editor replacement")
		if( options.willReplaceSelection && fileOK ) {
			options.editor.replaceRange(result.replacementText,
				options.editor.getCursor("from"), options.editor.getCursor("to"));
		}

		// Then see if we should open the new file
		console.log("Opening")
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




