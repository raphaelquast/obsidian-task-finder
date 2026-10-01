const obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
	"defaultQuery": "@u +-2w #* ",
	"queryDebounceTime": 100,
	"taskViewLimit": 1000,
	"excludedFolders": [],
	"excludedFoldersRegex": [],
	"includeStatus":"unchecked",
	"folderQueries":[],
	"showCacheRefreshMessage": true,
	"groupTasks":"date",
	"includeSubTasks":true,
	"showPath":true,
	"tagIcons": [],
}

class FolderSuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl) {
	super(plugin.app, inputEl)
	this.plugin = plugin
	this.inputEl = inputEl
	this.content = plugin.app.vault.getAllFolders().map((t)=>t.path)
}

	getSuggestions(query) {
		const lowerCaseQuery = query.toLowerCase()
		// filter files in excludedFolders (or sub-directories thereof)

		// find regex patterns and "normal paths"
		let excludedFolders = Object.groupBy(this.plugin.settings.excludedFolders, (f)=> f.startsWith("regex:"))
		if (excludedFolders[true]) {
			excludedFolders[true] = excludedFolders[true].map((ef) => new RegExp(ef.replace("regex:", "").trimStart()))
		}

		let watched_folders = this.content;
		if (excludedFolders[false]) { watched_folders = watched_folders.filter((f) => !excludedFolders[false].some((ef)=> f.startsWith(ef))) }
		if (excludedFolders[true]) { watched_folders = watched_folders.filter((f) => !excludedFolders[true].some((r) => f.match(r))) }

		return watched_folders.filter((f)=>f.includes(lowerCaseQuery))
	}

	renderSuggestion(content, el) {
		el.setText(content)
	}

	async selectSuggestion(content, evt) {
	}
}

class QueryFolderSuggest extends FolderSuggest {
	constructor(plugin, inputEl) {
	super(plugin, inputEl)
	}

	getSuggestions(query) {
		this.content = this.plugin.allFolders

		const words = query.split(" ")
		let word = words.at(-1)
	if (word){
		word = word.startsWith("$")?word.slice(1):word
		word = word.startsWith("~$")?word.slice(2):word
		return super.getSuggestions(word)
	}
	}

	renderSuggestion(content, el) {
		el.setText(content)
	}

	async selectSuggestion(content, evt) {
		let query = this.inputEl.value
		const words = query.split(" ")
		const word = words.at(-1)
		if (word && (word.startsWith("$") | word.startsWith("~$"))) {
			this.inputEl.value = words.slice(0, -1).join(" ") + ` $${content} `
			this.inputEl.dispatchEvent(new Event('input', { 'bubbles': true }));
		}
		this.close()
	}
}

class SettingsFolderSuggest extends FolderSuggest {
	async selectSuggestion(content, evt) {
		//this.inputEl.value = content
		this.plugin.settings.excludedFolders.push(content)
		await this.plugin.saveSettings();
		this.plugin.settingTab.update();
		this.close()
	}
}

class SettingsFolderQuerySuggest extends SettingsFolderSuggest {
	async selectSuggestion(content, evt) {
		this.plugin.settings.folderQueries.push([content, this.plugin.settings.folder_query.getValue()])
		await this.plugin.saveSettings();
		this.plugin.settingTab.update();
		this.close()
	}
}

class StatusSuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl) {
	super(plugin.app, inputEl)
	this.plugin = plugin
	this.inputEl = inputEl
	}

	getSuggestions(query) {
		const words = query.split(" ")
		if (words && (words.at(-1).startsWith("?") | words.at(-1).startsWith("~?"))) { return this.plugin.allStatuses } else { this.close() }
	}

	renderSuggestion(content, el) {
		const c = el.createEl('input',
			{cls:'task-list-item-checkbox',
			 type: 'checkbox',
			 attr: {checked:true, 'data-task':content}});
		if (content == " ") {c.checked = false}
	}

	async selectSuggestion(content, evt) {
		this.inputEl.value += (content==" ")?"~":content;
		this.inputEl.dispatchEvent(new Event('input', { 'bubbles': true }));
		}
}


class lucideIconSuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl) {
	super(plugin.app, inputEl)
	this.plugin = plugin
	this.inputEl = inputEl
	this.content = obsidian.getIconIds()
	}

	getSuggestions(query) {
		return this.content.filter((i) => i.includes(query))
	}

	renderSuggestion(content, el) {
		const i = el.createEl('div', {cls:"task_finder_tag_icon"});
		i.style.color = this.plugin.settings.iconColorPicker.getValue()

		obsidian.setIcon(i, content)
	}

	async selectSuggestion(content, evt) {
		this.plugin.settings.tagIcons.push([this.plugin.settings.tag_icon_query.getValue(), content, this.plugin.settings.iconColorPicker.getValue()]);
		await this.plugin.saveSettings();
		this.plugin.settingTab.update();
		this.close()
		}
}


class settingsTagSuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl) {
	super(plugin.app, inputEl)
	this.plugin = plugin
	this.inputEl = inputEl

	this.content = Object.keys(plugin.app.metadataCache.getTags())
	}

	getSuggestions(query) {
		return this.content.filter((t)=>t.toLowerCase().includes(query))
	}

	renderSuggestion(content, el) {
		el.createEl('a', {cls:'tag colored-tag-task', text:content, attr:{href:content}});
	}

	async selectSuggestion(content, evt) {
		this.plugin.settings.tag_for_icon = content
		this.inputEl.value = content
		this.inputEl.dispatchEvent(new Event('input', { 'bubbles': true }));
		this.close()
	}
}


class TagSuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl) {
	super(plugin.app, inputEl)
	this.plugin = plugin
	this.inputEl = inputEl
}

	getSuggestions(query) {
		const words = query.split(" ")
		if (words && words.at(-1).startsWith("#")) {
			return this.plugin.allTags.filter((t) => t.toLowerCase().includes(words.at(-1).toLowerCase().slice(1)))
		} else { this.close() }
	}

	renderSuggestion(content, el) {
		el.createEl('a', {cls:'tag colored-tag-task', text:content, attr:{href:content}});
	}

	async selectSuggestion(content, evt) {
		let query = this.inputEl.value
		const words = query.split(" ")
		const word = words.at(-1)
		if (word && word.startsWith("#")) {
			this.inputEl.value = words.slice(0, -1).join(" ") + ` ${content} `
			this.inputEl.dispatchEvent(new Event('input', { 'bubbles': true }));
		}
		this.close()
	}
}


class SettingTab extends obsidian.PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
		}

	addQueryStrdesc(el, str, desc) {
		const d = el.createEl("div", {cls:"task_finder_settings_query_item"});
		d.createEl("div", {cls:"task_finder_settings_query_str", text:str})
		const infoEl = d.createEl("div", {cls:"task_finder_settings_query_desc", text:desc})
		return infoEl
	}

	getSettingDefinitions() {

    return [
		{
		  name: 'Task check-status',
		  desc: 'Set which tasks to include based on their check-status.',
		  control: {
			type: 'dropdown',
			key: 'includeStatus',
			defaultValue: DEFAULT_SETTINGS.includeStatus,
			options: { 'unchecked': 'Only unchecked tasks', 'checked': 'Only checked tasks', 'all': 'All tasks' },
		  },
		},
		{name: 'Default Query', desc: 'The default query to use.',
		 control: { type: 'text', key: 'defaultQuery', placeholder: 'Enter default query'} },
	    {name: 'Test', render: (setting) => {
			let containerEl = setting.infoEl
			let e
			containerEl.empty();
			const d = containerEl.createEl("div", {cls:"task_finder_settings_query_container", text:"Query Language:"});

			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Set anchor date:"});
			this.addQueryStrdesc(d, "@DDMMYYYY", "Set 'anchor-date' (default: today).")
			this.addQueryStrdesc(d, "@DDMM", "Set 'anchor-date' to month/day of current year.")
			this.addQueryStrdesc(d, "@DD", "Set 'anchor-date' to day of current month.")
			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Include unscheduled tasks:"});
			this.addQueryStrdesc(d, "@u", "Include 'unscheduled' tasks when querying a time-period.")

			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Query date ranges:"});
			e = this.addQueryStrdesc(d, "+", "Show all future tasks.")
			e = this.addQueryStrdesc(d, "-", "Show all tasks from the past.")
			e = this.addQueryStrdesc(d, "+-5d", "Limit tasks to a time-period relative to the 'anchor-date'.")
			e.createEl("div", {text:"+ future | - past | +- future&past"})
			e.createEl("div", {text:"d:days (default), w:weeks, m:months, y:years"})


			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Query file- and inline-tags:"});
			this.addQueryStrdesc(d, "#", "Include only tasks with inline- or file-tags.")
			this.addQueryStrdesc(d, "#*", "Include only tasks with inline-tags.")
			this.addQueryStrdesc(d, "#tag", "Include only tasks with the mentioned inline- or file-tags.")
			this.addQueryStrdesc(d, "~#tag", "Exclude tasks with the mentioned inline- or file-tag.")

			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Query task-statuses:"});
			e = this.addQueryStrdesc(d, "?...", "Include only tasks with the mentioned tag-statuses.")
			e.createEl("div", {text:"( For empty task-status use ~ )"})
			e.createEl("div", {text:"(For example: ?!fl~ will include task-statuses [!], [f], [l] and [ ]. )"})
			e = this.addQueryStrdesc(d, "~?...", "Exclude tasks with the mentioned tag-statuses.")

		}},


		{
		type:"page",
		name: "️⛔ Exclude Folders",
		desc:`Exclude folders from the TaskFinder search. (${this.plugin.settings.excludedFolders.length} excluded folders assigned!)`,
		items:[
		{
		render: (setting) => {
			setting.settingEl.className = "task_finder_setting_add_folder"
			let containerEl = setting.infoEl
			containerEl.empty();
			new obsidian.Setting(containerEl)
			.setName("Add excluded folder")
			.setDesc("Use 'regex:<pattern>' to define a RegEx pattern.")
			.addSearch((search) => {
				search.setPlaceholder('Add Folder or RegEx')

				function getOnKeypress (plugin) { return async (e) => {
					if (e.key === 'Enter') {
						plugin.settings.excludedFolders.push(search.inputEl.value);
						await plugin.saveSettings();
						plugin.settingTab.update();
					};
				};
				}

				search.inputEl.addEventListener('keypress', getOnKeypress(this.plugin))
				new SettingsFolderSuggest(this.plugin, search.inputEl);
				})
		}},
			{
				type: 'list',
				heading: 'Excluded Folders',
				emptyState: 'No excluded folders set.',
				//addItem: {
				//name: 'Add task status',
				//action: () => new AddNewTaskStatusEntry(this.app, async (item) => await this.onNewItem(item)).open(),
				//},
				onReorder: async (oldIndex, newIndex) => {
					let folders = this.plugin.settings.excludedFolders;
					let [moved] = folders.splice(oldIndex, 1);
					folders.splice(newIndex, 0, moved);
					await this.plugin.saveData(this.plugin.settings);
					this.update();
				},
				onDelete: async (idx) => {
					this.plugin.settings.excludedFolders.splice(idx, 1);
					await this.plugin.saveData(this.plugin.settings);
					this.update();
				},
				items: this.plugin.settings.excludedFolders.map((f) => ({
					name: f,
					searchable: false,
					})),
		},
		]
	},

	{
	type:"page",
	name: "📂 Folder Queries",
	desc:`Change the default query based on the folder of the active note. (${this.plugin.settings.folderQueries.length} folder-queries assigned!)`,
	items:[
		{
		render: (setting) => {
			setting.settingEl.className = "task_finder_setting_add_folder"
			let containerEl = setting.infoEl
			containerEl.empty();
			new obsidian.Setting(containerEl)
			.setName("Add folder query")
			.setDesc("Set default query used when editing a file in a given folder.")
			.addSearch((search) => {
				search.setPlaceholder("Query")
				this.plugin.settings.folder_query = search
				})
			.addSearch((search) => {
				search.setPlaceholder('Folder')
				new SettingsFolderQuerySuggest(this.plugin, search.inputEl);
			})
		}},
		{
		type: 'list',
		heading: 'Folder Queries',
		emptyState: 'No folder query set.',
		onReorder: async (oldIndex, newIndex) => {
			let folders = this.plugin.settings.folderQueries;
			let [moved] = folders.splice(oldIndex, 1);
			folders.splice(newIndex, 0, moved);
			await this.plugin.saveData(this.plugin.settings);
			this.update();
		},
		onDelete: async (idx) => {
			this.plugin.settings.folderQueries.splice(idx, 1);
			await this.plugin.saveData(this.plugin.settings);
			this.update();
		},
		items: this.plugin.settings.folderQueries.map((f) => ({
			name: `${f[0]}: "${f[1]}"`,
			searchable: false,
			})),
		},
		]
	},

	{
	type:"page",
	name: "🏷️ Tag Icons",
	desc:`Select icons to represent tags. (${this.plugin.settings.tagIcons.length} tag-icons assigned!)`,
	items:[
		{
		render: (setting) => {
			setting.settingEl.className = "task_finder_setting_add_tag_icon"
			let containerEl = setting.infoEl
			containerEl.empty();
			new obsidian.Setting(containerEl)
			.setName("Add tag icon")
			.setDesc("Add an icon to represent a tag.")
			.addSearch((search) => {
				search.setPlaceholder('Tag')
				new settingsTagSuggest(this.plugin, search.inputEl);
				this.plugin.settings.tag_icon_query = search
				})
			.addColorPicker((e)=>{
				let values = getComputedStyle(document.querySelector('body')).getPropertyValue("--color-red-rgb").split(",").map(x=>Number(x))
				if (values){
					const keys = ["r", "g", "b"]
					const rgb = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
					e.setValueRgb(rgb)
				}

				this.plugin.settings.iconColorPicker = e;
				})


			.addSearch((search) => {
				search.setPlaceholder('Icon')
				function getOnKeypress (plugin) { return async (e) => {
					if (e.key === 'Enter') {
						await plugin.saveSettings();
						plugin.settingTab.update();
					};
				};
				}

				search.inputEl.addEventListener('keypress', getOnKeypress(this.plugin))
				new lucideIconSuggest(this.plugin, search.inputEl);
				})

		}},

		{
		type: 'list',
		heading: `Tag Icons`,
		emptyState: 'No tag icons set.',
		onReorder: async (oldIndex, newIndex) => {
			let icons = this.plugin.settings.tagIcons;
			let [moved] = icons.splice(oldIndex, 1);
			icons.splice(newIndex, 0, moved);
			await this.plugin.saveData(this.plugin.settings);
			this.update();
		},
		onDelete: async (idx) => {
			this.plugin.settings.tagIcons.splice(idx, 1);
			await this.plugin.saveData(this.plugin.settings);
			this.update();
		},
		items: this.plugin.settings.tagIcons.map((f) => ({
			//name: `${f[0]}: "${f[1]}"`,
			//searchable: false,
			render: (item) => {
				item.nameEl.className = "task_finder_tag_icon_settings_row"
				const r = item.nameEl
				const iconspan = r.createEl("span", {cls:"task_finder_tag_icon"})
				iconspan.style.color = f[2]
				obsidian.setIcon(iconspan, f[1]);
				r.createEl("span", {text:`(${f[1]})`})
				r.createEl("p", {text:`:`})
				r.createEl('a', {cls:'tag colored-tag-task', text:f[0], attr:{href:f[0]}});

				}
			})),
		},
		]
	},

	{
	  name: 'Task grouping',
	  desc: 'Set property that is used to group the tasks.',
	  control: {
		type: 'dropdown',
		key: 'groupTasks',
		defaultValue: DEFAULT_SETTINGS.groupTasks,
		options: { 'date': 'Task Date', 'filename': 'File Name' },
	  },
	},
	{name: 'Include sub-tasks?', desc: 'If true, tasks defined in callouts, nested lists etc. are included in the search. Otherwise, only tasks defined at the START OF A LINE are included in the search!',
	control: { type: 'toggle', key: 'includeSubTasks' }},
	{name: 'Show Path?', desc: 'If true, file-paths are shown below the tasks.',
	control: { type: 'toggle', key: 'showPath' }},
	{name: 'Query Debounce Time', desc: 'The time between typing and query-execution (miliseconds).',
	 control: { type: 'number', key: 'queryDebounceTime', placeholder: 'Enter query debounce time', min: 0} },
	{name: 'Task View Limit', desc: 'The max. number of tasks shown.',
	 control: { type: 'number', key: 'taskViewLimit', placeholder: 'Enter task view limit', min: 1} },
	{name: 'Show task-cache refresh message.', desc: 'Show a message indicating changed files and duration of task-cache evaluation.',
	 control: { type: 'toggle', key: 'showCacheRefreshMessage'} },
	]
	}
}


function sortByTime(a, b) {
    if (a.date === null) {
        return 1;
    }
    if (b.date === null) {
        return -1;
    }
	return a.date - b.date
}

class TaskSuggester extends obsidian.SuggestModal {
  constructor(plugin, content) {
	  super(plugin.app)
	  this.plugin = plugin

	  this.limit = this.plugin.settings.taskViewLimit
	  this.component = new obsidian.Component()
	  this.component.load()

	  this.content = content.sort(sortByTime)
	  this.debounceonInput = obsidian.debounce(() => { super.onInput(); }, this.plugin.settings.queryDebounceTime, true)

	  this.emptyStateText = "Oh nice... seems like there's nothing to do!"
	  this.inputEl.placeholder = "@: date  |  +-: range  |  #: tags  |  ?: status  |  $: path"
	  // attach auto-completer
	  new StatusSuggest(this.plugin, this.inputEl)
	  new TagSuggest(this.plugin, this.inputEl)
	  new QueryFolderSuggest(this.plugin, this.inputEl)
  }

  createHeader(el) {
	  const header = el.createEl("div", {cls:"task_finder_modal_header"})
	  header.setAttribute("id", "task_finder_header")

	  const dateEl = header.createEl("div", {attr: {id:'task_finder_header_date'}})

	  this.h_anchor_date_el = dateEl.createEl("span", {attr: {id:'task_finder_h_anchor_date'}})
	  this.h_date_range_el = dateEl.createEl("span", {attr: {id:'task_finder_h_date_range'}})

  	  const commentEl = header.createEl("div", {attr: {id:'task_finder_h_comment'}})
	  this.h_comment_tags_el = commentEl.createEl("span", {attr: {id:'task_finder_header_comment_tags'}})
	  this.h_comment_unchecked_el = commentEl.createEl("span", {attr: {id:'task_finder_header_comment_unchecked'}})
	  this.h_comment_statuses_el = commentEl.createEl("span", {attr: {id:'task_finder_header_comment_statuses'}})

	  this.h_ntasks_el = header.createEl("span", {attr: {id:'task_finder_header_ntasks'}})
  }

  onOpen() {
	  this.inputEl.defaultValue = this.plugin.settings.defaultQuery

	  const active_file = this.plugin.app.workspace.getActiveFile()
	  if ( active_file ) {
		  // check if file is in a folder that has a folderQuery defined
		 for (const folderQuery of this.plugin.settings.folderQueries) {
			 if (active_file.path.startsWith(folderQuery[0])) { this.inputEl.defaultValue = folderQuery[1]; break}
		 }
	  }
	  // set cursor to end
	  this.inputEl.setSelectionRange(0,this.inputEl.defaultValue.length)
	  // trigger query
	  this.onInput()
	  this.createHeader(this.modalEl)
  }

  onInput () { this.debounceonInput();}

  // Returns all available suggestions.
  getSuggestions(query){

	let use_content = this.content


	// check how to handle tasks without a date (e.g. unscheduled)
	let unscheduled_match = query.match(/(?<=^|\s)@u#?(#\*)?(?=\s|$)/)
	let include_unscheduled = false
	let require_unscheduled_tags = false
	let require_unscheduled_inline_tags = false


	if (unscheduled_match){
		query = query.replace(unscheduled_match[0], "")

		include_unscheduled = true
		require_unscheduled_tags = unscheduled_match[0] == "@u#"
		require_unscheduled_inline_tags = unscheduled_match[0] == "@u#*"
	}


	// check if we want to show only tasks with inline-tags
	// (NOTE: do this after searching for @u#* to avoid issues replacing #*)
	const require_inline_tags_match = query.match(/(?<=^|\s)#\*(?=\s|$)/)
	const require_inline_tags = require_inline_tags_match?true:false
	if (require_inline_tags_match) {
		query = query.replace(require_inline_tags_match[0], "")
	}


	// check if anchor-date is set
	const datematch = query.match(/(?<=^|\s)(?:@)(\d{8}|\d{4}|\d{2}|\d)?(?=\s|$)/)
	let datestr, date, startvalue, endvalue;
	let now = moment();
	if ( datematch ) {
		query = query.replace(datematch[0], "")
		date = datematch[1]?datematch[1]:null

		// set date anchor
		if ( date ) {
			if (date.length == 8) {
				now = moment(date, 'DDMMYYYY')
			} else if (date.length == 4) {
				now = moment(`${now.format('YYYY')}${date}`, "YYYYDDMM")
			} else if (date.length == 2 | date.length == 1) {
				now = moment(`${now.format('YYYYMM')}${date.padStart(2, "0")}`, "YYYYMMDD")
			}
		}

		startvalue = now.clone().startOf("day");
		endvalue = now.clone().endOf("day");
	}

	// check if date-range is set
	const rangematch = query.match(/(?<=^|\s)([+-]?[+-])(\d*)?([dwmy])?(?=\s|$)/)
	let rangestr, direction, value, unit;
	if ( rangematch ) {
		[rangestr, direction, value, unit] = rangematch
		query = query.replace(rangestr, "")
	}

	if ( direction ) {
		startvalue = now.clone().startOf("day");
		endvalue = now.clone().endOf("day");

		// treat lower-case "m" as Month ("M")
		if ( !unit ) {unit = "d"} else if ( unit == "m" ) { unit = "M" }
		if (direction.includes("-")) { startvalue = (value)?now.clone().startOf("day").subtract(value, unit):null; }
		if (direction.includes("+")) { endvalue = (value)?now.clone().endOf("day").add(value, unit):null; }
	}

	const show_scheduled = ((datematch?true:false) | (rangematch?true:false)) | !include_unscheduled
	const show_unscheduled = !((datematch?true:false) | (rangematch?true:false)) | include_unscheduled

	use_content = use_content.filter((t) =>  {
		if ((t.date == null) && show_unscheduled ) {
			if (require_unscheduled_inline_tags){
				return (t.tags)?t.tags.length > 0:false
			} else if (require_unscheduled_tags) {
				return (((t.tags)?t.tags.length > 0:false) | ((t.file_tags)?t.file_tags.length > 0:false))
			} else {
				return true
			}
		} else if ((t.date != null) && show_scheduled) {
			// skip in case no inline tag is set
			if (require_inline_tags_match) { if (!t.tags | (t.tags && t.tags.length==0)) { return false} }
			return (((startvalue)?t.date.isSameOrAfter(startvalue):true) && ((endvalue)?t.date.isSameOrBefore(endvalue):true))

		} else {
			return false
		}

		}
	)

	// check if we want to use only tasks with inline-tags
	//const require_inline_tags = query.includes("#*")

	//if ( require_inline_tags ) {
	//	use_content = use_content.filter((t) => (t.tags)?t.tags.length>0:false);
	//	query = query.replace("#*", "")
	//}


	// check include task statuses
	const require_checkstatus_tags = query.match(/(?<=^|\s)\?(\S+)?(?=\s|$)/)
	let required_task_statuses = [];
	if ( require_checkstatus_tags ) {
		query = query.replace(require_checkstatus_tags[0], "")
		if (require_checkstatus_tags[1]){
			const usestatuses = require_checkstatus_tags[1].replace("~", " ")
			required_task_statuses.push(...usestatuses.split(''))

			required_task_statuses = [...new Set(required_task_statuses)].sort()
			use_content = use_content.filter((t) => required_task_statuses.includes(t.task_status));
		}
	}

	// check exclude task statuses
	const exclude_checkstatus_tags = query.match(/(?<=^|\s)\~\?(\S+)?(?=\s|$)/)
	let excluded_task_statuses = [];
	if ( exclude_checkstatus_tags ) {
		query = query.replace(exclude_checkstatus_tags[0], "")
		if (exclude_checkstatus_tags[1]){
			const usestatuses = exclude_checkstatus_tags[1].replace("~", " ")
			excluded_task_statuses.push(...usestatuses.split(''))

			excluded_task_statuses = [...new Set(excluded_task_statuses)].sort()
			use_content = use_content.filter((t) => !excluded_task_statuses.includes(t.task_status));
		}
	}

	// check exclude tags
	const excludedtagmatch = query.match(/(?<=^|\s)~#(\S*)(?=\s|$)/g)
	if ( excludedtagmatch ) {
		for (i in excludedtagmatch) {
			query = query.replace(excludedtagmatch[i], "")
			excludedtagmatch[i] = excludedtagmatch[i].slice(1).trim().toLowerCase()
			}

		function checkexcludedtags(task) {
			return excludedtagmatch.every( ( tag ) => {
				if ( task.file_tags ) {
					if (task.file_tags.some((t) => t.toLowerCase().includes(tag))) { return false }
				}
				if ( task.tags ) {
					if (task.tags.some((t) => t.toLowerCase().includes(tag))) { return false }
				}
				return true
			})
		}

		use_content = use_content.filter(checkexcludedtags);
		}

	// check include tags
	const tagmatch = query.match(/(?<=^|\s)#(\S*)(?=\s|$)/g)
	if ( tagmatch ) {
		for (i in tagmatch) {
			query = query.replace(tagmatch[i], "")
			tagmatch[i] = tagmatch[i].trim().toLowerCase()
			}

		function checktags(task) {
			return tagmatch.every( ( tag ) => {
				if ( task.file_tags ) {
					if (task.file_tags.some((t) => t.toLowerCase().includes(tag))) { return true }
				}
				if ( task.tags ) {
					if (task.tags.some((t) => t.toLowerCase().includes(tag))) { return true }
				}
			})
		}

		use_content = use_content.filter(checktags);
		}



	// check include folders
	const foldermatch = query.match(/(?<=^|\s)\$(\S*)(?=\s|$)/g)
	if ( foldermatch ) {
		for (i in foldermatch) {
			query = query.replace(foldermatch[i], "")
			foldermatch[i] = foldermatch[i].trim().toLowerCase().slice(1)
			}

		function checkfolders(task) {
			return foldermatch.every( ( folder ) => {
				if (task.path.toLowerCase().includes(folder)) { return true }
			})
		}

		use_content = use_content.filter(checkfolders);
		}

	// check exclude folders
	const excludefoldermatch = query.match(/(?<=^|\s)\~\$(\S*)(?=\s|$)/g)
	if ( excludefoldermatch ) {
		for (i in excludefoldermatch) {
			query = query.replace(excludefoldermatch[i], "")
			excludefoldermatch[i] = excludefoldermatch[i].trim().toLowerCase().slice(2)
			}

		function checkexcludefolders(task) {
			return excludefoldermatch.every( ( folder ) => {
				if (folder && task.path.toLowerCase().includes(folder)) { return false } else { return true }
			})
		}

		use_content = use_content.filter(checkexcludefolders);
		}


	// avoid altering query if negation operator (~) is typed
	const negationoperator = query.match(/(?<=^|\s)\~(?=\s|$)/)
	if (negationoperator) {
		query = query.substring(0, negationoperator.index) + query.substring(negationoperator.index + 1)
	}


	const query_words = query.toLowerCase().split(" ")
	function check (task) {
		return query_words.every( ( word ) => {
			// check if task text maches query
			if (task.text.toLowerCase().includes(word)) {return true}
			}
		)
	}

	use_content = use_content.filter(check);

	let grouped;
	if (this.plugin.settings.groupTasks == "date") {
		grouped = Object.entries(Object.groupBy(use_content, (o) => o.date?o.date.format("YYYY-MM-DD"):null));
	} else if (this.plugin.settings.groupTasks == "filename") {
		grouped = Object.entries(Object.groupBy(use_content, (o) => o.path?o.path.slice(0,-3):null));
	}

	// update header text
	this.h_anchor_date_el.setText(`${now.format('dd, YYYY-MM-DD')}`)

	const unit_names = {"d":"day", "w":"week", "m":"month", "y":"year"}
	this.h_date_range_el.setText(`${direction?` ${direction}`:""}${value?value:''}${(unit&&value)?' ' + unit_names[unit.toLowerCase()] + ((value>1)?'s':''):''}`)

	let n_undefined = 0;// = include_unscheduled?grouped.find((g)=>g[0]=='null')[1].length:0
	if ( include_unscheduled ) {
		const undef_tasks = grouped.find((g)=>g[0]=='null')
		n_undefined = undef_tasks?undef_tasks[1].length:0
	}
	const n_scheduled = use_content.length - n_undefined
	this.h_comment_tags_el.setText(
	((tagmatch!=null|require_inline_tags)?"#":"") + (require_inline_tags?"inline-":"")+((tagmatch!=null|require_inline_tags)?"tags":""))

	this.h_comment_unchecked_el.setText(((excluded_task_statuses.length>0)?"not status: ":"") + excluded_task_statuses.join(","))
	this.h_comment_statuses_el.setText(((required_task_statuses.length > 0)?"status: ":"") + required_task_statuses.join(","))
	this.h_ntasks_el.setText(`scheduled: ${n_scheduled}  |  ${include_unscheduled?`unscheduled: ${n_undefined}  |`:''} total: ${this.content.length}`)

	// update suggester values
	refreshAutocomplete(this.plugin, use_content)

	return grouped


  }

	getToggleTaskContentProcessor(task, el) {
		// toggle checkbox status but maintain custom status
	    return (content) => {
			const line = task.meta.position.start.line
			const lines = content.split("\n");
			const target = lines[line];

			const active_status = target.match(/- \[(.)\]/)
			// sanity check: make sure task-text is equal in file and cache (except for task-status)
			if (!active_status | target.slice(6 + active_status.index) != task.full_text.slice(6 + active_status.index)) {
				new obsidian.Notice('The task-text in the file is not as expected! Re-run TaskFinder before checking tasks to update the cache!', 2000)
				throw new Error('The text of the task to toggle is different from the expected text!')
			}

			if ( active_status) {
				// TODO allow multiple 'checked' statuses
				if (active_status[1] != "x") {
					lines[line] = target.replace(/- \[.\]/, '- [x]');
					el.setAttribute("data-task", "x")
					el.checked = true
				} else {
					lines[line] = target.replace(/- \[.\]/, `- [${task.task_status}]`);
					el.setAttribute("data-task", task.task_status)
					if (task.task_status != " ") {
						el.checked = true
					} else {
						el.checked = false
					}
				};
			};
	        return lines.join("\n");
	    };
	}

	toggleTask(suggester, task, el) {
		return function doToggleTask (event) {
			// disable default checkbox events to avoid toggling the checkbox in case of errors
			event.preventDefault();
			event.stopPropagation();
			const processor = suggester.getToggleTaskContentProcessor(task, el);
			suggester.app.vault.adapter.process(task.path, processor);
	  };
  };

	openNote(suggester, task) {
		return function doOpenNote (event) {
			const file_open = suggester.app.workspace.activeLeaf.openFile(suggester.app.vault.getFileByPath(task.path),{active:true});

			file_open.then((value) => {
				const view = suggester.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				if (view) {
					const editor = suggester.app.workspace.activeEditor?.editor;
					editor.focus();
					editor.setCursor({ ch: task.meta.position.start.ch, line: task.meta.position.start.line });

					editor.scrollIntoView({from: task.meta.position.start, to: task.meta.position.end}, true);
				};
			});
			suggester.close();
	  };
  };


  // Renders each suggestion item.
  renderSuggestion(matches, el) {
	let [grp, grp_matches] = matches

	let header_txt = "???"
	let header_txt_right = "???"


	// append class to item container of today
	el.className = `task_finder ${el.className}`


	// check grouping behavior and assign headers accordingly
	let is_today = false;
	if (this.plugin.settings.groupTasks == "date") {
		let day = (grp=="null")?null:moment(grp)
		if (!day) {
			header_txt = "Unscheduled"
			header_txt_right = `(${grp_matches.length} ${grp_matches.length > 1?'tasks':'task'})`
		} else if (day.isValid()) {
			is_today = moment(day).isSame(moment(), "day")
			header_txt = `${day.format("dd, YYYY-MM-DD")}`
			header_txt_right = (is_today)?"today":moment(day).fromNow()
		}


		// add class suffix to tasks of today
		el.className = el.className + ((is_today)?' tasks_of_today':'')

	} else {
		header_txt = grp
		header_txt_right = ""
	}

	const header = el.createEl('div', {cls: 'task_suggestion_header'});
	const daydiv = header.createEl('div', {cls: 'task_suggestion_header_left', text: header_txt});
	const daydiv1 = header.createEl('div', {cls: 'task_suggestion_header_center'});
	const daydiv2 = header.createEl('div', {cls: 'task_suggestion_header_right', text: header_txt_right});

	for (const match of grp_matches){
		const c = el.createEl('div', {cls:'task_suggestion_container'});

		// prevent default click actions from propagating
		el.addEventListener('click', function (event) { event.stopPropagation() });


		const taskdiv = c.createEl('div', {cls:'task_suggestion_task_container'});
		const txtdiv = taskdiv.createEl('div', {cls:'task_finder_item'});

		const i = txtdiv.createEl('input', {cls:'task_finder_item_checkbox', type: 'checkbox', 'data-task':`*`});
		i.addEventListener("click", this.toggleTask(this, match, i))
		i.setAttribute("data-task", `${match.task_status}`)

		if (`${match.task_status}` != " ") {
			i.setAttribute("checked", true)
		}

		const tasktextEl = txtdiv.createEl('div', {cls:'task_finder_item_text_container'});
		const dt = txtdiv.createEl('div', {cls: `task_view_modal_date ${match.datesource}`});

		// add tags (unique set of file tags and explicit task-tags)
		const tags = [... new Set([...match.tags?match.tags:[], ...match.file_tags?match.file_tags:[]])].sort()
		// add tag icons
		const tag_icons = this.plugin.settings.tagIcons.filter(ti => tags.some(t=>t.startsWith(ti[0])))

		if (tag_icons) {
			for ( const [use_tag, use_tag_icon, use_icon_color] of tag_icons ) {
				// remove entry from tags array
				// todo implement this such that tags are iterated only once
				for (const found_tag of tags.filter(t => t.startsWith(use_tag))) {
					const tagidx = tags.indexOf(found_tag)
					if (tagidx >= 0){ tags.splice(tagidx, 1)}

					const t = tasktextEl.createEl('div', {cls:"task_finder_tag_icon"})
					obsidian.setIcon(t, use_tag_icon)
					t.style.color = use_icon_color

					// indicate sub-tags with a underlined icon
					if (found_tag != use_tag) {
						t.style["border-bottom"]=`1px solid ${use_icon_color}`
					}

					// add tag tooltip on hover over tag icon
					let tagtooltip
					t.addEventListener("mouseenter", (event) => {
						tagtooltip = t.createEl('a', {cls:'task_finder_tag_icon_tooltip tag colored-tag-task', text:found_tag, attr:{href:found_tag}})
						})

					t.addEventListener("mouseleave", (event) => {
						if (tagtooltip) {tagtooltip.remove()}
						})
				}
			}
		}

		const s = tasktextEl.createEl('div', {cls:'task_finder_item_text'});
		// open note if task-text is clicked
		s.addEventListener('click', this.openNote(this, match) );
		s.setText(match.text.trim())

		if ( match.additional_text ) {
			const add_txt = tasktextEl.createEl('div', {cls:'task_finder_additional_text_container'});

			// also open note if additional-text is clicked
			add_txt.addEventListener('click', this.openNote(this, match) );

			for (const i in match.additional_text) {
				add_txt.createEl("div", {text:match.additional_text[i]})
				if (i > 4) {
					add_txt.createEl("div", {text:'...'})
					break
					}
			}
		}

		// add remaining tags
		const footnote = taskdiv.createEl('div', {cls:'task_finder_item_footnote'});
		if (tags) {
			const tagcontainer = footnote.createEl('div', {cls:'task_finder_footnote_tag_container'})
			for ( const tag of tags ) {
				tagcontainer.createEl('div', {cls:"task_finder_footnote_tag"}).createEl('a', {cls:'tag colored-tag-task', text:tag, attr:{href:tag}})
			}
		}

		if (this.plugin.settings.showPath) {
			footnote.createEl("div", {cls:"task_finder_footnote_folder", text:match.path.slice(0, -3)})
		}

		if ( match.date ) {
			let date_str;
			const timediff = match.date.diff(moment(), "days")
			if (timediff == 0) {
				if (match.start_date) {
					date_str = moment.duration(match.start_date.diff(moment())).humanize(true)
				} else (
					date_str = "today"
					)
			} else {
				date_str = match.date.fromNow()
			}
			if (match.start_date) {
				dt.setAttribute("data-datesource", '⏱')//match.datesource)

				if (is_today){
					dt.setText(`${match.start_date.format('HH:mm')}${match.end_date?'-'+match.end_date.format('HH:mm'):''}\n${date_str}`);
				} else {
					dt.setText(`${match.start_date.format('HH:mm')}${match.end_date?'-'+match.end_date.format('HH:mm'):''}`);
				}
			} else if (match.date.isBefore()) {
				dt.setText("!")
			}
			dt.setAttribute("data-is-before", match.date.isBefore())
			dt.setAttribute("data-checked", match.meta.task == "x")
		}
	}

  };

  onChooseSuggestion(task, evt) {
  }

}


function getTaskCache(plugin, checked='all') {
	const file_cache = plugin.app.metadataCache.fileCache
	const metadata_cache = plugin.app.metadataCache.metadataCache
	let found = {}
	let contents = []

	let excludedFolders = Object.groupBy(plugin.settings.excludedFolders, (f)=> f.startsWith("regex:"))
	if (excludedFolders[true]) {
		excludedFolders[true] = excludedFolders[true].map((ef) => new RegExp(ef.replace("regex:", "").trimStart()))
	}

	for (const [path, c_file] of Object.entries(file_cache).filter(([key]) => key.endsWith('.md'))) {
		if (!(c_file["hash"] in metadata_cache)) { continue }

		//exclude files in excludedFolders (and subirectories thereof)
		if ( excludedFolders[false] && excludedFolders[false].some( (ef) => path.startsWith(ef) ) ) { continue }
		if ( excludedFolders[true] && excludedFolders[true].some( (ef) => path.match(ef) ) ) { continue }

		let c_meta = metadata_cache[c_file["hash"]]

		// if there are no lists in the file, we can ignore it
		if (!("listItems" in c_meta)) { continue }
		// TODO check if there is a better way to identify "subtasks"
		const all_tasks = c_meta.listItems.filter((obj) => ("task" in obj) && (plugin.settings.includeSubTasks?true:(obj.position.start.col != 0)))
		if (all_tasks.length == 0) { continue }

/* 		for (t of all_tasks) {
			t.sublist = c_meta.listItems.filter((obj) => obj.parent == t.position.start.line)
		}
 */

		let file_tags = c_meta.frontmatter?.tags

		if (file_tags) {file_tags = Array.from(file_tags, (t)=>`#${t}`) }

		let tasks;
		if ( checked == 'unchecked') {
			tasks = all_tasks.filter((t) => t.task != "x")
		} else if ( checked == 'checked' ) {
			tasks = all_tasks.filter((t) => t.task == "x")
		} else if ( checked == 'all' ) {
			tasks = all_tasks
		}
		if ( tasks.length > 0 ) { found[path] = [tasks, file_tags, c_file.hash] }

	}

	return found
}

async function getTasks(plugin, checked='all') {
	const task_file_cache = getTaskCache(plugin, checked)
	// remove all hashes that no longer exist in the cache (deleted/changed files)
	const current_file_hashes = Object.values(task_file_cache).map((a)=> a[2])
	for (const hash in plugin.taskCache) {
		if (!current_file_hashes.includes(hash)) {
			delete plugin.taskCache[hash]
		}
	}

	let number_of_updated_files = []
	for (const [path, [task_meta, file_tags, hash]] of Object.entries(task_file_cache)) {

		// reindex files only if hash changed
		if (hash in plugin.taskCache) {
			continue
		}

		number_of_updated_files.push(path)
		plugin.taskCache[hash] = []


		const content = await app.vault.cachedRead(plugin.app.vault.getFileByPath(path))
		for (const m of task_meta ) {
			const full_text = content.split("\n")[m.position.start.line]

			let additional_text = []
			for (l of content.split("\n").slice(m.position.start.line + 1)) {
				if (l.match(/^[ \t]+\S/)) {
					if (additional_text.length > 3) {
						additional_text.push("\t...")
						break
					}
					additional_text.push(l)
				} else { break }
			}

			let tasktext = full_text
			let task_match = tasktext.match(/- \[(.)\] /)


			if ( task_match ) {
				const task_status = task_match[1];
				tasktext = tasktext.slice(task_match.index + 6)

				// try to find date assigned to task
				let datestr = tasktext.match(/[📅⏳🛫] \d\d\d\d-\d\d-\d\d/gu);

				let date;
				let start_time;
				let start_date;
				let end_time;
				let end_date;
				let datesource;

				if ( datestr ) {
					// TODO allow multiple dates in task-text
					[datesource, date] = datestr[0].split(" ")
					tasktext = tasktext.replace(datestr[0], "")
				} else {
					// check if task is defined in a note whose title starts with a date
					const fname = path.split("/").slice(-1)[0].slice(0,-3)
					date = fname.match(/^\d\d\d\d-\d\d-\d\d/)
					if ( date ) {
						date = date[0]
						datesource = "📜️"
					}
				}

				// replace all internal links with link-names
				let links = tasktext.match(/\[\[(.*?)\]\]/g)
				if (links) {
					for (const link of links) {
						if ( link.contains("|") ) {
						tasktext = tasktext.replace(link, link.split("|")[1].slice(0,-2))
						}
					}
				}

				// replace all external links with link-names
				links = tasktext.match(/\[(.*?)\]\((.*?)\)/g)
				if (links) {
					for (const link of links) {
						tasktext = tasktext.replace(link, link.split("(")[0].slice(1))
					}
				}

				// remove bold text indicators **...**  //TODO
				links = tasktext.match(/\*\*(.*?)\*\*/g)
				if (links) {
					for (const link of links) {
						tasktext = tasktext.replace(link, link.slice(2,-2))
					}
				}

				// parse start- and end-time of task
				if ( date ) {
					// TODO allow dates anywhere?
					const datematch = tasktext.match(/^(\d?\d:\d\d)(?: - )?(\d?\d:\d\d)?/)
					if ( datematch ){
						const [found_datestr, start_time, end_time] = datematch
						if (start_time){start_date = moment(`${date}T${start_time.padStart(5, '0')}`)}
						if (end_time){end_date = moment(`${date}T${end_time.padStart(5, '0')}`)}
						// strip off found time string from tasktext
						tasktext = tasktext.replace(found_datestr, "")
					}
					date = moment(date)
				}


				// strip off tags
				let tags = tasktext.match(/((?:\s)?#[^\s]+(?:\s)?)/g)
				if ( tags ) {
					for (i in tags) {
						tasktext = tasktext.replace(tags[i], " ")
						tags[i] = tags[i].trim()
					}
				}
				plugin.taskCache[hash].push({
					path:path,
					meta:m,
					full_text:full_text,
					text:tasktext,
					task_status:task_status,
					date:date,
					start_date:start_date,
					end_date:end_date,
					datesource:datesource,
					tags:tags,
					file_tags:file_tags,
					additional_text:additional_text
					})
			}
		}
	}

	return number_of_updated_files
}

function refreshAutocomplete(plugin, content) {
	// retrieve all tags, statuses and folders of tasks for autocompletion
	// (alternative for ALL tags: plugin.app.metadataCache.getTags() )
	plugin.allTags = [];
	plugin.allFolders = [];
	plugin.allStatuses = [];
	for ((t) of Object.values(content).flat()) {
		plugin.allTags.push(t.tags?t.tags:[])
		plugin.allFolders.push(t.path.split("/").slice(0,-1).join("/"))
		plugin.allStatuses.push(t.task_status)
	}
	plugin.allTags = [... new Set(plugin.allTags.flat())].sort()
	plugin.allFolders = [... new Set(plugin.allFolders)].sort()
	plugin.allStatuses = [... new Set(plugin.allStatuses)].sort()

}

async function refreshTaskCache(plugin) {
	if (plugin.refresh_cache == true) {
		plugin.refresh_cache = false

		let note;
		if (plugin.settings.showCacheRefreshMessage){
			note = new obsidian.Notice('refreshing cache...');
		};

		const startTime = performance.now();
		const number_of_updated_files = await getTasks(plugin, checked=plugin.settings.includeStatus)
		refreshAutocomplete(plugin, plugin.taskCache)
		const endTime = performance.now()

		if (plugin.settings.showCacheRefreshMessage && number_of_updated_files.length > 0) {
			let msg = "";
			if (number_of_updated_files.length > 3) {
				msg = `TaskFinder: Refreshed task-cache of ${number_of_updated_files.length} files in (${((endTime - startTime)/1000).toFixed(2)}s)$.`;
			} else {
				msg = "TaskFinder: Refreshed task-cache for:\n  - " + number_of_updated_files.join("\n  - ");
			};
			note.hide();
			new obsidian.Notice(msg);
		}


	}
}



class TaskFinder extends obsidian.Plugin {
	async onload() {
		this.taskCache = {};

		this.allQueryTags = [];
		this.allQueryStatuses = [];
		this.allQueryFolders = [];

		this.refresh_cache = true

		await this.loadSettings();

		this.addSettingTab(new SettingTab(this.app, this));



		app.metadataCache.on('resolved', async (file, data, cache) => {
			this.refresh_cache = true
		})

		this.addCommand({
		  id: 'find-tasks',
		  name: 'Find Tasks',
		  callback: () => {
			//IIFE pattern to allow async call here
			(async () => {
				await refreshTaskCache(this);
				new TaskSuggester(this, Object.values(this.taskCache).flat(1)).open();
				})();
		}})

		this.addRibbonIcon('search-check', 'Find Tasks', () => {
			//IIFE pattern to allow async call here
			(async () => {
				await refreshTaskCache(this);
				new TaskSuggester(this, Object.values(this.taskCache).flat(1)).open();
				})();
		});

		this.codeBLockProcessor = this.registerMarkdownCodeBlockProcessor('taskfinder', (source, el, ctx) => {
		    const rows = source.split('\n');
			let header, query, options;

			if (rows.length > 3 | rows.length < 2) {
				new obsidian.Notice("TaskFinder code-block must contain 2 lines: 1: Header 2: Query");
				throw new Error("Unable to parse TaskFinder code-block content.")
			}

			[header, query, options] = rows;

			el.empty();
			el.className = "taskfinder_inline_block"
			const detailsEl = el.createEl("details", {cls:"task_finder_callout_details"})
			const summaryEl = detailsEl.createEl("summary", {cls:"task_finder_callout_summary"})
			obsidian.setIcon(summaryEl, "search-check") // set lucide icon
			const titleEl = summaryEl.createEl("span", {text: header, cls:"task_finder_callout_title"})
			const container = detailsEl.createEl("div", {cls: "taskfinder_inline_content"})

			detailsEl.open = (options && options.includes("open"))?true:false

			// callback to trigger fetching tasks and render results
			function getCallback (plugin) {
				 //IIFE pattern to allow async call here´
				return (async (event) => {
					if (event.target.open) {
						container.empty()
						await refreshTaskCache(plugin);
						const ts = new TaskSuggester(plugin, Object.values(plugin.taskCache).flat(1))
						ts.createHeader(container)
						for (const sug of ts.getSuggestions(query)){
							const taskcontainer = container.createEl("div", {cls:"task_finder suggestion-item"})
							ts.renderSuggestion(sug, taskcontainer)
						};
					}
			});
			};
			detailsEl.addEventListener("toggle", getCallback(this))
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async saveData(data) {
		// refresh cache whenever new settings are written
		// (override saveData to implement it also for builtin settings types)
		this.refresh_cache = true
		await super.saveData(data)
	}


}

module.exports = TaskFinder;