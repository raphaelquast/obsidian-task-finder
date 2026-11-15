const obsidian = require('obsidian');
//moment.locale("de-at")

const VIEW_NAME = "TaskFinder"

const TASK_ICONNAMES = {"📅":"due", "⏳":"scheduled", "🛫":"start", "⏫":"high", "🔼":"mid", "🔽":"low", "⏬":"lowest"}
const PRIORITY_RANKING = ["high", "mid", "low", "lowest", "", null, undefined]

const DEFAULT_SETTINGS = {
	"queryDebounceTime": 100,
	"taskViewLimit": 1000,
	"includeStatus":"unchecked",
	"excludedFolders": [],
	"excludedFoldersRegex": [],
	"tagIcons": [],
	"showCacheRefreshMessage": true,
	"includeSubTasks":true,
	"showPath":true,
	"showHeader":true,
	"recurranceRepetitions": 5,
	"dailyNotePath":"Termine",
	"dailyNoteFilenameFmt":"YYYY-MM-DD",
	"hideQueryTags":true,
	"renderDummyToday":true,
	"openNewNoteType":"tab",
	"viewUpdateInterval":60,
	"expandSubTasks":true,
	"showDifferentDatedSubTasksInDropdown":true,
	"requireControlClick":true,
	"queryDropdownOptions":[]
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

class LucideIconSuggest extends obsidian.AbstractInputSuggest {
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
		this.inputEl.value = content
		this.close()
		}
}

class SettingsTagSuggest extends obsidian.AbstractInputSuggest {
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
			return ["remove", "SUGGESTION_+1", "SUGGESTION_-2w", "SUGGESTION_today", "SUGGESTION_next monday", "SUGGESTION_15", "SUGGESTION_1503", "SUGGESTION_15032026"]
		}
	}

	renderSuggestion(content, el) {
		if ("remove".startsWith(content)) {
			el.setText("remove")
		} else if (content.startsWith("SUGGESTION_")) {
			el.setText(content.slice(11))
		} else {
			super.renderSuggestion(content, el)
		}
	}


	async selectSuggestion(content, evt) {
		if ("remove".startsWith(content)) {
			this.inputEl.value = "remove"
			this.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
		} else if (content.startsWith("SUGGESTION_")) {
			this.inputEl.value = content.slice(11)
			this.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
		} else {
			this.inputEl.value = naturalDateParser(content, this.reference_date).format("YYYY-MM-DD")
		}
		this.close()
	}

}

class EditTaskTimeSuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl, default_val) {
		super(plugin.app, inputEl)
		this.inputEl = inputEl
		this.default_val = default_val

		this.content = []
		if (this.default_val) {
			this.content.push(this.default_val, " ")
		}
		this.content.push("10", "12", "14:30", "20:15")

	}

	getSuggestions(query) {
		if (!query) {
			return this.content
		}
	}

	async selectSuggestion(content, evt) {
		this.inputEl.value = content
		this.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
	}

	renderSuggestion(content, el) {
		el.setText(content)
		}
}

class EmptyQuerySuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl) {
		super(plugin.app, inputEl)
		this.inputEl = inputEl
		this.plugin = plugin
	}

	getSuggestions(query) {
		if ((query == null) | (query == "") | (query.match(/^.+\S\s$/) != null)) {
			return [
				"+-|+-: date-range",
				"@|@: anchor date",
				"@u |@u: unscheduled",
				"#|#: tag",
				"?|?: status",
				"$|$: path",
				" | ",
				"#* |#*: require inline-tags",
				"@u#* |@u#*: require unscheduled inline-tags"

				]
		} else {this.close()}
	}

	async selectSuggestion(content, evt) {
		this.inputEl.value += content.split("|")[0]
		this.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
	}

	renderSuggestion(content, el) {
		el.setText(content.split("|")[1])
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
		type:"page",
		name: "Info on query language",
		desc:"A quick overview on how to find and filter tasks.",
		items:[
			{name: 'Query description', render: (setting) => {
				let containerEl = setting.infoEl
				let e
				containerEl.empty();

				const d = containerEl.createEl("div", {cls:"task_finder_settings_query_container", text:"Query Language:"});

				const d0 = d.createEl("div");
				d0.innerHTML = "<small>You can query tasks based on the <b>task-date</b>, <b>tags</b>, <b>task-status</b> or the <b>task-file path</b></small>!"


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
			]
		},


	{
	type:"page",
	name: "Appearance",
	desc:"General appearance, sub-tasks, recurring-tasks, daily-notes",
	items:[
		{name: 'Show Path?', desc: 'If true, file-paths are shown below the tasks.',
		control: { type: 'toggle', key: 'showPath' }},
		{name: 'Show query summary header?', desc: 'If true, a header with general infos on the query is shown.',
		control: { type: 'toggle', key: 'showHeader' }},
		{name: 'Task View Limit', desc: 'The max. number of tasks shown.',
		control: { type: 'number', key: 'taskViewLimit', placeholder: 'Enter task view limit', min: 1} },
		{name: 'Hide tags mentioned in query.', desc: 'Hide all tags (and tag-icons) corresponding to tags explicitly searched in the query.',
		control: { type: 'toggle', key: 'hideQueryTags'} },
		{name: 'Always include "today" entry.', desc: 'Add a "today" entry even if there are no tasks scheduled for today.',
		 control: { type: 'toggle', key: 'renderDummyToday'} },
		{type: 'group',
			 heading: 'Sub-Tasks',
			 items:[
				{name: 'Include sub-tasks?', desc: 'If true, tasks defined in callouts, nested lists etc. are included in the search. Otherwise, only tasks defined at the START OF A LINE are included in the search!',
				control: { type: 'toggle', key: 'includeSubTasks' }},
				{name: 'Expand sub-tasks?', desc:'If true, subtask-blocks are expanded by default. Otherwise they are collapsed and are expanded by clicking on the "subtask" icon.',
				control: {type: 'toggle', key:'expandSubTasks'}},
				{name: 'Show sub-tasks with different date in dropdown?', desc:'If true, subtasks with dates other than the parent-tasks are still shown in the subtask-dropdown. Otherwise they are only shown as individual tasks on the scheduled day.',
				control: {type: 'toggle', key:'showDifferentDatedSubTasksInDropdown'}},
		]},
		{type: 'group',
		 heading: 'Recurring Tasks',
		 items: [
			{name: 'Repetitions:', desc: 'Maximum number of times a recurring tasks are repeated.',
			control: { type: 'number', key: 'recurranceRepetitions' }},
			{name: 'Cutoff duration:', desc: 'Recurring tasks are only shown if the date-difference to the first recurrance is less than the cutoff duration.',
			control: { type: 'text', key: 'recurranceCutoffDuration', placeholder:'Cutoff duration' }},
		]},
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
				}},
				{name: 'Daily Note Date Format:', desc: 'The moment.js date-format used for the daily-note filenames.',
				control: { type: 'text', key: 'dailyNoteFilenameFmt' }},
		]},
	]},

	{
	type:"page",
	name: "Behaviour",
	desc:"General behaviour settings",
	items:[
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
		{name: 'Show task-cache refresh message.', desc: 'Show a message indicating changed files and duration of task-cache evaluation.',
		 control: { type: 'toggle', key: 'showCacheRefreshMessage'} },
		{name: 'Query Debounce Time', desc: 'The time between typing and query-execution (miliseconds).',
		 control: { type: 'number', key: 'queryDebounceTime', placeholder: 'Enter query debounce time', min: 0} },
		{name: 'Set how to open task notes', desc:'Define how the task-note is opened when clicking on "Open Note"',
		control: { type:'dropdown', key:'openNewNoteType', options:{"window":"Popup Window", "tab": "New Tab", "split":"Split-Tab"}}},
		{name: 'View update interval', desc: 'Time-interval (in seconds) to re-render the TaskFinder view (to show correct relative date/time). If set to 0, periodic re-rendering is disabled!',
		 control: { type: 'number', key: 'viewUpdateInterval', placeholder: 'Enter task view limit', min: 0} },
		{name: 'Require "control-click" to toggle checkboxes', desc: 'If true, checkboxes in the timeline can only be toggled if the "control" button is pressed.',
		 control: { type: 'toggle', key: 'requireControlClick'} },
	]},

		{
		type:"page",
		name: "Query Dropdown Options",
		desc:`Options available in the query-dropdown. (${this.plugin.settings.queryDropdownOptions.length} options defined!)`,
		items:[
			{
			render: (setting) => {
				setting.settingEl.className = "task_finder_setting_add_dropdown_option"
				let containerEl = setting.infoEl
				containerEl.empty();
				new obsidian.Setting(containerEl)
				.setName("Add option")
				//.setDesc("Add option to the query dropdown")
				.addSearch((search) => {
					search.setPlaceholder("Name")
					this.plugin.settings.queryInputName = search
					})
				.addSearch((search) => {
					search.setPlaceholder('Query')
					new EmptyQuerySuggest(this.plugin, search.inputEl)
					new StatusSuggest(this.plugin, search.inputEl)
					new TagSuggest(this.plugin, search.inputEl)
					new QueryFolderSuggest(this.plugin, search.inputEl)
					new DateSuggest(this.plugin, search.inputEl)

					this.plugin.settings.queryInputQuery = search
				})
				.addButton((btn) => {
					btn.setButtonText("add")
					btn.onClick(async () => {
						this.plugin.settings.queryDropdownOptions.push([this.plugin.settings.queryInputName.getValue(), this.plugin.settings.queryInputQuery.getValue()])
						await this.plugin.saveData(this.plugin.settings);
						this.update();
					})
				})
			}},
			{
			type: 'list',
			heading: 'Query Dropdown Options',
			emptyState: 'No dropdown options set.',
			onReorder: async (oldIndex, newIndex) => {
				let options = this.plugin.settings.queryDropdownOptions;
				let [moved] = options.splice(oldIndex, 1);
				options.splice(newIndex, 0, moved);
				await this.plugin.saveData(this.plugin.settings);
				this.update();
			},
			onDelete: async (idx) => {
				this.plugin.settings.queryDropdownOptions.splice(idx, 1);
				await this.plugin.saveData(this.plugin.settings);
				this.update();
			},
			items: this.plugin.settings.queryDropdownOptions.map((f) => ({
				name: `${f[0]}: "${f[1]}"`,
				searchable: false,
				})),
			},
			]
		},



		{
		type:"page",
		name: "️Exclude Folders",
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
	name: "Tag Icons",
	desc:`Select icons to represent tags. (${this.plugin.settings.tagIcons.length} tag-icons assigned!)`,
	items:[
		{
		render: (setting) => {
			setting.settingEl.className = "task_finder_setting_add_tag_icon"
			let containerEl = setting.infoEl
			containerEl.empty();
			new obsidian.Setting(containerEl)
			.setName("Add tag icon")
			//.setDesc("Add an icon to represent a tag.")
			.addSearch((search) => {
				this.plugin.settings.tag_icons_tag_input = search.inputEl
				search.setPlaceholder('Tag')
				new SettingsTagSuggest(this.plugin, search.inputEl);
				this.plugin.settings.tag_icon_query = search
				})
			.addColorPicker((e)=>{
				//e.setAttribute("id", "task_finder_tag_edit_color_input")

				let values = getComputedStyle(document.querySelector('body')).getPropertyValue("--color-red-rgb").split(",").map(x=>Number(x))
				if (values){
					const keys = ["r", "g", "b"]
					const rgb = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
					e.setValueRgb(rgb)
				}

				this.plugin.settings.iconColorPicker = e;
				})


			.addSearch((search) => {
				this.plugin.settings.tag_icons_icon_input = search.inputEl

				search.setPlaceholder('Icon')
				function getOnKeypress (plugin) { return async (e) => {
					if (e.key === 'Enter') {
						await plugin.saveSettings();
						plugin.settingTab.update();
					};
				};
				}

				search.inputEl.addEventListener('keypress', getOnKeypress(this.plugin))
				new LucideIconSuggest(this.plugin, search.inputEl);
				})
			.addButton((btn) => {
				btn.setButtonText("add")
				btn.onClick(() => {
					this.plugin.settings.tagIcons.push([this.plugin.settings.tag_icons_tag_input.value, this.plugin.settings.tag_icons_icon_input.value, this.plugin.settings.iconColorPicker.getValue()]);
					this.plugin.saveSettings();
					this.plugin.settingTab.update();
				})
			})

		}},

		{
		type: 'list',
		heading: `Tag Icons`,
		cls:"task_finder_tag_icon_settings_list",
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
				const tc = item.nameEl.createEl('div', {cls:"task_finder_tag_icon_settings_tag"})
				tc.createEl('a', {cls:'tag colored-tag-task', text:f[0], attr:{href:f[0]}});
				item.nameEl.createEl("p", {text:`:`})
				const iconspan = item.nameEl.createEl("span", {cls:"task_finder_tag_icon"})
				iconspan.style.color = f[2]
				obsidian.setIcon(iconspan, f[1]);
				item.nameEl.createEl("span", {text:`(${f[1]})`})

				const editButtonEl = item.controlEl.createEl("button", {cls:"task_finder_tag_icon_edit_button"})
				obsidian.setIcon(editButtonEl, "lucide-square-pen")

				editButtonEl.addEventListener('click', (event) => {
						this.plugin.settings.tag_icons_tag_input.value = f[0]
						this.plugin.settings.tag_icons_icon_input.value = f[1]
						this.plugin.settings.iconColorPicker.setValue(f[2])

				})
				}
			})),
		},
		]
	},

]}
}


function sortByTime(a, b) {
    if (a.date === null) {
        return 1;
    }
    if (b.date === null) {
        return -1;
    }

	if (a.date.isSame(b.date)) {
		// sort same-day tasks by priority (if available)
		if (a.priority || b.priority) {
			return PRIORITY_RANKING.indexOf(a.priority) - PRIORITY_RANKING.indexOf(b.priority)
		} else {
		// sort non-prioritized same-day tasks aphabetically
		// TODO chooose same-day non-priority sorting in settings?
			return a.text.localeCompare(b.text)
		}
	} else {
		return a.date - b.date
	}
}


class ConfirmModal extends obsidian.Modal {
  constructor(plugin, title, msg, onSubmit) {
    super(plugin.app);
	this.plugin = plugin
	if (title) {this.setTitle(title)}

	this.messageEl = this.contentEl.createEl("div")

	if (msg) {
		const txt = this.messageEl.createEl("div")
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

class TaskDeletionConfirmModal extends ConfirmModal {
	constructor(suggester, task, afterDelete=null) {
		let title;
		if (task.parent_task) {
			title = "Delete Sub-Task"
		} else {
			title = "Delete Task"
		}

		if (task.subtasks.length > 0) {
			title = title + ` and ${task.subtasks.length} Sub-Tasks?`
		} else {
			title = title + "?"
		}

		const msg = "<small>The task and all indended lines below the task will be removed from the defining note!</small>"

		async function do_delete_task(event) {
			await suggester.removeTaskFromFile(suggester.plugin, task)
			await refreshTaskCache(suggester.plugin);
			await suggester.setContent(suggester.plugin.taskCache)
			// to update "search Modals"
			suggester.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
			// to update "code-block queries"
			suggester.codeBlockEl?.dispatchEvent(new Event('toggle', {bubbles:true}))
			if (afterDelete) {afterDelete(event)}
			}

		super(suggester.plugin, title, msg, do_delete_task)
		this.suggester = suggester

		// render the exact (plain-text) lines that will be removed
		const taskrenderEl = this.messageEl.createEl("div", {cls:"task_finder_confirmation_task_render"})
		taskrenderEl.createEl("pre", {text:`${task.full_text}` + "\n" + task.additional_text.join("\n")})
		//suggester.renderTask(task, taskrenderEl, Infinity, false, true, false)
	}

	}


class TaskEditModal extends obsidian.Modal {
  constructor(suggester, task, onSubmit) {
    super(suggester.plugin.app);
	//this.setTitle('Re-schedule task');
	this.plugin = suggester.plugin
	// remember modal to ensure that only a single edit-modal is open at any time
	this.plugin.task_edit_modal = this

	this.valid_input_date = null;
	this.valid_input_end_date = null;
	this.valid_input_start_time = null;
	this.valid_input_end_time = null;
	this.valid_input_priority = null;

	this.task = task

	this.new_date;
	this.new_end_date;
	this.start_time=task.start_date?.format("HH:mm");
	this.end_time=task.end_date?.format("HH:mm");

	this.priority

	this.itemEl = this.contentEl.createEl("div", {cls:"task_suggester_task_edit_item"})

	this.headerEl = this.itemEl.createEl("div", {cls:"task_suggester_task_edit_entry_header"})
	if (this.task.recurrance) {
		this.headerEl.toggle("recurring_item")
		this.headerEl.setAttribute("data-recurrance", ` (recurs ${suggester.getRecurranceStr(this.task, false)})`)
	} else if (this.task.multidates) {
		this.headerEl.setAttribute("data-recurrance", ` (multi-date task: ${this.task.multidates.length + 1})`)

	}

	this.headerEl.innerHTML = this.getHeaderDateStr()
	this.taskContainerEl = this.itemEl.createEl("div", {cls:"task_suggester_task_edit_entry"})

	let highlight_subtask;
	if (task.parent_task) {
		 highlight_subtask = task.parent_task.subtasks.indexOf(task);
		 if (highlight_subtask < 0) {highlight_subtask = null}
	}

	suggester.renderTask(task.parent_task?task.parent_task:task, this.taskContainerEl,
		{additional_text_clip:Infinity,
		 print_today_duration:false,
		 always_show_checkbox:true,
		 open_editor_on_click:true,
		 highlight_subtask:highlight_subtask
		}
		 )

	// remember initially set time string (to restore on invalid input)
	this.taskTimeEl = this.taskContainerEl.getElementsByClassName("task_view_modal_date")[(highlight_subtask!=null?highlight_subtask+1:0)]
	this.init_times = this.taskTimeEl.innerHTML

	this.taskItemEl = this.taskContainerEl.getElementsByClassName("task_finder_item")[(highlight_subtask!=null?highlight_subtask+1:0)]
	this.subtaskDateEl = this.taskContainerEl.getElementsByClassName("subtask_date_indicator")[(highlight_subtask!=null?highlight_subtask+1:0)]


	new obsidian.Setting(this.contentEl)
	.setClass("task_finder_task_edit_setting")
	.addButton((btn) => {
		btn
			.setClass("task_finder_edit_date_icon")
			.setTooltip("Start date")

			if (this.task.datesource == "daily_note") {
				btn.setIcon("lucide-calendar-check-2")
			} else {
				btn.setIcon("lucide-calendar-arrow-down")
			}
	})
	.addText((text) => {
		this.dateInputEl = text.inputEl
		new EditTaskDateSuggest(this.plugin, text.inputEl, this.task.init_date)
		text.setPlaceholder("Start date/offset");
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
				this.valid_input_date = null
			}

			this.updateTaskPreview()
			}
		);
		}
	)
	.addButton((btn) => {
		btn
		  .setClass("task_finder_edit_time_icon")
		  .setIcon("lucide-clock-arrow-down")
		  .setTooltip("Start time")
	})

	.addText((text) => {
		this.startTimeInputEl = text.inputEl
		new EditTaskTimeSuggest(this.plugin, text.inputEl, this.task.start_date?this.task.start_date.format("HH:mm"):null)

		text.inputEl.className = "task_finder_time_edit_input"
		text.setValue(task.start_date?.format('HH:mm'))
		text.setPlaceholder("Start time")
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
				if (this.task.start_date) {
					if (this.end_time != null) {
						this.start_time = null
						this.valid_input_start_time = false
					} else {
						this.start_time = null
						this.valid_input_start_time = true
					}
				} else {
					this.start_time = null
					this.valid_input_start_time = null
				}
			}

			this.updateTaskPreview()
		})
	})
	.addButton((btn) => {
		this.submitButton = btn

		btn
		.setDisabled(true)
		.setClass("task_finder_edit_submit_button")
		.setIcon("lucide-calendar-check")
		.setTooltip('Update task date/time.')
		.setCta()
		.onClick(() => {
			if (this.inputValid()) {
				onSubmit(this.new_date, this.start_time, this.end_time, this.new_end_date, this.priority);
			} else {
				this.showInvalidInputNotice()
			}
		});
	})
	.addButton((btn) => {
		btn
		.setClass("task_finder_edit_date_icon")
		.setTooltip("End date")
		if (this.task.datesource == "daily_note") {
			btn.setIcon("lucide-triangle-alert")
			btn.buttonEl.style.display="none"
		} else {
			btn.setIcon("lucide-calendar-arrow-up")
		}

	})
	.addButton((btn) => {
		btn
		.setClass("task_finder_date_edit_input_dummy")
		.setButtonText("Daily Note task")
		if (this.task.datesource == "daily_note") {
			btn.buttonEl.style.display = "block"
		} else {
			btn.buttonEl.style.display = "none"
		}
	})
	.addText((text) => {
		this.dateendInputEl = text.inputEl
		// use start-date as offset-anchor if no end date is set
		const anchor_date = this.task.date_range_end?this.task.date_range_end:this.task.date

		new EditTaskDateSuggest(this.plugin, text.inputEl, anchor_date)
		text.setPlaceholder("End date/offset");
		text.inputEl.className = "task_finder_date_edit_input"
		text.inputEl.addEventListener('input', (event) => {
			const val = event.target.value
			if (val) {
				if (val == "remove") {
					this.valid_input_end_date = true
					this.new_end_date = val
				} else {
					// try to parse date
					this.new_end_date = naturalDateParser(val, anchor_date)
					if (this.new_end_date) {
						this.valid_input_end_date = true
					} else {
						this.valid_input_end_date = false
					}
				}
			} else {
				this.new_end_date = null;
				this.valid_input_end_date = null
			}

			this.updateTaskPreview()
			}
		);

		if (task.datesource == "daily_note") {
			text.inputEl.style.display = "none"
		} else {
			text.inputEl.style.display = "block"
		}
	})
	.addButton((btn) => {
		btn
		  .setClass("task_finder_edit_time_icon")
		  .setIcon("lucide-clock-arrow-up")
		  .setTooltip("End time")
	})
	.addText((text) => {
		this.endTimeInputEl = text.inputEl
		new EditTaskTimeSuggest(this.plugin, text.inputEl, this.task.end_date?this.task.end_date.format("HH:mm"):null)

		text.inputEl.className = "task_finder_time_edit_input"
		text.setValue(task.end_date?.format('HH:mm'))
		text.setPlaceholder("End time")
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
				if (this.task.end_date) {
					this.valid_input_end_time = true
				} else {
					this.valid_input_end_time = null
				}
				if (this.start_time == null) {
					// in case we had a invalid (empty) start-time due to a still present end-time
					this.valid_input_start_time = true
				}
			}

			this.updateTaskPreview()
		})
	})


    new obsidian.Setting(this.contentEl)
		.setClass("task_finder_task_edit_setting_buttons")
		.addDropdown((dd) => {
			dd.selectEl.className="task_finder_edit_priority_dropdown"
			//const placeholder = dd.selectEl.createEl("option", {text:"Set Priority ▽"})
			//placeholder.disabled = true
			//placeholder.selected = true

			dd.addOption("", "no priority")
			dd.addOption("⏫", "⏫ high")
			dd.addOption("🔼", "🔼 mid")
			dd.addOption("🔽", "🔽 low")
			dd.addOption("⏬", "⏬ lowest")


			if (this.task.priority == "high"){
				dd.setValue("⏫")
			} else if (this.task.priority == "mid") {
				dd.setValue("🔼")
			} else if (this.task.priority == "low"){
				dd.setValue("🔽")
			} else if (this.task.priority == "lowest") {
				dd.setValue("⏬")
			} else {
				dd.setValue("")
			}

			dd.onChange((value) => {
				this.priority = value;
				this.valid_input_priority=true;
				this.updateTaskPreview();
			})
		})

		.addButton((btn) => {
			btn
			  .setButtonText('Delete Task')
			  .setTooltip('Delete the task (and all additional lines) from the defining note.')
			  .setClass("task_finder_edit_remove_task_button")
			  .setWarning()
			  .onClick((event) => {new TaskDeletionConfirmModal(suggester, this.task, ()=>this.close()).open();});
		}
		)

		.addButton((btn) => {
			btn
			  .setButtonText('Open Note')
			  .setClass("task_finder_edit_open_note_button")
			  .setTooltip('Open the note in which the task is defined.')
			  .onClick((event) => {
				suggester.getOpenNoteCallback(task)(event)
				this.close();
			});
		}
		)


	// todo check how to focus the input on startup
	this.dateInputEl.focus()
	this.shouldAnimateOpen = false
	}

	onClose() {
		this.plugin.task_edit_modal = null
	}

	getHeaderDateStr(new_date=null, new_end_date=null) {
		let end_date;

		if ((this.task.date_range_end != null) | (new_end_date != null)) {
			end_date = new_end_date?new_end_date.format("dd, DD. MMMM YYYY"):this.task.date_range_end.format("dd, DD. MMMM YYYY")
		}



		let header_date_str = "";
		if ( this.task.init_date || (this.task.parent_task && this.task.parent_task.init_date) || new_date ) {
			if ( new_date ) {
				if (new_date == "remove") {
					header_date_str += `<mark class="task_finder_date_edit_highlight">Unscheduled</mark>`
				} else {
					// evaluate difference to existing date
					let dt_txt;
					if (this.task.init_date) {
						const dt = new_date.diff(this.task.init_date, "days")
						dt_txt = `<span class="task_finder_date_edit_change_text">(${dt>0?"+":""}${dt})</span>`
					} else {
						dt_txt = '<span class="task_finder_date_edit_change_text">(new)</span>'
					}
					header_date_str += `<mark class="task_finder_date_edit_highlight">${new_date.format("dd, DD. MMMM YYYY")}</mark> ${dt_txt}`
				}
			} else {
				if (this.task.init_date) {
					header_date_str += this.task.init_date.format("dd, DD. MMMM YYYY")
				} else if (this.task.parent_task && this.task.parent_task.init_date) {
					header_date_str += this.task.parent_task.init_date.format("dd, DD. MMMM YYYY") + " (subtask)"
				}

			}

			if ((new_end_date == "remove") & (new_date != "remove")) {
				header_date_str += ` <del><mark class="task_finder_date_edit_highlight">to ${this.task.date_range_end.format("dd, DD. MMMM YYYY")}</mark></del>`
			} else {
				if ((end_date != null) & (new_date != "remove")) {
					header_date_str += " to "
					if (new_end_date) {
						// evaluate difference to existing date
						let dt_txt;
						if (this.task.date_range_end) {
							const dt = this.new_end_date.diff(this.task.date_range_end, "days")
							dt_txt = `<span class="task_finder_date_edit_change_text">(${dt>0?"+":""}${dt})</span>`
						} else {
							dt_txt = '<span class="task_finder_date_edit_change_text">(new)</span>'
						}


						header_date_str += `<mark class="task_finder_date_edit_highlight">${end_date}</mark>${dt_txt}`
					} else {
						header_date_str += end_date
					}
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
			if (this.task.start_date) {
				out += `<mark class="task_finder_date_edit_highlight"><del>${this.init_times}</del></mark>`;
			}
		}
		return out
	}

	showInvalidInputNotice () {
		new obsidian.Notice("TaskFinder: Cannot re-schedule task on invalid date/time input!")
	};

	inputValid() {
		if (
			(this.valid_input_date!=null)||
			(this.valid_input_end_date!=null)||
			(this.valid_input_start_time!=null)||
			(this.valid_input_end_time!=null) ||
			(this.valid_input_priority!=null)
			) {
			return (
				((this.valid_input_date!=null)?this.valid_input_date:true) &&
				((this.valid_input_end_date!=null)?this.valid_input_end_date:true) &&
				((this.valid_input_start_time!=null)?this.valid_input_start_time:true) &&
				((this.valid_input_end_time!=null)?this.valid_input_end_time:true) &&
				((this.valid_input_priority!=null)?this.valid_input_priority:true)
				)
		} else {
			// no input given at all
			return null
		}
	}

	toggleValidInputCls(valid, el) {
		if (valid === true) {
			el.classList.add("input_valid")
			el.classList.remove("input_invalid")
		} else if (valid === false) {
			el.classList.remove("input_valid")
			el.classList.add("input_invalid")
		} else {
			el.classList.remove("input_valid")
			el.classList.remove("input_invalid")
		}
	}


	updateTaskPreview() {
		const input_valid = this.inputValid()

		this.toggleValidInputCls(this.valid_input_date, this.dateInputEl)
		this.toggleValidInputCls(this.valid_input_end_date, this.dateendInputEl)

		this.toggleValidInputCls(this.valid_input_start_time, this.startTimeInputEl)
		this.toggleValidInputCls(this.valid_input_end_time, this.endTimeInputEl)

		this.toggleValidInputCls(input_valid, this.submitButton.buttonEl)

		if (input_valid) {
			// update date header
			this.headerEl.innerHTML = this.getHeaderDateStr(this.new_date, this.new_end_date)
			this.subtaskDateEl.innerHTML = this.getHeaderDateStr(this.new_date)

			// update times
			this.taskTimeEl.innerHTML = this.getTaskTimeStr()

			// activate submit Button
			this.submitButton.setDisabled(false)

			// update Priority
			if (this.priority) {
				this.taskItemEl.setAttribute("task-priority", TASK_ICONNAMES[this.priority])
			} else {
				this.taskItemEl.setAttribute("task-priority", null)
			}


		} else {
			this.taskTimeEl.innerHTML = this.init_times;
			this.headerEl.innerHTML = `${this.task.init_date?this.task.init_date.format("dd, DD. MMMM YYYY"):"Unscheduled"}`
			this.submitButton.setDisabled(true)

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

		this.setContent(taskCache)

		this.debounceonInput = obsidian.debounce(() => { super.onInput(); }, this.plugin.settings.queryDebounceTime, true)
		this.emptyStateText = "Oh nice... seems like there's nothing to do!"

		// add query dropdown before the input element
		const dropdowndivEl = document.body.createEl("div", {cls:"task_finder_query_dropdown_container"})
		this.queryDropdown = createQueryDropdown(this.plugin, dropdowndivEl)
		this.queryDropdown.onChange(() => {
			const val = this.queryDropdown.getValue()
			this.inputEl.value = (val?val + " ":"")
			this.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
		})
		// reset on focus to allow "selecting the same element again"
		this.queryDropdown.selectEl.addEventListener('focus', () => {
			this.queryDropdown.selectEl.selectedIndex=-1;
		});

		// "unselect" the dropdown by default (and re-set the default value)
		// use a timeout to ensure DOM is fully loaded before (un)setting focus
		setTimeout(() => {
			this.queryDropdown.selectEl.blur();
			this.queryDropdown.setValue("~?x")
			this.inputEl.value = this.queryDropdown.getValue() + " "
			this.inputEl.dispatchEvent(new Event('input', {bubbles:true}))
		}, 0);

		this.inputEl.before(dropdowndivEl)

		this.inputEl.placeholder = "@: date  |  +-: range  |  #: tags  |  ?: status  |  $: path"
		// attach auto-completer
		new EmptyQuerySuggest(this.plugin, this.inputEl)
		new StatusSuggest(this.plugin, this.inputEl)
		new TagSuggest(this.plugin, this.inputEl)
		new QueryFolderSuggest(this.plugin, this.inputEl)
		new DateSuggest(this.plugin, this.inputEl)

		this.modalEl.createEl("div", {cls:"taskfinder_month_header_background"})

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
		if ((match.date != null) & (match.recurrance != null)) {
			// match date is the next occurance of the repeated task!
			const cutoff = (recurrance_cutoff_duration>0)?(match.date.clone().add(recurrance_cutoff_duration)):null;
			for( let i=1; i<=this.plugin.settings.recurranceRepetitions; i++) {

				const dateoffset = i*match.recurrance.recurrance_n
				const dateoffsetunit = match.recurrance.recurrance_unit=="dayofyear"?"days":match.recurrance.recurrance_unit

				const recdate = match.date.clone().add(dateoffset, dateoffsetunit);
				if (cutoff?recdate.isSameOrAfter(cutoff):false) { break };

				const recmatch = { ...match };
				recmatch.recurrance = {...match.recurrance};
				recmatch.recurrance.recurr_n += i*match.recurrance.recurrance_n;
				recmatch.date = recdate;
				recmatch.recurring_item = true;

				// TODO handle recurring ranged items
				//if (match.date_range_end) {
				//  const recdate_range_end = match.date_range_end.clone().add(dateoffset, dateoffsetunit);
				//	recmatch.date_range_end = recdate;
				// }

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

				const rangematch = { ...match };
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

		if (match.multidates) {
			match.range_item_number = [0]
			match.date_range_pos = "start"
			// match date is the next occurance of the repeated task!
			for (const newdate of match.multidates) {
				let rangematch = { ...match };
				rangematch.date = newdate;
				rangematch.range_item = true;
				recurring_content.push(rangematch);
				}
		}
	}

	this.content = content.concat(recurring_content)

	// TODO find a way to properly add subtasks without going through all tasks again
	// handle same-day subtasks
	const dated_singleton_subtasks = new Set([])
	const dated_subtasks = new Set([])
	for (const match of this.content) {
		// also sort subtasks by time
		match.subtasks = match.subtasks.sort(sortByTime)
		for (const sub of match.subtasks) {
			// if there is no parent task that has the same date as the subtask,
			// also push it as an individual task so that it correctly shows up in the timeline
			// NOTE: ranged tasks might act as parents which is why checking
			// for equality between the parent and the subtask is not enough
			if (match.date && sub.date) {
				if (!match.date.isSame(sub.date, "day")) {
					dated_singleton_subtasks.add(sub)
				} else {
					dated_subtasks.add(sub)
				}
			}
		}
	}
	this.content.push(...dated_singleton_subtasks.difference(dated_subtasks))

	this.content = this.content.sort(sortByTime)

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
		// set cursor to end
		this.inputEl.setSelectionRange(0,this.inputEl.defaultValue.length)
		// trigger query
		this.onInput()
		if (this.plugin.settings.showHeader) { this.createHeader(this.modalEl) }
    }

  onInput () { this.debounceonInput();}

  // Returns all available suggestions.
  getSuggestions(query){
	// TODO allow querying subtasks

	let use_content = this.content

	// get all tags included in the query so we can hide them (if required)
	if (this.plugin.settings.hideQueryTags) {
		this.query_tags = query.match(/(?<=^|\s)(#[^#^\s]+)(?=\s|$)/g)
		if (this.query_tags) {this.query_tags=this.query_tags.map(t=>t.toLowerCase())}
	}

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


	// remember if today tasks are present in the query to show a dummy-entry if no tasks are present
	this.query_contains_today = true;
	if (startvalue == null) {
		this.query_contains_today = true;
	} else if (endvalue == null) {
		this.query_contains_today = true;
	} else if ((startvalue != null) & (endvalue != null)) {
		this.query_contains_today = moment().isSameOrAfter(startvalue, "day") && moment().isSameOrBefore(endvalue, "day")
	} else if (startvalue) {
		this.query_contains_today = moment().isSame(startvalue, "day")
	} else if (endvalue) {
		this.query_contains_today = moment().isSameOrBefore(endvalue, "day")
	}

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


	this.closest_day_to_today = null; // closest day-group to today (used to insert the dummy-today group)
	let diff_to_today;
	let today = moment()
	let check_diff;

	let grouped = [];
	let unscheduled = []

	for (const match of use_content) {
		if (!match.date) {
			unscheduled.push(match)
		} else {
			this.today_tasks_found = match.date.isSame(today, "day")

			// evaluate the closest group to "today"
			check_diff = Math.abs(today.diff(match.date, "days"))

			if (diff_to_today == null) {
				diff_to_today = check_diff
				this.closest_day_to_today = match.date.clone()
			}

			if (check_diff < diff_to_today) {
				diff_to_today = check_diff
				this.closest_day_to_today = match.date.clone()
			}
			if (match.date.isSame(today, "day")){
				this.today_rendered = true
			}

			let curr_day_entries = grouped.at(-1)
			if ((curr_day_entries!=null)?match.date.isSame(curr_day_entries[0], "day"):false) {
				curr_day_entries[1].push(match)
			} else {
				grouped.push([match.date, [match]])
			}
		}
	}

	if (unscheduled.length > 0) {
		grouped.push([null, unscheduled])
	}

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
	if (grouped.length == 0) {
		grouped.push([today, []])
		this.closest_day_to_today = today
	}
	return grouped


  }

	getToggleTaskContentProcessor(task, el) {
		// toggle checkbox status but maintain custom status
		// TODO this is not possible in a view that auto-re-loads on changes since the status is updated to x after checking!
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
					lines[line] = target.replace(/- \[.\]/, `- [${task.task_status=="x"?" ":task.task_status}]`);
					el.setAttribute("data-task", task.task_status)
					if (active_status[1] != "x") {
						el.checked = true
					} else {
						el.checked = false
					}
				};
			};
	        return lines.join("\n");
	    };
	}

	toggleTask(suggester, task, el, require_control_click=true) {
		return function doToggleTask (event) {
			// disable default checkbox events to avoid toggling the checkbox in case of errors
			event.preventDefault();
			event.stopPropagation();
			if (require_control_click && !event.ctrlKey) {
				return
			}

			const processor = suggester.getToggleTaskContentProcessor(task, el);
			suggester.app.vault.adapter.process(task.path, processor);
	  };
  };

	getOpenNoteCallback(task, close_suggester=true) {
		const suggester = this
		return function doOpenNote (event) {
			const file_open = suggester.app.workspace.getLeaf(suggester.plugin.settings.openNewNoteType).openFile(suggester.app.vault.getFileByPath(task.path),{active:true});

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
		t.addEventListener("mouseenter", (event) => {
			const tagtooltip = new DocumentFragment()
			if (tooltip) {
				tagtooltip.createEl('span', {text:tooltip, cls:"taskfinder_tooltip_prefix"})
			}
			tagtooltip.createEl('a', {cls:'tag colored-tag-task', text:tag, attr:{href:tag}})
			obsidian.displayTooltip(t, tagtooltip, {placement:"top", classes:["taskfinder_tooltip", "taskfinder_tag_tooltip"]})
			})

		t.addEventListener("mouseleave", (event) => {
			for (const tt of document.getElementsByClassName("taskfinder_tooltip")){tt.remove()}
			})

	} else if (tooltip) {
		t.addEventListener("mouseenter", (event) => {
			const tagtooltip = new DocumentFragment()
			tagtooltip.createEl('span', {text:tooltip})
			obsidian.displayTooltip(t, tagtooltip, {placement:"top", classes:["taskfinder_tooltip", "taskfinder_custom_tooltip"]})
			})

	}

	t.addEventListener("mouseleave", (event) => {
	for (const tt of document.getElementsByClassName("taskfinder_tooltip")){tt.remove()}
	})


	return t
  }


	getUpdateTaskTagProcessor(task, remove_tag, add_tag) {
		return (content) => {
			const lines = content.split("\n");
			const tasktext = lines[task.meta.position.start.line];
			let new_tasktext = tasktext;

			if (remove_tag) {
				new_tasktext = new_tasktext.replace(remove_tag, "")
			}

			if (add_tag) {
				new_tasktext = new_tasktext.trimEnd() + " " + add_tag
			}

			lines[task.meta.position.start.line] = new_tasktext
			return lines.join("\n");
		}
	}

	async updateTaskTagInFile(plugin, task, remove_tag, add_tag) {
		// update task inline fields
		const processor = this.getUpdateTaskTagProcessor(task, remove_tag, add_tag);
		//const new_note_txt = await app.vault.process(plugin.app.vault.getFileByPath(task.path), processor);
		plugin.app.vault.adapter.process(task.path, processor);

		// TODO add method to reload all task properties when updating file-contents
		// update in-memory task representation
		if (add_tag) {
			if (task.tags){
				task.tags.push(add_tag)
			} else {
				task.tags = [add_tag]
			}
		}

		if (remove_tag) {
			const idx = task.tags.indexOf(remove_tag)
			if (idx > -1) {task.tags.splice(idx, 1)}
		}


	}


	getUpdateTaskDateProcessor(task, new_date, start_time, end_time, new_end_date, priority) {
		return (content) => {
			const lines = content.split("\n");
			const tasktext = lines[task.meta.position.start.line];
			let new_tasktext = tasktext;

			// in case the start-date is removed, also remove the end-date!
			if (new_date == "remove"){ new_end_date = "remove" }

			// replace existing priority
			if (new_tasktext.match(/[⏫🔼🔽⏬]/u) && (priority != null)) {
				new_tasktext = new_tasktext.replace(/(.*)(?:\s+)?( [⏫🔼🔽⏬])(?:\s+)?(.*)/u, "$1" + "$3" + (priority?(" " + priority):""))
			} else if (priority) {
				new_tasktext = new_tasktext + " " + priority
			}

			// handle end-date removal (do this before start-date to ensure proper removal of both)
			if (new_end_date == "remove") {
				if (new_tasktext.match(/(.*[📅⏳🛫] \d\d\d\d-\d\d-\d\d - \d\d\d\d-\d\d-\d\d)/u)) {
					//remove inline task-date
					new_tasktext = new_tasktext.replace(/^(.*?[📅⏳🛫] \d\d\d\d-\d\d-\d\d)( - \d\d\d\d-\d\d-\d\d)(?:\s+)?(.*)$/u, "$1" + " " + "$3");
				}
			}

			// handle start-date
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

			// handle end-date
			if ((new_end_date != null) & (new_end_date != "remove")) {
				if (new_tasktext.match(/(.*[📅⏳🛫] \d\d\d\d-\d\d-\d\d - \d\d\d\d-\d\d-\d\d)/u)) {
					//replace inline end-date
					new_tasktext = new_tasktext.replace(/(.*[📅⏳🛫] \d\d\d\d-\d\d-\d\d - )(\d\d\d\d-\d\d-\d\d)/u, "$1" + new_end_date.format("YYYY-MM-DD"));
				} else if (new_tasktext.match(/.*[📅⏳🛫] \d\d\d\d-\d\d-\d\d/)){
					//add new inline end-date
					new_tasktext = new_tasktext.replace(/(.*[📅⏳🛫] \d\d\d\d-\d\d-\d\d)(?:\s+)?(.*)$/u, "$1" + " - " + new_end_date.format("YYYY-MM-DD") + " " + "$2");
				}
			}

			// remove start-time (and end-time if set)
			if (!start_time) {
				if (task.end_date){
					new_tasktext = new_tasktext.replace(/(.*- \[.\] )(\d\d?:\d\d - \d\d?:\d\d)(?:\s+)?(.*)$/, "$1" + "$3")
				} else if (task.start_date) {
					new_tasktext = new_tasktext.replace(/(.*- \[.\] )(\d\d?:\d\d)(?:\s+)?(.*)$/, "$1" + "$3")
				}
			}

			// remove end-time
			if (!end_time) {
				if (task.end_date){
					new_tasktext = new_tasktext.replace(/(.*- \[.\] \d\d?:\d\d )(- \d\d?:\d\d )(?:\s+)?(.*)$/, "$1" + " " + "$3")
				}
			}

			// replace (or add) start-time
			if (start_time) {
				// in case a start-time is defined, replace it
				if (new_tasktext.match(/.*- \[.\] \d\d?:\d\d/)) {
					new_tasktext = new_tasktext.replace(/(.*- \[.\] )(\d\d?:\d\d)(.*)/, "$1" + `${start_time}` + "$3");
				} else {
					new_tasktext = new_tasktext.replace(/(.*- \[.\] )(?:\s+)?(.*)/, "$1" + `${start_time} ` + "$2")
				}
			}

			if (end_time) {
				// in case a end-time is defined, replace it
				if (new_tasktext.match(/.*- \[.\] \d\d?:\d\d - \d\d?:\d\d/)) {
					new_tasktext = new_tasktext.replace(/(.*- \[.\] \d\d?:\d\d - )(\d\d?:\d\d)(?:\s+)?(.*)/, "$1" + `${end_time} ` + "$3");
				} else {
					// if only a start-time is already defined, add the end-time
					if (new_tasktext.match(/.*- \[.\] \d\d?:\d\d/)) {
						new_tasktext = new_tasktext.replace(/(.*- \[.\] \d\d?:\d\d)(?:\s+)?(.*)/, "$1" + ` - ${end_time} ` + "$2");
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

	async updateTaskDateInFile(plugin, task, new_date, start_time, end_time, new_end_date, priority) {
		// update task inline fields
		const processor = this.getUpdateTaskDateProcessor(task, new_date, start_time, end_time, new_end_date, priority);
		const new_note_txt = await app.vault.process(plugin.app.vault.getFileByPath(task.path), processor);

		// move the task to the appropriate file (if necessary)
		if ((new_date != null) & (task.datesource == "daily_note")) {
			//move task to daily-note representing new_date
			const new_note_path = plugin.settings.dailyNotePath.replace(/\/+$/, "") + "/" + new_date.format(plugin.settings.dailyNoteFilenameFmt) + ".md"
			if (task.path != new_note_path) {
				const taskfile = plugin.app.vault.getAbstractFileByPath(new_note_path)

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


  async do_update_task_in_file(task, new_date=null, start_time=null, end_time=null, new_end_date=null, priority=null, scroll_to_today=null) {
		await this.updateTaskDateInFile(
			this.plugin,
			task,
			new_date,
			(start_time?start_time:(task.start_date?task.start_date.format('HH:mm'):null)),
			(end_time?end_time:(task.date_range_end?task.date_range_end.format('HH:mm'):null)),
			new_end_date,
			priority
			)
		//await delay(200);  // TODO check why this is necessary!!
		await refreshTaskCache(this.plugin);
		await this.setContent(this.plugin.taskCache)
		// to update "search Modals"

		event = new Event('input', {bubbles:true})
		event.scroll_to_today = scroll_to_today
		this.inputEl.dispatchEvent(event)
		// to update "code-block queries"
		this.codeBlockEl?.dispatchEvent(new Event('toggle', {bubbles:true}))
	}

  async openTaskEditor(event, plugin, task) {
	event.preventDefault()
	event.stopPropagation()
	// only a single taskEditorModal should be open at any time
	if (this.plugin.task_edit_modal) {
		this.plugin.task_edit_modal.close();}

	const delay = ms => new Promise(res => setTimeout(res, ms));

	new TaskEditModal(
		this,
		task,
		async (new_date, start_time, end_time, new_end_date, priority)=>{
			await this.updateTaskDateInFile(plugin, task, new_date, start_time, end_time, new_end_date, priority)
			//await delay(200);  // TODO check why this is necessary!!
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


  md2html(text) {
	let tasktext = text
	// handle internal links
	const internal_link_iterator = tasktext.matchAll(/\[\[([^|]+)(?:\|([^|]+))?\]\]/g)
	let imatch, ilink, iname;
	for ([imatch, ilink, iname] of internal_link_iterator) {
		const ipath = this.plugin.app.vault.getAbstractFileByPath(ilink + ".md")
		if (ipath) {
			tasktext = tasktext.replace(`${imatch}`, `<a href="obsidian://open?vault=${this.plugin.app.vault.getName()}&file=${encodeURI(ipath.path)}">${iname?iname:ilink}</a>`)
		} else {
			tasktext = tasktext.replace(`${imatch}`, `<a>${iname?iname:ilink}</a>`)

		}
	}


	// handle external links
	tasktext = tasktext.replace(/(\[(.*?)\]\((.*?)\))/g, "<a href=$3>$2</a>")
	// handle bold text
	tasktext = tasktext.replace(/(\*\*(.*?)\*\*)/g, "<b>$2</b>")
	// handle italic text
	tasktext = tasktext.replace(/(\*(.*?)\*)/g, "<i>$2</i>")
	return tasktext
  }

	rescheduleTask(task, new_date=null, offset=null) {
		// handle ranged tasks
		if (new_date) {
			if ((task.date_range_pos == "start") || (task.date_range_pos == "mid")) {
				this.do_update_task_in_file(task, new_date, null, null, null, null)
			} else if ((task.date_range_pos == "end")) {
				this.do_update_task_in_file(task, null, null, null, new_date, null)
			} else {
				this.do_update_task_in_file(task, new_date, null, null, null, null)
			}
		}

		if (offset) {
			if (((task.date_range_pos == "start") || (task.date_range_pos == "mid")) && task.init_date) {
				this.do_update_task_in_file(task, task.init_date.clone().add(offset, "days"), null, null, null, null)
			} else if ((task.date_range_pos == "end")) {
				this.do_update_task_in_file(task, null, null, null, task.date_range_end.clone().add(offset, "days"), null)
			} else {
				this.do_update_task_in_file(task, task.date?task.date.clone().add(offset, "days"):moment().add(offset, "days"), null, null, null, null)
			}
		}


	}

	setAddRemoveTagsEditor(task, el) {
		const suggester = this
		const containerEl = el.createEl("div", {cls:"taskfinder_add_remove_task_edit"})
		const el_add = containerEl.createEl("div", {cls:"taskfinder_taskicon_contextmenu_add"})
		const el_remove = containerEl.createEl("div", {cls:"taskfinder_taskicon_contextmenu_remove"})

		function makeRemoveButton(el, tag, icon, color) {
			const b = el.createEl("button", {cls:"taskfinder_taskicon_contextmenu_remove_button"})
			suggester.addTaskIcon(b, icon, color, tag, "remove: ")

			b.addEventListener("click", (event) => {
				event.preventDefault()
				event.stopPropagation()
				suggester.updateTaskTagInFile(suggester.plugin, task, tag, null)
				el.removeChild(b)
			})
		}

		function makeAddButton(el, tag, icon, color) {
			const b = el.createEl("button", {cls:"taskfinder_taskicon_contextmenu_add_button"})
			suggester.addTaskIcon(b, icon, color, tag, "add: ")

			b.addEventListener("click", (event) => {
				event.preventDefault()
				event.stopPropagation()

				if (!task.tags || (task.tags && !task.tags.includes(tag))) {
					suggester.updateTaskTagInFile(suggester.plugin, task, null, tag)
					makeRemoveButton(el_remove, tag, icon, color)
				} else {
					new obsidian.Notice("Tag already present on task!")
				}
			})
		}
		let tag
		let icon
		let color

		el_add.addEventListener("wheel", (evt) => {el_add.scrollLeft += (evt.deltaY * 1);}, { passive: true });
		el_add.className="taskfinder_taskicon_contextmenu_add"

		for ([tag, icon, color] of this.plugin.settings.tagIcons) {
			makeAddButton(el_add, tag, icon, color)
		}

		el_remove.className="taskfinder_taskicon_contextmenu_remove"
		if (task.tags) {
			for (const tag of task.tags) {
				const found_icon = this.plugin.settings.tagIcons.find((t)=>{return t[0]== tag})
				if (found_icon) {
					makeRemoveButton(el_remove, ...found_icon)
				}
			}
		}

	  }

  openContextMenu(event, task) {
	const menu = new obsidian.Menu();
	const suggester = this
	menu.dom.classList.add("taskfinder_contextmenu")
	menu.addItem((item) => {
		item.dom.className="taskfinder_contextmenu_priority"
		item.dom.empty()


		const p1 = item.dom.createEl("button", {cls:"taskfinder_contextmenu_priority_lowest"})
		obsidian.setIcon(p1.createEl("div"), "rewind")
		const p2 = item.dom.createEl("button", {cls:"taskfinder_contextmenu_priority_low"})
		obsidian.setIcon(p2.createEl("div"), "triangle")

		const p0 = item.dom.createEl("button", {cls:"taskfinder_contextmenu_priority_none"})
		obsidian.setIcon(p0.createEl("div"), "square")

		const p3 = item.dom.createEl("button", {cls:"taskfinder_contextmenu_priority_mid"})
		obsidian.setIcon(p3.createEl("div"), "triangle")
		const p4 = item.dom.createEl("button", {cls:"taskfinder_contextmenu_priority_high"})
		obsidian.setIcon(p4.createEl("div"), "rewind")

		if(task.priority=="lowest") {p1.classList.add("active")}
		else if(task.priority=="low") {p2.classList.add("active")}
		else if(task.priority=="mid") {p3.classList.add("active")}
		else if(task.priority=="high") {p4.classList.add("active")}
		else {p0.classList.add("active")}

		p1.addEventListener('click', () => {this.do_update_task_in_file(task, null, null, null, null, "⏬")})
		p2.addEventListener('click', () => {this.do_update_task_in_file(task, null, null, null, null, "🔽")})
		p0.addEventListener('click', () => {this.do_update_task_in_file(task, null, null, null, null, "")})
		p3.addEventListener('click', () => {this.do_update_task_in_file(task, null, null, null, null, "🔼")})
		p4.addEventListener('click', () => {this.do_update_task_in_file(task, null, null, null, null, "⏫")})
		})

	function fillRescheduleDiv(el) {

		let refdate;
		if (menu.shift_down) {
			refdate = task.date
		} else {
			refdate = moment()
		}
		el.replaceChildren()


		for (let i = -7; i <= 7; i++) {
			const icon = (i==0?"calendar-sync":(i < 0?"chevron-left":"chevron-right"))
			const cls = (i==0?"reschedule_today":(i < 0?"reschedule_minus":"reschedule_plus"))
			const newdate = (i==0?refdate:refdate.clone().add(i, "day"));
			const txt = newdate.format("dd, DD MMM")

			const p0 = el.createEl("button", {cls:cls})
			const p1 = p0.createEl("div", {cls:"reschedule_text"})
			p1.createEl("span", {text:(i==0?(menu.shift_down?"task-date":"today"):(i>0?"+":"") + (i!=0?i.toString():txt))})
			p1.createEl("span", {text:txt})

			const icondiv = p0.createEl("div")
			obsidian.setIcon(icondiv, icon)

			if (i >= 0) {
				p1.before(icondiv)
			} else {
				p1.after(icondiv)
			}

			p0.addEventListener('click', (event) => {suggester.rescheduleTask(task, newdate, null)})
			if (i==0){menu.scheduletodayEl = p0}
		}
	}

	menu.addItem((item) => {
		item.dom.className="taskfinder_contextmenu_reschedule"
		item.dom.addEventListener("wheel", (evt) => {item.dom.scrollLeft += (evt.deltaY * 1);}, { passive: true });
		menu.rescheduleContainerEl = item.dom

		fillRescheduleDiv(item.dom)
	})

	// hold down shift to switch between rescheduling based on "today" or based on the "task-date"
	menu.registerDomEvent(window, 'keydown', (event) => {
		if (event.shiftKey && !menu.shift_down) {
			menu.shift_down = true;
			fillRescheduleDiv(menu.rescheduleContainerEl)
		}});
	menu.registerDomEvent(window, 'keyup', (event) => {
		if (!event.shiftKey) {
			menu.shift_down = false
			fillRescheduleDiv(menu.rescheduleContainerEl)
		}});

	menu.addItem((item) => {
		item.dom.empty()
		suggester.setAddRemoveTagsEditor(task, item.dom)
	})

	menu.addItem((item) =>
		item
			.setTitle('Open Note')
			.setIcon('notepad-text')
			.onClick(() => {
				this.getOpenNoteCallback(task)(event);
			})
	);



	menu.addItem((item) =>
		item
			.setTitle('Delete')
			.setIcon('trash')
			.setWarning(true)
			.onClick(() => {new TaskDeletionConfirmModal(this, task).open()})
	);


	menu.showAtMouseEvent(event);

	menu.scheduletodayEl.scrollIntoView({ inline: "center" })


  }

  renderTask(
	match, el,
	{
		additional_text_clip=4,
		print_today_duration=true,
		always_show_checkbox=false,
		open_editor_on_click=true,
		highlight_subtask=null
	}={}
	) {

  		const taskContainerEl = el.createEl('div', {cls:'task_suggestion_container'});
		if (match.recurring_item) {
			taskContainerEl.className = "task_suggestion_container task_finder_recurring_item"
		}
		if (match.range_item) {
			taskContainerEl.className = "task_suggestion_container task_finder_range_item"
		}

		// prevent default click actions from propagating
		el.addEventListener('click', (event) => {
			event.stopPropagation()
			});

		const taskdiv = taskContainerEl.createEl('div', {cls:'task_suggestion_task_container'});
		const txtdiv = taskdiv.createEl('div', {cls:'task_finder_item'});
		txtdiv.setAttribute("task-priority", match.priority)

		const checkboxdiv = txtdiv.createEl("div")

		if ((match.recurrance != null) && (!always_show_checkbox)) {
			// add recurrance icon instead of checkbox
			// TODO handle action if recurring item is checked?
			const t = this.addTaskIcon(
				checkboxdiv,
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
				checkboxdiv,
				date_range_icon,
				null,
				null,
				null
				)

			t.className += " task_finder_item_checkbox task_finder_range_item_icon"
			t.className += ` task_finder_item_checkbox task_finder_range_item_icon_${match.range_item_number[0]}`

		} else if ((match.multidates != null) & (!always_show_checkbox)) {
				// add multi-date icons

				const t = this.addTaskIcon(
					checkboxdiv,
					"lucide-copy-check",
					null,
					null,
					null
					)
				t.className += " task_finder_item_checkbox task_finder_range_item_icon"
				t.className += ` task_finder_item_checkbox task_finder_range_item_icon_${match.range_item_number[0]}`
		//} else if ((match.subtasks.length > 0) & (!always_show_checkbox)) {
			// don't add checkbox in case we have subtasks present
		} else {
			const i = checkboxdiv.createEl('input', {cls:'task_finder_item_checkbox', type: 'checkbox', 'data-task':`*`});
			i.addEventListener("click",
				this.toggleTask(this, match, i, this.plugin.settings.requireControlClick && !always_show_checkbox)
				)
			i.setAttribute("data-task", `${match.task_status}`)

			if (`${match.task_status}` != " ") {
				i.setAttribute("checked", true)
			}

		}


		// add a button to show/hide subtasks)
		let subtaskbuttonEl;
		let subtaskContainerEl;

		if (match.subtasks && match.subtasks.length > 0) {
				subtaskContainerEl = taskContainerEl.createEl("div", {cls:"subtask_container"})
			if (always_show_checkbox) {
				subtaskContainerEl.classList.add("show_subtasks")
			} else {
				subtaskbuttonEl = txtdiv.createEl("button", {cls:"task_finder_show_subtask_button"})
				obsidian.setIcon(subtaskbuttonEl, "square-stack")
			}
		}


		if (!always_show_checkbox) {
			if (match.subtasks && match.subtasks.length > 0) {

				if (this.plugin.settings.expandSubTasks) {
					taskContainerEl.classList.add("show_subtasks")
				}

				subtaskbuttonEl.addEventListener("click", () => {
					taskContainerEl.classList.toggle("show_subtasks");
					})


				subtaskbuttonEl.addEventListener("mouseenter", () => {
					subtaskContainerEl.classList.add("show_subtasks");
					})

				taskContainerEl.addEventListener("mouseleave", () => {
					subtaskContainerEl.classList.remove("show_subtasks");
					})

			}
		}


		const tasktextEl = txtdiv.createEl('div', {cls:'task_finder_item_text_container'});
		// open openTaskEditor modal if task is clicked
		if (open_editor_on_click) {
			tasktextEl.addEventListener("click", (event) => {
				this.openTaskEditor(event, this.plugin, match)
			})

			tasktextEl.addEventListener("contextmenu", (event) => {
				event.preventDefault()
				this.openContextMenu(event, match)
			})

		}

		const dt = txtdiv.createEl('div', {cls: `task_view_modal_date`});

		// add tags (unique set of file tags and explicit task-tags)
		let tags = [... new Set([...match.tags?match.tags:[], ...match.file_tags?match.file_tags:[]])].sort()

		if (this.plugin.settings.hideQueryTags & (this.query_tags!=null)) {
			tags = tags.filter(t => !this.query_tags.includes(t.toLowerCase()))
		}

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
		s.innerHTML = this.md2html(match.text.trim())

		if ( match.additional_text ) {
			const add_txt = tasktextEl.createEl('div', {cls:'task_finder_additional_text_container'});

			let add_i = 0
			let n_subtasks = 0
			for (const add_line of match.additional_text) {
				// special treatment for subtasks
				const issubtask = add_line.trim().match(/^- \[.\]/)
				if (issubtask) {
					if (!this.plugin.settings.includeSubTasks) {
						add_txt.createEl("div").innerHTML = this.md2html(add_line)
						add_i += 1
					} else {
						n_subtasks += 1
					}
				} else {
					// TODO find better way to avoid showing additional text of subtasks
					if (add_line.match(/^\t\S/)) {
						add_txt.createEl("div").innerHTML = this.md2html(add_line.replace(/^(\t)?(.+)/, "$2"))
					}
				}

				if (add_i > additional_text_clip) {
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

		const task_path_footnote = footnote.createEl("div", {cls:"task_finder_footnote_folder", text:match.path.slice(0, -3)})
		if (!this.plugin.settings.showPath) {
			task_path_footnote.classList.add("hidden")
		}

		if ( match.date || (match.parent_task && match.parent_task.date)) {
			const usedate = (match.date?match.date:match.parent_task.date)
			let date_str;
			const timediff = usedate.diff(moment(), "days")
			if (timediff == 0) {
				if (match.start_date) {
					date_str = moment.duration(match.start_date.diff(moment())).humanize(true)
				} else (
					date_str = "today"
					)
			} else {
				date_str = usedate.fromNow()
			}
			if (match.start_date) {
				dt.setAttribute("data-datesource", '⏱')//match.datesource)

				if (timediff == 0){
					dt.setText(`${match.start_date.format('HH:mm')}${match.end_date?'-'+match.end_date.format('HH:mm'):''}${print_today_duration?"\n"+date_str:""}`);
				} else {
					dt.setText(`${match.start_date.format('HH:mm')}${match.end_date?'-'+match.end_date.format('HH:mm'):''}`);
				}
			} else if (usedate.isBefore()) {
				//dt.setText("!")
			}
			dt.setAttribute("data-is-before", usedate.isBefore())
			dt.setAttribute("data-checked", match.meta.task == "x")
		}

		// render subtasks

		// handle subtasks that do not share a date with the parent task
		// (render them as "individual" tasks)

		// add div to indicate subtask-date in modals
		const subtaskDateDiv = taskdiv.createEl("div", {cls:"subtask_date_indicator"})


		if (match.parent_task && match.date) {
			if (!match.date.isSame(match.parent_task.date, "day")) {
				taskContainerEl.classList.add("subtask")
				taskContainerEl.classList.add("show_subtasks")
			}
			// indicate subtask-date in modals
			if (match.parent_task && match.date) {
				subtaskDateDiv.innerHTML = match.date.format("dd, DD.MMM YYYY")
			}
		}
		// todo implement filter logic here as well
		if (this.plugin.settings.includeSubTasks && match.subtasks.length > 0) {
			let subtask_rendered = false
			for (const subtaskidx in match.subtasks) {
				const subtask = match.subtasks[subtaskidx]
				// only show subtasks that are dated on the same day as the parent in the timeline!
				// all other subtasks are added as individual tasks anyways!
				if (subtask.date && !subtask.date.isSame(match.date, "day") && !this.plugin.settings.showDifferentDatedSubTasksInDropdown && !always_show_checkbox) {
					continue
					}

				// create a copy to avoid altering the subtask as it might be rendered multiple times
				const rendersubtask = {...subtask}
				rendersubtask.file_tags = [];  // don't show file-tags again on subtasks

				const subtaskEl = subtaskContainerEl.createEl("div", {cls:"subtask"})

				// add class to highlight subtask
				if (subtaskidx == highlight_subtask) {
					subtaskEl.classList.add("highlight_subtask")
				}
				this.renderTask(subtask, subtaskEl,
					{additional_text_clip:additional_text_clip,
					 print_today_duration:print_today_duration,
					 always_show_checkbox:always_show_checkbox,
					 open_editor_on_click:open_editor_on_click}
					)
				subtask_rendered = true
			}
			if ((subtask_rendered == false) && subtaskbuttonEl) {
				// indicate missing subtasks for specific day with the button
				subtaskbuttonEl.setAttribute('disabled', true)
			}
		}

		return taskContainerEl
	}

  getStickyHeader(el, date=null, datefmt="MMMM YYYY", nonelabel="Unscheduled", cls="taskfinder_month_header") {
	const grplabel = date?`${date.format(datefmt)}`:nonelabel
	const grpheaderid = `taskfinder_header_${grplabel}_${this.uuid}`
	const grpcontainerid = `taskfinder_container_${grplabel}_${this.uuid}`

	let grpheaderEl = document.getElementById(grpheaderid)
	let grpcontainerEl;
	if (grpheaderEl == null) {
		grpheaderEl = el.createEl("div", {text:grplabel, cls:cls, attr:{id:grpheaderid}})
		grpcontainerEl = el.createEl("div", {attr:{id:grpcontainerid}})
	} else {
		grpcontainerEl = document.getElementById(grpcontainerid)
	}
	return [grpheaderEl, grpcontainerEl]

  }

  // Renders each suggestion item.
  renderSuggestion(matches, el) {
	let [grp, grp_matches] = matches


	// create a dummy today entry if no tasks for today have been defined
	// TODO avoid duplication of code in here...
	if (!this.today_rendered & this.plugin.settings.renderDummyToday & (grp != null) & this.query_contains_today){
		if (grp.isSame(this.closest_day_to_today)){
			const dummyel = this.getStickyHeader(el, moment())[1].createEl("div", {cls:"tasks_of_today"})
			const todaydiv = dummyel.createEl('div', {cls: 'task_suggestion_header'});
			todaydiv.createEl('div', {cls: 'task_suggestion_header_left', text: " " + moment().format("dd, DD")});
			todaydiv.createEl('div', {cls: 'task_suggestion_header_center'});
			todaydiv.createEl('div', {cls: 'task_suggestion_header_right', text: "today "});
			const dummytextEl = dummyel.createEl('div', {cls: 'task_finder_today_dummy_entry'})
			this.addTaskIcon(dummytextEl, "lucide-tent-tree", null, null, "Nice... nothing to do today!")

			this.today_rendered = true
		}
	}
	// quick exit in case there are not tasks for the day
	// (required to trigger rendering of the dummy-today entry in case no tasks are found in the query
	if (grp_matches.length == 0) {return}

	// define monthly (sticky) headers
	el = this.getStickyHeader(el, grp)[1].createEl("div")

	let header_txt = "???"
	let header_txt_right = "???"

	// append class to item container of today
	el.className = `task_finder ${el.className}`


	// check grouping behavior and assign headers accordingly
	let is_today = false;
	let day = (grp==null)?null:moment(grp)
	if (!day) {
		header_txt = ""
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

	// create unique sticky headers for each day
	const header = this.getStickyHeader(el, moment(grp), "YYYYMMDD", "", "task_suggestion_header")[0]
	header.setText("")

	const daydiv = header.createEl('div', {cls: 'task_suggestion_header_left', text: header_txt});
	const daydiv1 = header.createEl('div', {cls: 'task_suggestion_header_center'});
	const daydiv2 = header.createEl('div', {cls: 'task_suggestion_header_right', text: header_txt_right});

	// count number of range-items in the group
	let n_range_items = 0

	let range_start_items = []
	for (const match of grp_matches){
		if (match.date_range_pos) {
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
		const all_tasks = c_meta.listItems.filter((obj) => ("task" in obj))
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
		// record of subtasks
		const identified_subtasks = {pos:[], subtask_container:[], parent:[]}

		// reindex files only if hash changed
		if (hash in plugin.taskCache) {
			continue
		}

		number_of_updated_files.push(path)
		plugin.taskCache[hash] = []


		const content = await app.vault.cachedRead(plugin.app.vault.getFileByPath(path))
		for (const m of task_meta ) {
			const full_text = content.split("\n")[m.position.start.line]
			//let tasktext = full_text
			let task_match = full_text.match(/^([^-]+)?- \[(.)\] (.*)/)

			if ( task_match ) {
				const task = {}
				const subtasks = [] // subtask container array passed as reference and filled later!

				const task_prefix = task_match[1];  // (in case task is inside a callout etc.)
				const task_status = task_match[2];
				let tasktext = task_match[3];
				let additional_text = []
				//for (l of content.split("\n").slice(m.position.start.line + 1)) {

				const contentlines = content.split("\n").slice(m.position.start.line + 1)
				for (addl in contentlines) {
					l = contentlines[addl]
					// strip off task-prefix (if there is one)

					if (task_prefix) {
						if (l.startsWith(task_prefix?task_prefix:"")) {
							l = l.slice(task_prefix.length);
						} else {
							break
						}
					}

					// check if the line actually represents a subtask (i.e. indended with a tab)
					if (l.match(/^\t- \[.\]/)) {
						identified_subtasks.pos.push(m.position.start.line + 1 + Number(addl))
						identified_subtasks.subtask_container.push(subtasks)
						identified_subtasks.parent.push(task)
					}

					// only use full "tab" to identify additional-lines (or subtasks)
					if (l.match(/^\t+(\S)?/)) {
						additional_text.push(l)
					} else {
						break
					}
				}

				// push subtasks to dedicated array
				const subtask_idx = identified_subtasks.pos.indexOf(m.position.start.line)
				if ( subtask_idx > -1 ) {
					task.parent_task = identified_subtasks.parent[subtask_idx]
					identified_subtasks.subtask_container[subtask_idx].push(task)
				} else {
					plugin.taskCache[hash].push(task)
				}

				// parse date (and optional date-range)
				//let datematch = tasktext.match(/(?<=^|\s)([📅⏳🛫]) (\d\d\d\d-\d\d-\d\d)(?: - (\d\d\d\d-\d\d-\d\d))?(?=\s|$)/u)
				let datematch = tasktext.match(/(?<=^|\s)([📅⏳🛫]) (\d\d\d\d-\d\d-\d\d)(?: - (\d\d\d\d-\d\d-\d\d))?((?:, \d\d\d\d-\d\d-\d\d)+)?(?=\s|$)/u)

				let datestr
				let date;
				let date_range_end;
				let start_time;
				let start_date;
				let end_time;
				let end_date;
				let datesource;
				let dateicon;
				let multidates;

				if ( datematch ) {
					[datestr, dateicon, date, date_range_end, multidates] = datematch
					date = moment(date)
					date_range_end = date_range_end?moment(date_range_end):null

					datesource = TASK_ICONNAMES[dateicon]
					tasktext = tasktext.replace(datestr, "")

					if (multidates) {
						multidates = multidates.split(",").slice(1).map(d=>moment(d.trim()))
					}

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

				// parse start- and end-time of task
				// TODO allow dates anywhere?
				const timematch = tasktext.match(/^(\d?\d:\d\d)(?: - )?(\d?\d:\d\d)?/)
				let found_datestr;

				if ( timematch ){
					[found_datestr, start_time, end_time] = timematch
					// strip off found time string from tasktext
					tasktext = tasktext.replace(found_datestr, "")
				}


				// use parent-task date as time-anchor if no explicit date is set
				// (to allow setting start-end-times on sub-tasks without having to add the date again)
				let usedate
				if (date) {
					usedate = date
				} else if (task.parent_task && task.parent_task.date) {
					usedate = task.parent_task.date
				}
				//const usedate = (date?date:task.parent_task.date).clone()
				if (usedate) {
					if (start_time){start_date = moment(`${usedate.format("YYYY-MM-DD")}T${start_time.padStart(5, '0')}`)}
					if (end_time){end_date = moment(`${usedate.format("YYYY-MM-DD")}T${end_time.padStart(5, '0')}`)}
				}

				let recurr_n;
				let init_date;

				if ( date ) {
					init_date = date.clone()

					// handle recurrance
					if (recurrance_n) {
						const now = moment()
						// in case the initial task-date is before now, re-schedule to the next (future) occurance
						if (date.isBefore(now.startOf("day"))) {
							const recurr_diff = now.get(recurrance_unit) - date.get(recurrance_unit)
							recurr_n = Math.floor(recurr_diff/recurrance_n)*recurrance_n

							date = date.add(recurr_n, recurrance_unit=="dayofyear"?"days":recurrance_unit)

							// check if we need to add a full period
							if (date.isBefore(now.startOf("day"))) {
								recurr_n += recurrance_n
								date = date.add(recurrance_n, recurrance_unit=="dayofyear"?"days":recurrance_unit)
							}
						}
					}
				}


				// parse inline-tags
				let tags = tasktext.match(/((?:\s)?#[^\s]+(?:\s)?)/g)
				if ( tags ) {
					for (i in tags) {
						tasktext = tasktext.replace(tags[i], " ")
						tags[i] = tags[i].trim()
					}
				}

				// parse priority
				let priority;

				if (tasktext.contains("⏫")) {
					priority = TASK_ICONNAMES["⏫"]
				} else if (tasktext.contains("🔼")) {
					priority = TASK_ICONNAMES["🔼"]
				} else if (tasktext.contains("🔽")) {
					priority = TASK_ICONNAMES["🔽"]
				} else if (tasktext.contains("⏬")) {
					priority = TASK_ICONNAMES["⏬"]
				}

				tasktext = tasktext.replace(/[⏫🔼🔽⏬]/u, "")

				Object.assign(task, {
					path:path,
					meta:m,
					full_text:full_text,
					text:tasktext,
					task_status:task_status,
					date:date,
					date_range_end:date_range_end,
					multidates:multidates,
					init_date:init_date,
					start_date:start_date,
					end_date:end_date,
					datesource:datesource,
					tags:tags,
					priority:priority,
					file_tags:file_tags,
					additional_text:additional_text,
					recurrance:recurrance_str?{str:recurrance_str.slice(2).trim(), recurr_n:recurr_n, recurrance_unit:recurrance_unit, recurrance_n:recurrance_n}:null,
					subtasks:subtasks
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


async function renderSuggesterQueryResult(plugin, el, query) {
	await refreshTaskCache(plugin);
	const ts = new TaskSuggester(plugin, plugin.taskCache)
	if (plugin.settings.showHeader) {
		ts.createHeader(el)
	}
	for (const sug of ts.getSuggestions(query)){
		const taskcontainer = el.createEl("div", {cls:"task_finder suggestion-item"})
		await ts.renderSuggestion(sug, taskcontainer)
	};
}

function scrollTodayIntoView(el, center=true) {
	const todaydivs = el.getElementsByClassName('tasks_of_today');
	if (todaydivs[0]) {
		let offset = 50 // default offset is height of sticky-header!
		if (center) {
			offset = el.clientHeight/2
		}
		const topPos = todaydivs[0].offsetTop - todaydivs[0].clientHeight - offset;
		el.scrollTop = topPos
	}
}

function createQueryDropdown(plugin, el) {
	queryDropdown = new obsidian.DropdownComponent(el)
	queryDropdown.selectEl.className = "task_finder_query_dropdown"

	queryDropdown.addOption("", "")
	queryDropdown.addOption("~?x", "todo")
	queryDropdown.addOption("?x", "done")

	for (const [n, q] of plugin.settings.queryDropdownOptions) {
		queryDropdown.addOption(q, n)
	}
	queryDropdown.setValue("~?x")
	return queryDropdown

}

class TaskFinderView extends obsidian.ItemView {
	constructor(plugin, leaf) {
		super(leaf);
		this.plugin = plugin
		this.icon = "search-check"

		this.suggester = new TaskSuggester(plugin, plugin.taskCache)
	}

	getViewType() {return VIEW_NAME;}
	getDisplayText() {return VIEW_NAME;}

	async renderSuggesterQueryResult(suggester, el, query) {
		await refreshTaskCache(suggester.plugin);
		await suggester.setContent(suggester.plugin.taskCache)

		el.empty();
		for (const sug of suggester.getSuggestions(query)){
			const taskcontainer = el.createEl("div", {cls:"task_finder suggestion-item"})
			await suggester.renderSuggestion(sug, taskcontainer)
		};
	}


	async onOpen() {
		this.contentEl.empty()
		this.contentEl.className = "taskfinder_view_content"

		this.inputContainerEl = this.contentEl.createEl("div", {cls:"taskfinder_view_input_container"})

		this.queryDropdown = createQueryDropdown(this.plugin, this.inputContainerEl)
		this.queryDropdown.onChange((value) => {
			const val = this.queryDropdown.getValue()
			this.inputEl.value = (val?val + " ":"")
			event = new Event('input', { 'bubbles': true })
			event.scroll_to_today = true
			this.inputEl.dispatchEvent(event);
		})
		// reset on focus to allow "selecting the same element again"
		this.queryDropdown.selectEl.addEventListener('focus', () => {
			this.queryDropdown.selectEl.selectedIndex=-1;
		});



		this.queryInput = new obsidian.SearchComponent(this.inputContainerEl)
		this.inputEl = this.queryInput.inputEl

		// replace inputEl of suggester so it reacts to input-event triggers
		this.suggester.inputEl = this.inputEl

		this.inputEl.placeholder = ""
		// attach auto-completer
		new EmptyQuerySuggest(this.plugin, this.inputEl)
		new StatusSuggest(this.plugin, this.inputEl)
		new TagSuggest(this.plugin, this.inputEl)
		new QueryFolderSuggest(this.plugin, this.inputEl)
		new DateSuggest(this.plugin, this.inputEl)


		this.suggestionContainerEl = this.contentEl.createEl("div", {cls:"taskfinder_view_container"});

		this.inputEl.addEventListener('input', async (event) => {
			const promise = this.reRenderSuggestions()
			if (event.isTrusted || event.scroll_to_today) {
				// only scroll today into view if event was triggered by user input
				promise.then( () => scrollTodayIntoView(this.suggestionContainerEl))
			}
			})

		// connect update triggers
		app.metadataCache.on('resolved', () => {this.reRenderSuggestions()})

		// periodically update view to show correct times
		if (this.plugin.settings.viewUpdateInterval > 0) {
			this.triggerPeriodicUpdates()
		}
    }

	async reRenderSuggestions () {
		const init_scroll_top = this.suggestionContainerEl.scrollTop
		await this.renderSuggesterQueryResult(this.suggester, this.suggestionContainerEl, this.inputEl.value?this.inputEl.value:"")
		// maintain scroll position as good as possible...
		this.suggestionContainerEl.scrollTop = init_scroll_top
	}

	triggerPeriodicUpdates(){
		const view = this

		// ensure that we have only a single update-scheduler running
		if (view.periodic_re_render_id) {
			clearTimeout(view.periodic_re_render_id)
		}

		function scheduleNext() {
			if (view.plugin.settings.viewUpdateInterval > 0) {
				// Do your work or async task here
				view.periodic_re_render_id = setTimeout(() => {
					view.reRenderSuggestions()
					scheduleNext(); // Schedule the next run after completion
				}, view.plugin.settings.viewUpdateInterval*1000);
			} else {
				if (view.periodic_re_render_id) {
					clearTimeout(view.periodic_re_render_id)
				}
			}
		}
		scheduleNext()

	}

	async onClose() {
		app.metadataCache.off('resolved', this.reRenderSuggestions)
		if (this.periodic_re_render_id) {
			clearTimeout(this.periodic_re_render_id)
		}
	}
}

class TaskFinder extends obsidian.Plugin {
	async onunload() {
	}

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
				new TaskSuggester(this, this.taskCache).open();
				})();
		}})

		this.addRibbonIcon('search-check', 'TaskFinder', () => {
		  this.activateView();
		});

		this.registerView(
		  VIEW_NAME,
		  (leaf) => new TaskFinderView(this, leaf)
		);
/*
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
		}) */;
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = null;
		const leaves = workspace.getLeavesOfType(VIEW_NAME);

		if (leaves.length > 0) {
		  // A leaf with our view already exists, use that
		  leaf = leaves[0];
		} else {
		  // Our view could not be found in the workspace, create a new leaf
		  // in the right sidebar for it
		  leaf = workspace.getRightLeaf(false);
		  await leaf.setViewState({ type: VIEW_NAME, active: true });
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		workspace.revealLeaf(leaf);
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

		// re-trigger time interval for leaf-re-rendering
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_NAME);

		if (leaves.length > 0) {
		  // A leaf with our view already exists, use that
		  leaves[0].view.triggerPeriodicUpdates()
		}

	}


}

module.exports = TaskFinder;