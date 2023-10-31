import {  TFile, TFolder, Vault,  parseYaml} from 'obsidian';
import {  TemplateIdentifier, TemplateActionSettings,  TEMPLATE_FIELDS, ActiveTemplate } from './SharedInterfaces'
import { FullTemplate } from './Template';




export default class TemplateProcessing {
    vault:Vault
    constructor(vault:Vault) {
        this.vault = vault;
    }

    /*
     * Loads a template from the vault, and sets up default values as necessary
     */
    async loadTemplate(ts:TemplateIdentifier,defaults:TemplateActionSettings):Promise<FullTemplate> {
        const c = this.vault.getAbstractFileByPath(ts.path) as TFile
        if( c instanceof TFile ) {
            const data = await this.noteToTemplateData(ts.path)
            return new FullTemplate(data.body, data.template_settings, data.frontmatter, defaults)
        } 
    }

 

    /*
     * Sets a template up for use. Requires:
     * - template ID to find the template
     * - input text
     * - a delimiter to turn the input text into field values
     */
    async prepareTemplate(ts:TemplateIdentifier,defaults:TemplateActionSettings,input:string,delimiter:string="\\s+-\\s+") : Promise<ActiveTemplate> {
        console.log("Getting template ready...",ts)
		const template = await this.loadTemplate(ts,defaults)
        console.log("Got template: ",template)
        console.log("Splitting input: ",input, template.inputFieldList, delimiter)
		const fieldData = this.parseInput(input,template.inputFieldList,delimiter)
        return {
			template:template,
            input:input,
			templateID:ts,
            textReplacementString:template.textReplacementTemplates[0],
			data:fieldData,
		}
    }


    /*
     * Returns all the templates in a directory
     * Run through the settings directory and return an TemplateSettings for each valid file there
     */
	async getTemplateIdentifiersFromDirectory(directory:string) : Promise<TemplateIdentifier[]>  {
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

        const metadata = (await this.noteToTemplateData(c.path) ).template_settings
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

    /*
     * Reads in a markdown note file from the Vault, and returns:
     * - the body of the note
     * - a Record of the YAML frontmatter for the destination note
     * - a Record of the YAML that holds template settings and should not go into the destination note
     */
    async noteToTemplateData(path:string) {
        const data = await this.vault.read(this.vault.getAbstractFileByPath(path) as TFile)
        const fm_match = /---(.*)---(.*)$/sm
        console.log("Data: ",data)
        const m = data.match(fm_match)

        if( m ) {
            const fm = m[1];
            const body = m[2];
            const props:Record<string,any> = {}
            const temp_props:Record<string,any> = {}
            const fmy:Record<string,any> = parseYaml(fm)
            for( const key in fmy ) {
                if( TEMPLATE_FIELDS.contains (key) ) temp_props[key] = fmy[key]
                else props[key] = fmy[key]
            };
            return {
                body: body,
                frontmatter: props,
                template_settings:temp_props
            }
        }
        return {body:data, frontmatter:{}, template_settings:{}}
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


/*
 * Just produced in response to scanning for templates? Perhaps?
 */
export interface TemplateFolderSpec {
    location:TFolder
    depth:number
    numTemplates:number
}