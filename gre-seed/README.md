# GRE seed pack for Quantara

```
content/gre/
  schema.ts            zod schemas (quant + vocab)
  taxonomy.json        topics, subtopics, QC choices, tiers
  roadmap.json         4-week plan
  quant/*.json         30 original questions (5 topics x 6, all 4 types)
  vocab/set-01..02     50 hard GRE words (tiers 1-3)
  notes/*.md           short study notes per quant topic
scripts/validate-gre.mjs   validator + manifest generator (no deps)
PUKU_PROMPT_GRE.md         paste into the agent
```

Run `node scripts/validate-gre.mjs` to validate. All quant answers were checked by script when generated.
Explanations are intentionally NOT in the files (AI explain on demand).
