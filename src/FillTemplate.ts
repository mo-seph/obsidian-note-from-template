import { App, DropdownComponent, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, TextAreaComponent, TextComponent, TFile, TFolder } from 'obsidian';
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { tmpdir } from 'os';
import { notDeepStrictEqual, strictEqual } from 'assert';
//import { BaseModal } from './BaseModal';
import FromTemplatePlugin, { ReplacementOptions}  from './main';
import { CreateType, ReplacementSpec, TemplateField } from './templates';



export class FillTemplate extends Modal {
	plugin:FromTemplatePlugin
	result:ReplacementSpec
	options:ReplacementOptions
	constructor(app: App,plugin:FromTemplatePlugin,spec:ReplacementSpec, options:ReplacementOptions ) {
		super(app);
        this.result = spec
		this.plugin = plugin;
        this.options = options;
	}

	async onOpen() {
		let {contentEl} = this;

		//Create the top of the interface - header and input for Title of the new note
		contentEl.createEl('h2', { text: "Create from Template: " + this.result.templateID.name });
		contentEl.createEl('h4', { text: "Destination: " + this.result.settings.outputDirectory });
		const form = contentEl.createEl('div');

        //Create each of the fields
        this.result.settings.fields.forEach( f => {
            this.createInput(contentEl,this.result.data,f)
        })

        // And the extra controls at the bottom

        /* Should text be replaced? It's a combination of:
         * - if it is turned on in the plugin. Will be yes/no/if selection
         * - if that is overriden in the template - same values
         * - is there text selected
         * For now, just using the settings value that is passed in
        */ 
        const willReplace = () => {
            if( this.options.shouldReplaceSelection === "always" ) return true;
            if( this.options.shouldReplaceSelection === "sometimes" && this.result.input.length > 0 ) return true;
            return false;
        }
        this.options.willReplaceSelection = willReplace()

        const fieldNames = this.result.settings.fields.map(f => f.id)
        fieldNames.push("templateResult")
     
        let replacementText: TextComponent;
        new Setting(contentEl)
        .setName("Replacement String")
        //.setDesc(("String to replace selection with. Template fields: "+))
        //.setDesc(("String to replace selection with."))
        .addToggle(toggle => toggle
            .setValue(willReplace())
            .onChange(async (value) => {
                this.options.willReplaceSelection = value;
                replacementText.setDisabled(!value)
            }))
        .addText((text) => {
            replacementText = text;
            text.setValue(this.result.settings.textReplacementTemplate)
                .onChange((value) => {
                    this.result.settings.textReplacementTemplate = value
                })
                .setDisabled(!willReplace());
        })
        const label = contentEl.createEl("div", {text: "Available fields: " + fieldNames.join(", "), cls:"setting-item-description"})
        new Setting(contentEl)
        .setName("Create and open note")
        .setDesc(("Should the note be created / opened?"))
        .addDropdown((dropdown) => {
            dropdown
            .addOption("none","Don't create")
            .addOption("create","Create, but don't open")
            .addOption("open","Create and open")
            .addOption("open-pane","Create and open in new pane")
            .setValue(this.options.shouldCreateOpen)
            .onChange((value) => {
                this.options.shouldCreateOpen = value as CreateType
            });
        });            
	
		//And a submit button
		const submit = contentEl.createDiv({cls:"from-template-section"})
		const submitButton = submit.createEl('button', { text: "Add", cls:"from-template-submit" });
		//submitButton.style.cssText = 'align: right;';

		//On submit, get the data out of the form, pass through to main plugin for processing
		submitButton.addEventListener('click', () => {
            this.plugin.templateFilled(this.result,this.options)
			this.close()
		});

	}





	/*
	 * Creates the UI element for putting in the text. Takes a parent HTMLElement, and:
	 * - creates a div with a title for the control
	 * - creates a control, base on a field type. The 'field' parameter is taken from the template, and can be given as field:type
	*/
	createInput(parent:HTMLElement, data:Record<string,string>, field:TemplateField, initial:string=""){

        const id = field.id
        const inputType = field.inputType
        // Create div and label
		const controlEl = parent.createEl('div',{cls:"from-template-section"});
		const labelText = ucFirst(id) + ": ";
		const label = controlEl.createEl("label", {text: labelText, cls:"from-template-label"})
		label.htmlFor = id
         
        //Put the data into the record to start
        if( initial) data[field.id] = initial;

        if(inputType === "area") {
            const t = new TextAreaComponent(controlEl)
            .setValue(data[id])
            .onChange((value) => data[id] = value)
            t.inputEl.rows = 5;
            t.inputEl.cols = 50;
            t.inputEl.addClass("from-template-control")
        }
        else if( inputType === "choice") {
            const opts: Record<string,string> = {}
            field.args.forEach( f => opts[f] = ucFirst(f))
            const t = new DropdownComponent(controlEl)
            .addOptions(opts)
            .setValue(data[id])
            .onChange((value) => data[id] = value)
            //t.selectEl.addClass("from-template-control")
        }
        else if( inputType === "text") {
            const t = new TextComponent(controlEl)
            .setValue(data[id])
            .onChange((value) => data[id] = value)
            t.inputEl.addClass("from-template-control")
            t.inputEl.size = 50
        }
        
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();

	}
};

function ucFirst(s: string): string {
    return s[0].toUpperCase() + s.substring(1) 
}
