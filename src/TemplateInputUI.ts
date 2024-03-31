import { App, ButtonComponent, DropdownComponent, Editor, Modal, MomentFormatComponent, Notice, Plugin, PluginSettingTab, SearchComponent, Setting, TextAreaComponent, TextComponent, TFile, TFolder, Modifier, ToggleComponent, KeymapEventListener } from 'obsidian';
//import { BaseModal } from './BaseModal';
import FromTemplatePlugin  from './main';
import { CreateType, ActiveTemplate, TemplateField, BAD_CHARS_FOR_FILENAMES_MATCH, BAD_CHARS_FOR_FILENAMES_TEXT, ReplacementOptions, FolderOK } from './SharedInterfaces';
import { DateTime } from "luxon";
import { LinkSuggest, TagSuggest, ucFirst } from './UISupport';

export class TemplateInputUI extends Modal {
	plugin:FromTemplatePlugin
	result:ActiveTemplate
	options:ReplacementOptions
	constructor(app: App,plugin:FromTemplatePlugin,spec:ActiveTemplate, options:ReplacementOptions ) {
		super(app);
        this.result = spec
		this.plugin = plugin;
        this.options = options;
	}

	async onOpen() {
		let {contentEl} = this;
        this.modalEl.addClass("from-template-modal")

        //console.log("Data before filling out template",this.result.data)
		//Create the top of the interface - header and input for Title of the new note

		this.titleEl.createEl('h4', { text: "Create from Template"});
        const errorField = this.contentEl.createDiv({text:"", cls:"from-template-error-text"})
        const lowerError = this.contentEl.createDiv({text:"", cls:"from-template-error-text"})

        const setError = (error:string) => {
            this.modalEl.addClass("from-template-Error")
            errorField.removeAttribute("hidden")
            errorField.setText(error)
            lowerError.removeAttribute("hidden")
            lowerError.setText(error)
            //alert(error)
        }
        const setNeutral = () => {
            this.modalEl.removeClass("from-template-Error")
            errorField.setAttribute("hidden","true")
            lowerError.setAttribute("hidden","true")
        }
        setNeutral()

        const setValue = (id:string,value:any) => { this.result.data[id] = value; setNeutral() }

        //Create each of the fields
        console.debug("Fields",this.result.template.fields)
        this.result.template.fields.forEach( (field,index) => {
            this.createInput(contentEl,this.result.data,field,setValue,index)
        })

        const makeSubcontrol = (el:HTMLElement,title:string,content:string="",cls:string[]=[]) => {
            const sc = contentEl.createDiv({cls:["from-template-subsection","setting-item-description"]})
            sc.createSpan({text: `${title}:`,cls:"from-template-sublabel"}) 
            return sc.createSpan({text: `${content}`,cls:["from-template-subcontrol",...cls]}) 
        }
        contentEl.createEl("hr",{cls:"from-template-section-sep"})

        // An info box...
        makeSubcontrol(contentEl,"Template",`${this.result.templateID.name}`)
        makeSubcontrol(contentEl,"Destination",
            `${this.result.template.outputDirectory}/${this.result.template.templateFilename}.md`,
            ["from-template-code-span"]
            )

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

        const fieldNames = this.result.template.fields.map(f => f.id)
        fieldNames.push("templateResult")
     
        let replacementText: TextComponent;
        const setReplaceText = (r:string) => {
            replacementText.setValue(r)
            this.result.textReplacementString = r
        }
        const replaceSetting = new Setting(contentEl)
        .setName("Replace selected text")
        //.setDesc(("String to replace selection with. Template fields: "+))
        //.setDesc(("String to replace selection with."))
        .addToggle(toggle => toggle
            .setValue(willReplace())
            .onChange(async (value) => {
                this.options.willReplaceSelection = value;
                replacementText.setDisabled(!value)
            }))

        //const repDiv = contentEl.createEl("div", {text: "Replacement: ", cls:"setting-item-description"})
        const repDiv = makeSubcontrol(contentEl,"Replacement")
        replacementText = new TextComponent(repDiv)
            .setValue(this.result.textReplacementString)
            .onChange((value) => {
                this.result.textReplacementString =  value
            })
            .setDisabled(!willReplace());
        //replacementText.inputEl.size = 60



        const availFields = makeSubcontrol(contentEl,"Available")
        //const availFields = contentEl.createEl("div", {text: "Available fields: " , cls:"setting-item-description"})
        fieldNames.forEach(f => {
            const s = availFields.createEl("button",{text:f, cls:["from-template-inline-code-button"]})
            s.onClickEvent((e) => setReplaceText( replacementText.getValue() + `{{${f}}}` ) )
        })
        

        // Create buttons for the alternative replacements
        const alternatives = makeSubcontrol(contentEl,"Replacements")
        //const alternatives = contentEl.createEl("div", { text: `Replacements:`, cls:["setting-item-description","from-template-command-list"]})
        this.result.template.textReplacementTemplates.forEach( (r,i) => {
            const el = new ButtonComponent(alternatives)
                .setButtonText(`${i+1}: ${r}`).onClick((e) => setReplaceText(r)).buttonEl
            el.addClass("from-template-inline-code-button")
            el.tabIndex = -1
            this.scope.register(['Ctrl'],`${i+1}`,()=>setReplaceText(r))
        })

        new Setting(contentEl)
        .setName("Create and open note")
        .setDesc(("Should the note be created / opened?"))
        .addDropdown((dropdown) => {
            dropdown
            .addOption("none","Don't create")
            .addOption("create","Create, but don't open")
            .addOption("open","Create and open")
            .addOption("open-pane","Create and open in new pane")
            .addOption("open-tab","Create and open in new tab")
            .setValue(this.options.shouldCreateOpen)
            .onChange((value) => {
                this.options.shouldCreateOpen = value as CreateType
            });
        });



        //On submit, get the data out of the form, pass through to main plugin for processing
        const submitTemplate = async()  => {
            console.debug("Filling out template")
            let result = await this.result.template.fillOutTemplate(this.result)
            try {
                const r2 = await this.plugin.writeTemplate(result,this.options)
                if( r2 ) {
                    setError( r2 )
                }
                else this.close()
            } catch( error ) {
                console.debug("Unhandled error writing template",error)
                setError( "Unexpected problem creating file: " + result.filename + "\n" + error.toString())
            }
        }

		//And a submit button
		contentEl.createDiv({cls:"from-template-section"})
            .createEl('button', { text: "Add", cls:"from-template-submit" })
                .addEventListener("click",submitTemplate);
        this.scope.register(['Mod'],"enter",() => { submitTemplate() } )
        contentEl.appendChild(lowerError)

	}

	/*
	 * Creates the UI element for putting in the text. Takes a parent HTMLElement, and:
	 * - creates a div with a title for the control
	 * - creates a control, base on a field type. The 'field' parameter is taken from the template, and can be given as field:type
	*/
	createInput(parent:HTMLElement, data:Record<string,string>, field:TemplateField, setTemplateValue:(k:string,v:any)=>void, index:number=-1, initial:string=""){

        const id = field.id
        const inputType = field.inputType

        /*
         * Some fields don't need UI...
         */
        // Moved currentdate into fields that *do* need UI!
        if(id === "currentTitle") return;
        if(id === "currentPath") return;
  
        // Create div and label
		const controlEl = parent.createEl('div',{cls:"from-template-section"});
        
		const labelText = index < 9 ? `${field.description} (${index+1}): ` : `${field.description}: `;
		const labelContainer = controlEl.createEl("div", {cls:"from-template-label"})
		const label = labelContainer.createEl("label", {text: labelText})
		label.htmlFor = id

        //console.debug(`Creating field with initial: '${initial}'`,field)
         
        //Put the data into the record to start
        if( initial) data[field.id] = initial;

        let element:HTMLElement

        if(inputType === "area") {
            console.debug(field)
            const t = new TextAreaComponent(controlEl)
            .setValue(data[id])
            .onChange((value) => setTemplateValue(id,value))
            t.inputEl.rows = 5;
            element = t.inputEl
            if( field.args[0] && field.args[0].length ) 
                labelContainer.createEl("div", {text: field.args[0], cls:"from-template-description"})
        }
        else if( inputType === "text") {
            const initial = data[id] || (field.args.length ? field.args[0] : "")
            console.debug(field)
            // Make a function to all from somewhere else to fill in the value...
            const cb = (value:string) => {
                setTemplateValue(id, value)
            }
            //console.debug("Initial: ", initial)
            const t = new TextComponent(controlEl)
            .setValue(initial)
            .onChange( cb )
            t.inputEl.size = 50
            element = t.inputEl
            if( this.plugin.settings.inputSuggestions ) {
                if( id === "tags") new TagSuggest(element as HTMLInputElement,this.app, cb)
                else new LinkSuggest(element as HTMLInputElement, this.app, cb)
            }
            if( field.args[1] && field.args[1].length )
                labelContainer.createEl("div", {text: field.args[1], cls:"from-template-description"})
        }
        else if( inputType === "note-title") {
            const initial = data[id] || (field.args.length ? field.args[0] : "") 
            const initial_safe = initial.replace(BAD_CHARS_FOR_FILENAMES_MATCH,"")
            data[id] = initial_safe
            console.debug(field)
            const error = controlEl.createEl("div", {text: "Error! Characters not allowed in filenames: "+BAD_CHARS_FOR_FILENAMES_TEXT, cls:"from-template-error-text"})
            function updateError(v:string) { 
                const OK = v.match(BAD_CHARS_FOR_FILENAMES_MATCH) ? false : true
                if( OK ) error.setAttribute("hidden","true")
                else error.removeAttribute("hidden")
            }
            updateError(initial_safe)
            const t = new TextComponent(controlEl)
            .setValue(initial_safe)
            .onChange((value) => {setTemplateValue(id,value); updateError(value)})
            t.inputEl.size = 50
            element = t.inputEl
        }
        else if( inputType === "choice") {
            const opts: Record<string,string> = {}
            field.args.forEach( f => opts[f] = ucFirst(f))
            const t = new DropdownComponent(controlEl)
            .addOptions(opts)
            .setValue(data[id])
            .onChange((value) => setTemplateValue(id,value))
            element = t.selectEl
        }
        else if( inputType === "multi") {
            const selected: string[] = []
            const cont = controlEl.createSpan()
            field.args.forEach((f) => {
                const d = cont.createDiv({text:f})
                const t = new ToggleComponent(d)
                .setTooltip(f)
                .onChange((value) => {
                    if( value ) { selected.push(f)}
                    else {selected.remove(f)}
                    setTemplateValue(id, selected.join(", "))
                })
            }) 
            element = cont
        }
        /*
        else if( inputType === "search") {
            const t = new SearchComponent(controlEl)
            //.setValue(data[id])
            .onChange((value) => data[id] = value)
            t.inputEl.addClass("from-template-control")
        }
        else if( inputType === "moment") {
            const t = new MomentFormatComponent(controlEl)
            //.setValue(data[id])
            .onChange((value) => data[id] = value)
            t.inputEl.addClass("from-template-control")
        }
        */
        else if( inputType === "currentDate") {
            const fmt = field.args[0] || 'yyyy-MM-dd'
            const cur = DateTime.now().toFormat(fmt)
            data[id] = cur
            const t = new TextComponent(controlEl)
            .setValue(cur)
            .onChange((value) => setTemplateValue(id,value))
            t.inputEl.size = 50
            element = t.inputEl
        }


        if( element ) {
            if( index === 0 ) element.focus()
            element.addClass("from-template-control")
            if( index <= 8 ) this.scope.register(["Mod"],`${index+1}`,()=>element.focus())
        }
        
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();

	}
};



