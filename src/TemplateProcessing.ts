// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache';
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { normalizePath, TAbstractFile, TFile, TFolder, Vault, stringifyYaml, parseYaml} from 'obsidian';
import { defaultMaxListeners } from 'events';
import {ReplacementSpec, BAD_CHARS_FOR_FILENAMES_MATCH, BAD_CHARS_FOR_FILENAMES_TEXT, TemplateIdentifier, TemplateDefaults, TemplateSettings, TEMPLATE_FIELDS, TemplateField, TemplateFolderSpec} from './SharedInterfaces'



export default class TemplateProcessing {
    vault:Vault
    constructor(vault:Vault) {
        this.vault = vault;
    }

       /*
    Takes the replacement spec and creates:
    - a filled out version of the template body
    - a filled out version of the currently selected text in the editor
    */
    async fillOutTemplate(spec:ReplacementSpec) : Promise<[string,string,string]> {

        //console.log("Data after filling out template",spec.data)
		//Copy data across to all the alternative formulations of a field
		spec.settings.fields.forEach( f => {
			f.alternatives.forEach( a => spec.data[a] = spec.data[f.id])
		})
		
		//const template = await this.loadTemplate(spec.template);
		const filledTemplate = Mustache.render(spec.settings.templateBody,spec.data);
        spec.data['templateResult'] = metadataParser(filledTemplate).content
        const raw_filename = Mustache.render(spec.settings.templateFilename,spec.data)

        const filename = normalizePath(raw_filename.replace(BAD_CHARS_FOR_FILENAMES_MATCH,"")) //Quick and dirty regex for usable titles
        spec.data['filename'] = filename
        const replaceText = Mustache.render(spec.replacementTemplate,spec.data)
        return [filledTemplate,replaceText,filename]
    }

    /*
     * Sets a template up for use. Requires:
     * - template ID to find the template
     * - input text
     * - a delimiter to turn the input text into field values
     */
    async prepareTemplate(ts:TemplateIdentifier,defaults:TemplateDefaults,input:string,delimiter:string="\\s+-\\s+") : Promise<ReplacementSpec> {
		const templateSettings = await this.getTemplateSettings(ts,defaults)
		const fieldData = this.parseInput(input,templateSettings.inputFieldList,delimiter)
        return {
            input:input,
			templateID:ts,
			settings:templateSettings,
            replacementTemplate:templateSettings.textReplacementTemplates[0],
			data:fieldData,
		}
    }


    /*
     * Returns all the templates in a directory
     * Run through the settings directory and return an TemplateSettings for each valid file there
     */
	async getTemplates(directory:string) : Promise<TemplateIdentifier[]>  {
		const templateFolder:TFolder = this.vault.getAbstractFileByPath(directory) as TFolder
		if( ! templateFolder ) return Promise.all([])
        const children = templateFolder.children
        const files : TFile[] = templateFolder.children.filter( c => 
            {return c.path.endsWith(".md") && c instanceof TFile } ).map(c => c as TFile)
        const templates =  files.map( async c => this.getTemplateIdentifier(c) )
        return Promise.all( templates)
	}

    async getTemplateIdentifier(c:TFile) {
        try {

        const metadata = (await this.readMetadata(c.path) ).metadata
        const fn = c.basename
        const tmpl:TemplateIdentifier = {
            id:metadata['template-id'] || fn.toLowerCase(),
            name:metadata['template-name'] || fn,
            path:c.path,
        }
        return tmpl
        } catch( error ) {
            console.log("Couldn't read template: " + c.path, error )
            return {
                id: c.name.toLowerCase(),
                name: "Can't parse " + c.name,
                path:c.path, 
            }
        }
    }


    // Gets the YAML metadata for the given template path
    async readMetadata(path:string) {
        try {
            const data = await this.vault.read(this.vault.getAbstractFileByPath(path) as TFile)
            const result = metadataParser(data)
            return result
        } catch (error) {
            console.log("Couldn't read template file "+path, error)
        }
    }

    async getTemplateSettings(ts:TemplateIdentifier,defaults:TemplateDefaults):Promise<TemplateSettings> {
        const c = this.vault.getAbstractFileByPath(ts.path) as TFile
        if( c instanceof TFile ) {

            const template_data = await this.readMetadata(ts.path)
            if(! template_data ) return new Promise(null)
            const metadata = template_data.metadata
            const body = this.removeExtraYAML(metadata, template_data.content,TEMPLATE_FIELDS)

            const tmpl:TemplateSettings = {
                outputDirectory:metadata['template-output'] || defaults.outputDirectory,
                inputFieldList:metadata['template-input'] || defaults.inputFieldList,
                textReplacementTemplates:this.ensureArray( metadata['template-replacement'], defaults.textReplacementTemplate ),
                shouldReplaceInput:metadata['template-should-replace'] || defaults.replaceSelection,
                shouldCreateOpen:metadata['template-should-create'] || defaults.createOpen,
                templateFilename:metadata['template-filename'] || defaults.templateFilename,
                templateBody : body,
                fields : this.getTemplateFields(body,metadata)
            }
            //console.log("Fields:",tmpl.fields)
            return tmpl
        } 
    }

    ensureArray(a:any,backup:string=null) : string[] {
        const backupValue = backup ? [backup] : []
        if( !a ) return backupValue
        if( a instanceof Array ) return a
        if( typeof a === "string" ) return [a]
        return backupValue
    }

    /*
     * Strips out any of the YAML tags given in TEMPLATE_FIELDs from the template, and 
     * sticks it back together. Unfortuantely, doesn't guarantee order of fields,
     * and the status of quotes is a bit wobbly
     */
    removeExtraYAML(metadata:Record<string,any>,body:string,fields:string[]=TEMPLATE_FIELDS) : string {
        const md = {...metadata}
        fields.forEach(f => delete md[f])
        let yamlBlock = "---\n"
        for( const k in md ) {
            const v = md[k]
            if( typeof v === 'string' ) yamlBlock += `${k}: ${this.quoteYAML(v)}\n`
            else if( v instanceof Array ) {
                yamlBlock += `${k}:\n`
                v.forEach((x) =>  yamlBlock += `- ${this.quoteYAML(x)}\n`)
            } else {
                console.log("Unknown data",[k,v])
            }
        } 
        yamlBlock += "---\n" 
        return yamlBlock + body
    }
    //Quote YAML values if necessary - not implemented
    quoteYAML(s:string) : string {
        return s
    }


    // Pull out the tags that Mustache finds and turn them into TemplateFields ready for use
    getTemplateFields(template:string,metadata:Record<string,any>): TemplateField[] {
        // Returns tuples of type ["name","<tag>"] - maybe other types...
        //const templateFields: Array<Array<any>> = Mustache.parse(template);
        const templateFields: string[][] = Mustache.parse(template);
        
        const titleField:TemplateField = {id:"title",inputType:"note-title",args:[],alternatives:[]}

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

    // Parse an individual tag name into a TemplateField
    // Allows tags to be named e.g. {{title:text}}, or {{info:dropdown:a:b:c:}}
    // and turned into something useful
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

    /* 
    Parse the selected input in the editor, and turn it into values for some of the fields
    - input is the selected text, e.g. "Kevin - old friend - school"
    - spec is the list of field names, e.g. body,overview,tags
    - delimiter is what is between the different fields in the input (in this case " - ")
    */
    parseInput(input:string,spec:string,delimiter:string) : Record<string,string> {
        const fields = spec.split(",").map(s => s.trim())
        const input_parts = input.split(new RegExp(delimiter)).map(s=>s.trim())
        const zip = (a:string[], b:string[]) => Array.from(Array(Math.min(b.length, a.length)), (_, i) => [a[i], b[i]]);
        const r : Record<string,string> = {}
        zip(fields,input_parts).forEach(f => r[f[0]] = f[1])
        return r
    }

    /*
    Combines one TemplateField with another. Currently just adds the alternative manifestations,
    e.g. '{{body}}' and '{{body:text}}', but might want to be more clever in the future in case
    the second declaration of the tag in the template has more info.
    */
    mergeField(current:TemplateField,additional:TemplateField) {
        if( current.inputType === "text" ) current.inputType = additional.inputType
        if( additional.args.length > current.args.length ) current.args = additional.args
        current.alternatives = current.alternatives.concat(additional.alternatives)
    }

    countTemplates(folder:string) : number | undefined {
		const templateFolder:TFolder = this.vault.getAbstractFileByPath(folder) as TFolder
        if( !templateFolder ) return undefined
        let templates  = templateFolder.children.filter(t => t.path.endsWith(".md"))
        return templates.length
    }

    getTemplateFolders() {
        const descend = (t:TFolder,i:number,all:TemplateFolderSpec[]) => {
            if(i > 0) all.push({location:t,depth:i+1,numTemplates:this.countTemplates(t.path)})
            t.children.filter(f => f instanceof TFolder).forEach(f => descend(f as TFolder,i+1,all))
        }
        const result:TemplateFolderSpec[] = []
        descend(this.vault.getRoot(),0,result)
        console.log(result)
        return result
    }
}