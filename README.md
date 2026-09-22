# Task Finder

A plugin to help you find tasks inside your vault.
(on Desktop and Mobile)

<img src="./images/basic_query.png" width=100%>


## What do I get with this plugin?

- A command: `Task Finder: Find Tasks` to query all tasks in your vault based on date, tags and task-text.

## Query Language
### Filter Dates
Examples:
-`+-2w`: Show all tasks scheduled between 2 weeks before and after today.
- `+`: Show all future tasks.

Set anchor-date `@...`
    - `@yyyymmdd` for specific day
    - `@mmdd` for month/day in current year
    - `@dd` for day in current month
    - `@` for today (default)
 
Set date-range: `(direction)(duration)(unit)`
- direction:
    - `+` for all days after 'anchor-date'
    - `-` for all days before 'anchor-date
- unit:
    - `d` for days   
    - `w` for weeks
    - `m` for months
    - `y` for years


### Filter Tags
inline- and/or file-tags 

### Filter Text


## How does it work?


## Settings

> TODO add description

#TODOs

- [ ] Implement a caching strategy for task ptoperties
