import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, TFile, TFolder } from 'obsidian';
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { tmpdir } from 'os';
import { notDeepStrictEqual, strictEqual } from 'assert';
//import { BaseModal } from './BaseModal';
import FromTemplatePlugin, { ReplacementSpec, TemplateSpec } from './main';

export class FillTemplate extends Modal {
	plugin:FromTemplatePlugin
	spec:TemplateSpec
	result:ReplacementSpec
	input:string
	constructor(app: App,plugin:FromTemplatePlugin,spec:ReplacementSpec ) {
		super(app);
        this.result = spec
		this.plugin = plugin;
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
		const input_fields = this.parseInput(this.input)
		const title = (input_fields['title'] || "").replace(/[^a-zA-Z0-9 -:]/g,"") //Quick and dirty regex for usable titles

		this.createInput(form,controls,"title","text",title)

		// Pull out the tags the Mustache finds
		const result: Array<Array<any>> = Mustache.parse(template);

		//Now go through and make an input for each field in the template
		//const controls:Record<string,HTMLInputElement> = {"title":titleInput}
		const fields : { [name: string]: number } = {"title":1} //Assume we already have a title field
		result.forEach( r => {
			if( r[0] === "name" ) {
				const [id,typ] = this.parseField(r[1])
				if( ! fields[id] ) {
					fields[id] = 1
					this.createInput(contentEl,controls,id,typ,input_fields[id],r[1])
				}
			}
		})

		let nameText: TextComponent;
		new Setting(contentEl)
		.setName("Test")
		.setDesc(("Testing stuff?"))
		.addText((text) => {
			nameText = text;
			text.setValue("Hi")
				.onChange((value) => {
					console.log("New text: "+value)
					this.setValidationError(nameText, "invalid_name");
				});
		});
	
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
            this.plugin.templateFilled(this.result)
            /*
			if( this.plugin.settings.replaceSelection && (this.spec.replacement !== "none") ) {
				const replaceText = Mustache.render(this.spec.replacement,data)
				this.editor.replaceRange(replaceText,this.editor.getCursor("from"), this.editor.getCursor("to"));
			}
			this.plugin.createNote(this.spec.name,this.spec.directory,data['title'],data);
            */
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