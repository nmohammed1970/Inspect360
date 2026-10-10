# Reapit integration execution order

```
00 audit → 01 API research → 02 database → 03 oauth → 04 client
  → 05 mapping → 06 sync engine → 07 webhooks → 08 admin UI
  → 09 observability/tests → 10 security → IMPLEMENTATION-REPORT
```

Do not write data back to Reapit in v1.
