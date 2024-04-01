import { AbstractInputSuggest, App, FuzzySuggestModal, Modal, SearchResult, TFile, TextComponent, fuzzySearch, prepareFuzzySearch } from "obsidian";
import { FolderOK } from "./SharedInterfaces";


export class FolderCreateUI extends Modal {
    input:FolderOK
    func:()=>void;
    constructor(app:App,input:FolderOK,func:()=>void) {
        super(app)
        this.input = input
        this.func = func
    }
	async onOpen() {
		let {contentEl} = this;
        //this.modalEl.addClass("from-template-modal")
    		//And a submit button
        const folder_to_create = 
		contentEl.createEl('h4', { text: "Missing parent folder for note"});
        contentEl.createEl('div',{text: this.input.path,cls:"from-template-error-text"})
        contentEl.createEl('hr')
        const folDiv = contentEl.createDiv()
        folDiv.createEl('div',{text: "The following paths are missing: "})
        const pDiv = folDiv.createEl('div',{cls:"from-template-folder-container"})
        const goodDiv = pDiv.createEl('span',{cls:"from-template-folder-OK"})
        for( const g in this.input.good ) {
            goodDiv.createEl('span',{text: "✅ "+this.input.good[g],cls:"from-template-ok-text"})
            goodDiv.createEl('span',{text: " / "})
        }
        const badDiv = pDiv.createEl('span',{cls:"from-template-folder-bad"})
        for( const b in this.input.bad ) {
            badDiv.createEl('span',{text: "⚠️ "+this.input.bad[b],cls:"from-template-error-text"})
            badDiv.createEl('span',{text: " / "})
        }
        contentEl.createEl('hr')
		const submits = contentEl.createDiv()
        const createFolder = () => {
            this.app.vault.createFolder(this.input.path)
            this.close()
            this.func()
        }
        const notCreateFolder = () => {
            this.close()
            this.func()
        }
        submits.createEl('button', { text: "Create"})
            .addEventListener("click",createFolder);
        submits.createEl('button', { text: "Don't Create"})
            .addEventListener("click",notCreateFolder);
    }
}


/*
 * Class that can be added to an existing inputElement to add suggestions.
 * It needs an implementation of `getContent` to provide the set of things to suggest from
 * By default it does a FuzzySearch over these: this can be changed to a simple search
 * by overriding `getSuggestions`
 * `targetMatch` is a regex that finds the part of the input to use as a search term
 * It should provide two groups: the first one is left alone, the second one is the
 * search term, and is replaced by the result of the suggestions. By default, it's
 * a comma separator.
 * 
 */
abstract class AddTextSuggest extends AbstractInputSuggest<string> {
    content: string[];
    targetMatch = /^(.*),\s*([^,]*)/


    constructor(private inputEl: HTMLInputElement, app: App, private onSelectCb: (value: string) => void = (v)=>{}) {
        super(app, inputEl);
        this.content = this.getContent();
    }

    getSuggestions(inputStr: string): string[] {
		return this.doFuzzySearch(this.getParts(inputStr)[1]);
    }

    /*
     * Returns the bit at the beginning to ignore [0] and the target bit [1]
     */
    getParts(input:string) : [string,string] {
        const m = input.match(this.targetMatch)
        if(m) {
            return [m[1],m[2]]
        } else {
            return ["",input]
        }
    }

    doSimpleSearch(target:string) : string[] {
        if( ! target || target.length < 2 ) return []
        //fuzzySearch
        const lowerCaseInputStr = target.toLocaleLowerCase();
        const t = this.content.filter((content) =>
            content.toLocaleLowerCase().contains(lowerCaseInputStr)
        );
        return t
    }

    doFuzzySearch(target:string,maxResults=20,minScore=-2) : string[] {
        if( ! target || target.length < 2 ) return []
        const fuzzy = prepareFuzzySearch(target)
        const matches:[string,SearchResult][] = this.content.map((c)=>[c,fuzzy(c)])
        const goodMatches = matches.filter((i)=>(i[1] && i[1]['score'] > minScore))
        goodMatches.sort((c)=>c[1]['score'])
        const ret = goodMatches.map((c)=>c[0])
        return ret.slice(0,maxResults)
    }

    renderSuggestion(content: string, el: HTMLElement): void {
        el.setText(content);
    }

    selectSuggestion(content: string, evt: MouseEvent | KeyboardEvent): void {
        this.onSelectCb(content);
        let [head,tail] = this.getParts(this.inputEl.value)
        //console.log(`Got '${head}','${tail}' from `, this.inputEl.value)
        if( head.length > 0 ) this.inputEl.value = head + ", " +this.wrapContent(content)
        else this.inputEl.value = this.wrapContent(content) 
        this.inputEl.dispatchEvent(new Event("change"))
        this.inputEl.setSelectionRange(0, 1)
        this.inputEl.setSelectionRange(this.inputEl.value.length,this.inputEl.value.length)
        this.inputEl.focus()
        this.close();
    }

    wrapContent(content:string):string {
        return content
    }

    abstract getContent(): string[];

}

export class TagSuggest extends AddTextSuggest {
	getContent() {
		// @ts-ignore - this is an undocumented function...
		const tagMap:Map<string,any> = this.app.metadataCache.getTags();
        return Object.keys(tagMap).map((k)=>k.replace("#",""))
	  }
}

export class LinkSuggest extends AddTextSuggest {
	getContent() {
        return this.app.vault.getFiles().filter((f)=>f.extension === "md").map((f)=>f.basename)
    }

    getSuggestions(inputStr: string): string[] {
		const target = this.getParts(inputStr)[1];
        const m = target.match(/\s*\[\[(.*)/);
        if( ! m || m.length < 2 || m[1].length < 1) return []
        //console.log(m)
        const newTarget = m[1]
        //console.log("Got newTarget ",newTarget," from  ",target)
		return this.doFuzzySearch(newTarget)
    }

    wrapContent(content:string):string {
        return `[[${content}]]`
    }
}

/* Experiment towards making a UI that turns suggestions in to visually distinct elements
export class ContentEditableTest extends Modal {
    editDiv:HTMLDivElement

    async onOpen() {
		let {contentEl} = this; 
        contentEl.createEl("h4",{text:"ContentEditable"})
        this.editDiv = contentEl.createEl("div",{text:"Edit me"})
        this.editDiv.setAttribute("contenteditable","true")
        this.addElement("hello","from-template-text-completion-a")
        this.addElement("there","from-template-text-completion-b")

    }

    addElement(tx:string, cls:string) {
        const el = this.editDiv.createSpan(cls)
        el.setText(tx)
        const but = el.createEl("button")
        but.setText("X")
        but.onclick = () => el.detach()
    }
}
*/

export function ucFirst(s: string): string {
    return s[0].toUpperCase() + s.substring(1) 
}