---
status: implemented
date: 2026-08-17
name: D406 lessons-learned 通道改向
class: D406_M7
constraint: "check-lessons-learned.sh 新教训必须写 memory/notes/proposed/（四态），不重建平铺堆"
expected: 新免疫细胞落在 notes/proposed/，class 去重扫四态全目录
severity: warn
occurrences: 1
first_seen: 2026-08-17
description: K3 D395a 审计 P1-2——check-lessons-learned.sh 原平铺写 memory/ 根，四态改造后防腐化通道未关；改向 proposed + 日期文件名 + 四态头字段
---
