const obsidian = require('obsidian');
moment.locale('de')

// #*            : include only tasks that have an explicit tag assigned
// # (at the end): include only tasks that have a tag or file-tag

// default queries set if explicit file is opened
let defaultQueryFiles = {
	}

// default queries set if file is part of folder
let defaultQueryFolders = {
	"GeoSphere/Projects/CGLOPS/": "@u #CGLOPS ",
	"GeoSphere/Projects/HSAF/": "@u #HSAF ",
	"GeoSphere/Projects/GeoSphere/": "@u #GeoSphere ",
}

const DEFAULT_SETTINGS = {
	"defaultQuery": "@u +-2w #* ",
	"queryDebounceTime": 100,
	"taskViewLimit": 1000,
	"excludedFolders": [],
	"excludedFoldersRegex": [],
	"includeStatus":"unchecked",
}

class FolderSuggest extends obsidian.AbstractInputSuggest {
	constructor(plugin, inputEl) {
	super(plugin.app, inputEl)
	this.plugin = plugin
	this.inputEl = inputEl
	this.content = app.vault.getAllFolders().map((t)=>t.path)
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
		//this.inputEl.value = content
		this.plugin.settings.excludedFolders.push(content)
		await this.plugin.saveSettings();
		this.plugin.settingTab.update();
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
			const d = containerEl.createEl("div", {cls:"task_finder_settings_query_container"});

			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Set anchor date:"});
			this.addQueryStrdesc(d, "@YYYYMMDD", "Set 'anchor-date' (default: today).")
			this.addQueryStrdesc(d, "@MMDD", "Set 'anchor-date' to month/day of current year.")
			this.addQueryStrdesc(d, "@DD", "Set 'anchor-date' to day of current month.")

			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Query date ranges:"});
			e = this.addQueryStrdesc(d, "+-5d", "Limit tasks to a time-period relative to the 'anchor-date'.")
			e.createEl("div", {text:"+ future | - past | +- future&past"})
			e.createEl("div", {text:"d:days (default), w:weeks, m:months, y:years"})

			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Include unscheduled tasks:"});
			this.addQueryStrdesc(d, "@u", "Include 'unscheduled' tasks when querying a time-period.")

			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Query file- and inline-tags:"});
			this.addQueryStrdesc(d, "#", "Include only tasks with inline- or file-tags.")
			this.addQueryStrdesc(d, "#*", "Include only tasks with inline-tags.")
			this.addQueryStrdesc(d, "#tag", "Search for tasks with the given inline- or file-tag.")

			d.createEl("div", {cls:"task_finder_settings_query_header", text:"Query task-statuses:"});
			this.addQueryStrdesc(d, "", "")
			this.addQueryStrdesc(d, "?", "Include only unchecked tags.")
			e = this.addQueryStrdesc(d, "?...", "Include only specific tag-statuses")
			e.createEl("div", {text:"( e.g. ?!fl will include task-statuses [!], [f] and [l] )"})

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
	{
	render: (setting) => {
		let containerEl = setting.infoEl  // controlEl
		containerEl.empty();
		new obsidian.Setting(containerEl)
		.setName("Add excluded folder")
		.setDesc("Use 'regex:<pattern>' to define a RegEx pattern.")
		.addSearch((search) => {
			search.setValue(this.plugin.settings.icon)
				.setPlaceholder('Add Folder or RegEx')

			 function getOnKeypress (plugin) { return async (e) => {
				if (e.key === 'Enter') {
					plugin.settings.excludedFolders.push(search.inputEl.value);
					await plugin.saveSettings();
					plugin.settingTab.update();
				};
			};
			}

			search.inputEl.addEventListener('keypress', getOnKeypress(this.plugin))
			new FolderSuggest(this.plugin, search.inputEl);
		})
	}},
	{name: 'Query Debounce Time', desc: 'The time between typing and query-execution (miliseconds).',
	 control: { type: 'number', key: 'queryDebounceTime', placeholder: 'Enter query debounce time', min: 0} },
	{name: 'Task View Limit', desc: 'The max. number of tasks shown.',
	 control: { type: 'number', key: 'taskViewLimit', placeholder: 'Enter task view limit', min: 1} },
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


	  const header = this.modalEl.createEl("div", {cls:"task_finder_modal_header"})
	  header.setAttribute("id", "task_finder_header")

	  const dateEl = header.createEl("div", {attr: {id:'task_finder_header_date'}})
	  dateEl.createEl("span", {attr: {id:'task_finder_h_anchor_date'}})
	  dateEl.createEl("span", {attr: {id:'task_finder_h_date_range'}})

  	  const commentEl = header.createEl("div", {attr: {id:'task_finder_h_comment'}})
	  commentEl.createEl("span", {attr: {id:'task_finder_header_comment_tags'}})
	  commentEl.createEl("span", {attr: {id:'task_finder_header_comment_unchecked'}})
	  commentEl.createEl("span", {attr: {id:'task_finder_header_comment_statuses'}})

	  header.createEl("span", {attr: {id:'task_finder_header_ntasks'}})

  }
  onOpen() {
	  this.inputEl.defaultValue = this.plugin.settings.defaultQuery

	  const active_file = this.plugin.app.workspace.getActiveFile()
	  if ( active_file ) {
		  // check if file is in a folder that has a folderQuery defined
		 for (const folderQuery in defaultQueryFolders) {
			 if (active_file.path.startsWith(folderQuery)) { this.inputEl.defaultValue = defaultQueryFolders[folderQuery]; break}
		 }

		 // check if there is an explicit default query for the file
		 const fname = active_file.name.split(".")[0]
		 if (fname in defaultQueryFiles) {
			this.inputEl.defaultValue = defaultQueryFiles[fname]
		 }
	  }
	  // set cursor to end
	  this.inputEl.setSelectionRange(0,this.inputEl.defaultValue.length)
	  // trigger query
	  this.onInput()
  }

  onInput () { this.debounceonInput();}

  // Returns all available suggestions.
  getSuggestions(query){
	let use_content = this.content

	// select tasks without a date (e.g. unscheduled)
	let include_unscheduled = query.match(/(?<=^|\s)@u(?=\s|$)/g)?true:false
	query = query.replace("@u", "")

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
				now = moment(date)
			} else if (date.length == 4) {
				now = moment(`${now.format('YYYY')}${date}`)
			} else if (date.length == 2 | date.length == 1) {
				now = moment(`${now.format('YYYYMM')}${date.padStart(2, "0")}`)
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

	use_content = use_content.filter((t) => (
		(t.date == null && (include_unscheduled))) | ((t.date != null) && (((startvalue)?t.date.isSameOrAfter(startvalue):true) && ((endvalue)?t.date.isSameOrBefore(endvalue):true)))
		)

	// check for tags in the query
	const require_inline_tags = query.includes("#*")
	if ( require_inline_tags ) {
		use_content = use_content.filter((t) => (t.tags)?t.tags.length>0:false);
		query = query.replace("#*", "")
	}

	// check for task status query
	const require_unchecked = query.match(/(?<=^|\s)\?(?=\s|$)/)
	if (require_unchecked) {
		query = query.replace(require_unchecked[0], "")
		use_content = use_content.filter((t) => (t.task_status != "x"));
	}

	const require_checkstatus_tags = query.match(/(?<=^|\s)\?(\S+)(?=\s|$)/)
	let required_task_statuses = [];
	if ( require_checkstatus_tags ) {
		required_task_statuses.push(...require_checkstatus_tags[1].split(''))
		query = query.replace(require_checkstatus_tags[0], "")

		required_task_statuses = [...new Set(required_task_statuses)].sort()
		use_content = use_content.filter((t) => required_task_statuses.includes(t.task_status));

	}

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



	const query_words = query.toLowerCase().split(" ")
	function check (task) {
		return query_words.every( ( word ) => {
			// check if task text maches query
			if (task.text.toLowerCase().includes(word)) {return true}
			}
		)
	}

	use_content = use_content.filter(check);
	const grouped = Object.entries(Object.groupBy(use_content, (o) => o.date?o.date.format("YYYY-MM-DD"):null));


	// update header text
	const header = document.getElementById("task_finder_header")
	document.getElementById("task_finder_h_anchor_date").setText(`${now.format('dd, YYYY-MM-DD')}`)

	const unit_names = {"d":"day", "w":"week", "m":"month", "y":"year"}
	document.getElementById("task_finder_h_date_range").setText(`${direction?` ${direction}`:""}${value?value:''}${(unit&&value)?' ' + unit_names[unit.toLowerCase()] + ((value>1)?'s':''):''}`)

	let n_undefined = 0;// = include_unscheduled?grouped.find((g)=>g[0]=='null')[1].length:0
	if ( include_unscheduled ) {
		const undef_tasks = grouped.find((g)=>g[0]=='null')
		n_undefined = undef_tasks?undef_tasks[1].length:0
	}
	const n_scheduled = use_content.length - n_undefined
	document.getElementById("task_finder_header_comment_tags").setText(
	((tagmatch!=null|require_inline_tags)?"#":"") + (require_inline_tags?"inline-":"")+((tagmatch!=null|require_inline_tags)?"tags":""))

	console.log(
	((tagmatch!=null|require_inline_tags)?"#":"") + (require_inline_tags?"inline-":"")+((tagmatch!=null|require_inline_tags)?"tags":""))

	document.getElementById("task_finder_header_comment_unchecked").setText(require_unchecked?"unchecked ":"")
	document.getElementById("task_finder_header_comment_statuses").setText(((required_task_statuses.length > 0)?"status: ":"") + required_task_statuses.join(","))
	document.getElementById("task_finder_header_ntasks").setText(`scheduled: ${n_scheduled}  |  ${include_unscheduled?`unscheduled: ${n_undefined}  |`:''} total: ${this.content.length}`)

	//document.getElementById("task_finder_header_comment").setText(comments.join(" | "))
	return grouped


  }

	getToggleTaskContentProcessor(task, el) {
		// toggle checkbox status but maintain custom status
	    return (content) => {
			const line = task.meta.position.start.line
			const lines = content.split("\n");
			const target = lines[line];

			// sanity check: make sure task-text is equal in file and cache (except for task-status)
			if (target.slice(6) != task.full_text.slice(6)) {
				new obsidian.Notice('The task-text in the file is not as expected! Re-run TaskFinder before checking tasks to update the cache!', 2000)
				throw new Error('The text of the task to toggle is different from the expected text!')
			}

			const active_status = target.match(/^- \[(.)\]/)
			if ( active_status) {
				// TODO allow multiple 'checked' statuses
				if (active_status[1] != "x") {
					lines[line] = target.replace(/^- \[.\]/, '- [x]');
					el.setAttribute("data-task", "x")
					el.checked = true
				} else {
					lines[line] = target.replace(/^- \[.\]/, `- [${task.task_status}]`);
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
	let [day, daymatches] = matches
	day = moment(day)
	const is_today = moment(day).isSame(moment(), "day")

	let daytxt = "Unscheduled"
	if (day.isValid()) {
		daytxt = `${day.format("dd, YYYY-MM-DD")}`
	}

	// append class to item container of today
	el.className = `task_finder ${el.className}`

	el.className = el.className + ((is_today)?' tasks_of_today':'')

	const header = el.createEl('div', {cls: 'task_suggestion_header'});

	const daydiv = header.createEl('div', {cls: 'task_suggestion_header_left', text: daytxt});
	const daydiv1 = header.createEl('div', {cls: 'task_suggestion_header_center'});
	const daydiv2 = header.createEl('div', {cls: 'task_suggestion_header_right', text: day.isValid()?((is_today)?"today":moment(day).fromNow()):""});

	for (const match of daymatches){
		const c = el.createEl('div', {cls:'task_suggestion_container'});

		// prevent default click actions from propagating
		el.addEventListener('click', function (event) { event.stopPropagation() });

		const dt = c.createEl('div', {cls: `task_view_modal_date ${match.datesource}`});

		const taskdiv = c.createEl('div', {cls:'task_suggestion_task_container'});

		const i = taskdiv.createEl('input', {cls:'task-list-item-checkbox', type: 'checkbox', 'data-task':`*`});
		i.addEventListener("click", this.toggleTask(this, match, i))
		i.setAttribute("data-task", `${match.task_status}`)

		if (`${match.task_status}` != " ") {
			i.setAttribute("checked", true)
		}

		const s = taskdiv.createEl('span', {cls:'task-list-item-text', text:"???"});
		s.addEventListener('click', this.openNote(this, match) );

		if ( match.additional_text ) {
			const add_txt = taskdiv.createEl('div', {cls:'task_finder_additional_text_container', text:match.additional_text});
		}

		const d = c.createEl('div');
		d.setAttribute('line-height', '0%');
		d.createEl('br');
		const footnote = taskdiv.createEl('div', {cls:'task_view_modal_suffix', text:match.path.slice(0, -3)});


		// add tags (unique set of file tags and explicit task-tags)
		const tags = [... new Set([...match.tags?match.tags:[], ...match.file_tags?match.file_tags:[]])].sort()
		if (tags) {
			const tagcontainer = footnote.createEl('div', {cls:'task_finder_footnote_tag_container'})
		for ( const tag of tags ) {
			const t = tagcontainer.createEl('small').createEl('a', {cls:'tag colored-tag-task', text:tag})
			t.setAttribute("href", tag)
		}
		}

		s.setText(match.text)

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
	let file_cache = plugin.app.metadataCache.fileCache
	let metadata_cache = plugin.app.metadataCache.metadataCache
	let found = []
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
		if (!("listItems" in c_meta)) { continue }
		const all_tasks = c_meta.listItems.filter((obj) => "task" in obj)

/* 		for (t of all_tasks) {
			t.sublist = c_meta.listItems.filter((obj) => obj.parent == t.position.start.line)
		}
 */
		if (all_tasks.length == 0) { continue }

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
		if ( tasks.length > 0 ) { found.push([path, tasks, file_tags]) }

	}

	return found
}

async function getTasks(plugin, checked='all') {
	const found = getTaskCache(plugin, checked)

	let tasks = []

	for (const [path, task_meta, file_tags] of found) {
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
			additional_text = additional_text.join("\n")

			let tasktext = full_text
			let task_status = tasktext.match(/^- \[(.)\] /)


			if ( task_status ) {
				task_status = task_status[1];
				tasktext = tasktext.slice(6)

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

				// parse start- and end-time of task
				if ( date ) {
					// TODO allow dates anywhere?
					const datematch = tasktext.match(/^(\d?\d:\d\d)(?: - )?(\d?\d:\d\d)?/)
					if ( datematch ){
						const [found_datestr, start_time, end_time] = datematch
						if (start_time){start_date = moment(`${date}T${start_time.padStart(5, '0')}`)}
						if (end_time){end_date = moment(`${date}T${end_time.padStart(5, '0')}`)}
						// strip off found time string from tasktext
						tasktext.replace(found_datestr, "")
					}
					date = moment(date)
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


				// strip off tags
				let tags = tasktext.match(/((?:\s)?#[^\s]+(?:\s)?)/g)
				if ( tags ) {
					for (i in tags) {
						tasktext = tasktext.replace(tags[i], " ")
						tags[i] = tags[i].trim()
					}
				}
				tasks.push({
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
	return tasks
}

async function refreshTaskCache(plugin) {
	if (plugin.refresh_cache == true) {
		plugin.tasks = await getTasks(plugin, checked=plugin.settings.includeStatus)
		plugin.refresh_cache = false
	}
}



class SimpleTasks extends obsidian.Plugin {

	openSuggester() {
		//IIFE pattern to allow async call here
		(async () => {
				this.tasks = await getTasks(this, this.settings.includeStatus);
				new TaskSuggester(this, this.tasks).open();
				})();
	};

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SettingTab(this.app, this));

		// TODO do we want to refresh?
		//app.metadataCache.on('changed', async (file, data, cache) => { await refreshTaskCache(this) })
		this.refresh_cache = true
		app.metadataCache.on('changed', async (file, data, cache) => { this.refresh_cache = true })

		this.addCommand({
		  id: 'find-tasks',
		  name: 'Find Tasks',
		  callback: () => {
			//IIFE pattern to allow async call here
			(async () => {
				await refreshTaskCache(this);
				new TaskSuggester(this, this.tasks).open();
				})();
		}})

		this.addRibbonIcon('search-check', 'Find Tasks', () => {
			//IIFE pattern to allow async call here
			(async () => {
				await refreshTaskCache(this);
				new TaskSuggester(this, this.tasks).open();
				})();
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

module.exports = SimpleTasks;