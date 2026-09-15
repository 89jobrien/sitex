#!/usr/bin/env nu

def assert-equal [actual: any, expected: any, message: string] {
    if $actual != $expected {
        error make {msg: $message}
    }
}

def assert-true [condition: bool, message: string] {
    if not $condition {
        error make {msg: $message}
    }
}

def rendered-frontmatter [content: string] {
    let lines = ($content | lines)
    assert-equal ($lines | first) "---" "template output must start with YAML frontmatter"
    let closing = ($lines | skip 1 | enumerate | where item == "---" | first)
    $lines
        | skip 1
        | take $closing.index
        | str join "\n"
        | from yaml
}

def note-files [] {
    let roots = (glob "*.md")
    let content = (glob "content/**/*.md")
    let ideas = if ("ideas" | path exists) { glob "ideas/**/*.md" } else { [] }
    $roots | append $content | append $ideas | sort | uniq
}

def dry-run [arguments: list<string>] {
    let result = (do { ^zk new --no-input --dry-run --date 2026-09-15 ...$arguments } | complete)
    assert-equal $result.exit_code 0 $"zk dry-run failed: ($result.stderr)"
    rendered-frontmatter $result.stdout
}

def assert-common [metadata: record, title: string] {
    assert-equal $metadata.title $title "rendered title must round-trip through YAML"
    let date = ($metadata.date | into string)
    assert-true ($date =~ '^\d{4}-\d{2}-\d{2}$') "rendered date must be ISO YYYY-MM-DD"
}

def main [] {
    let before = (note-files)
    let title = 'Agents, APIs & "Sharp Edges": a maintainer''s test'

    let default = (dry-run ["." "--template" "default.md" "--title" $title])
    assert-common $default $title

    let project = (dry-run [
        "content/projects"
        "--group" "projects"
        "--title" $title
        "--extra" 'description=A "quoted" project: safe & small,repo=https://github.com/89jobrien/example?tab=readme'
    ])
    assert-common $project $title
    assert-equal $project.description 'A "quoted" project: safe & small' "project description must round-trip"
    assert-equal $project.extra.repo "https://github.com/89jobrien/example?tab=readme" "project repo must round-trip"

    let project_without_extras = (dry-run [
        "content/projects"
        "--group" "projects"
        "--title" $title
    ])
    assert-common $project_without_extras $title
    assert-equal $project_without_extras.description "" "project description must be optional"
    assert-equal $project_without_extras.extra.repo "" "project repo must be optional"

    let post = (dry-run ["content/blog" "--group" "blog" "--title" $title])
    assert-common $post $title

    let idea = (dry-run ["ideas/queue" "--group" "ideas" "--title" $title])
    assert-common $idea $title
    assert-equal $idea.status "seed" "idea template must default to seed"

    let after = (note-files)
    assert-equal $after $before "zk template tests must not create notes"
    print "zk-template-tests: all dry-run fixtures pass"
}
