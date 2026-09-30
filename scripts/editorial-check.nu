#!/usr/bin/env nu

def frontmatter [path: path] {
    let lines = (open --raw $path | lines)
    if ($lines | is-empty) or ($lines | first) != "---" {
        error make {msg: $"($path): missing YAML frontmatter"}
    }

    let closing = ($lines | skip 1 | enumerate | where item == "---" | first)
    $lines
        | skip 1
        | take $closing.index
        | str join "\n"
        | from yaml
}

def command-failure [result: record, message: string] {
    if $result.exit_code == 0 { [] } else { [$message] }
}

def note-errors [note: path, fields: list<string>, headings: list<string>] {
    try {
        mut issues = []
        let metadata = (frontmatter $note)
        for field in $fields {
            if $field not-in ($metadata | columns) {
                $issues = ($issues | append $"($note): missing frontmatter field ($field)")
            }
        }
        if status in ($metadata | columns) and $metadata.status not-in [seed researching ready] {
            $issues = ($issues | append $"($note): invalid active status ($metadata.status)")
        }
        if date in ($metadata | columns) and not (($metadata.date | into string) =~ '^\d{4}-\d{2}-\d{2}$') {
            $issues = ($issues | append $"($note): date must use YYYY-MM-DD")
        }
        let body = (open --raw $note)
        for heading in $headings {
            if not ($body | lines | any {|line| $line == $heading}) {
                $issues = ($issues | append $"($note): missing heading ($heading)")
            }
        }
        $issues
    } catch {|error|
        [$"($note): ($error.msg)"]
    }
}

def published-index-errors [index_path: string] {
    if not ($index_path | path exists) {
        return [$"missing published index: ($index_path)"]
    }

    try {
        mut issues = []
        let index = (open $index_path)
        if published_slugs not-in ($index | columns) {
            return ["published index requires published_slugs"]
        }

        let slugs = $index.published_slugs
        # No upper bound: the ledger grows with every published post. The
        # original exact-12 assertion was retired when the first twelve
        # pitches were promoted (see docs/designs/2026-09-09-blog-idea-backlog-design.md),
        # which also retired the exact-12 rule for the queue in favor of a
        # 12-note maximum.
        if ($slugs | is-empty) {
            $issues = ($issues | append "published index is empty")
        }
        if (($slugs | uniq | length) != ($slugs | length)) {
            $issues = ($issues | append "published index contains duplicate slugs")
        }
        for slug in $slugs {
            let post = $"content/blog/($slug).md"
            if not ($post | path exists) {
                $issues = ($issues | append $"published pitch has no blog counterpart: ($slug)")
            }
        }
        $issues
    } catch {|error|
        [$"invalid published index: ($error.msg)"]
    }
}

def note-site-errors [note: path] {
    # Project reference sites are published automatically at
    # https://89jobrien.github.io/<repo>/, so extra.site is only ever a marker
    # for "this project has a site" plus the URL the convention already implies.
    try {
        let metadata = (frontmatter $note)
        if "extra" not-in ($metadata | columns) { return [] }

        let extra = ($metadata | get extra)
        if "site" not-in ($extra | columns) { return [] }

        if "repo" not-in ($extra | columns) {
            return [$"($note): extra.site requires extra.repo"]
        }

        let repo_name = ($extra | get repo | split row "/" | where {|segment| $segment != ""} | last)
        let expected = $"https://89jobrien.github.io/($repo_name)/"
        if ($extra | get site) != $expected {
            return [$"($note): extra.site must be ($expected)"]
        }
        []
    } catch {|error|
        [$"($note): ($error.msg)"]
    }
}

def project-site-errors [] {
    glob "content/projects/*.md"
    | where {|path| ($path | path basename) != "_index.md"}
    | each {|note| note-site-errors $note }
    | flatten
}

def main [] {
    mut errors = []

    for directory in [ideas/queue ideas/published] {
        if not ($directory | path exists) {
            $errors = ($errors | append $"missing directory scaffold: ($directory)")
        }
    }

    for scaffold in [ideas/queue/.gitkeep ideas/published/.gitkeep] {
        let tracked = (do { git ls-files --error-unmatch $scaffold } | complete)
        $errors = ($errors | append (command-failure $tracked $"untracked scaffold: ($scaffold)"))
    }

    let ignore_contract = [
        {path: ideas/queue/private-pitch.md, ignored: true}
        {path: ideas/published/private-pitch.md, ignored: true}
        {path: ideas/queue/.gitkeep, ignored: false}
        {path: ideas/published/.gitkeep, ignored: false}
        {path: ideas/published/published-slugs.yaml, ignored: false}
    ]
    for contract in $ignore_contract {
        let result = (do { git check-ignore --quiet $contract.path } | complete)
        let is_ignored = $result.exit_code == 0
        if $is_ignored != $contract.ignored {
            $errors = ($errors | append $"ignore policy mismatch: ($contract.path)")
        }
    }

    let broad_rule = (open .gitignore | lines | where {|line| ($line | str trim) == "ideas/"})
    if not ($broad_rule | is-empty) {
        $errors = ($errors | append ".gitignore must not ignore the ideas directory itself")
    }

    let active_notes = if ("ideas/queue" | path exists) {
        glob "ideas/queue/*.md" | where {|path| ($path | path basename) != ".gitkeep"}
    } else {
        []
    }
    if ($active_notes | length) > 12 {
        $errors = ($errors | append "ideas/queue contains more than 12 active notes")
    }

    let fields = [title date status priority theme effort]
    let headings = [
        "## Hook"
        "## Thesis"
        "## Reader Value"
        "### Engineers"
        "### Decision-makers"
        "## Evidence"
        "## Mini Outline"
        "## Readiness"
    ]
    for note in $active_notes {
        $errors = ($errors | append (note-errors $note $fields $headings))
    }

    let index_path = "ideas/published/published-slugs.yaml"
    let tracked_index = (do { git ls-files --error-unmatch $index_path } | complete)
    $errors = ($errors | append (command-failure $tracked_index $"untracked published index: ($index_path)"))
    $errors = ($errors | append (published-index-errors $index_path))
    $errors = ($errors | append (project-site-errors))

    let output = (mktemp -d)
    let build = (do { zola build --force --output-dir $output } | complete)
    $errors = ($errors | append (command-failure $build "temporary Zola build failed"))
    if ($output | path join ideas | path exists) {
        $errors = ($errors | append "temporary Zola build emitted an ideas directory")
    }
    rm --recursive --force $output

    if not ($errors | is-empty) {
        $errors | each {|message| print --stderr $"editorial-check: ($message)"}
        exit 1
    }

    print "editorial-check: all contracts pass"
}
