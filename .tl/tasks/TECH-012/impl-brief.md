# TECH-012 — Implementation Brief

## Step plan

1. Add Redis pub/sub helpers in shared/.
2. Worker publishes on Meeting.status transitions.
3. API endpoint subscribes per meeting + streams events.
4. Test full pub-sub round trip.
