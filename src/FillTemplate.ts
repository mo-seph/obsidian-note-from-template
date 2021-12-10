import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, TextAreaComponent, TextComponent, TFile, TFolder } from 'obsidian';
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
	result:ReplacementSpec
	constructor(app: App,plugin:FromTemplatePlugin,spec:ReplacementSpec ) {
		super(app);
        this.result = spec
		this.plugin = plugin;
	}

	async onOpen() {
		let {contentEl} = this;

		// Load the template based on the name given
		//let template = await this.plugin.loadTemplate(this.result.template.name)

		//Create the top of the interface - header and input for Title of the new note
		contentEl.createEl('h2', { text: "Create from Template: " + this.result.template.name });
		contentEl.createEl('h4', { text: "Destination: " + this.result.template.directory });
		const form = contentEl.createEl('div');

        //Create each of the fields
        this.result.fields.forEach( f => {
            this.createInput(contentEl,this.result.data,f.id,f.inputType)
        })

        // And the extra controls at the bottom

        /* Should text be replaced? It's a combination of:
         * - if it is turned on in the plugin. Will be yes/no/if selection
         * - if that is overriden in the template - same values
         * - is there text selected
         * For now, just using the settings value that is passed in
        */ 
        const willReplace = () => {
            return this.result.shouldReplaceSelection
        }
        this.result.willReplaceSelection = willReplace()
        new Setting(contentEl)
        .setName('Replace selection')
        .setDesc('Should the current editor selection be replaced with a template text')
        .addToggle(toggle => toggle
            .setValue(this.result.shouldReplaceSelection)
            .onChange(async (value) => {
                this.result.willReplaceSelection = value;
            }));

        let replacementText: TextComponent;
        new Setting(contentEl)
        .setName("Replacement String")
        .setDesc(("String to replace selection with. Template fields: "))
        .addText((text) => {
            replacementText = text;
            text.setValue(this.result.replacementText)
                .onChange((value) => {
                    this.result.replacementText = value
                });
        }).addToggle(toggle => toggle);

        new Setting(contentEl)
        .setName("Create and open note")
        .setDesc(("Should the note be created / opened?"))
        .addDropdown((dropdown) => {
            dropdown.addOption("none","Don't create")
            dropdown.addOption("create","Create don't open")
            dropdown.addOption("open","Create and open")
            dropdown.addOption("open_new","Create and open in new pane")
        });            
	
		//And a submit button
		const submit = contentEl.createDiv({cls:"from-template-section"})
		const submitButton = submit.createEl('button', { text: "Add", cls:"from-template-submit" });
		//submitButton.style.cssText = 'align: right;';

		//On submit, get the data out of the form, pass through to main plugin for processing
		submitButton.addEventListener('click', () => {
            console.log(this.result.data)
            console.log(this.result)
            this.plugin.templateFilled(this.result)
			this.close()
		});

	}





	/*
	 * Creates the UI element for putting in the text. Takes a parent HTMLElement, and:
	 * - creates a div with a title for the control
	 * - creates a control, base on a field type. The 'field' parameter is taken from the template, and can be given as field:type
	*/
	createInput(parent:HTMLElement, data:Record<string,string>, id:string, inputType:string=null, initial:string=""){
        // Create div and label
		const controlEl = parent.createEl('div',{cls:"from-template-section"});
		const labelText = id[0].toUpperCase() + id.substring(1) + ": ";
		const label = controlEl.createEl("label", {text: labelText, cls:"from-template-label"})
		label.htmlFor = id
         
        console.log("Creating field ",id)
        console.log("Data: ",data[id])
        console.log("Initial: ",initial)

        //Put the data into the record to start
        if( initial) data[id] = initial;


        //Create the control
		switch(inputType) {
			case "area": {
                const t = new TextAreaComponent(controlEl)
                    .setValue(data[id])
                    .onChange((value) => data[id] = value)
				t.inputEl.rows = 5;
				t.inputEl.cols = 50;
                t.inputEl.addClass("from-template-control")
				break;
			}
			case "text": {
                const t = new TextComponent(controlEl)
                    .setValue(data[id])
                    .onChange((value) => data[id] = value)
                t.inputEl.addClass("from-template-control")
				t.inputEl.size = 50
				break;
			}
		}
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();

	}
}