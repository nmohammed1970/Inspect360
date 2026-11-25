# Maintenance discussions via messaging — acceptance

## Contabo

```bash
docker exec -it postgres psql -U creativecloud -d inspect360_dev
# \i or paste server/migrations/addMessagingMaintenanceThreads.sql
```

## Checklist

- [ ] New MR creates one `type=maintenance` conversation (owners + maintenance_admins + reporter)
- [ ] Second Open Discussion returns the same conversation id
- [ ] Messages page: Direct vs Maintenance tabs; MR list shows ref/property/status/unread
- [ ] Thread header View request navigates correctly for staff and tenant
- [ ] Maintenance / Tenant Discussion buttons open `/messages/:id` with unread badge
- [ ] Create WO or resolve MR does not delete the thread
- [ ] Tenant cannot open another tenant’s MR discussion
- [ ] Contractor cannot ensure a new discussion (403) unless already a participant
- [ ] Direct messaging unchanged
