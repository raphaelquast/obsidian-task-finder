const obsidian = require('obsidian');
//moment.locale("de-at")

const tasks_iconnames = {"📅":"due", "⏳":"scheduled", "🛫":"start"}

const DEFAULT_SETTINGS = {
	"defaultQuery": "@u +-2w #* ",
	"queryDebounceTime": 100,
	"taskViewLimit": 1000,
	"includeStatus":"unchecked",
	"folderQueries":[],
	"excludedFolders": [],
	"excludedFoldersRegex": [],
	"tagIcons": [],
	"showCacheRefreshMessage": true,
	"groupTasks":"date",
	"includeSubTasks":true,
	"showPath":true,
	"showHeader":true,
	"recurranceRepetitions": 5,
	"dailyNotePath":"Termine",
	"dailyNoteFilenameFmt":"YYYY-MM-DD",
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

class DailyNoteFolderSuggest extends FolderSuggest {
	async selectSuggestion(content, evt) {
		this.inputEl.value = content
		this.plugin.settings.dailyNotePath = content
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



function naturalDateParser(str, reference_date=null) {
	let now = moment();
	// set reference date for offsets
	if (reference_date == null) {
		reference_date = now
	} else {
		reference_date = reference_date.clone()
	}

	let regexmatch;
	str = str.toLowerCase().trim()

	// check for today / tomorrow / yesterday
	if (str == "today") {
		return now
	}
	if (str == "tomorrow") {
		return now.add(1, "day")
	}
	if (str == "yesterday") {
		return now.subtract(1, "day")
	}

	// check for day in this month / day+month in this year / full date
	regexmatch = str.match(/^(\d{1,2})(\d{2})?(\d{4})?$/)
	if (regexmatch) {
		if (regexmatch[3]) {return moment(str, "DDMMYYYY")}
		if (regexmatch[2]) {return now.date(regexmatch[1]).month(Number(regexmatch[2])-1)}
		if (regexmatch[1]) {return now.date(regexmatch[1])}
	}

	const months = {
		"january":0, "jan":0,
		"february":1, "feb":1,
		"march":2, "mar":2,
		"april":3, "apr":3,
		"may":4, "may":4,
		"june":5, "jun":5,
		"july":6, "jul":6,
		"august":7, "aug":7,
		"september":8, "sep":8,
		"october":9, "oct":9,
		"november":10, "nov":10,
		"december":11, "dec":11
	}

	regexmatch = str.match(/^(\d{1,2})\s?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\s?(\d{4})?\b$/i)
	if (regexmatch) {
		if (regexmatch[3]) {return moment([Number(regexmatch[3]), months[regexmatch[2].toLowerCase()], Number(regexmatch[1])])}
		if (regexmatch[2]) {return now.date(regexmatch[1]).month(months[regexmatch[2].toLowerCase()])}
	}

	// check for "in x <unit>" and "x <unit> ago"
	regexmatch = str.match(/^in (\d+) \b(day|week|month|year)s?\b/i)
	if (regexmatch) {
		return now.add(regexmatch[1], regexmatch[2])
	}
	regexmatch = str.match(/^(\d+) \b(day|week|month|year)s? ago\b/i)
	if (regexmatch) {
		return now.subtract(regexmatch[1], regexmatch[2])
	}

	// check for "next/previous weekday"
	const weekdays = {
		"monday":0, "mon":0,
		"tuesday":1, "tue":1,
		"wednesday":2, "wed":2,
		"thursday":3, "thu":3,
		"friday":4, "fri":4,
		"saturday":5, "sat":5,
		"sunday":6, "sun":6
	}

	const now_idx = now.weekday()
	regexmatch = str.match(/^next \b(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)\b/i)
	if (regexmatch) {
		const day_idx = weekdays[regexmatch[1].toLowerCase()]
		let dt = day_idx - now_idx
		if (dt <= 0) {
			dt = 7 + dt
		}
		return now.add(dt, "days")
	}

	regexmatch = str.match(/^previous \b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
	if (regexmatch) {
		const day_idx = weekdays[regexmatch[1].toLowerCase()]
		let dt = day_idx - now_idx
		if (dt >= 0) {
			dt = dt - 7
		}
		return now.add(dt, "days")
	}

	// check for "+- x <unit>"
	regexmatch = str.match(/^([+-])(\d+)([dwmy])?/i)
	if (regexmatch) {
		let unit = regexmatch[3]
		// make sure we use proper characters for day (d), week (w), month (M) and year (y)
		if (!unit) {unit = "d"}
		if (unit == "m") {unit = "M"} else {unit = unit.toLowerCase()}

		if (regexmatch[1] == "+") {return reference_date.add(regexmatch[2], unit)}
		if (regexmatch[1] == "-") {return reference_date.subtract(regexmatch[2], unit)}
	}
}

// TODO make the date-suggester more versatile
class DateSuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl, reference_date=null) {
		super(plugin.app, inputEl)
		this.plugin = plugin
		this.inputEl = inputEl
		this.reference_date = reference_date

		this.content = ["today", "tomorrow", "yesterday", "in", "next", "previous"]
		this.months = []

	}

	getSuggestions(query) {
		const words = query.split("@")

		if (words.length == 2 & (this.content.some((w)=>w.startsWith(words[0])) | words[0].endsWith("ago"))) {
			return [words[1]]
		} else { this.close() }
	}

	renderSuggestion(content, el) {
		if (content != null) {
			const date = naturalDateParser(content, this.reference_date)
			if (date) {
				el.setText(date.format("dd, D.MMM YYYY"))
			}
		}
	}

	async selectSuggestion(content, evt) {
		const words = this.inputEl.value.split("@")
		this.inputEl.value = words[0] + "@" + naturalDateParser(content, this.reference_date).format("DDMMYYYY")
	}
}

class EditTaskDateSuggest extends DateSuggest {
	getSuggestions(query) {
		if (query != "") {
			return [query]
		} else {
			this.close()
		}
	}
	async selectSuggestion(content, evt) {
		this.inputEl.value = naturalDateParser(content, this.reference_date).format("YYYY-MM-DD")
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
		{name: 'Default Query', desc: 'The default query to use.',
		 control: { type: 'text', key: 'defaultQuery', placeholder: 'Enter default query'} },

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

		{name: 'Query description', render: (setting) => {
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
		  name: 'Task check-status',
		  desc: 'Set which tasks to include based on their check-status.',
		  control: {
			type: 'dropdown',
			key: 'includeStatus',
			defaultValue: DEFAULT_SETTINGS.includeStatus,
			options: { 'unchecked': 'Only unchecked tasks', 'checked': 'Only checked tasks', 'all': 'All tasks' },
		  },
		},
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
	{name: 'Show query summary header?', desc: 'If true, a header with general infos on the query is shown.',
	control: { type: 'toggle', key: 'showHeader' }},
	{name: 'Query Debounce Time', desc: 'The time between typing and query-execution (miliseconds).',
	 control: { type: 'number', key: 'queryDebounceTime', placeholder: 'Enter query debounce time', min: 0} },
	{name: 'Task View Limit', desc: 'The max. number of tasks shown.',
	 control: { type: 'number', key: 'taskViewLimit', placeholder: 'Enter task view limit', min: 1} },
	{name: 'Show task-cache refresh message.', desc: 'Show a message indicating changed files and duration of task-cache evaluation.',
	 control: { type: 'toggle', key: 'showCacheRefreshMessage'} },

	{type: 'group',
	 heading: 'Recurring Tasks',
	 items: [
		{name: 'Repetitions:', desc: 'Maximum number of times a recurring tasks are repeated.',
		control: { type: 'number', key: 'recurranceRepetitions' }},
		{name: 'Cutoff duration:', desc: 'Recurring tasks are only shown if the date-difference to the first recurrance is less than the cutoff duration.',
		control: { type: 'text', key: 'recurranceCutoffDuration', placeholder:'Cutoff duration' }},

	]
	},

	{type: 'group',
	 heading: 'Daily Notes',
	 items: [
		{name: 'Daily Note Folder:', desc: 'The folder that contains the daily-notes.',
		//control: { type: 'text', key: 'dailyNotePath' }
		render: (setting) => {
			let containerEl = setting.infoEl
			containerEl.empty();
			new obsidian.Setting(containerEl)
			.setName("Daily Note Folder:")
			.setDesc("The folder that contains the daily-notes.")
			.addSearch((search) => {
				search.setPlaceholder('Daily Note Folder')
				search.setValue(this.plugin.settings.dailyNotePath)

				new DailyNoteFolderSuggest(this.plugin, search.inputEl);
				})
		}
		},
		{name: 'Daily Note Date Format:', desc: 'The moment.js date-format used for the daily-note filenames.',
		control: { type: 'text', key: 'dailyNoteFilenameFmt' }},

	]
	}


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


class ConfirmModal extends obsidian.Modal {
  constructor(plugin, title, msg, onSubmit) {
    super(plugin.app);
	this.plugin = plugin
	if (title) {this.setTitle(title)}
	if (msg) {
		const txt = this.contentEl.createEl("div")
		txt.innerHTML = msg
		txt.style["white-space"] = "pre-wrap";
	}
    new obsidian.Setting(this.contentEl)
		.addButton((btn) => {
			btn
			  .setButtonText('Yes')
			  .setWarning()
			  .setCta()
			  .onClick(async () => {
				this.close();
				await onSubmit();
			});
		});
	}
}



class TaskEditModal extends obsidian.Modal {
  constructor(suggester, task, onSubmit, onDelete=null) {
    super(suggester.plugin.app);
	//this.setTitle('Re-schedule task');
	this.plugin = suggester.plugin
	// remember modal to ensure that only a single edit-modal is open at any time
	this.plugin.task_edit_modal = this

	this.valid_input_date = true;
	this.valid_input_start_time = true;
	this.valid_input_end_time = true;

	this.task = task

	this.new_date;
	this.start_time=task.start_date?.format("HH:mm");
	this.end_time=task.end_date?.format("HH:mm");


	this.taskItemEl = this.contentEl.createEl("div", {cls:"task_suggester_task_edit_item"})

	this.headerEl = this.taskItemEl.createEl("div", {cls:"task_suggester_task_edit_entry_header"})
	if (this.task.recurrance) {
		this.headerEl.toggle("recurring_item")
		this.headerEl.setAttribute("data-recurrance", ` (recurs ${suggester.getRecurranceStr(this.task, false)})`)
	} else {
	}

	this.headerEl.innerHTML = this.getHeaderDateStr()
	this.taskContainerEl = this.taskItemEl.createEl("div", {cls:"task_suggester_task_edit_entry"})
	suggester.renderTask(task, this.taskContainerEl, Infinity, false, true)

	// remember initially set time string (to restore on invalid input)
	this.taskTimeEl = this.taskContainerEl.getElementsByClassName("task_view_modal_date")[0]
	this.init_times = this.taskTimeEl.innerHTML
	new obsidian.Setting(this.contentEl)
	.setClass("task_finder_task_edit_setting")
	.addText((text) => {
		this.dateInputEl = text.inputEl
		new EditTaskDateSuggest(this.plugin, text.inputEl, this.task.init_date)
		text.setPlaceholder("Enter new date (or date-offset)");
		text.inputEl.className = "task_finder_date_edit_input"
		text.inputEl.addEventListener('input', (event) => {
			const val = event.target.value
			if (val) {
				if (val == "remove") {
					if (task.datesource != "daily_note") {
						// target date for removal
						this.new_date = val
						this.valid_input_date = true
					} else {
						this.valid_input_date = false
						new obsidian.Notice("TaskFinder: Cannot remove date for daily-note tasks!")
					}
				} else {
					// try to parse date
					this.new_date = naturalDateParser(val, this.task.init_date)
					if (this.new_date) {
						this.valid_input_date = true
					} else {
						this.valid_input_date = false
					}
				}
			} else {
				this.new_date = null;
				this.valid_input_date = true
			}

			this.updateTaskPreview()
			}
		);
		}
	)
	.addButton((btn) => {
		btn.setButtonText("x")
		   .setClass("task_finder_date_edit_remove_date_button")
		   .setTooltip("remove inline date from task")
		   .onClick((event) => {
			   this.dateInputEl.value = "remove"
			   this.dateInputEl.dispatchEvent(new Event('input', {bubbles:true}))
		   });
		if (task.datesource == "daily_note" | (this.task.init_date == null)) {
			btn.buttonEl.style.display = "none"
		} else {
			btn.buttonEl.style.display = "block"
		}

	})
	new obsidian.Setting(this.contentEl)
	.setClass("task_finder_task_edit_setting")
	.addText((text) => {
		this.startTimeInputEl = text.inputEl
		text.inputEl.className = "task_finder_time_edit_input"
		text.setValue(task.start_date?.format('HH:mm'))
		text.setPlaceholder("start time")
		text.inputEl.addEventListener('input', (event) => {
			const val = event.target.value
			if (val) {
				if (val.match(/^\d?\d?(:\d)?(:\d\d)?$/)) {
					const valsplit = val.split(":")
					this.start_time = valsplit[0].padStart(2, "0") + ":" + (valsplit[1]?valsplit[1].padStart(2, "0"):"00")
					this.valid_input_start_time = true
				} else {
					this.valid_input_start_time = false
				}
			} else {
				if (this.end_time != null) {
					this.start_time = null
					this.valid_input_start_time = false
				} else {
					this.start_time = null
					this.valid_input_start_time = true
				}
			}

			this.updateTaskPreview()
		})
	})
	.addText((text) => {
		this.endTimeInputEl = text.inputEl
		text.inputEl.className = "task_finder_time_edit_input"
		text.setValue(task.end_date?.format('HH:mm'))
		text.setPlaceholder("end time")
		text.inputEl.addEventListener('input', (event) => {
			const val = event.target.value
			if (val) {
				if ((val.match(/^\d?\d?(:\d)?(:\d\d)?$/) != null) & (this.start_time != null)) {
					const valsplit = val.split(":")
					this.end_time = valsplit[0].padStart(2, "0") + ":" + (valsplit[1]?valsplit[1].padStart(2, "0"):"00")
					this.valid_input_end_time = true
				} else {
					this.valid_input_end_time = false
				}
			} else {
				this.end_time = null
				this.valid_input_end_time = true
				if (this.start_time == null) {
					// in case we had a invalid (empty) start-time due to a still present end-time
					this.valid_input_start_time = true
				}
			}

			this.updateTaskPreview()
		})
	})
    new obsidian.Setting(this.contentEl)
		.addButton((btn) => {
			btn
			  .setButtonText('Delete Task')
			  .setTooltip('Delete the task (and all additional lines) from the defining note.')
			  .setClass("task_finder_edit_remove_task_button")
			  .setWarning()
			  .onClick((event) => {
				  new ConfirmModal(this.plugin, "Delete Task?", "<small>The task and all indended lines below the task will be removed from the defining note!</small>", async () => {await onDelete(); this.close();}).open();

			});
		}
		)

		.addButton((btn) => {
			btn
			  .setButtonText('Open Note')
			  .setTooltip('Open the note in which the task is defined.')
			  .onClick((event) => {
				suggester.getOpenNoteCallback(task)(event)
				this.close();
			});
		}
		)
		.addButton((btn) => {
			btn
			  .setButtonText('Re-schedule')
			  .setTooltip('Update the task with respect to the new date/time.')
			  .setCta()
			  .onClick(() => {
				if (this.inputValid()) {
					this.close();
					onSubmit(this.new_date, this.start_time, this.end_time);
				} else {
					this.showInvalidInputNotice()
				}
			});
		})

	// todo check how to focus the input on startup
	this.dateInputEl.focus()
	this.shouldAnimateOpen = false
	}

	onClose() {
		this.plugin.task_edit_modal = null
	}

	getHeaderDateStr(new_date=null, new_end_date=null) {
		let date;
		let end_date;

		if ((this.task.init_date != null) | (new_date != null)) {
			date = new_date?new_date.format("dd, DD. MMMM YYYY"):this.task.init_date.format("dd, DD. MMMM YYYY")
		}

		if ((this.task.date_range_end != null) | (new_end_date != null)) {
			end_date = new_end_date?new_end_date.format("dd, DD. MMMM YYYY"):this.task.date_range_end.format("dd, DD. MMMM YYYY")
		}

		let header_date_str = "";
		if (date) {
			if (new_date) {
				if (new_date == "remove") {
					header_date_str += `<mark class="task_finder_date_edit_highlight">Unscheduled</mark>`
				} else {
					// evaluate difference to existing date
					let dt_txt;
					if (this.task.init_date) {
						const dt = this.new_date.diff(this.task.init_date, "days")
						dt_txt = `<span class="task_finder_date_edit_change_text">(${dt>0?"+":""}${dt})</span>`
					} else {
						dt_txt = "(new date)"
					}
					header_date_str += `<mark class="task_finder_date_edit_highlight">${date}</mark> ${dt_txt}`
				}
			} else {
				header_date_str += date
			}

			if ((end_date != null) & (new_date != "remove")) {
				header_date_str += " to "
				if (new_end_date) {
					header_date_str += `<mark class="task_finder_date_edit_highlight">${end_date}</mark>`
				} else {
					header_date_str += end_date
				}
			}
		} else {
			header_date_str = "Unscheduled"
		}
		return header_date_str
	}


	getTaskTimeStr() {
		let out = ""
		if ((this.start_time != null) | (this.end_time != null)) {
			if ((this.start_time != this.task.start_date?.format("HH:mm")) & (this.end_time != this.task.end_date?.format("HH:mm"))) {
				out += `<mark class="task_finder_date_edit_highlight">${this.start_time}${this.end_time?'-'+this.end_time:''}</mark>`;
			}
			else if (this.start_time != this.task.start_date?.format("HH:mm")) {
				out += `<mark class="task_finder_date_edit_highlight">${this.start_time}</mark>${this.end_time?'-'+this.end_time:''}`;
			}
			else if (this.end_time != this.task.end_date?.format("HH:mm")) {
				out += `${this.start_time}${this.end_time?'-<mark class="task_finder_date_edit_highlight">'+this.end_time:''}</mark>`;
			}
			else {
				out += this.init_times;
			}
		} else {
			if (this.init_times) {
				out += `<mark class="task_finder_date_edit_highlight"><del>${this.init_times}</del></mark>`;
			}
		}
		return out
	}

	showInvalidInputNotice () {
		new obsidian.Notice("TaskFinder: Cannot re-schedule task on invalid date/time input!")
	};

	inputValid() {
		return this.valid_input_date & this.valid_input_start_time & this.valid_input_end_time
	}
	toggleValidInputCls(valid, el) {
		if (valid) {
			el.classList.add("input_valid")
			el.classList.remove("input_invalid")
		} else {
			el.classList.remove("input_valid")
			el.classList.add("input_invalid")
		}
	}


	updateTaskPreview() {
		this.toggleValidInputCls(this.valid_input_date, this.dateInputEl)
		this.toggleValidInputCls(this.valid_input_start_time, this.startTimeInputEl)
		this.toggleValidInputCls(this.valid_input_end_time, this.endTimeInputEl)

		if (this.inputValid()) {
			// update date header
			this.headerEl.innerHTML = this.getHeaderDateStr(this.new_date, null)

			// update times
			this.taskTimeEl.innerHTML = this.getTaskTimeStr()

		} else {
			this.taskTimeEl.innerHTML = this.init_times;
			this.headerEl.innerHTML = `${this.task.init_date?this.task.init_date.format("dd, DD. MMMM YYYY"):"Unscheduled"}`
		}
	}
}


class TaskSuggester extends obsidian.SuggestModal {
  constructor(plugin, taskCache) {
	  super(plugin.app)
	  this.plugin = plugin

	  this.limit = this.plugin.settings.taskViewLimit
	  this.component = new obsidian.Component()
	  this.component.load()

	  this.uuid = crypto.randomUUID()

	  //this.content = content.sort(sortByTime)

	  this.setContent(taskCache)

	  this.debounceonInput = obsidian.debounce(() => { super.onInput(); }, this.plugin.settings.queryDebounceTime, true)

	  this.emptyStateText = "Oh nice... seems like there's nothing to do!"
	  this.inputEl.placeholder = "@: date  |  +-: range  |  #: tags  |  ?: status  |  $: path"
	  // attach auto-completer
	  new StatusSuggest(this.plugin, this.inputEl)
	  new TagSuggest(this.plugin, this.inputEl)
	  new QueryFolderSuggest(this.plugin, this.inputEl)
	  new DateSuggest(this.plugin, this.inputEl)


  }

  setContent(taskCache) {
	// reset today-rendered property if content changed
	this.today_rendered = null


	let content = Object.values(taskCache).flat(1)

	// TODO maybe there's a better way to handle recurrance?
	// add recurring items
	let recurring_content = []
	const recurrance_cutoff_duration = this.plugin.settings.recurranceCutoffDuration?moment.duration(...this.plugin.settings.recurranceCutoffDuration.split(" ")):0

	for (const match of content) {
		if (match.date & match.recurrance) {
			// match date is the next occurance of the repeated task!
			const cutoff = (recurrance_cutoff_duration>0)?(match.date.clone().add(recurrance_cutoff_duration)):null;
			for( let i=1; i<=this.plugin.settings.recurranceRepetitions; i++) {

				const recdate = match.date.clone().add(i*match.recurrance.recurrance_n, match.recurrance.recurrance_unit=="dayofyear"?"days":match.recurrance.recurrance_unit);
				if (cutoff?recdate.isSameOrAfter(cutoff):false) { break };

				let recmatch = { ...match };
				recmatch.recurrance = {...match.recurrance};
				recmatch.recurrance.recurr_n += i*match.recurrance.recurrance_n;
				recmatch.date = recdate;
				recmatch.recurring_item = true;
				recurring_content.push(recmatch);
			}
		}

		if (match.date_range_end) {
			match.range_item_number = [0]
			match.date_range_pos = "start"
			// match date is the next occurance of the repeated task!
			let idate = match.date.clone()
			while (true) {
				idate = idate.add(1, "d");

				let rangematch = { ...match };
				rangematch.date = idate.clone();
				rangematch.range_item = true;
				rangematch.date_range_pos = "mid"

				if (idate.isSameOrAfter(match.date_range_end)) {
					rangematch.date_range_pos = "end"
					recurring_content.push(rangematch);
					break
					}

				recurring_content.push(rangematch);
			}
		}
	}
	// add task-date ranges

	this.content = content.concat(recurring_content).sort(sortByTime)

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
	  if (this.plugin.settings.showHeader) { this.createHeader(this.modalEl) }
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
	const rangematch = query.match(/(?<=^|\s)(([+-])(\d*)?([dwmy])?)(([+-])(\d*)?([dwmy])?)?(?=\s|$)/)
	let rangestr, rangestr0, direction0, unit0, value0, rangestr1, direction1, unit1, value1;
	let direction, value, unit;

	if ( rangematch ) {
		[rangestr, rangestr0, direction0, value0, unit0, rangestr1, direction1, value1, unit1] = rangematch
		query = query.replace(rangestr, "")

		// only define if we have a positive range-match to show all tasks on queries without range-indications
		startvalue = now.clone().startOf("day");
		endvalue = now.clone().endOf("day");

	}

	// allow definition of symmetric ranges via +-(value)(unit)
	if ((direction0 != null) & (direction1 != null) & (value0 == null) & (unit0 == null)) {
		value0 = value1
		unit0 = unit1
	}

	for ([direction, unit, value] of [[direction0, unit0, value0], [direction1, unit1, value1]]) {
		if ( direction ) {
			// treat lower-case "m" as Month ("M")
			if ( !unit ) {unit = "d"} else if ( unit == "m" ) { unit = "M" }
			if (direction.includes("-")) { startvalue = (value)?now.clone().startOf("day").subtract(value, unit):null; }
			if (direction.includes("+")) { endvalue = (value)?now.clone().endOf("day").add(value, unit):null; }
		}
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



/* 	let grouped = [];

	let unscheduled = []
	for (const match of use_content) {
		if (!match.date) {
			unscheduled.push(match)
		} else {
			let curr_year_entries = grouped.at(-1)
			if (curr_year_entries!=null?(match.date.year() == curr_year_entries[0]):false){
				let curr_month_entries = curr_year_entries[1].at(-1)
				if (curr_month_entries!=null?(match.date.month() + 1 == curr_month_entries[0]):false){
					let curr_day_entries = curr_month_entries[1].at(-1)
					if (curr_day_entries!=null?match.date.isSame(curr_day_entries[0], "day"):false){
						curr_day_entries[1].push(match)
					} else {
						curr_month_entries[1].push([match.date, [match]])
					}
				} else {
					curr_year_entries[1].push([match.date.month() + 1, [match.date, [match]]])
				}
			} else {
				grouped.push([[match.date.year(), [[match.date.month() + 1, [[match.date, [match]]]]]]])
			}
		}
	}
 */

	let grouped = [];
	let unscheduled = []
	for (const match of use_content) {
		if (!match.date) {
			unscheduled.push(match)
		} else {
			let curr_day_entries = grouped.at(-1)
			if ((curr_day_entries!=null)?match.date.isSame(curr_day_entries[0], "day"):false) {
				curr_day_entries[1].push(match)
			} else {
				grouped.push([match.date, [match]])
			}
		}
	}
	grouped.push([null, unscheduled])

/*
	if (this.plugin.settings.groupTasks == "date") {
		grouped = Object.entries(Object.groupBy(use_content, (o) => o.date?o.date.format("YYYY-MM-DD"):null));
	} else if (this.plugin.settings.groupTasks == "filename") {
		grouped = Object.entries(Object.groupBy(use_content, (o) => o.path?o.path.slice(0,-3):null));
	} */

	// update header text
	if (this.plugin.settings.showHeader) {
		this.h_anchor_date_el.setText(`${now.format('dd, YYYY-MM-DD')}`)

		const unit_names = {"d":"day", "w":"week", "m":"month", "y":"year"}
		this.h_date_range_el.setText(`${direction?` ${direction}`:""}${value?value:''}${(unit&&value)?' ' + unit_names[unit.toLowerCase()] + ((value>1)?'s':''):''}`)

		let n_undefined = 0;// = include_unscheduled?grouped.find((g)=>g[0]=='null')[1].length:0
		if ( include_unscheduled ) {
			n_undefined = unscheduled.length
		}
		const n_scheduled = use_content.length - n_undefined
		this.h_comment_tags_el.setText(
		((tagmatch!=null|require_inline_tags)?"#":"") + (require_inline_tags?"inline-":"")+((tagmatch!=null|require_inline_tags)?"tags":""))

		this.h_comment_unchecked_el.setText(((excluded_task_statuses.length>0)?"not status: ":"") + excluded_task_statuses.join(","))
		this.h_comment_statuses_el.setText(((required_task_statuses.length > 0)?"status: ":"") + required_task_statuses.join(","))
		this.h_ntasks_el.setText(`scheduled: ${n_scheduled}  |  ${include_unscheduled?`unscheduled: ${n_undefined}  |`:''} total: ${this.content.length}`)
	}

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

	getOpenNoteCallback(task, close_suggester=true) {
		const suggester = this
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
			if (close_suggester){
				suggester.close();
			}
	  };
  };


  addTaskIcon(el, icon, color=null, tag=null, tooltip=null) {
	const t = el.createEl('div', {cls:"task_finder_tag_icon"})
	obsidian.setIcon(t, icon)
	// set color on svg to avoid altering the text-color of the tooltip
	if (color) {
		t.querySelectorAll('svg').forEach(element => {element.style.color = color})
	}

	// add tooltip on hover over icon
 	if (tag) {
		let tagtooltip
		t.addEventListener("mouseenter", (event) => {
			tagtooltip = t.createEl('a', {cls:'task_finder_tag_icon_tooltip tag colored-tag-task', text:tag, attr:{href:tag}})
			})

		t.addEventListener("mouseleave", (event) => {
			if (tagtooltip) {tagtooltip.remove()}
			})
	} else if (tooltip) {
		let tagtooltip
		t.addEventListener("mouseenter", (event) => {
			tagtooltip = t.createEl('span', {cls:'task_finder_tag_icon_tooltip', text:tooltip})
			})

		t.addEventListener("mouseleave", (event) => {
			if (tagtooltip) {tagtooltip.remove()}
			})
	}
	return t
  }

	getUpdateTaskDateProcessor(task, new_date, start_time, end_time) {
		return (content) => {
			const lines = content.split("\n");
			const tasktext = lines[task.meta.position.start.line];
			let new_tasktext = tasktext;

			// todo add sanity check here?

			if (new_date) {
				if (new_date == "remove") {
					if (new_tasktext.match(/(.*[📅⏳🛫] \d\d\d\d-\d\d-\d\d)/u)) {
						//remove inline task-date
						new_tasktext = new_tasktext.replace(/^(.*?)(?:\s+)?([📅⏳🛫] \d\d\d\d-\d\d-\d\d)(?:\s+)?(.*)$/u, "$1" + " " + "$3");
					}
				} else {
					if (task.datesource == "daily_note") {
						// task-date is updated by moving the task to a new file
					} else {
						if (new_tasktext.match(/(.*[📅⏳🛫] \d\d\d\d-\d\d-\d\d)/u)) {
							//replace inline task-date
							new_tasktext = new_tasktext.replace(/(.*[📅⏳🛫] )(\d\d\d\d-\d\d-\d\d)/u, "$1" + new_date.format("YYYY-MM-DD"));
						} else {
							// add new inline task-date
							new_tasktext = `${new_tasktext} 📅 ${new_date.format("YYYY-MM-DD")}`;
						}
					}
				}
			}

			// remove start-time (and end-time if set)
			if (!start_time) {
				if (task.end_date){
					new_tasktext = new_tasktext.replace(/^(- \[.\] )(\d\d?:\d\d - \d\d?:\d\d)(?:\s+)?(.*)$/, "$1" + "$3")
				} else if (task.start_date) {
					new_tasktext = new_tasktext.replace(/^(- \[.\] )(\d\d?:\d\d)(?:\s+)?(.*)$/, "$1" + "$3")
				}
			}

			// remove end-time
			if (!end_time) {
				if (task.end_date){
					new_tasktext = new_tasktext.replace(/^(- \[.\] \d\d?:\d\d )(- \d\d?:\d\d )(?:\s+)?(.*)$/, "$1" + " " + "$3")
				}
			}

			// replace (or add) start-time
			if (start_time) {
				// in case a start-time is defined, replace it
				if (new_tasktext.match(/^- \[.\] \d\d?:\d\d/)) {
					new_tasktext = new_tasktext.replace(/^(- \[.\] )(\d\d?:\d\d)(.*)/, "$1" + `${start_time}` + "$3");
				} else {
					new_tasktext = new_tasktext.replace(/^(- \[.\] )(?:\s+)?(.*)/, "$1" + `${start_time} ` + "$2")
				}
			}

			if (end_time) {
				// in case a end-time is defined, replace it
				if (new_tasktext.match(/^- \[.\] \d\d?:\d\d - \d\d?:\d\d/)) {
					new_tasktext = new_tasktext.replace(/^(- \[.\] \d\d?:\d\d - )(\d\d?:\d\d)(?:\s+)?(.*)/, "$1" + `${end_time} ` + "$3");
				} else {
					// if only a start-time is already defined, add the end-time
					if (new_tasktext.match(/^- \[.\] \d\d?:\d\d/)) {
						new_tasktext = new_tasktext.replace(/^(- \[.\] \d\d?:\d\d)(?:\s+)?(.*)/, "$1" + ` - ${end_time} ` + "$2");
					}
				}
			}

			lines[task.meta.position.start.line] = new_tasktext

			return lines.join("\n");
		};
	}

	async removeTaskFromFile(plugin, task) {
		await plugin.app.vault.process(plugin.app.vault.getFileByPath(task.path),
					(content)=> {
						const lines = content.split("\n");
						return [
							...lines.slice(0, task.meta.position.start.line),
							...lines.slice(task.meta.position.start.line + (task.additional_text?task.additional_text.length:0) + 1)
							].join("\n")
					})
	}

	async updateTaskDateInFile(plugin, task, new_date, start_time, end_time) {
		// update task inline fields
		const processor = this.getUpdateTaskDateProcessor(task, new_date, start_time, end_time);
		const new_note_txt = await app.vault.process(plugin.app.vault.getFileByPath(task.path), processor);

		// move the task to the appropriate file (if necessary)
		if ((new_date != null) & (task.datesource == "daily_note")) {
			//move task to daily-note representing new_date
			const new_note_path = plugin.settings.dailyNotePath.replace(/\/+$/, "") + "/" + new_date.format(plugin.settings.dailyNoteFilenameFmt) + ".md"
			if (task.path != new_note_path) {
				const taskfile = plugin.app.vault.getAbstractFileByPath(new_note_path)

				//const taskstr = ["\n", task.full_text, ...task.additional_text].join("\n")

				const taskstr = "\n" + new_note_txt.split("\n").slice(
					task.meta.position.start.line,
					task.meta.position.start.line + (task.additional_text?task.additional_text.length:0) + 1
					).join("\n")

				if (taskfile == null) {
					// create new file and add the task as content
					const newtaskfile = await plugin.app.vault.create(new_note_path, "")
					// TODO somehow a file needs to be "processed" in order to appear in the cache immediately
					// using the data-argument to fill the newly created file with app.vault.create() does NOT work!
					await app.vault.process(newtaskfile, (content)=> taskstr)
				} else {
					// append the task to the existing file-content
					await plugin.app.vault.append(taskfile, taskstr)
				}

				// remove task from old file
				await this.removeTaskFromFile(plugin, task)

			}
		}
	}




  async openTaskEditor(event, plugin, task) {
	// only a single taskEditorModal should be open at any time
	if (this.plugin.task_edit_modal) {
		this.plugin.task_edit_modal.close();}

	const delay = ms => new Promise(res => setTimeout(res, ms));

	new TaskEditModal(
		this,
		task,
		async (new_date, start_time, end_time)=>{
			await this.updateTaskDateInFile(plugin, task, new_date, start_time, end_time)
			await delay(200);  // TODO check why this is necessary!!
			await refreshTaskCache(plugin);
			await this.setContent(plugin.taskCache)
			// to update "search Modals"
			this.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
			// to update "code-block queries"
			this.codeBlockEl?.dispatchEvent(new Event('toggle', {bubbles:true}))
		},
		async () => {
			await this.removeTaskFromFile(plugin, task)
			await delay(200);  // TODO check why this is necessary!!
			await refreshTaskCache(plugin);
			await this.setContent(plugin.taskCache)
			// to update "search Modals"
			this.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
			// to update "code-block queries"
			this.codeBlockEl?.dispatchEvent(new Event('toggle', {bubbles:true}))

			}
		).open()

  }

  getRecurranceStr(task, indicate_nth_repetition=true) {
	let use_unit = task.recurrance.str.includes("week")?"week":(task.recurrance.recurrance_unit=="dayofyear"?"day":task.recurrance.recurrance_unit)
	let use_value = use_unit=="week"?task.recurrance.recurr_n/7:task.recurrance.recurr_n
	if (use_value > 1) {use_unit += "s"}
	return `${task.recurrance.str}` + (indicate_nth_repetition?(use_value>0?` (${use_value})`:''):'')
  }

  renderTask(match, el, additional_text_clip=4, print_today_duration=true, always_show_checkbox=false) {
  		const taskContainerEl = el.createEl('div', {cls:'task_suggestion_container'});
		if (match.recurring_item) {
			taskContainerEl.className = "task_suggestion_container task_finder_recurring_item"
		}
		if (match.range_item) {
			taskContainerEl.className = "task_suggestion_container task_finder_range_item"
		}


		// prevent default click actions from propagating
		el.addEventListener('click', function (event) { event.stopPropagation() });

		const taskdiv = taskContainerEl.createEl('div', {cls:'task_suggestion_task_container'});
		const txtdiv = taskdiv.createEl('div', {cls:'task_finder_item'});


		if ((match.recurrance != null) & (!always_show_checkbox)) {
			// add recurrance icon instead of checkbox
			// TODO handle action if recurring item is checked?
			const t = this.addTaskIcon(
				txtdiv,
				"lucide-repeat",
				"#f07a4d",
				null,
				this.getRecurranceStr(match)
				)
			t.className += " task_finder_item_checkbox task_finder_recurrance_icon"
		} else if ((match.date_range_end != null) & (!always_show_checkbox)) {
			// add date-range icons
			let date_range_icon;
			if (match.date_range_pos == "start") {
				date_range_icon = "lucide-arrow-down-from-line"
			} else if (match.date_range_pos == "end") {
				date_range_icon = "lucide-arrow-up-from-line"
			} else {
				date_range_icon = "lucide-ellipsis-vertical"
			}

			const t = this.addTaskIcon(
				txtdiv,
				date_range_icon,
				null,
				null,
				null
				)
			t.className += " task_finder_item_checkbox task_finder_range_item_icon"
			t.className += ` task_finder_item_checkbox task_finder_range_item_icon_${match.range_item_number[0]}`

		} else {
			const i = txtdiv.createEl('input', {cls:'task_finder_item_checkbox', type: 'checkbox', 'data-task':`*`});
			i.addEventListener("click", this.toggleTask(this, match, i))
			i.setAttribute("data-task", `${match.task_status}`)

			if (`${match.task_status}` != " ") {
				i.setAttribute("checked", true)
			}

		}


		const tasktextEl = txtdiv.createEl('div', {cls:'task_finder_item_text_container'});
		// open openTaskEditor modal if task is clicked
		tasktextEl.addEventListener("click", (e) => {this.openTaskEditor(e, this.plugin, match)})

		const dt = txtdiv.createEl('div', {cls: `task_view_modal_date`});

		// add tags (unique set of file tags and explicit task-tags)
		const tags = [... new Set([...match.tags?match.tags:[], ...match.file_tags?match.file_tags:[]])].sort()

		// add tag icons
		const tag_icons = this.plugin.settings.tagIcons.filter(ti => tags.some(t=>(t==ti[0] | t.startsWith(ti[0] + "/"))))
		if (tag_icons) {
			for ( const [use_tag, use_tag_icon, use_icon_color] of tag_icons ) {
				// remove entry from tags array
				// todo implement this such that tags are iterated only once
				for (const found_tag of tags.filter(t => (t==use_tag | t.startsWith(use_tag + "/")))) {
					const tagidx = tags.indexOf(found_tag)
					if (tagidx >= 0){ tags.splice(tagidx, 1)}

					const t = this.addTaskIcon(tasktextEl, use_tag_icon, use_icon_color, found_tag)
					// indicate sub-tags with a underlined icon
					if (found_tag.startsWith(use_tag + "/")) {
						t.style["border-bottom"]=`1px solid ${use_icon_color}`
					}
					}
			}
		}

		const s = tasktextEl.createEl('div', {cls:'task_finder_item_text'});
		s.setText(match.text.trim())

		if ( match.additional_text ) {
			const add_txt = tasktextEl.createEl('div', {cls:'task_finder_additional_text_container'});

			for (const i in match.additional_text) {
				add_txt.createEl("div", {text:match.additional_text[i]})
				if (i > additional_text_clip) {
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

				if (timediff == 0){
					dt.setText(`${match.start_date.format('HH:mm')}${match.end_date?'-'+match.end_date.format('HH:mm'):''}${print_today_duration?"\n"+date_str:""}`);
				} else {
					dt.setText(`${match.start_date.format('HH:mm')}${match.end_date?'-'+match.end_date.format('HH:mm'):''}`);
				}
			} else if (match.date.isBefore()) {
				dt.setText("!")
			}
			dt.setAttribute("data-is-before", match.date.isBefore())
			dt.setAttribute("data-checked", match.meta.task == "x")
		}

		return taskContainerEl
	}

  getStickyHeader(el, date=null) {
	const grplabel = date?`${date.format("MMMM YYYY")}`:"Unscheduled"
	const grpheaderid = `taskfinder_header_${grplabel}_${this.uuid}`
	const grpcontainerid = `taskfinder_container_${grplabel}_${this.uuid}`

	let grpheaderEl = document.getElementById(grpheaderid)
	let grpcontainerEl;
	if (grpheaderEl == null) {
		grpheaderEl = el.createEl("div", {text:grplabel, cls:"taskfinder_month_header", attr:{id:grpheaderid}})
		grpcontainerEl = el.createEl("div", {attr:{id:grpcontainerid}})
	} else {
		grpcontainerEl = document.getElementById(grpcontainerid)
	}
	return grpcontainerEl

  }

  // Renders each suggestion item.
  renderSuggestion(matches, el) {
	let [grp, grp_matches] = matches


	// create a dummy today entry if no tasks for today have been defined
	// TODO avoid duplication of code in here...
	if (!this.today_rendered){
		if (grp.isAfter(moment())){

			const dummyel = this.getStickyHeader(el, moment()).createEl("div", {cls:"tasks_of_today"})
			const todaydiv = dummyel.createEl('div', {cls: 'task_suggestion_header'});
			todaydiv.createEl('div', {cls: 'task_suggestion_header_left', text: " " + moment().format("dd, DD")});
			todaydiv.createEl('div', {cls: 'task_suggestion_header_center'});
			todaydiv.createEl('div', {cls: 'task_suggestion_header_right', text: "today "});
			const dummytextEl = dummyel.createEl('div', {cls: 'task_finder_today_dummy_entry'})
			this.addTaskIcon(dummytextEl, "lucide-tent-tree", null, null, "Nice... nothing to do today!")

			this.today_rendered = true
		}
	}


	// define monthly (sticky) headers
	el = this.getStickyHeader(el, grp).createEl("div")

	let header_txt = "???"
	let header_txt_right = "???"

	// append class to item container of today
	el.className = `task_finder ${el.className}`


	// check grouping behavior and assign headers accordingly
	let is_today = false;
	if (this.plugin.settings.groupTasks == "date") {
		let day = (grp==null)?null:moment(grp)
		if (!day) {
			header_txt = "Unscheduled"
			header_txt_right = `(${grp_matches.length} ${grp_matches.length > 1?'tasks':'task'})`
		} else if (day.isValid()) {
			is_today = moment(day).isSame(moment(), "day")
			header_txt = `${day.format("dd, DD")}`
			header_txt_right = (is_today)?"today":moment(day).fromNow()
		}

		// add class suffix to tasks of today
		if (is_today){
			el.className = el.className + ' tasks_of_today'
			this.today_rendered = true
		}
	} else {
		header_txt = grp
		header_txt_right = ""
	}

	const header = el.createEl('div', {cls: 'task_suggestion_header'});
	const daydiv = header.createEl('div', {cls: 'task_suggestion_header_left', text: header_txt});
	const daydiv1 = header.createEl('div', {cls: 'task_suggestion_header_center'});
	const daydiv2 = header.createEl('div', {cls: 'task_suggestion_header_right', text: header_txt_right});

	// count number of range-items in the group
	let n_range_items = 0

	let range_start_items = []
	for (const match of grp_matches){
		if (match.date_range_end) {
			n_range_items += 1
			}

		// delay rendering of the first item of a range so we can assign
		// the "range-number" (e.g. the number of simultaneous range-items in a group)
		// before rendering.
		// The number is inherited by all members of a range-item group!
		if (match.date_range_pos == "start") {
			range_start_items.push(match)
		} else {
			this.renderTask(match, el)
		}

	}

	// render range-start items
	// (subtract number of "start items" in reverse to handle case where multiple ranges start at the same day
	for (let nstart = 0; nstart < range_start_items.length; nstart++) {
		const match = range_start_items[nstart];
		match.range_item_number[0] = (n_range_items - range_start_items.length + nstart)
		const itemEl = this.renderTask(match, el)
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

	const daily_note_date_fmt_regex = new RegExp(plugin.settings.dailyNoteFilenameFmt.replaceAll(/[YMD]/g, "\\d"))

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
					additional_text.push(l)
				} else {
					break
				}
			}

			let tasktext = full_text
			let task_match = tasktext.match(/- \[(.)\] /)

			if ( task_match ) {
				const task_status = task_match[1];
				// strip off task-prefix (e.g. "- [x] ")
				tasktext = tasktext.slice(task_match.index + 6)
				// try to find date (and optional date-range) assigned to task
				let datematch = tasktext.match(/(?<=^|\s)([📅⏳🛫]) (\d\d\d\d-\d\d-\d\d)(?: - (\d\d\d\d-\d\d-\d\d))?(?=\s|$)/u)

				let datestr
				let date;
				let date_range_end;
				let start_time;
				let start_date;
				let end_time;
				let end_date;
				let datesource;
				let dateicon;

				if ( datematch ) {
					[datestr, dateicon, date, date_range_end] = datematch
					date = moment(date)
					date_range_end = date_range_end?moment(date_range_end):null

					datesource = tasks_iconnames[dateicon]
					tasktext = tasktext.replace(datestr, "")
				} else {
					// check if task is defined in a note whose title starts with a date
					const fname = path.split("/").slice(-1)[0].split(".")[0]

					date = moment(fname, plugin.settings.dailyNoteFilenameFmt, true);
					if ( date.isValid() ) {
						datesource = "daily_note";
					} else {
						date = null;
					}

				}

				// parse recurrance
				let recurrancematch = tasktext.match(/🔁\s\bevery\b(?:\s(\d+)\s(\b(?:years|months|weeks|days)\b))?(\s\b(?:year|month|week|day)\b)?/i);
				let recurrance_str, recurrance_n, recurrance_n_unit, recurrance_unit
				if (recurrancematch) {
					[recurrance_str, recurrance_n, recurrance_n_unit, recurrance_unit] = recurrancematch
					tasktext = tasktext.replace(recurrance_str, "")

					if (recurrance_n){
						recurrance_n = Number(recurrance_n)
						recurrance_unit = recurrance_n_unit.slice(0, -1)
					} else if (recurrance_unit) {
						recurrance_n = 1
					}

					recurrance_unit = recurrance_unit.trim().toLowerCase()
					if (recurrance_unit == "day") {recurrance_unit="dayofyear"}
					if (recurrance_unit == "week") {
						recurrance_unit="dayofyear"
						recurrance_n = 7*recurrance_n
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
				let recurr_n;
				let init_date;
				if ( date ) {

					// TODO allow dates anywhere?
					const timematch = tasktext.match(/^(\d?\d:\d\d)(?: - )?(\d?\d:\d\d)?/)
					let found_datestr, start_time, end_time;

					if ( timematch ){
						[found_datestr, start_time, end_time] = timematch
						// strip off found time string from tasktext
						tasktext = tasktext.replace(found_datestr, "")
					}

					// handle recurrance
					init_date = date.clone()
					if (recurrance_n) {
						const now = moment()
						// in case the initial task-date is before now, re-schedule to the next (future) occurance
						if (date.isBefore(now.startOf("day"))) {
							const recurr_diff = now.get(recurrance_unit) - date.get(recurrance_unit)
							recurr_n = Math.floor(recurr_diff/recurrance_n) + ((recurr_diff % recurrance_n)?recurrance_n:0)

							date = date.add(recurr_n, recurrance_unit=="dayofyear"?"days":recurrance_unit)

							// check if we need to add a full period
							if (date.isBefore(now.startOf("day"))) {
								recurr_n += recurrance_n
								date = date.add(recurrance_n, recurrance_unit=="dayofyear"?"days":recurrance_unit)
							}
						}
					}

					if (start_time){start_date = moment(`${date.format("YYYY-MM-DD")}T${start_time.padStart(5, '0')}`)}
					if (end_time){end_date = moment(`${date.format("YYYY-MM-DD")}T${end_time.padStart(5, '0')}`)}

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
					date_range_end:date_range_end,
					init_date:init_date,
					start_date:start_date,
					end_date:end_date,
					datesource:datesource,
					tags:tags,
					file_tags:file_tags,
					additional_text:additional_text,
					recurrance:recurrance_str?{str:recurrance_str.slice(2).trim(), recurr_n:recurr_n, recurrance_unit:recurrance_unit, recurrance_n:recurrance_n}:null
					})
			}
		}
	}

	return number_of_updated_files
}

function refreshAutocomplete(plugin, content) {
	// retrieve all tags, statuses and folders of tasks for autocompletion
	// (alternative for ALL tags: plugin.app.metadataCache.getTags() )

	let allTags = [];
	let allFolders = [];
	let allStatuses = [];
	for ((t) of Object.values(content).flat()) {
		allTags.push(t.tags?t.tags:[])
		allTags.push(t.file_tags?t.file_tags:[])

		allFolders.push(t.path.split("/").slice(0,-1).join("/"))
		allStatuses.push(t.task_status)
	}

	plugin.allTags = [... new Set(allTags.flat())].sort()
	plugin.allFolders = [... new Set(allFolders)].sort()
	plugin.allStatuses = [... new Set(allStatuses)].sort()

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

function getUpdateTaskContentProcessor(task, txt) {
	return (content) => {
		const firstline = task.meta.position.start.line
		const lastline = task.meta.position.end.line

		const lines = content.split("\n");
		// todo add sanity check here

		let before = []
		if (firstline > 0) {
			before = lines.slice(0, firstline)
		}
		const after = lines.slice(lastline+1)
		return before.concat(txt.split("\n")).concat(after).join("\n");
	};
}

function updateTaskInFile(win, window) {
	if (window.taskfinder_popup) {
	(async () => {
		const task = window.taskfinder_popup
		const txt = await app.vault.read(app.vault.getFileByPath("_taskfinder_tempfile.md"))
		const processor = getUpdateTaskContentProcessor(task, txt);
		app.vault.adapter.process(task.path, processor);
	})();
	}
}


class TaskFinder extends obsidian.Plugin {
	async onunload() {
		app.workspace.off("window-close", updateTaskInFile)

	}
	async onload() {
		this.taskCache = {};

		this.allQueryTags = [];
		this.allQueryStatuses = [];
		this.allQueryFolders = [];

		this.refresh_cache = true

		await this.loadSettings();

		this.addSettingTab(new SettingTab(this.app, this));

		// TODO hanlde popout window close
		app.workspace.on("window-close", updateTaskInFile)


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
				new TaskSuggester(this, this.taskCache).open();
				})();
		}})

		this.addRibbonIcon('search-check', 'Find Tasks', () => {
			//IIFE pattern to allow async call here
			(async () => {
				await refreshTaskCache(this);
				new TaskSuggester(this, this.taskCache).open();
				})();
		});

		this.codeBLockProcessor = this.registerMarkdownCodeBlockProcessor('taskfinder', (source, el, ctx) => {
		    const rows = source.split('\n');
			let header, query, options;

			if (rows.length > 3 | rows.length < 1) {
				new obsidian.Notice("TaskFinder code-block must contain 1, 2 or 3 lines: 1: Query, 2: Header, 3: Options");
				throw new Error("Unable to parse TaskFinder code-block content.")
			}

			[query, header, options] = rows;

			el.empty();
			el.className = "taskfinder_inline_block"
			const detailsEl = el.createEl("details", {cls:"task_finder_callout_details"})
			const summaryEl = detailsEl.createEl("summary", {cls:"task_finder_callout_summary"})
			obsidian.setIcon(summaryEl, "search-check") // set lucide icon
			const titleEl = summaryEl.createEl("span", {text: header?header:`TaskFinder Query: ${query}`, cls:"task_finder_callout_title"})
			const container = detailsEl.createEl("div", {cls: "taskfinder_inline_content"})

			detailsEl.open = (options && options.includes("open"))?true:false

			// callback to trigger fetching tasks and render results
			function getCallback (plugin) {
				 //IIFE pattern to allow async call here´

				return (async (event) => {
					if (event.target.open) {
						container.empty()
						await refreshTaskCache(plugin);

						const ts = new TaskSuggester(plugin, plugin.taskCache)
						ts.codeBlockEl = detailsEl
						// to allow dynamic-re fetching by triggering the 'input' event on the inputEl
						ts.inputEl.value = query
						if (plugin.settings.showHeader) {
							ts.createHeader(container)
						}
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