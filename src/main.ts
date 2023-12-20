import {  EditableFileView, Editor, MarkdownView,  Plugin, WorkspaceLeaf  } from 'obsidian';
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
					//editorCallback: async (editor, view ) => { this.launchTemplate(editor,view,ts) },
					// Switched - using callback: lets it be called from anywhere, but we have to guess at the editor/view
					callback: async () => { this.launchTemplate(undefined,undefined,ts) }
					
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

	async launchTemplate(editor:(Editor|undefined),view:MarkdownView|undefined, ts:TemplateIdentifier) {
		// Updated to deal with the idea we might not have a view/editor
		if( ! view ) view = this.app.workspace.getActiveViewOfType(MarkdownView)
		if( (! editor) && view ) editor = view.editor

		const initial_selection = this.getCurrentSelection( editor )
		// Get the template text and the fields to fill in
		const template = await this.templates.prepareTemplate(
			ts,this.settings,initial_selection,this.settings.inputSplit)

		// Can we fill in extra information here?
		if( view ) {
			template.data['currentTitle'] = view.file.basename
			template.data['currentPath'] = view.file.path
		}

		const options:ReplacementOptions = {
			editor:editor,
			shouldReplaceSelection:editor ? template.template.replaceSelection : "never",
			shouldCreateOpen:template.template.createOpen,
			willReplaceSelection:editor ? true : false,
		}
		//This class does all the UI work
		new TemplateInputUI(this.app,this,template,options).open();
	}

	
	// Writes the template to file, does any replacement needed in the active file, opens new file if needed
	// Current structure of returning null on success and a string on failure is rather ugly
	async writeTemplate(result:TemplateResult, options:ReplacementOptions) : Promise<void|string> {

		// First try to make the file
		console.debug("Making file")
		let newFile = null
		let fileOK = true // Will be false if file creation failed, true if it succeded or was not requested
		if( options.shouldCreateOpen !== "none" ) {
			try {
				fileOK = false
				newFile = await this.app.vault.create(result.fullPath, result.note)
				fileOK = true
			} catch (error) {
                console.debug("Error writing template",error)
				return("Couldn't create file '" + result.filename + "': " + error.toString() )
			}
		}

		// Then see if we replace text in the editor
		if( options.willReplaceSelection && fileOK ) 
			this.replaceCurrentSelection(result.replacementText,options.editor)

		// Then see if we should open the new file
		if( newFile) {
			console.debug("Opening")
			let leaf:WorkspaceLeaf = undefined
			if( options.shouldCreateOpen === "open" ) 
				leaf = this.app.workspace.getLeaf(false)
			else if( options.shouldCreateOpen === "open-pane" ) 
				leaf = this.app.workspace.getLeaf("split")
			else if( options.shouldCreateOpen === "open-tab" ) 
				leaf = this.app.workspace.getLeaf("tab")
			if( leaf ) {
				leaf.openFile(newFile)
			}
		}

	}

	getCurrentSelection(editor?:Editor) {
		if( editor ) return editor.getSelection();
		const t = window.getSelection().toString()
		console.log("Got no Editor, getting from window: ",t)
		return t
	}

	replaceCurrentSelection(repl:string,editor?:Editor) {
		if(editor) {
			console.log("Got Editor" )
			editor.replaceRange(repl,
				editor.getCursor("from"), editor.getCursor("to"));
		}
		else {
			console.log("Got no Editor, putting text on clipboard: ",repl)
			navigator.clipboard.writeText(repl)
			// https://developer.mozilla.org/en-US/docs/Web/API/Selection
			//const sel = window.getSelection()
			//const selText = sel.toString()
			//if( sel.anchorNode === sel.focusNode ) {
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




