---
name: stub-implementation-pattern
class: interface-declared-but-body-is-pass-through
constraint: "grep -rnA1 'listForTeam\|listCron\|findBy\|searchBy\|filterBy' src/ --include='*.ts' 2>/dev/null | grep -v 'node_modules\|\.test\.' | grep -B1 'return this\.list();$' | grep -v '^--$' | grep -v '\.filter\|\.includes' | head -5"
expected: ""
severity: block
occurrences: 2
first_seen: 2026-06-24
upgraded_to_block: 2026-06-24
description: 声明了按条件查询的接口但实现是 pass-through。listForTeam(teamId){return this.list()}—参数未使用。检测模式: 函数名含list/find/search+函数体bare return this.list()
